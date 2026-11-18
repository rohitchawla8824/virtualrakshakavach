import type { RequestHandler } from 'express';
import { AuthError } from '../auth/auth.errors.js';
import {
  archivePlan,
  assignSubscription,
  cancelSubscription,
  createPlan,
  listPlans,
  listSubscriptions,
  renewSubscription,
  subscriptionHistory,
  updatePlan,
} from './subscription.service.js';

function auth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) throw new AuthError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return request.auth;
}
function result(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(result);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (
    'toHexString' in value &&
    typeof (value as { toHexString?: unknown }).toHexString === 'function'
  )
    return (value as { toHexString: () => string }).toHexString();
  const obj =
    typeof (value as { toObject?: unknown }).toObject === 'function'
      ? (value as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(value as Record<string, unknown>) };
  if (obj._id) {
    obj.id = String(obj._id);
    delete obj._id;
  }
  delete obj.__v;
  for (const [key, nested] of Object.entries(obj)) obj[key] = result(nested);
  return obj;
}
export const listPlansController: RequestHandler = async (req, res) =>
  res.json(
    result(
      await listPlans(
        auth(req),
        req.query.q as string,
        (req.query.status as string) ?? 'ACTIVE',
        Number(req.query.page),
        Number(req.query.limit),
      ),
    ),
  );
export const createPlanController: RequestHandler = async (req, res) =>
  res.status(201).json({ plan: result(await createPlan(req.body, auth(req))) });
export const updatePlanController: RequestHandler = async (req, res) =>
  res.json({ plan: result(await updatePlan(String(req.params.planId), req.body, auth(req))) });
export const archivePlanController: RequestHandler = async (req, res) =>
  res.json({ plan: result(await archivePlan(String(req.params.planId), auth(req))) });
export const listSubscriptionsController: RequestHandler = async (req, res) =>
  res.json(result(await listSubscriptions(auth(req), req.query as never)));
export const assignSubscriptionController: RequestHandler = async (req, res) =>
  res.status(201).json({ subscription: result(await assignSubscription(req.body, auth(req))) });
export const renewSubscriptionController: RequestHandler = async (req, res) =>
  res.status(201).json({
    subscription: result(
      await renewSubscription(String(req.params.subscriptionId), req.body, auth(req)),
    ),
  });
export const cancelSubscriptionController: RequestHandler = async (req, res) =>
  res.json({
    subscription: result(await cancelSubscription(String(req.params.subscriptionId), auth(req))),
  });
export const subscriptionHistoryController: RequestHandler = async (req, res) =>
  res.json(
    result(
      await subscriptionHistory(
        String(req.params.subscriptionId),
        auth(req),
        Number(req.query.page),
        Number(req.query.limit),
      ),
    ),
  );
