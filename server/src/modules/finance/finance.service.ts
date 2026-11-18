import { createHash } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { AuthError } from '../auth/auth.errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CustomerModel } from '../identity/identity.model.js';
import { ProductModel } from '../catalogue/catalogue.model.js';
import { AuditLogModel } from '../operations/operations.model.js';
import { enqueueForCustomer, enqueueForActiveAdmins } from '../operations/notification.service.js';
import {
  calculateInvoiceTotals,
  calculateOutstanding,
  canReserveAllocationRefund,
  planPaymentAllocation,
} from './finance.calculations.js';
import {
  InvoiceCounterModel,
  InvoiceModel,
  PaymentAllocationModel,
  PaymentModel,
  RefundModel,
  TaxConfigurationModel,
} from './finance.model.js';

const denied = () =>
  new AuthError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
const notFound = () =>
  new AuthError(404, 'FINANCIAL_RECORD_NOT_FOUND', 'The requested financial record was not found.');
function formatPaise(amountPaise: number) {
  const amount = BigInt(amountPaise);
  return `₹${new Intl.NumberFormat('en-IN').format(amount / 100n)}.${String(amount % 100n).padStart(2, '0')}`;
}
function permission(auth: AuthContext, key: string) {
  if (auth.role === 'CUSTOMER' || (auth.role === 'EMPLOYEE' && !auth.permissions.includes(key)))
    throw denied();
}
async function accessibleCustomer(
  customerId: string,
  auth: AuthContext,
  requiredPermission: 'invoices:create' | 'payments:record' | 'refunds:request' | false = false,
) {
  if (!Types.ObjectId.isValid(customerId)) throw notFound();
  if (auth.role === 'CUSTOMER') {
    if (auth.customerId !== customerId) throw notFound();
  } else if (auth.role === 'EMPLOYEE') {
    permission(auth, requiredPermission || 'finance:read');
    if (
      !(await CustomerModel.exists({
        _id: customerId,
        assignedEmployeeIds: auth.employeeId,
        status: 'ACTIVE',
      }))
    )
      throw notFound();
  }
  const customer = await CustomerModel.findOne({ _id: customerId, status: 'ACTIVE' })
    .select('_id')
    .lean();
  if (!customer) throw notFound();
}
async function inTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let output!: T;
    await session.withTransaction(async () => {
      output = await fn(session);
    });
    return output;
  } finally {
    await session.endSession();
  }
}
export function paymentFingerprint(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
function indiaPeriod(date: Date) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  return `${values.find((p) => p.type === 'year')!.value}${values.find((p) => p.type === 'month')!.value}`;
}
async function ensureInvoiceCounter(period: string) {
  try {
    await InvoiceCounterModel.updateOne(
      { period },
      { $setOnInsert: { period, value: 0 } },
      { upsert: true },
    );
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000))
      throw error;
    if (!(await InvoiceCounterModel.exists({ period }))) throw error;
  }
}
async function nextInvoiceNumber(session: mongoose.ClientSession, period: string) {
  const counter = await InvoiceCounterModel.findOneAndUpdate(
    { period },
    { $inc: { value: 1 } },
    { returnDocument: 'after', session },
  );
  if (!counter) throw new Error('Invoice sequence is not initialized.');
  return `VRK-${period}-${String(counter!.value).padStart(6, '0')}`;
}
async function amountByInvoice(
  customerId: string,
  invoiceIds: Types.ObjectId[],
  session?: mongoose.ClientSession,
) {
  if (!invoiceIds.length) return new Map<string, number>();
  const allocationRows = await PaymentAllocationModel.aggregate([
    { $match: { invoiceId: { $in: invoiceIds } } },
    { $lookup: { from: 'payments', localField: 'paymentId', foreignField: '_id', as: 'payment' } },
    { $unwind: '$payment' },
    {
      $match: {
        'payment.customerId': new Types.ObjectId(customerId),
        'payment.status': 'SUCCEEDED',
      },
    },
    { $group: { _id: '$invoiceId', paise: { $sum: '$amountPaise' } } },
  ]).session(session ?? null);
  const refunds = await RefundModel.aggregate([
    { $match: { invoiceId: { $in: invoiceIds }, status: 'PROCESSED' } },
    { $group: { _id: '$invoiceId', paise: { $sum: '$amountPaise' } } },
  ]).session(session ?? null);
  const map = new Map<string, number>();
  for (const row of allocationRows) map.set(String(row._id), Number(row.paise));
  for (const row of refunds)
    map.set(String(row._id), (map.get(String(row._id)) ?? 0) - Number(row.paise));
  return map;
}
async function recomputeInvoice(invoiceId: Types.ObjectId, session: mongoose.ClientSession) {
  const invoice = await InvoiceModel.findById(invoiceId).session(session);
  if (!invoice || ['VOID', 'DRAFT'].includes(invoice.status)) return;
  const amounts = await amountByInvoice(String(invoice.customerId), [invoiceId], session);
  const paid = amounts.get(String(invoiceId)) ?? 0;
  const due = calculateOutstanding(invoice.totalPaise, [paid]);
  invoice.status =
    due === 0
      ? 'PAID'
      : paid > 0
        ? 'PARTIALLY_PAID'
        : invoice.dueAt < new Date()
          ? 'OVERDUE'
          : 'ISSUED';
  await invoice.save({ session });
}

