import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import type { AuthContext } from '../src/modules/auth/auth.types.js';
import { CategoryModel, ProductModel } from '../src/modules/catalogue/catalogue.model.js';
import {
  categoryListQuerySchema,
  createCategorySchema,
  createProductSchema,
  productListQuerySchema,
} from '../src/modules/catalogue/catalogue.schemas.js';
import {
  createProduct,
  updateProduct,
  archiveProduct,
  createCategory,
  updateCategory,
  archiveCategory,
  listProducts,
} from '../src/modules/catalogue/catalogue.service.js';
import { AuditLogModel } from '../src/modules/operations/operations.model.js';
import { InvoiceModel } from '../src/modules/finance/finance.model.js';

const admin: AuthContext = {
  userId: '665f00000000000000000001',
  sessionId: 'catalogue-admin-session',
  role: 'ADMIN',
  permissions: [],
};
const employee: AuthContext = {
  userId: '665f00000000000000000002',
  employeeId: '665f00000000000000000003',
  sessionId: 'catalogue-employee-session',
  role: 'EMPLOYEE',
  permissions: [],
};

function chain(value: unknown) {
  const query = {
    select: vi.fn(() => query),
    populate: vi.fn(() => query),
    sort: vi.fn(() => query),
    skip: vi.fn(() => query),
    limit: vi.fn(() => query),
    lean: vi.fn().mockResolvedValue(value),
  };
  return query;
}

