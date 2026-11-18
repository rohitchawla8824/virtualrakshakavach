import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  archiveCustomerController,
  createCustomerController,
  getCustomerController,
  getOwnCustomerController,
  listCustomerRecordsController,
  listOwnCustomerRecordsController,
  listCustomersController,
  requestCustomerEmailChangeController,
  requestOwnEmailChangeController,
  updateCustomerController,
  updateOwnCustomerController,
} from './customer.controller.js';
import {
  createCustomerSchema,
  customerIdParamsSchema,
  customerOwnRecordParamsSchema,
  customerListQuerySchema,
  customerRecordParamsSchema,
  emailChangeSchema,
  relatedListQuerySchema,
  updateCustomerSchema,
} from './customer.schemas.js';
import { authenticateUser, requireCsrf } from '../auth/auth.middleware.js';

export const customerRouter = Router();
customerRouter.use(authenticateUser);
const emailChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

customerRouter.get(
  '/',
  validateRequest({ query: customerListQuerySchema }),
  listCustomersController,
);
customerRouter.post(
  '/',
  requireCsrf,
  validateRequest({ body: createCustomerSchema }),
  createCustomerController,
);

customerRouter.get('/me', getOwnCustomerController);
customerRouter.get(
  '/me/:kind',
  validateRequest({ params: customerOwnRecordParamsSchema, query: relatedListQuerySchema }),
  listOwnCustomerRecordsController,
);
customerRouter.patch(
  '/me',
  requireCsrf,
  validateRequest({ body: updateCustomerSchema }),
  updateOwnCustomerController,
);
customerRouter.post(
  '/me/email-change',
  emailChangeLimiter,
  requireCsrf,
  validateRequest({ body: emailChangeSchema }),
  requestOwnEmailChangeController,
);

customerRouter.post(
  '/:customerId/email-change',
  emailChangeLimiter,
  requireCsrf,
  validateRequest({ params: customerIdParamsSchema }),
  validateRequest({ body: emailChangeSchema }),
  requestCustomerEmailChangeController,
);
customerRouter.get(
  '/:customerId/:kind',
  validateRequest({ params: customerRecordParamsSchema, query: relatedListQuerySchema }),
  listCustomerRecordsController,
);
customerRouter.get(
  '/:customerId',
  validateRequest({ params: customerIdParamsSchema }),
  getCustomerController,
);
customerRouter.patch(
  '/:customerId',
  requireCsrf,
  validateRequest({ params: customerIdParamsSchema, body: updateCustomerSchema }),
  updateCustomerController,
);
customerRouter.delete(
  '/:customerId',
  requireCsrf,
  validateRequest({ params: customerIdParamsSchema }),
  archiveCustomerController,
);
