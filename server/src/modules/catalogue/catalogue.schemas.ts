import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const kind = z.enum(['PHYSICAL', 'SERVICE']);
const productStatus = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
const categoryKind = z.enum(['PRODUCT', 'SERVICE']);
const categoryStatus = z.enum(['ACTIVE', 'ARCHIVED']);
const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
export const relatedListQuerySchema = z.object(pageQuery).strict();
const safePaise = z.number().int().safe().min(0);
const safeStock = z.number().int().safe().min(0);
const httpsImageUrl = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Image URL must use HTTPS and cannot contain credentials.');

export const catalogueIdParamsSchema = z.object({ productId: objectId }).strict();
export const categoryIdParamsSchema = z.object({ categoryId: objectId }).strict();

export const productListQuerySchema = z
  .object({
    ...pageQuery,
    q: z.string().trim().max(100).optional(),
    kind: kind.optional(),
    status: productStatus.optional(),
    categoryId: objectId.optional(),
  })
  .strict();

export const categoryListQuerySchema = z
  .object({
    ...pageQuery,
    q: z.string().trim().max(100).optional(),
    kind: categoryKind.optional(),
    status: categoryStatus.optional(),
  })
  .strict();

const productFields = {
  name: z.string().trim().min(1).max(160),
  kind,
  categoryId: objectId.nullable().optional(),
  sku: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(2_000).nullable().optional(),
  imageUrl: httpsImageUrl.nullable().optional(),
  purchasePricePaise: safePaise,
  sellingPricePaise: safePaise,
  stockQuantity: safeStock.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
};

export const createProductSchema = z
  .object(productFields)
  .strict()
  .superRefine((value, context) => {
    if (value.kind === 'PHYSICAL' && value.stockQuantity === undefined) {
      context.addIssue({ code: 'custom', path: ['stockQuantity'], message: 'Stock is required.' });
    }
    if (value.kind === 'SERVICE' && value.stockQuantity !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['stockQuantity'],
        message: 'Services cannot have stock.',
      });
    }
  });

export const updateProductSchema = z
  .object(productFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one product field is required.');

export const productStatusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict();

export const createCategorySchema = z
  .object({ name: z.string().trim().min(1).max(100), kind: categoryKind })
  .strict();
export const updateCategorySchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