describe('catalogue validation and permissions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requires non-negative integer paise and stock for physical products', () => {
    const base = {
      name: 'Kavach unit',
      kind: 'PHYSICAL',
      purchasePricePaise: 12_500,
      sellingPricePaise: 18_000,
    };
    expect(createProductSchema.safeParse({ ...base, stockQuantity: 0 }).success).toBe(true);
    expect(createProductSchema.safeParse({ ...base }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, stockQuantity: -1 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, stockQuantity: 1.5 }).success).toBe(false);
    expect(
      createProductSchema.safeParse({ ...base, purchasePricePaise: -1, stockQuantity: 1 }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        ...base,
        sellingPricePaise: Number.MAX_SAFE_INTEGER + 1,
        stockQuantity: 1,
      }).success,
    ).toBe(false);
  });

  it('rejects stock on services and non-HTTPS image URLs', () => {
    const base = {
      name: 'Installation service',
      kind: 'SERVICE',
      purchasePricePaise: 0,
      sellingPricePaise: 5_000,
    };
    expect(createProductSchema.safeParse(base).success).toBe(true);
    expect(createProductSchema.safeParse({ ...base, stockQuantity: 1 }).success).toBe(false);
    expect(
      createProductSchema.safeParse({ ...base, imageUrl: 'http://example.com/image.png' }).success,
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        ...base,
        imageUrl: 'https://user:pass@example.com/image.png',
      }).success,
    ).toBe(false);
  });

  it('validates search and pagination parameters strictly', () => {
    expect(
      productListQuerySchema.safeParse({ page: '1', limit: '20', status: 'ACTIVE' }).success,
    ).toBe(true);
    expect(productListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ kind: 'PRODUCT' }).success).toBe(false);
    expect(categoryListQuerySchema.safeParse({ kind: 'PRODUCT', status: 'ARCHIVED' }).success).toBe(
      true,
    );
    expect(createCategorySchema.safeParse({ name: 'Hardware', kind: 'PRODUCT' }).success).toBe(
      true,
    );
  });

  it('denies employees without catalogue read permission before querying products', async () => {
    const findSpy = vi.spyOn(ProductModel, 'find');
    await expect(listProducts(employee, { page: 1, limit: 20 })).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('creates a physical product with integer paise, SKU normalization, and audit history', async () => {
    const productId = '665f00000000000000000010';
    const created = {
      _id: productId,
      toObject: () => ({ _id: productId, name: 'Kavach unit', kind: 'PHYSICAL' }),
    };
    const createSpy = vi.spyOn(ProductModel, 'create').mockResolvedValue(created as never);
    vi.spyOn(AuditLogModel, 'create').mockResolvedValue({} as never);

    const product = await createProduct(
      {
        name: 'Kavach unit',
        kind: 'PHYSICAL',
        sku: ' vrk-01 ',
        purchasePricePaise: 12_500,
        sellingPricePaise: 18_000,
        stockQuantity: 0,
      },
      admin,
    );

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: 'VRK-01',
        purchasePricePaise: 12_500,
        sellingPricePaise: 18_000,
        pricePaise: 18_000,
        stockQuantity: 0,
        currency: 'INR',
      }),
    );
    expect(product).toBe(created);
    expect(AuditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PRODUCT_CREATED',
        entityType: 'Product',
        entityId: productId,
      }),
    );
  });

  it('searches and paginates catalogue records', async () => {
    const query = chain([{ _id: '665f00000000000000000015', name: 'Camera' }]);
    vi.spyOn(ProductModel, 'find').mockReturnValue(query as never);
    vi.spyOn(ProductModel, 'countDocuments').mockResolvedValue(21);

    const result = await listProducts(admin, { q: 'cam', kind: 'PHYSICAL', page: 2, limit: 10 });

    expect(ProductModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'PHYSICAL', $or: expect.any(Array) }),
    );
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 21, pages: 3 });
  });

  it('updates product fields and records before/after history', async () => {
    const productId = '665f00000000000000000016';
    const current = {
      _id: productId,
      name: 'Old name',
      kind: 'SERVICE',
      status: 'ACTIVE',
      purchasePricePaise: 100,
      sellingPricePaise: 200,
      pricePaise: 200,
      save: vi.fn().mockResolvedValue(undefined),
      toObject: () => ({
        _id: productId,
        name: current.name,
        sellingPricePaise: current.sellingPricePaise,
      }),
    };
    vi.spyOn(ProductModel, 'findById')
      .mockResolvedValueOnce(current as never)
      .mockReturnValueOnce(chain({ _id: productId, name: 'New name' }) as never);
    vi.spyOn(AuditLogModel, 'create').mockResolvedValue({} as never);

    const result = await updateProduct(
      productId,
      { name: 'New name', sellingPricePaise: 500 },
      admin,
    );

    expect(current.name).toBe('New name');
    expect(current.sellingPricePaise).toBe(500);
    expect(current.pricePaise).toBe(500);
    expect(current.save).toHaveBeenCalledOnce();
    expect(AuditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRODUCT_UPDATED' }),
    );
    expect(result).toMatchObject({ name: 'New name' });
  });

  it('archives a product without deleting it and writes audit history', async () => {
    const product = {
      _id: '665f00000000000000000017',
      status: 'ACTIVE',
      save: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(ProductModel, 'findById').mockResolvedValue(product as never);
    vi.spyOn(AuditLogModel, 'create').mockResolvedValue({} as never);

    await archiveProduct(String(product._id), admin);

    expect(product.status).toBe('ARCHIVED');
    expect(product.save).toHaveBeenCalledOnce();
    expect(AuditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PRODUCT_ARCHIVED' }),
    );
  });

  it('creates and renames categories with history', async () => {
    const categoryId = '665f00000000000000000018';
    const category = {
      _id: categoryId,
      name: 'Old category',
      status: 'ACTIVE',
      save: vi.fn().mockResolvedValue(undefined),
      toObject: () => ({ _id: categoryId, name: category.name }),
    };
    vi.spyOn(CategoryModel, 'create').mockResolvedValue(category as never);
    vi.spyOn(CategoryModel, 'findById').mockResolvedValue(category as never);
    vi.spyOn(AuditLogModel, 'create').mockResolvedValue({} as never);

    await createCategory({ name: 'Hardware', kind: 'PRODUCT' }, admin);
    await updateCategory(categoryId, { name: 'New category' }, admin);

    expect(CategoryModel.create).toHaveBeenCalledWith({
      name: 'Hardware',
      kind: 'PRODUCT',
      status: 'ACTIVE',
    });
    expect(category.name).toBe('New category');
    expect(category.save).toHaveBeenCalledOnce();
    expect(AuditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CATEGORY_UPDATED' }),
    );
  });

  it('rejects a category that does not match the product type', async () => {
    const query = chain(null);
    vi.spyOn(CategoryModel, 'findOne').mockReturnValue(query as never);
    const createSpy = vi.spyOn(ProductModel, 'create');

    await expect(
      createProduct(
        {
          name: 'Kavach unit',
          kind: 'PHYSICAL',
          categoryId: '665f00000000000000000011',
          purchasePricePaise: 1,
          sellingPricePaise: 2,
          stockQuantity: 0,
        },
        admin,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_CATEGORY' });
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('does not archive a category still used by non-archived products', async () => {
    vi.spyOn(CategoryModel, 'findById').mockResolvedValue({
      _id: '665f00000000000000000012',
      status: 'ACTIVE',
    } as never);
    vi.spyOn(ProductModel, 'countDocuments').mockResolvedValue(1);

    await expect(archiveCategory('665f00000000000000000012', admin)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CATEGORY_IN_USE',
    });
  });

  it('keeps invoice item values as snapshots without a live product reference', () => {
    const lines = InvoiceModel.schema.path('lines') as {
      schema: { path: (name: string) => unknown };
    };
    expect(lines.schema.path('nameSnapshot')).toBeDefined();
    expect(lines.schema.path('unitPricePaise')).toBeDefined();
    expect(lines.schema.path('productId')).toBeUndefined();
  });

  it('requires authentication for the catalogue API', async () => {
    const response = await request(app).get('/api/v1/products');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
