import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const phone = z.string().trim().max(32).optional();

export const customerIdParamsSchema = z.object({ customerId: objectId }).strict();
export const customerRecordParamsSchema = z
  .object({ customerId: objectId, kind: z.enum(['subscriptions', 'invoices', 'payments']) })
  .strict();
export const customerOwnRecordParamsSchema = z
  .object({ kind: z.enum(['subscriptions', 'invoices', 'payments']) })
  .strict();
export const customerListQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const relatedListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const createCustomerSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160),
    email: z.string().trim().email().max(254),
    phone,
    assignedEmployeeIds: z.array(objectId).max(50).optional(),
    primaryEmployeeId: objectId.optional(),
  })
  .strict();
export const updateCustomerSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160).optional(),
    phone: z.union([z.string().trim().max(32), z.null()]).optional(),
    assignedEmployeeIds: z.array(objectId).max(50).optional(),
    primaryEmployeeId: z.union([objectId, z.null()]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one editable field is required.');
export const emailChangeSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
export const emailChangeConfirmSchema = z.object({ token: z.string().min(32).max(200) }).strict();
