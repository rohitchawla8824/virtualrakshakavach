import { z } from 'zod';

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.');
const date = z.iso.datetime({ offset: true });
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const planIdParamsSchema = z.object({ planId: id });
export const subscriptionIdParamsSchema = z.object({ subscriptionId: id });
export const customerIdParamsSchema = z.object({ customerId: id });
export const planListSchema = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});
export const subscriptionListSchema = pageQuery.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['UPCOMING', 'ACTIVE', 'EXPIRED', 'CANCELLED']).optional(),
  expiringWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  customerId: id.optional(),
});
export const createPlanSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).optional(),
    duration: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM']),
    customDurationDays: z.number().int().min(1).max(3_650).optional(),
    pricePaise: z.number().int().safe().min(0),
  })
  .strict()
  .refine(
    (v) =>
      v.duration === 'CUSTOM'
        ? v.customDurationDays !== undefined
        : v.customDurationDays === undefined,
    {
      message: 'Custom duration days are required only for CUSTOM plans.',
      path: ['customDurationDays'],
    },
  );
export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2_000).optional(),
    duration: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM']).optional(),
    customDurationDays: z.number().int().min(1).max(3_650).optional(),
    pricePaise: z.number().int().safe().min(0).optional(),
  })
  .strict()
  .refine((v) => v.duration !== 'CUSTOM' || v.customDurationDays !== undefined, {
    message: 'Custom duration days are required for CUSTOM plans.',
    path: ['customDurationDays'],
  });
export const assignSubscriptionSchema = z
  .object({
    customerId: id,
    planId: id,
    startsAt: date,
    invoiceDueAt: date.optional(),
  })
  .strict();
export const renewSubscriptionSchema = z
  .object({
    renewalKey: z.string().trim().min(8).max(128),
    planId: id.optional(),
    startsAt: date.optional(),
    invoiceDueAt: date.optional(),
  })
  .strict();
export const relatedSubscriptionQuerySchema = pageQuery;
