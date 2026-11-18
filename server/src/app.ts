import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestLogger } from './config/request-logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { customerRouter } from './modules/customers/customer.routes.js';
import { employeeRouter } from './modules/employees/employee.routes.js';
import { categoryRouter, productRouter } from './modules/catalogue/catalogue.routes.js';
import { subscriptionRouter } from './modules/subscriptions/subscription.routes.js';
import {
  invoiceRouter,
  ledgerRouter,
  paymentRouter,
  refundRouter,
  taxRouter,
} from './modules/finance/finance.routes.js';
import {
  notificationRouter,
  razorpayRouter,
  razorpayWebhookRouter,
} from './modules/payments/razorpay.routes.js';
import { reportRouter } from './modules/reports/report.routes.js';

export const app = express();
const allowedOrigins = new Set(
  env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.disable('x-powered-by');
app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);
app.use(requestLogger);
app.use((request, response, next) => {
  response.setHeader('x-request-id', String(request.id));
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
        connectSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
        frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
      },
    },
  }),
);
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) callback(null, true);
      else
        callback(
          Object.assign(new Error('Origin is not allowed by CORS.'), {
            statusCode: 403,
            code: 'CORS_ORIGIN_DENIED',
          }),
        );
    },
  }),
);
app.use(
  express.json({
    limit: '100kb',
    strict: true,
    verify(request, _response, buffer) {
      if ((request as express.Request).originalUrl.startsWith('/api/v1/webhooks/razorpay'))
        (request as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(cookieParser());
app.use(
  '/api',
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    },
  }),
);

const apiRouter = express.Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/customers', customerRouter);
apiRouter.use('/employees', employeeRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/categories', categoryRouter);
apiRouter.use('/subscriptions', subscriptionRouter);
apiRouter.use('/invoices', invoiceRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/ledger', ledgerRouter);
apiRouter.use('/refunds', refundRouter);
apiRouter.use('/tax-configurations', taxRouter);
apiRouter.use('/payments/razorpay', razorpayRouter);
apiRouter.use('/webhooks/razorpay', razorpayWebhookRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/reports', reportRouter);
app.use('/api/v1', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
