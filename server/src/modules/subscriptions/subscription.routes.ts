import { Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { authenticateUser, requireCsrf } from '../auth/auth.middleware.js';
import {
  archivePlanController,
  assignSubscriptionController,
  cancelSubscriptionController,
  createPlanController,
  listPlansController,
  listSubscriptionsController,
  renewSubscriptionController,
  subscriptionHistoryController,
  updatePlanController,
} from './subscription.controller.js';
import {
  assignSubscriptionSchema,
  createPlanSchema,
  planIdParamsSchema,
  planListSchema,
  relatedSubscriptionQuerySchema,
  renewSubscriptionSchema,
  subscriptionIdParamsSchema,
  subscriptionListSchema,
  updatePlanSchema,
} from './subscription.schemas.js';

export const subscriptionRouter = Router();
subscriptionRouter.use(authenticateUser);
subscriptionRouter.get('/plans', validateRequest({ query: planListSchema }), listPlansController);
subscriptionRouter.post(
  '/plans',
  requireCsrf,
  validateRequest({ body: createPlanSchema }),
  createPlanController,
);
subscriptionRouter.patch(
  '/plans/:planId',
  requireCsrf,
  validateRequest({ params: planIdParamsSchema, body: updatePlanSchema }),
  updatePlanController,
);
subscriptionRouter.delete(
  '/plans/:planId',
  requireCsrf,
  validateRequest({ params: planIdParamsSchema }),
  archivePlanController,
);
subscriptionRouter.get(
  '/',
  validateRequest({ query: subscriptionListSchema }),
  listSubscriptionsController,
);
subscriptionRouter.post(
  '/',
  requireCsrf,
  validateRequest({ body: assignSubscriptionSchema }),
  assignSubscriptionController,
);
subscriptionRouter.post(
  '/:subscriptionId/renew',
  requireCsrf,
  validateRequest({ params: subscriptionIdParamsSchema, body: renewSubscriptionSchema }),
  renewSubscriptionController,
);
subscriptionRouter.post(
  '/:subscriptionId/cancel',
  requireCsrf,
  validateRequest({ params: subscriptionIdParamsSchema }),
  cancelSubscriptionController,
);
subscriptionRouter.get(
  '/:subscriptionId/history',
  validateRequest({ params: subscriptionIdParamsSchema, query: relatedSubscriptionQuerySchema }),
  subscriptionHistoryController,
);
