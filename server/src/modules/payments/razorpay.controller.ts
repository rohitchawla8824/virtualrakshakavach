import type { RequestHandler, Request } from 'express';
import { AuthError } from '../auth/auth.errors.js';
import {
  cancelCheckoutOrder,
  createRazorpayOrder,
  listMyNotifications,
  processRazorpayWebhook,
  verifyCheckoutPayment,
} from './razorpay.service.js';

function auth(req: Request) {
  if (!req.auth) throw new AuthError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return req.auth;
}
function json(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(json);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const out =
    typeof (value as { toObject?: unknown }).toObject === 'function'
      ? (value as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(value as Record<string, unknown>) };
  if (out._id) {
    out.id = String(out._id);
    delete out._id;
  }
  delete out.__v;
  for (const [key, item] of Object.entries(out)) out[key] = json(item);
  return out;
}

export const createRazorpayOrderController: RequestHandler = async (req, res) =>
  res.status(201).json(await createRazorpayOrder(req.body, auth(req)));

export const verifyRazorpayPaymentController: RequestHandler = async (req, res) =>
  res.json(await verifyCheckoutPayment(req.body, auth(req)));

export const cancelRazorpayOrderController: RequestHandler = async (req, res) =>
  res.json(await cancelCheckoutOrder(String(req.params.orderId), auth(req)));

export const razorpayWebhookController: RequestHandler = async (req, res) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody)
    throw new AuthError(400, 'WEBHOOK_BODY_MISSING', 'Webhook payload could not be verified.');
  const result = await processRazorpayWebhook(
    req.get('x-razorpay-event-id') ?? '',
    req.get('x-razorpay-signature') ?? '',
    rawBody,
    req.body,
  );
  res.status(200).json(result);
};

export const myNotificationsController: RequestHandler = async (req, res) =>
  res.json(json({ items: await listMyNotifications(auth(req)) }));
