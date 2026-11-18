import { Router } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validate-request.js';
import { authenticateUser, requireCsrf, requireRole } from '../auth/auth.middleware.js';
import {
  listAssignableEmployeesController,
  ownEmployeeProfileController,
  updateOwnEmployeeProfileController,
} from './employee.controller.js';

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();

export const employeeRouter = Router();
const ownProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160).optional(),
    phone: z.union([z.string().trim().max(32), z.null()]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
employeeRouter.get('/me', authenticateUser, ownEmployeeProfileController);
employeeRouter.patch(
  '/me',
  authenticateUser,
  requireCsrf,
  validateRequest({ body: ownProfileSchema }),
  updateOwnEmployeeProfileController,
);
employeeRouter.get(
  '/assignable',
  authenticateUser,
  requireRole('ADMIN'),
  validateRequest({ query: querySchema }),
  listAssignableEmployeesController,
);
