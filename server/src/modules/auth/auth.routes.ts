import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validateRequest } from '../../middleware/validate-request.js';
import {
  acceptInvitationController,
  changePasswordController,
  confirmEmailChangeController,
  createInvitationController,
  csrfController,
  currentUserController,
  forgotPasswordController,
  loginController,
  logoutController,
  refreshController,
  resetPasswordController,
  setAccountStatusController,
} from './auth.controller.js';
import {
  authenticateCsrfSource,
  authenticateUser,
  requireCsrf,
  requirePermission,
  requireRefreshCsrf,
  requireRefreshCsrfWhenPresent,
  requireRole,
} from './auth.middleware.js';
import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine(
    (password) => Buffer.byteLength(password, 'utf8') <= 72,
    'Password must be no more than 72 UTF-8 bytes.',
  );
const loginSchema = z
  .object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) })
  .strict();
const emailSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
const resetSchema = z
  .object({ token: z.string().min(32).max(200), password: passwordSchema })
  .strict();
const invitationAcceptSchema = resetSchema;
const confirmEmailChangeSchema = z.object({ token: z.string().min(32).max(200) }).strict();
const createInvitationSchema = z
  .object({
    email: z.string().trim().email().max(254),
    displayName: z.string().trim().min(1).max(160),
    role: z.enum(['EMPLOYEE', 'CUSTOMER']),
    phone: z.string().trim().max(32).optional(),
    permissions: z.array(z.string().trim().min(3).max(80)).max(100).optional(),
  })
  .strict();
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }).strict();
const userIdSchema = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i) });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: { code: 'LOGIN_RATE_LIMITED', message: 'Too many sign-in attempts. Try again later.' },
  },
});
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'RECOVERY_RATE_LIMITED',
      message: 'Too many recovery requests. Try again later.',
    },
  },
});

export const authRouter = Router();
authRouter.post('/login', loginLimiter, validateRequest({ body: loginSchema }), loginController);
authRouter.post(
  '/change-password',
  authenticateUser,
  requireCsrf,
  validateRequest({
    body: z
      .object({ currentPassword: z.string().min(1).max(128), password: passwordSchema })
      .strict(),
  }),
  changePasswordController,
);
authRouter.post('/logout', requireRefreshCsrfWhenPresent, logoutController);
authRouter.post('/refresh', requireRefreshCsrf, refreshController);
authRouter.get('/csrf', authenticateCsrfSource, csrfController);
authRouter.get('/me', authenticateUser, currentUserController);
authRouter.post(
  '/forgot-password',
  recoveryLimiter,
  validateRequest({ body: emailSchema }),
  forgotPasswordController,
);
authRouter.post(
  '/reset-password',
  recoveryLimiter,
  validateRequest({ body: resetSchema }),
  resetPasswordController,
);
authRouter.post(
  '/email-change/confirm',
  recoveryLimiter,
  validateRequest({ body: confirmEmailChangeSchema }),
  confirmEmailChangeController,
);
authRouter.post(
  '/invitations/accept',
  recoveryLimiter,
  validateRequest({ body: invitationAcceptSchema }),
  acceptInvitationController,
);
authRouter.post(
  '/invitations',
  authenticateUser,
  requireCsrf,
  requireRole('ADMIN'),
  requirePermission('users:invite'),
  validateRequest({ body: createInvitationSchema }),
  createInvitationController,
);
authRouter.patch(
  '/users/:userId/status',
  authenticateUser,
  requireCsrf,
  requireRole('ADMIN'),
  validateRequest({ params: userIdSchema, body: statusSchema }),
  setAccountStatusController,
);
