import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { AuthError } from '../auth/auth.errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CustomerModel, UserModel } from '../identity/identity.model.js';
import {
  AuditLogModel,
  NotificationModel,
  WebhookEventModel,
} from '../operations/operations.model.js';
import { enqueueForActiveAdmins, enqueueNotification } from '../operations/notification.service.js';
import {
  InvoiceModel,
  PaymentAllocationModel,
  PaymentModel,
  RazorpayOrderModel,
} from '../finance/finance.model.js';

const conflict = (code: string, message: string) => new AuthError(409, code, message);
const unavailable = () =>
  new AuthError(
    503,
    'RAZORPAY_TEST_NOT_CONFIGURED',
    'Razorpay test mode is not configured on the server.',
  );

export function verifyHmacSignature(secret: string, data: string | Buffer, supplied: string) {
  if (!/^[a-f\d]{64}$/i.test(supplied)) return false;
  const expected = createHmac('sha256', secret).update(data).digest();
  const actual = Buffer.from(supplied, 'hex');
  return actual.length === expected.length && timingSafeEqual(expected, actual);
}

export function isTestKeyId(value: string) {
  return /^rzp_test_[A-Za-z0-9]+$/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function configuredCredentials() {
  const keyId = env.RAZORPAY_TEST_KEY_ID;
  const keySecret = env.RAZORPAY_TEST_KEY_SECRET;
  if (!keyId || !keySecret || !isTestKeyId(keyId)) throw unavailable();
  return { keyId, keySecret };
}

async function razorpayRequest<T>(
  path: string,
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<T> {
  const { keyId, keySecret } = configuredCredentials();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = (await response.json().catch(() => null)) as T | null;
    if (!response.ok || !payload)
      throw new AuthError(
        502,
        'RAZORPAY_REQUEST_FAILED',
        'Razorpay test request could not be completed.',
      );
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export function createRazorpayTestOrderRequest(input: {
  amountPaise: number;
  receipt: string;
  attemptId: string;
  invoiceNumber: string;
}) {
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < 1)
    throw new AuthError(
      400,
      'INVALID_ORDER_AMOUNT',
      'Order amount must be positive integer paise.',
    );
  return razorpayRequest<{ id: string; amount: number; currency: string }>('/orders', 'POST', {
    amount: input.amountPaise,
    currency: 'INR',
    receipt: input.receipt,
    notes: { virtualRakshaOrderId: input.attemptId, invoiceNumber: input.invoiceNumber },
  });
}

async function invoiceAmounts(invoiceId: Types.ObjectId, session?: mongoose.ClientSession) {
  const [allocated, refunded] = await Promise.all([
    PaymentAllocationModel.aggregate([
      { $match: { invoiceId } },
      {
        $lookup: { from: 'payments', localField: 'paymentId', foreignField: '_id', as: 'payment' },
      },
      { $unwind: '$payment' },
      { $match: { 'payment.status': 'SUCCEEDED' } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]).session(session ?? null),
    (await import('../finance/finance.model.js')).RefundModel.aggregate([
      { $match: { invoiceId, status: 'PROCESSED' } },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]).session(session ?? null),
  ]);
  return {
    allocatedPaise: BigInt(allocated[0]?.total ?? 0),
    refundedPaise: BigInt(refunded[0]?.total ?? 0),
  };
}

async function reserveInvoiceBalance(
  invoiceId: Types.ObjectId,
  customerId: Types.ObjectId,
  session: mongoose.ClientSession,
) {
  const invoice = await InvoiceModel.findOne({ _id: invoiceId, customerId }).session(session);
  if (!invoice || ['DRAFT', 'VOID', 'PAID'].includes(invoice.status))
    throw new AuthError(
      404,
      'INVOICE_NOT_PAYABLE',
      'This invoice is not available for online payment.',
    );
  const { allocatedPaise, refundedPaise } = await invoiceAmounts(invoiceId, session);
  const amountDue = BigInt(invoice.totalPaise) - allocatedPaise + refundedPaise;
  const amountPaise = Number(amountDue > 0n ? amountDue : 0n);
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 1)
    throw conflict('INVOICE_ALREADY_SETTLED', 'This invoice has no balance available for payment.');
  const reservation = await InvoiceModel.updateOne(
    {
      _id: invoiceId,
      customerId,
      $expr: { $eq: [{ $ifNull: ['$onlineReservedPaise', 0] }, 0] },
    },
    { $inc: { onlineReservedPaise: amountPaise } },
    { session },
  );
  if (!reservation.modifiedCount)
    throw conflict(
      'INVOICE_PAYMENT_IN_PROGRESS',
      'An online payment is already in progress for this invoice.',
    );
  return { amountPaise, invoiceNumber: invoice.invoiceNumber };
}

async function releaseInvoiceReservation(
  invoiceId: Types.ObjectId,
  amountPaise: number,
  session: mongoose.ClientSession,
) {
  await InvoiceModel.updateOne(
    { _id: invoiceId },
    [
      {
        $set: {
          onlineReservedPaise: {
            $max: [0, { $subtract: [{ $ifNull: ['$onlineReservedPaise', 0] }, amountPaise] }],
          },
        },
      },
    ],
    { session },
  );
}

export async function createRazorpayOrder(
  input: { invoiceId: string; idempotencyKey: string },
  auth: AuthContext,
) {
  if (auth.role !== 'CUSTOMER' || !auth.customerId)
    throw new AuthError(
      403,
      'FORBIDDEN',
      'Online checkout is available to customers for their own invoices.',
    );
  const { keyId } = configuredCredentials();
  if (!Types.ObjectId.isValid(input.invoiceId))
    throw new AuthError(
      404,
      'INVOICE_NOT_PAYABLE',
      'This invoice is not available for online payment.',
    );
  const customerId = new Types.ObjectId(auth.customerId);
  const invoiceId = new Types.ObjectId(input.invoiceId);
  const prior = await RazorpayOrderModel.findOne({ customerId, requestKey: input.idempotencyKey })
    .select('+orderId')
    .lean();
  if (prior) {
    if (String(prior.invoiceId) !== input.invoiceId)
      throw conflict(
        'IDEMPOTENCY_KEY_REUSED',
        'This checkout key was already used for another invoice.',
      );
    if (prior.status === 'CREATED' && prior.orderId)
      return {
        orderId: prior.orderId,
        keyId,
        amountPaise: prior.amountPaise,
        currency: 'INR',
        invoiceNumber: (await InvoiceModel.findById(invoiceId).select('invoiceNumber').lean())
          ?.invoiceNumber,
      };
    throw conflict(
      'CHECKOUT_ATTEMPT_EXISTS',
      'This checkout attempt is not reusable. Start a new attempt.',
    );
  }
  const customer = await CustomerModel.findOne({
    _id: customerId,
    userId: auth.userId,
    status: 'ACTIVE',
  })
    .select('displayName email')
    .lean();
  if (!customer) throw new AuthError(404, 'CUSTOMER_NOT_FOUND', 'Customer account was not found.');
  const receipt = `vrk_${randomUUID().replaceAll('-', '')}`;
  const session = await mongoose.startSession();
  let attemptId!: Types.ObjectId;
  let amountPaise = 0;
  let invoiceNumber = '';
  try {
    await session.withTransaction(async () => {
      const reserved = await reserveInvoiceBalance(invoiceId, customerId, session);
      amountPaise = reserved.amountPaise;
      invoiceNumber = reserved.invoiceNumber;
      const [attempt] = await RazorpayOrderModel.create(
        [
          {
            customerId,
            invoiceId,
            requestKey: input.idempotencyKey,
            receipt,
            amountPaise,
            currency: 'INR',
            status: 'CREATING',
            createdByUserId: auth.userId,
          },
        ],
        { session },
      );
      attemptId = attempt._id;
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      const raced = await RazorpayOrderModel.findOne({
        customerId,
        requestKey: input.idempotencyKey,
      })
        .select('+orderId')
        .lean();
      if (raced?.status === 'CREATED' && raced.orderId) {
        const racedInvoice = await InvoiceModel.findById(raced.invoiceId)
          .select('invoiceNumber')
          .lean();
        return {
          orderId: raced.orderId,
          keyId,
          amountPaise: raced.amountPaise,
          currency: 'INR',
          invoiceNumber: racedInvoice?.invoiceNumber,
        };
      }
      throw conflict('CHECKOUT_ATTEMPT_EXISTS', 'This checkout key is already being processed.');
    }
    throw error;
  } finally {
    await session.endSession();
  }
  let providerOrder: { id: string; amount: number; currency: string };
  try {
    providerOrder = await createRazorpayTestOrderRequest({
      amountPaise,
      receipt,
      attemptId: String(attemptId),
      invoiceNumber,
    });
  } catch (error) {
    await mongoose.startSession().then(async (releaseSession) => {
      try {
        await releaseSession.withTransaction(async () => {
          await releaseInvoiceReservation(invoiceId, amountPaise, releaseSession);
          await RazorpayOrderModel.updateOne(
            { _id: attemptId, status: 'CREATING' },
            { $set: { status: 'FAILED', failureCode: 'ORDER_CREATION_FAILED' } },
            { session: releaseSession },
          );
        });
      } finally {
        await releaseSession.endSession();
      }
    });
    throw error;
  }
  if (
    providerOrder.amount !== amountPaise ||
    providerOrder.currency !== 'INR' ||
    !providerOrder.id
  ) {
    const releaseSession = await mongoose.startSession();
    try {
      await releaseSession.withTransaction(async () => {
        await releaseInvoiceReservation(invoiceId, amountPaise, releaseSession);
        await RazorpayOrderModel.updateOne(
          { _id: attemptId, status: 'CREATING' },
          { $set: { status: 'FAILED', failureCode: 'ORDER_RESPONSE_MISMATCH' } },
          { session: releaseSession },
        );
      });
    } finally {
      await releaseSession.endSession();
    }
    throw new AuthError(
      502,
      'RAZORPAY_ORDER_MISMATCH',
      'Razorpay returned an unexpected test order.',
    );
  }
  const updated = await RazorpayOrderModel.updateOne(
    { _id: attemptId, status: 'CREATING' },
    { $set: { orderId: providerOrder.id, status: 'CREATED' } },
  );
  if (!updated.modifiedCount)
    throw conflict(
      'CHECKOUT_ORDER_STATE_CHANGED',
      'Checkout order state changed; start a new attempt.',
    );
  return {
    orderId: providerOrder.id,
    keyId,
    amountPaise,
    currency: 'INR',
    invoiceNumber,
    customerName: customer.displayName,
    customerEmail: customer.email,
  };
}

async function notifySuccessfulPayment(
  customerId: Types.ObjectId,
  paymentId: Types.ObjectId,
  invoiceNumber: string,
  amountPaise: number,
  session: mongoose.ClientSession,
) {
  const customer = await CustomerModel.findById(customerId)
    .select('userId displayName')
    .session(session)
    .lean();
  const money = `${new Intl.NumberFormat('en-IN').format(BigInt(amountPaise) / 100n)}.${String(BigInt(amountPaise) % 100n).padStart(2, '0')}`;
  if (customer?.userId)
    await enqueueNotification({
      userId: customer.userId,
      type: 'PAYMENT_RECEIVED',
      message: `Payment confirmed for invoice ${invoiceNumber}.`,
      entityType: 'Payment',
      entityId: paymentId,
      deduplicationKey: `razorpay-payment:${paymentId}`,
      session,
    });
  await enqueueForActiveAdmins({
    type: 'PAYMENT_RECEIVED',
    message: `${customer?.displayName ?? 'A customer'} paid ₹${money} for invoice ${invoiceNumber}.`,
    entityType: 'Payment',
    entityId: paymentId,
    deduplicationKey: `razorpay-payment:${paymentId}`,
    session,
  });
}

async function settleCapturedPayment(
  data: { orderId: string; paymentId: string; amount: number; currency: string },
  source: 'CHECKOUT' | 'WEBHOOK',
) {
  const session = await mongoose.startSession();
  let result: { paymentId: string; alreadyPaid: boolean } | undefined;
  try {
    await session.withTransaction(async () => {
      const attempt = await RazorpayOrderModel.findOne({ orderId: data.orderId })
        .select('+providerPaymentId')
        .session(session);
      if (!attempt)
        throw new AuthError(404, 'CHECKOUT_ORDER_NOT_FOUND', 'Checkout order was not found.');
      if (
        attempt.status === 'PAID' &&
        attempt.paymentRecordId &&
        attempt.providerPaymentId === data.paymentId
      ) {
        result = { paymentId: String(attempt.paymentRecordId), alreadyPaid: true };
        return;
      }
      const holdsInvoiceReservation = attempt.status === 'CREATING' || attempt.status === 'CREATED';
      if (data.currency !== 'INR' || data.amount !== attempt.amountPaise)
        throw conflict(
          'PAYMENT_AMOUNT_MISMATCH',
          'Verified payment details do not match this invoice.',
        );
      const duplicatePayment = await PaymentModel.findOne({ providerPaymentId: data.paymentId })
        .select('+providerPaymentId')
        .session(session);
      if (duplicatePayment) {
        if (String(duplicatePayment.customerId) !== String(attempt.customerId))
          throw conflict(
            'PAYMENT_ALREADY_USED',
            'This provider payment is already associated with another account.',
          );
        if (duplicatePayment.status === 'SUCCEEDED') {
          if (attempt.status !== 'PAID') {
            attempt.status = 'PAID';
            attempt.providerPaymentId = data.paymentId;
            attempt.paymentRecordId = duplicatePayment._id;
            await attempt.save({ session });
          }
          result = { paymentId: String(duplicatePayment._id), alreadyPaid: true };
          return;
        }
      }
      const invoice = await InvoiceModel.findById(attempt.invoiceId).session(session);
      if (!invoice || String(invoice.customerId) !== String(attempt.customerId))
        throw new AuthError(404, 'INVOICE_NOT_FOUND', 'Invoice was not found.');
      const amounts = await invoiceAmounts(invoice._id, session);
      const due = BigInt(invoice.totalPaise) - amounts.allocatedPaise + amounts.refundedPaise;
      const allocatedPaise = Number(
        due > 0n ? (due < BigInt(attempt.amountPaise) ? due : BigInt(attempt.amountPaise)) : 0n,
      );
      let payment = duplicatePayment;
      if (payment) {
        payment.status = 'SUCCEEDED';
        payment.receivedAt = new Date();
        await payment.save({ session });
      } else {
        [payment] = await PaymentModel.create(
          [
            {
              customerId: attempt.customerId,
              amountPaise: attempt.amountPaise,
              currency: 'INR',
              method: 'RAZORPAY_SANDBOX',
              status: 'SUCCEEDED',
              idempotencyKey: `razorpay:${data.paymentId}`,
              providerPaymentId: data.paymentId,
              reference: data.paymentId,
              receivedAt: new Date(),
              createdByUserId: attempt.createdByUserId,
            },
          ],
          { session },
        );
      }
      const existingAllocation = await PaymentAllocationModel.exists({
        paymentId: payment._id,
        invoiceId: invoice._id,
      }).session(session);
      if (allocatedPaise > 0 && !existingAllocation) {
        await PaymentAllocationModel.create(
          [
            {
              paymentId: payment._id,
              invoiceId: invoice._id,
              amountPaise: allocatedPaise,
              allocatedByUserId: attempt.createdByUserId,
            },
          ],
          { session },
        );
      }
      if (holdsInvoiceReservation)
        await releaseInvoiceReservation(invoice._id, attempt.amountPaise, session);
      const remaining = due - BigInt(allocatedPaise);
      invoice.status =
        remaining <= 0n ? 'PAID' : invoice.dueAt < new Date() ? 'OVERDUE' : 'PARTIALLY_PAID';
      await invoice.save({ session });
      if (attempt.status !== 'PAID') {
        attempt.status = 'PAID';
        attempt.providerPaymentId = data.paymentId;
        attempt.paymentRecordId = payment._id;
        await attempt.save({ session });
      }
      await AuditLogModel.create(
        [
          {
            actorUserId: source === 'CHECKOUT' ? attempt.createdByUserId : undefined,
            action: 'RAZORPAY_TEST_PAYMENT_CAPTURED',
            entityType: 'Payment',
            entityId: payment._id,
            metadata: {
              orderId: data.orderId,
              providerPaymentId: data.paymentId,
              invoiceId: invoice._id,
              amountPaise: attempt.amountPaise,
              allocatedPaise,
            },
          },
        ],
        { session },
      );
      await notifySuccessfulPayment(
        attempt.customerId,
        payment._id,
        invoice.invoiceNumber,
        payment.amountPaise,
        session,
      );
      result = { paymentId: String(payment._id), alreadyPaid: false };
    });
  } finally {
    await session.endSession();
  }
  if (!result) throw new Error('Payment settlement produced no result.');
  return result;
}

export async function verifyCheckoutPayment(
  input: { orderId: string; paymentId: string; signature: string },
  auth: AuthContext,
) {
  if (auth.role !== 'CUSTOMER' || !auth.customerId)
    throw new AuthError(403, 'FORBIDDEN', 'Online checkout is available to customers only.');
  const { keySecret } = configuredCredentials();
  const order = await RazorpayOrderModel.findOne({
    orderId: input.orderId,
    customerId: auth.customerId,
  })
    .select('+orderId')
    .lean();
  if (!order) throw new AuthError(404, 'CHECKOUT_ORDER_NOT_FOUND', 'Checkout order was not found.');
  if (!verifyHmacSignature(keySecret, `${input.orderId}|${input.paymentId}`, input.signature))
    throw new AuthError(400, 'PAYMENT_SIGNATURE_INVALID', 'Payment verification failed.');
  const payment = await razorpayRequest<{
    id: string;
    order_id: string;
    amount: number;
    currency: string;
    status: string;
  }>(`/payments/${encodeURIComponent(input.paymentId)}`, 'GET');
  if (
    payment.id !== input.paymentId ||
    payment.order_id !== input.orderId ||
    payment.amount !== order.amountPaise ||
    payment.currency !== 'INR'
  )
    throw new AuthError(
      400,
      'PAYMENT_DETAILS_MISMATCH',
      'Verified payment details do not match this checkout.',
    );
  let captured = payment;
  if (payment.status !== 'captured') {
    if (payment.status !== 'authorized')
      throw conflict('PAYMENT_NOT_CAPTURED', 'Razorpay has not captured this payment.');
    captured = await razorpayRequest<typeof payment>(
      `/payments/${encodeURIComponent(input.paymentId)}/capture`,
      'POST',
      { amount: order.amountPaise, currency: 'INR' },
    );
  }
  if (
    captured.status !== 'captured' ||
    captured.order_id !== input.orderId ||
    captured.amount !== order.amountPaise
  )
    throw conflict('PAYMENT_NOT_CAPTURED', 'Razorpay has not confirmed capture of this payment.');
  return settleCapturedPayment(
    {
      orderId: input.orderId,
      paymentId: input.paymentId,
      amount: captured.amount,
      currency: captured.currency,
    },
    'CHECKOUT',
  );
}

export async function cancelCheckoutOrder(orderId: string, auth: AuthContext) {
  if (auth.role !== 'CUSTOMER' || !auth.customerId)
    throw new AuthError(403, 'FORBIDDEN', 'Only the owning customer can close a checkout attempt.');
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const attempt = await RazorpayOrderModel.findOneAndUpdate(
        { orderId, customerId: auth.customerId, status: 'CREATED' },
        { $set: { status: 'CANCELLED' } },
        { returnDocument: 'after', session },
      );
      if (attempt) await releaseInvoiceReservation(attempt.invoiceId, attempt.amountPaise, session);
      return { status: attempt?.status ?? 'UNCHANGED' };
    });
  } finally {
    await session.endSession();
  }
}