export async function createInvoice(
  input: {
    customerId: string;
    dueAt: string;
    lines: Array<{ productId: string; quantity: number }>;
    discountPaise: number;
    taxConfigurationId?: string;
  },
  auth: AuthContext,
) {
  if (auth.role === 'CUSTOMER') throw denied();
  permission(auth, 'invoices:create');
  await accessibleCustomer(input.customerId, auth, 'invoices:create');
  const issuedAt = new Date();
  const period = indiaPeriod(issuedAt);
  await ensureInvoiceCounter(period);
  return inTransaction(async (session) => {
    const ids = input.lines.map((line) => new Types.ObjectId(line.productId));
    const products = await ProductModel.find({ _id: { $in: ids }, status: 'ACTIVE' })
      .session(session)
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const lines = input.lines.map((item) => {
      const product = byId.get(item.productId);
      if (!product)
        throw new AuthError(
          400,
          'PRODUCT_UNAVAILABLE',
          'Invoice contains an unavailable product or service.',
        );
      if (product.kind === 'PHYSICAL' && (product.stockQuantity ?? 0) < item.quantity)
        throw new AuthError(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${product.name}.`);
      return {
        product,
        quantity: item.quantity,
        lineTotalPaise: BigInt(product.sellingPricePaise) * BigInt(item.quantity),
      };
    });
    const subtotalBig = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0n);
    if (subtotalBig > BigInt(Number.MAX_SAFE_INTEGER))
      throw new AuthError(400, 'TOTAL_TOO_LARGE', 'Invoice total exceeds supported range.');
    const subtotalPaise = Number(subtotalBig);
    let taxRateBps = 0;
    let taxMode: 'EXCLUSIVE' | 'INCLUSIVE' = 'EXCLUSIVE';
    let taxLabel: string | undefined;
    if (input.taxConfigurationId) {
      const tax = await TaxConfigurationModel.findOne({
        _id: input.taxConfigurationId,
        active: true,
      })
        .session(session)
        .lean();
      if (!tax)
        throw new AuthError(400, 'TAX_CONFIG_UNAVAILABLE', 'Choose an active tax configuration.');
      taxRateBps = tax.rateBps;
      taxMode = tax.mode as typeof taxMode;
      taxLabel = tax.name;
    }
    let totals;
    try {
      totals = calculateInvoiceTotals(subtotalPaise, input.discountPaise, taxRateBps, taxMode);
    } catch {
      throw new AuthError(
        400,
        'INVALID_INVOICE_TOTAL',
        'Discount or tax values exceed the invoice subtotal.',
      );
    }
    const number = await nextInvoiceNumber(session, period);
    const invoice = await InvoiceModel.create(
      [
        {
          invoiceNumber: number,
          customerId: input.customerId,
          issuedAt,
          dueAt: new Date(input.dueAt),
          lines: lines.map(({ product, quantity }) => ({
            nameSnapshot: product.name,
            quantity,
            unitPricePaise: product.sellingPricePaise,
            lineTotalPaise: Number(BigInt(product.sellingPricePaise) * BigInt(quantity)),
          })),
          ...totals,
          taxRateBps,
          taxMode,
          taxLabel,
          currency: 'INR',
          status: 'ISSUED',
          taxConfigurationStatus: input.taxConfigurationId ? 'PENDING_APPROVAL' : 'NOT_CONFIGURED',
        },
      ],
      { session },
    );
    for (const line of lines) {
      if (line.product.kind === 'PHYSICAL') {
        const stock = await ProductModel.updateOne(
          { _id: line.product._id, stockQuantity: { $gte: line.quantity } },
          { $inc: { stockQuantity: -line.quantity } },
          { session },
        );
        if (!stock.modifiedCount)
          throw new AuthError(
            409,
            'INSUFFICIENT_STOCK',
            'Stock changed while creating the invoice. Please retry.',
          );
      }
    }
    await AuditLogModel.create(
      [
        {
          actorUserId: auth.userId,
          action: 'INVOICE_CREATED',
          entityType: 'Invoice',
          entityId: invoice[0]._id,
          metadata: { invoiceNumber: number, totalPaise: totals.totalPaise },
        },
      ],
      { session },
    );
    await enqueueForCustomer({
      customerId: input.customerId,
      type: 'INVOICE_GENERATED',
      message: `Invoice ${invoice[0].invoiceNumber} was generated for ${formatPaise(totals.totalPaise)}.`,
      entityType: 'Invoice',
      entityId: invoice[0]._id,
      deduplicationKey: `invoice-generated:${invoice[0]._id}`,
      session,
    });
    return invoice[0];
  });
}

export async function listInvoices(
  auth: AuthContext,
  args: { page: number; limit: number; customerId?: string; status?: string; q?: string },
) {
  const filter: Record<string, unknown> = {};
  if (auth.role === 'CUSTOMER') filter.customerId = auth.customerId;
  else {
    permission(auth, 'finance:read');
    if (args.customerId) {
      await accessibleCustomer(args.customerId, auth);
      filter.customerId = args.customerId;
    }
    if (auth.role === 'EMPLOYEE') {
      const customers = await CustomerModel.find({ assignedEmployeeIds: auth.employeeId }).distinct(
        '_id',
      );
      filter.customerId = args.customerId
        ? new Types.ObjectId(args.customerId)
        : { $in: customers };
    }
  }
  if (args.status) filter.status = args.status;
  if (args.q) filter.invoiceNumber = new RegExp(args.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [items, total] = await Promise.all([
    InvoiceModel.find(filter)
      .sort({ issuedAt: -1 })
      .skip((args.page - 1) * args.limit)
      .limit(args.limit)
      .lean(),
    InvoiceModel.countDocuments(filter),
  ]);
  return {
    items,
    pagination: { page: args.page, limit: args.limit, total, pages: Math.ceil(total / args.limit) },
  };
}

export async function recordPayment(
  input: {
    customerId: string;
    amountPaise: number;
    method: 'CASH' | 'UPI' | 'BANK_TRANSFER';
    status: 'SUCCEEDED' | 'FAILED';
    idempotencyKey: string;
    reference?: string;
    receivedAt?: string;
    allocations?: Array<{ invoiceId: string; amountPaise: number }>;
  },
  auth: AuthContext,
) {
  if (auth.role === 'CUSTOMER') throw denied();
  permission(auth, 'payments:record');
  await accessibleCustomer(input.customerId, auth, 'payments:record');
  const print = paymentFingerprint({
    ...input,
    allocations: [...(input.allocations ?? [])].sort((a, b) =>
      a.invoiceId.localeCompare(b.invoiceId),
    ),
  });
  const old = await PaymentModel.findOne({ idempotencyKey: input.idempotencyKey }).select(
    '+requestFingerprint',
  );
  if (old) {
    if (old.requestFingerprint !== print)
      throw new AuthError(
        409,
        'IDEMPOTENCY_KEY_REUSED',
        'This request key was already used for different payment details.',
      );
    return old;
  }
  try {
    return await inTransaction(async (session) => {
      const invoices = await InvoiceModel.find({
        customerId: input.customerId,
        status: { $nin: ['DRAFT', 'VOID', 'PAID'] },
      })
        .sort({ issuedAt: 1, _id: 1 })
        .session(session);
      const map = await amountByInvoice(
        input.customerId,
        invoices.map((i) => i._id),
        session,
      );
      const outstanding = invoices.map((i) => ({
        invoiceId: String(i._id),
        outstandingPaise: calculateOutstanding(i.totalPaise, [map.get(String(i._id)) ?? 0]),
      }));
      let allocations: Array<{ invoiceId: string; amountPaise: number }>;
      try {
        allocations = planPaymentAllocation(
          input.status,
          input.amountPaise,
          outstanding,
          input.allocations,
        ).allocations;
      } catch (error) {
        throw new AuthError(
          409,
          'INVALID_ALLOCATION',
          error instanceof Error ? error.message : 'Payment allocation is invalid.',
        );
      }
      const created = await PaymentModel.create(
        [
          {
            customerId: input.customerId,
            amountPaise: input.amountPaise,
            currency: 'INR',
            method: input.method,
            status: input.status,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: print,
            reference: input.reference,
            receivedAt:
              input.status === 'SUCCEEDED'
                ? input.receivedAt
                  ? new Date(input.receivedAt)
                  : new Date()
                : undefined,
            createdByUserId: auth.userId,
          },
        ],
        { session },
      );
      if (input.status === 'SUCCEEDED' && allocations.length) {
        await PaymentAllocationModel.insertMany(
          allocations.map((a) => ({
            paymentId: created[0]._id,
            invoiceId: a.invoiceId,
            amountPaise: a.amountPaise,
            allocatedByUserId: auth.userId,
          })),
          { session },
        );
        for (const id of [...new Set(allocations.map((a) => a.invoiceId))])
          await recomputeInvoice(new Types.ObjectId(id), session);
      }
      await AuditLogModel.create(
        [
          {
            actorUserId: auth.userId,
            action: input.status === 'SUCCEEDED' ? 'PAYMENT_RECORDED' : 'PAYMENT_FAILED_RECORDED',
            entityType: 'Payment',
            entityId: created[0]._id,
            metadata: { amountPaise: input.amountPaise, method: input.method },
          },
        ],
        { session },
      );
      if (input.status === 'SUCCEEDED') {
        const amount = formatPaise(input.amountPaise);
        await enqueueForCustomer({
          customerId: input.customerId,
          type: 'PAYMENT_RECEIVED',
          message: `We received your ${amount} payment by ${input.method.replaceAll('_', ' ').toLowerCase()}.`,
          entityType: 'Payment',
          entityId: created[0]._id,
          deduplicationKey: `manual-payment-received:${created[0]._id}`,
          session,
        });
        await enqueueForActiveAdmins({
          type: 'PAYMENT_RECEIVED',
          message: `A ${amount} payment by ${input.method.replaceAll('_', ' ').toLowerCase()} was recorded for customer ${input.customerId}.`,
          entityType: 'Payment',
          entityId: created[0]._id,
          deduplicationKey: `manual-payment-received:${created[0]._id}`,
          session,
        });
      }
      return created[0];
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      const raced = await PaymentModel.findOne({ idempotencyKey: input.idempotencyKey }).select(
        '+requestFingerprint',
      );
      if (raced?.requestFingerprint === print) return raced;
      throw new AuthError(409, 'IDEMPOTENCY_KEY_REUSED', 'This request key was already used.');
    }
    throw error;
  }
}

export async function listPayments(
  auth: AuthContext,
  args: { page: number; limit: number; customerId?: string; status?: string },
) {
  const filter: Record<string, unknown> = {};
  if (auth.role === 'CUSTOMER') filter.customerId = auth.customerId;
  else {
    permission(auth, 'finance:read');
    if (args.customerId) {
      await accessibleCustomer(args.customerId, auth);
      filter.customerId = args.customerId;
    }
    if (auth.role === 'EMPLOYEE') {
      const assigned = await CustomerModel.find({ assignedEmployeeIds: auth.employeeId }).distinct(
        '_id',
      );
      filter.customerId = args.customerId ? new Types.ObjectId(args.customerId) : { $in: assigned };
    }
  }
  if (args.status) filter.status = args.status;
  const [items, total] = await Promise.all([
    PaymentModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((args.page - 1) * args.limit)
      .limit(args.limit)
      .lean(),
    PaymentModel.countDocuments(filter),
  ]);
  return {
    items,
    pagination: { page: args.page, limit: args.limit, total, pages: Math.ceil(total / args.limit) },
  };
}

export async function getInvoice(invoiceId: string, auth: AuthContext) {
  if (!Types.ObjectId.isValid(invoiceId)) throw notFound();
  const invoice = await InvoiceModel.findById(invoiceId).lean();
  if (!invoice) throw notFound();
  await accessibleCustomer(String(invoice.customerId), auth);
  return invoice;
}
export async function getPayment(paymentId: string, auth: AuthContext) {
  if (!Types.ObjectId.isValid(paymentId)) throw notFound();
  const payment = await PaymentModel.findById(paymentId).lean();
  if (!payment) throw notFound();
  await accessibleCustomer(String(payment.customerId), auth);
  return payment;
}

export async function createRefund(
  input: { paymentId: string; invoiceId?: string; amountPaise: number; reason: string },
  auth: AuthContext,
) {
  if (auth.role === 'CUSTOMER') throw denied();
  permission(auth, 'refunds:request');
  const payment = await PaymentModel.findOne({ _id: input.paymentId, status: 'SUCCEEDED' });
  if (!payment) throw notFound();
  if (payment.method === 'RAZORPAY_SANDBOX')
    throw new AuthError(
      409,
      'GATEWAY_REFUND_NOT_AVAILABLE',
      'Razorpay refunds are not part of this sandbox payment phase.',
    );
  await accessibleCustomer(String(payment.customerId), auth, 'refunds:request');
  return inTransaction(async (session) => {
    const lockedPayment = await PaymentModel.findOneAndUpdate(
      {
        _id: payment._id,
        status: 'SUCCEEDED',
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ['$refundReservedPaise', 0] }, input.amountPaise] },
            '$amountPaise',
          ],
        },
      },
      { $inc: { refundReservedPaise: input.amountPaise } },
      { returnDocument: 'after', session },
    );
    if (!lockedPayment)
      throw new AuthError(409, 'REFUND_EXCEEDS_PAYMENT', 'Refund exceeds the available payment.');
    const allocations = await PaymentAllocationModel.find({ paymentId: payment._id })
      .select('+refundReservedPaise')
      .session(session)
      .lean();
    if (input.invoiceId) {
      const invoiceId = new Types.ObjectId(input.invoiceId);
      const ownAllocation = allocations.find((row) => String(row.invoiceId) === input.invoiceId);
      if (!ownAllocation)
        throw new AuthError(
          400,
          'INVALID_REFUND_INVOICE',
          'The selected invoice is not allocated to this payment.',
        );
      if (
        !canReserveAllocationRefund(
          ownAllocation.amountPaise,
          ownAllocation.refundReservedPaise ?? 0,
          input.amountPaise,
        )
      )
        throw new AuthError(
          409,
          'REFUND_EXCEEDS_ALLOCATION',
          'Refund exceeds this payment’s remaining allocation to the invoice.',
        );
      const reservedAllocation = await PaymentAllocationModel.updateOne(
        {
          _id: ownAllocation._id,
          $expr: {
            $lte: [
              {
                $add: [{ $ifNull: ['$refundReservedPaise', 0] }, input.amountPaise],
              },
              '$amountPaise',
            ],
          },
        },
        { $inc: { refundReservedPaise: input.amountPaise } },
        { session },
      );
      if (!reservedAllocation.modifiedCount)
        throw new AuthError(
          409,
          'REFUND_EXCEEDS_ALLOCATION',
          'Refund exceeds this payment’s remaining allocation to the invoice.',
        );
      const allAllocated = await PaymentAllocationModel.aggregate([
        { $match: { invoiceId } },
        {
          $lookup: {
            from: 'payments',
            localField: 'paymentId',
            foreignField: '_id',
            as: 'payment',
          },
        },
        { $unwind: '$payment' },
        { $match: { 'payment.status': 'SUCCEEDED' } },
        { $group: { _id: null, total: { $sum: '$amountPaise' } } },
      ]).session(session);
      const invoice = await InvoiceModel.findOneAndUpdate(
        {
          _id: invoiceId,
          customerId: payment.customerId,
          $expr: {
            $lte: [
              { $add: [{ $ifNull: ['$refundReservedPaise', 0] }, input.amountPaise] },
              Number(allAllocated[0]?.total ?? 0),
            ],
          },
        },
        { $inc: { refundReservedPaise: input.amountPaise } },
        { returnDocument: 'after', session },
      );
      if (!invoice)
        throw new AuthError(
          409,
          'REFUND_EXCEEDS_ALLOCATION',
          'Refund exceeds the invoice allocation remaining.',
        );
    } else if (allocations.length) {
      throw new AuthError(
        400,
        'REFUND_INVOICE_REQUIRED',
        'Choose an invoice to associate with the refund.',
      );
    }
    const [refund] = await RefundModel.create(
      [{ ...input, status: 'PENDING_APPROVAL', requestedByUserId: auth.userId }],
      { session },
    );
    await AuditLogModel.create(
      [
        {
          actorUserId: auth.userId,
          action: 'REFUND_REQUESTED',
          entityType: 'Refund',
          entityId: refund._id,
          metadata: { paymentId: payment.id, amountPaise: refund.amountPaise },
        },
      ],
      { session },
    );
    return refund;
  });
}

export async function listRefunds(auth: AuthContext) {
  if (auth.role !== 'ADMIN') throw denied();
  permission(auth, 'finance:read');
  return RefundModel.find().sort({ createdAt: -1 }).limit(200).lean();
}

export async function decideRefund(refundId: string, approve: boolean, auth: AuthContext) {
  if (auth.role !== 'ADMIN') throw denied();
  return inTransaction(async (session) => {
    const refund = await RefundModel.findOneAndUpdate(
      { _id: refundId, status: 'PENDING_APPROVAL' },
      {
        $set: {
          status: approve ? 'PROCESSED' : 'REJECTED',
          ...(approve ? { approvedByUserId: new Types.ObjectId(auth.userId) } : {}),
        },
      },
      { returnDocument: 'after', session },
    );
    if (!refund) throw notFound();
    if (!approve) {
      await PaymentModel.updateOne(
        { _id: refund.paymentId },
        [
          {
            $set: {
              refundReservedPaise: {
                $max: [
                  0,
                  {
                    $subtract: [{ $ifNull: ['$refundReservedPaise', 0] }, refund.amountPaise],
                  },
                ],
              },
            },
          },
        ],
        { session },
      );
      if (refund.invoiceId)
        await InvoiceModel.updateOne(
          { _id: refund.invoiceId },
          [
            {
              $set: {
                refundReservedPaise: {
                  $max: [
                    0,
                    {
                      $subtract: [{ $ifNull: ['$refundReservedPaise', 0] }, refund.amountPaise],
                    },
                  ],
                },
              },
            },
          ],
          { session },
        );
      if (refund.invoiceId)
        await PaymentAllocationModel.updateOne(
          { paymentId: refund.paymentId, invoiceId: refund.invoiceId },
          [
            {
              $set: {
                refundReservedPaise: {
                  $max: [
                    0,
                    {
                      $subtract: [{ $ifNull: ['$refundReservedPaise', 0] }, refund.amountPaise],
                    },
                  ],
                },
              },
            },
          ],
          { session },
        );
    } else if (refund.invoiceId) await recomputeInvoice(refund.invoiceId, session);
    await AuditLogModel.create(
      [
        {
          actorUserId: auth.userId,
          action: approve ? 'REFUND_PROCESSED' : 'REFUND_REJECTED',
          entityType: 'Refund',
          entityId: refund._id,
          metadata: { amountPaise: refund.amountPaise },
        },
      ],
      { session },
    );
    return refund;
  });
}

export async function ledger(auth: AuthContext, customerId: string) {
  await accessibleCustomer(customerId, auth);
  const [invoices, payments, refunds] = await Promise.all([
    InvoiceModel.find({ customerId, status: { $nin: ['DRAFT', 'VOID'] } })
      .sort({ issuedAt: 1 })
      .lean(),
    PaymentModel.find({ customerId }).sort({ createdAt: 1 }).lean(),
    RefundModel.find({ status: 'PROCESSED' })
      .populate({ path: 'paymentId', match: { customerId } })
      .sort({ createdAt: 1 })
      .lean(),
  ]);
  const invoiceIds = invoices.map((i) => i._id);
  const amounts = await amountByInvoice(customerId, invoiceIds);
  const invoiceRows = invoices.map((invoice) => ({
    ...invoice,
    paidPaise: Math.max(0, amounts.get(String(invoice._id)) ?? 0),
    outstandingPaise: calculateOutstanding(invoice.totalPaise, [
      amounts.get(String(invoice._id)) ?? 0,
    ]),
  }));
  const received = payments
    .filter((p) => p.status === 'SUCCEEDED')
    .reduce((sum, p) => sum + BigInt(p.amountPaise), 0n);
  const refunded = refunds
    .filter((r) => r.paymentId)
    .reduce((sum, r) => sum + BigInt(r.amountPaise), 0n);
  const allocated = [...amounts.values()].reduce((sum, p) => sum + BigInt(Math.max(0, p)), 0n);
  const invoiced = invoices.reduce((sum, i) => sum + BigInt(i.totalPaise), 0n);
  return {
    customerId,
    invoices: invoiceRows,
    payments,
    refunds: refunds.filter((r) => r.paymentId),
    summary: {
      invoicedPaise: Number(invoiced),
      receivedPaise: Number(received),
      refundedPaise: Number(refunded),
      allocatedPaise: Number(allocated),
      outstandingPaise: Math.max(0, Number(invoiced - allocated)),
      advancePaise: Math.max(0, Number(received - refunded - allocated)),
      currency: 'INR' as const,
    },
  };
}

export async function setTaxConfiguration(
  input: { name: string; rateBps: number; mode: 'EXCLUSIVE' | 'INCLUSIVE'; active: boolean },
  auth: AuthContext,
) {
  if (auth.role !== 'ADMIN') throw denied();
  const tax = await TaxConfigurationModel.create(input);
  await AuditLogModel.create({
    actorUserId: auth.userId,
    action: 'TAX_CONFIGURATION_CREATED',
    entityType: 'TaxConfiguration',
    entityId: tax._id,
    metadata: { name: tax.name, rateBps: tax.rateBps, mode: tax.mode },
  });
  return tax;
}

export async function listTaxConfigurations(auth: AuthContext) {
  if (auth.role === 'CUSTOMER') throw denied();
  permission(auth, 'finance:read');
  return TaxConfigurationModel.find({ active: true }).sort({ updatedAt: -1 }).lean();
}

export async function runOverdueInvoiceJob(now = new Date()) {
  const dueInvoices = await InvoiceModel.find({
    status: { $in: ['ISSUED', 'PARTIALLY_PAID'] },
    dueAt: { $lt: now },
  })
    .select('_id customerId invoiceNumber dueAt')
    .lean();
  let updated = 0;
  for (const invoice of dueInvoices) {
    const result = await InvoiceModel.updateOne(
      { _id: invoice._id, status: { $in: ['ISSUED', 'PARTIALLY_PAID'] }, dueAt: { $lt: now } },
      { $set: { status: 'OVERDUE' } },
    );
    if (!result.modifiedCount) continue;
    updated += 1;
    await enqueueForCustomer({
      customerId: invoice.customerId,
      type: 'PAYMENT_OVERDUE',
      message: `Invoice ${invoice.invoiceNumber} was due on ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(invoice.dueAt)} and has an outstanding balance.`,
      entityType: 'Invoice',
      entityId: invoice._id,
      deduplicationKey: `payment-overdue:${invoice._id}`,
    });
  }
  return updated;
}
