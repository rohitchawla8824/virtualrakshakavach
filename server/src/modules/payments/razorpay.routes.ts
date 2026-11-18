import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validateRequest } from '../../middleware/validate-request.js';
import { authenticateUser, requireCsrf } from '../auth/auth.middleware.js';
import {
  cancelRazorpayOrderController,
  createRazorpayOrderController,
  myNotificationsController,
  razorpayWebhookController,
  verifyRazorpayPaymentController,
} from './razorpay.controller.js';
import { createOrderSchema, orderIdSchema, verifyPaymentSchema } from './razorpay.schemas.js';

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'CHECKOUT_RATE_LIMITED',
      message: 'Too many checkout attempts. Please try again later.',
    },
  },
});

export const razorpayRouter = Router();
razorpayRouter.use(authenticateUser);
razorpayRouter.post(
  '/orders',
  orderLimiter,
  requireCsrf,
  validateRequest({ body: createOrderSchema }),
  createRazorpayOrderController,
);
razorpayRouter.post(
  '/verify',
  requireCsrf,
  validateRequest({ body: verifyPaymentSchema }),
  verifyRazorpayPaymentController,
);
razorpayRouter.post(
  '/orders/:orderId/cancel',
  requireCsrf,
  validateRequest({ params: orderIdSchema }),
  cancelRazorpayOrderController,
);

export const razorpayWebhookRouter = Router();
razorpayWebhookRouter.post('/', razorpayWebhookController);

export const notificationRouter = Router();
notificationRouter.use(authenticateUser);
notificationRouter.get('/', myNotificationsController);