export async function processRazorpayWebhook(
  eventId: string,
  signature: string,
  rawBody: Buffer,
  body: unknown,
) {
  const secret = env.RAZORPAY_TEST_WEBHOOK_SECRET;
  if (!secret) throw unavailable();
  if (!verifyHmacSignature(secret, rawBody, signature))
    throw new AuthError(400, 'WEBHOOK_SIGNATURE_INVALID', 'Webhook signature verification failed.');
  const webhook = asRecord(body);
  const eventType = webhook?.event;
  if (!eventId || eventId.length > 160 || typeof eventType !== 'string')
    throw new AuthError(400, 'WEBHOOK_EVENT_INVALID', 'Webhook event is malformed.');
  let duplicate = false;
  try {
    await WebhookEventModel.create({
      provider: 'RAZORPAY',
      providerEventId: eventId,
      eventType,
      status: 'RECEIVED',
    });
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000))
      throw error;
    duplicate = true;
    const previous = await WebhookEventModel.findOne({
      provider: 'RAZORPAY',
      providerEventId: eventId,
    }).lean();
    if (previous?.status === 'PROCESSED') return { received: true, duplicate: true };
    await WebhookEventModel.updateOne(
      { provider: 'RAZORPAY', providerEventId: eventId },
      { $set: { status: 'RECEIVED', eventType } },
    );
  }
  try {
    const payload = asRecord(webhook?.payload);
    const paymentPayload = asRecord(payload?.payment);
    const entity = asRecord(paymentPayload?.entity);
    const providerPaymentId = entity?.id;
    const providerOrderId = entity?.order_id;
    const providerAmount = entity?.amount;
    const providerCurrency = entity?.currency;
    const providerErrorCode = entity?.error_code;
    if (
      eventType === 'payment.captured' &&
      typeof providerPaymentId === 'string' &&
      typeof providerOrderId === 'string' &&
      typeof providerAmount === 'number' &&
      Number.isSafeInteger(providerAmount) &&
      typeof providerCurrency === 'string'
    ) {
      await settleCapturedPayment(
        {
          orderId: providerOrderId,
          paymentId: providerPaymentId,
          amount: providerAmount,
          currency: providerCurrency,
        },
        'WEBHOOK',
      );
    } else if (eventType === 'payment.failed' && typeof providerOrderId === 'string') {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const attempt = await RazorpayOrderModel.findOne({
            orderId: providerOrderId,
            status: 'CREATED',
          }).session(session);
          if (attempt) {
            attempt.status = 'FAILED';
            attempt.failureCode =
              typeof providerErrorCode === 'string'
                ? providerErrorCode.slice(0, 80)
                : 'PAYMENT_FAILED';
            await attempt.save({ session });
            await releaseInvoiceReservation(attempt.invoiceId, attempt.amountPaise, session);
            const existingFailure =
              typeof providerPaymentId === 'string'
                ? await PaymentModel.findOne({ providerPaymentId })
                    .select('+providerPaymentId')
                    .session(session)
                : null;
            if (!existingFailure) {
              const [failedPayment] = await PaymentModel.create(
                [
                  {
                    customerId: attempt.customerId,
                    amountPaise:
                      typeof providerAmount === 'number' &&
                      Number.isSafeInteger(providerAmount) &&
                      providerAmount > 0
                        ? providerAmount
                        : attempt.amountPaise,
                    currency: 'INR',
                    method: 'RAZORPAY_SANDBOX',
                    status: 'FAILED',
                    idempotencyKey: `razorpay:${String(providerPaymentId ?? eventId)}`,
                    providerPaymentId:
                      typeof providerPaymentId === 'string' ? providerPaymentId : undefined,
                    reference:
                      typeof providerPaymentId === 'string' ? providerPaymentId : undefined,
                    createdByUserId: attempt.createdByUserId,
                  },
                ],
                { session },
              );
              await AuditLogModel.create(
                [
                  {
                    actorUserId: attempt.createdByUserId,
                    action: 'RAZORPAY_TEST_PAYMENT_FAILED',
                    entityType: 'Payment',
                    entityId: failedPayment._id,
                    metadata: {
                      orderId: providerOrderId,
                      providerPaymentId,
                      amountPaise: failedPayment.amountPaise,
                      failureCode: attempt.failureCode,
                    },
                  },
                ],
                { session },
              );
              const admins = await UserModel.find({ role: 'ADMIN', status: 'ACTIVE' })
                .select('_id')
                .session(session)
                .lean();
              if (admins.length)
                await NotificationModel.insertMany(
                  admins.map((admin) => ({
                    userId: admin._id,
                    channel: 'IN_APP',
                    type: 'CUSTOMER_PAYMENT_FAILED',
                    message: `A test payment attempt failed for order ${providerOrderId}.`,
                    entityType: 'Payment',
                    entityId: failedPayment._id,
                    status: 'QUEUED',
                    deduplicationKey: `razorpay-failed:${String(providerPaymentId ?? eventId)}:${admin._id}`,
                  })),
                  { session, ordered: false },
                );
            }
          }
        });
      } finally {
        await session.endSession();
      }
    }
    await WebhookEventModel.updateOne(
      { provider: 'RAZORPAY', providerEventId: eventId },
      { $set: { status: 'PROCESSED', processedAt: new Date() } },
    );
    return { received: true, duplicate };
  } catch (error) {
    await WebhookEventModel.updateOne(
      { provider: 'RAZORPAY', providerEventId: eventId },
      { $set: { status: 'FAILED' } },
    );
    throw error;
  }
}

export async function listMyNotifications(auth: AuthContext) {
  return NotificationModel.find({ userId: auth.userId, channel: 'IN_APP' })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
}
