import { Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { authenticateUser } from '../auth/auth.middleware.js';
import { reportController } from './report.controller.js';
import { reportParamsSchema, reportQuerySchema } from './report.schemas.js';

export const reportRouter = Router();
reportRouter.use(authenticateUser);
reportRouter.get(
  '/:reportId',
  validateRequest({ params: reportParamsSchema, query: reportQuerySchema }),
  reportController,
);
