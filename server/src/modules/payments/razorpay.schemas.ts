import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const createOrderSchema = z
  .object({
    invoiceId: objectId,
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict();
export const verifyPaymentSchema = z
  .object({
    orderId: z
      .string()
      .regex(/^order_[A-Za-z\d]+$/)
      .max(80),
    paymentId: z
      .string()
      .regex(/^pay_[A-Za-z\d]+$/)
      .max(80),
    signature: z.string().regex(/^[a-f\d]{64}$/i),
  })
  .strict();
export const orderIdSchema = z.object({
  orderId: z
    .string()
    .regex(/^order_[A-Za-z\d]+$/)
    .max(80),
});
