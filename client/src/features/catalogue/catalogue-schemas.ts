import { z } from 'zod';

const rupeeAmount = z
  .string()
  .trim()
  .regex(/^\d{1,13}(\.\d{1,2})?$/, 'Enter a valid INR amount with up to two decimal places.');

export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Product name is required.').max(160),
    kind: z.enum(['PHYSICAL', 'SERVICE']),
    categoryId: z.string(),
    sku: z.string().trim().max(64),
    description: z.string().trim().max(2_000),
    imageUrl: z.string().trim().max(2_048),
    purchasePrice: rupeeAmount,
    sellingPrice: rupeeAmount,
    stockQuantity: z.string(),
  })
  .superRefine((value, context) => {
    if (value.kind === 'PHYSICAL' && !/^\d+$/.test(value.stockQuantity)) {
      context.addIssue({
        code: 'custom',
        path: ['stockQuantity'],
        message: 'Enter a whole stock quantity of zero or more.',
      });
    }
    if (value.kind === 'SERVICE' && value.stockQuantity.trim()) {
      context.addIssue({
        code: 'custom',
        path: ['stockQuantity'],
        message: 'Services do not use stock quantities.',
      });
    }
    if (value.imageUrl) {
      try {
        const url = new URL(value.imageUrl);
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new Error('invalid image url');
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['imageUrl'],
          message: 'Use a valid HTTPS image URL.',
        });
      }
    }
  });

export function rupeesToPaise(value: string): number {
  const [whole, fraction = ''] = value.trim().split('.');
  const paise = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('Amount exceeds the supported limit.');
  return Number(paise);
}

export function paiseToRupees(value?: number) {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) return '';
  const paise = BigInt(value);
  return `${paise / 100n}.${(paise % 100n).toString().padStart(2, '0')}`;
}

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, 'Category name is required.').max(100),
  kind: z.enum(['PRODUCT', 'SERVICE']),
});
