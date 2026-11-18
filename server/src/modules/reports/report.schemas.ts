import { z } from 'zod';

const date = z.iso.date().optional();
export const reportParamsSchema = z.object({
  reportId: z.enum([
    'collections',
    'outstanding',
    'overdue-invoices',
    'product-sales',
    'subscriptions',
    'employee-performance',
    'refunds',
    'notification-delivery',
  ]),
});
export const reportQuerySchema = z
  .object({
    from: date,
    to: date,
    period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
    status: z.enum(['ACTIVE', 'EXPIRED', 'UPCOMING']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .strict();
