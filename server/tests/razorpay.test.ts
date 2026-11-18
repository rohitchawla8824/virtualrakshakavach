import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';
import { PaymentModel, RazorpayOrderModel } from '../src/modules/finance/finance.model.js';
import { WebhookEventModel } from '../src/modules/operations/operations.model.js';
import {
  isTestKeyId,
  verifyHmacSignature,
  createRazorpayTestOrderRequest,
} from '../src/modules/payments/razorpay.service.js';
import {
  createOrderSchema,
  verifyPaymentSchema,
} from '../src/modules/payments/razorpay.schemas.js';

const originalTestKeyId = env.RAZORPAY_TEST_KEY_ID;
const originalTestKeySecret = env.RAZORPAY_TEST_KEY_SECRET;
const originalWebhookSecret = env.RAZORPAY_TEST_WEBHOOK_SECRET;

afterEach(() => {
  env.RAZORPAY_TEST_KEY_ID = originalTestKeyId;
  env.RAZORPAY_TEST_KEY_SECRET = originalTestKeySecret;
  env.RAZORPAY_TEST_WEBHOOK_SECRET = originalWebhookSecret;
  vi.unstubAllGlobals();
});

describe('Razorpay test-mode safeguards', () => {
  it('accepts only test key IDs and rejects live key prefixes', () => {
    expect(isTestKeyId('rzp_test_unit123')).toBe(true);
    expect(isTestKeyId('rzp_live_unit123')).toBe(false);
    expect(isTestKeyId('unit123')).toBe(false);
  });

  it('verifies checkout and webhook HMAC signatures with constant-time comparison', () => {
    const secret = 'test-only-webhook-secret';
    const payload = Buffer.from('{"event":"payment.captured"}');
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifyHmacSignature(secret, payload, signature)).toBe(true);
    expect(verifyHmacSignature(secret, payload, `${signature.slice(0, -1)}0`)).toBe(false);
    expect(verifyHmacSignature(secret, payload, 'invalid')).toBe(false);
  });

  it('sends only integer paise to the sandbox REST API and keeps credentials in Basic auth', async () => {
    env.RAZORPAY_TEST_KEY_ID = 'rzp_test_unit123';
    env.RAZORPAY_TEST_KEY_SECRET = 'server-only-test-secret';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'order_test123', amount: 12345, currency: 'INR' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createRazorpayTestOrderRequest({
      amountPaise: 12345,
      receipt: 'vrk_test_receipt',
      attemptId: 'attempt-test',
      invoiceNumber: 'VRK-202611-000001',
    });

    expect(result).toEqual({ id: 'order_test123', amount: 12345, currency: 'INR' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.razorpay.com/v1/orders');
    expect(new Headers(init.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('rzp_test_unit123:server-only-test-secret').toString('base64')}`,
    );
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 12345, currency: 'INR' });
  });

  it('rejects non-integer provider order amounts and validates checkout contracts', () => {
    expect(() =>
      createRazorpayTestOrderRequest({
        amountPaise: 120.5,
        receipt: 'r',
        attemptId: 'a',
        invoiceNumber: 'i',
      }),
    ).toThrow();
    expect(
      createOrderSchema.safeParse({
        invoiceId: '665f00000000000000000001',
        idempotencyKey: 'checkout-unique-1',
      }).success,
    ).toBe(true);
    expect(
      verifyPaymentSchema.safeParse({
        orderId: 'order_abc123',
        paymentId: 'pay_abc123',
        signature: 'a'.repeat(64),
      }).success,
    ).toBe(true);
    expect(
      verifyPaymentSchema.safeParse({
        orderId: 'order_abc123',
        paymentId: 'pay_abc123',
        signature: 'x',
      }).success,
    ).toBe(false);
  });

  it('declares unique provider payment, order request, and webhook event indexes', () => {
    const paymentIndexes = PaymentModel.schema.indexes();
    const providerPayment = paymentIndexes.find(([fields]) => 'providerPaymentId' in fields);
    const orderIndexes = RazorpayOrderModel.schema.indexes();
    const requestKey = orderIndexes.find(
      ([fields]) => 'customerId' in fields && 'requestKey' in fields,
    );
    const webhookIndexes = WebhookEventModel.schema.indexes();
    const eventId = webhookIndexes.find(
      ([fields]) => 'provider' in fields && 'providerEventId' in fields,
    );
    expect(providerPayment?.[1].unique).toBe(true);
    expect(requestKey?.[1].unique).toBe(true);
    expect(eventId?.[1].unique).toBe(true);
  });

  it('requires authentication for order creation and user notifications', async () => {
    expect((await request(app).post('/api/v1/payments/razorpay/orders').send({})).status).toBe(401);
    expect((await request(app).get('/api/v1/notifications')).status).toBe(401);
  });

  it('rejects webhook signatures that do not match the exact raw request bytes', async () => {
    env.RAZORPAY_TEST_WEBHOOK_SECRET = 'sandbox-webhook-secret';
    const signedBody = '{ "event": "payment.captured" }';
    const sentBody = '{"event":"payment.captured"}';
    const signature = createHmac('sha256', env.RAZORPAY_TEST_WEBHOOK_SECRET)
      .update(signedBody)
      .digest('hex');
    const response = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-event-id', 'evt_raw_body_test')
      .set('x-razorpay-signature', signature)
      .set('Content-Type', 'application/json')
      .send(sentBody);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
  });
});
