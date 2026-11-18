import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const invoiceListSchema = page.extend({
  customerId: id.optional(),
  status: z.enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE']).optional(),
  q: z.string().trim().max(100).optional(),
});
export const paymentListSchema = page.extend({
  customerId: id.optional(),
  status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'REVERSED']).optional(),
});
export const createInvoiceSchema = z
  .object({
    customerId: id,
    dueAt: z.iso.datetime({ offset: true }),
    lines: z
      .array(z.object({ productId: id, quantity: z.number().int().min(1).max(10_000) }).strict())
      .min(1)
      .max(100),
    discountPaise: z.number().int().safe().min(0).default(0),
    taxConfigurationId: id.optional(),
    dueInDays: z.number().int().min(0).max(365).optional(),
  })
  .strict();
export const recordPaymentSchema = z
  .object({
    customerId: id,
    amountPaise: z.number().int().safe().min(1),
    method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER']),
    status: z.enum(['SUCCEEDED', 'FAILED']).default('SUCCEEDED'),
    idempotencyKey: z.string().trim().min(8).max(128),
    reference: z.string().trim().max(120).optional(),
    receivedAt: z.iso.datetime({ offset: true }).optional(),
    allocations: z
      .array(z.object({ invoiceId: id, amountPaise: z.number().int().safe().min(1) }).strict())
      .max(100)
      .optional(),
  })
  .strict();
export const refundSchema = z
  .object({
    paymentId: id,
    invoiceId: id.optional(),
    amountPaise: z.number().int().safe().min(1),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const refundIdSchema = z.object({ refundId: id });
export const taxConfigurationSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    rateBps: z.number().int().min(0).max(10_000),
    mode: z.enum(['EXCLUSIVE', 'INCLUSIVE']),
    active: z.boolean().default(true),
  })
  .strict();
export const taxIdSchema = z.object({ taxConfigurationId: id });
