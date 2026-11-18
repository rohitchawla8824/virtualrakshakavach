import { Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { authenticateUser, requireCsrf } from '../auth/auth.middleware.js';
import {
  createInvoiceController,
  createRefundController,
  customerLedgerController,
  decideRefundController,
  invoicePdfController,
  listTaxConfigurationsController,
  listRefundsController,
  listInvoicesController,
  listPaymentsController,
  getPaymentController,
  receiptPdfController,
  recordPaymentController,
  taxConfigurationController,
} from './finance.controller.js';
import {
  createInvoiceSchema,
  invoiceListSchema,
  paymentListSchema,
  recordPaymentSchema,
  refundIdSchema,
  refundSchema,
  taxConfigurationSchema,
} from './finance.schemas.js';
import { z } from 'zod';
const id = z.object({ invoiceId: z.string().regex(/^[a-f\d]{24}$/i) });
const payId = z.object({ paymentId: z.string().regex(/^[a-f\d]{24}$/i) });
const customerId = z.object({ customerId: z.string().regex(/^[a-f\d]{24}$/i) });
const decision = z.object({ approve: z.boolean() }).strict();
export const invoiceRouter = Router();
invoiceRouter.use(authenticateUser);
invoiceRouter.get('/', validateRequest({ query: invoiceListSchema }), listInvoicesController);
invoiceRouter.post(
  '/',
  requireCsrf,
  validateRequest({ body: createInvoiceSchema }),
  createInvoiceController,
);
invoiceRouter.get('/:invoiceId/pdf', validateRequest({ params: id }), invoicePdfController);
export const paymentRouter = Router();
paymentRouter.use(authenticateUser);
paymentRouter.get('/', validateRequest({ query: paymentListSchema }), listPaymentsController);
paymentRouter.post(
  '/',
  requireCsrf,
  validateRequest({ body: recordPaymentSchema }),
  recordPaymentController,
);
paymentRouter.get('/:paymentId', validateRequest({ params: payId }), getPaymentController);
paymentRouter.get(
  '/:paymentId/receipt.pdf',
  validateRequest({ params: payId }),
  receiptPdfController,
);
export const ledgerRouter = Router();
ledgerRouter.use(authenticateUser);
ledgerRouter.get('/:customerId', validateRequest({ params: customerId }), customerLedgerController);
export const refundRouter = Router();
refundRouter.use(authenticateUser);
refundRouter.get('/', listRefundsController);
refundRouter.post(
  '/',
  requireCsrf,
  validateRequest({ body: refundSchema }),
  createRefundController,
);
refundRouter.patch(
  '/:refundId/decision',
  requireCsrf,
  validateRequest({ params: refundIdSchema, body: decision }),
  decideRefundController,
);
export const taxRouter = Router();
taxRouter.use(authenticateUser);
taxRouter.get('/', listTaxConfigurationsController);
taxRouter.post(
  '/',
  requireCsrf,
  validateRequest({ body: taxConfigurationSchema }),
  taxConfigurationController,
);
