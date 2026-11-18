import { Types } from 'mongoose';
import { AuthError } from '../auth/auth.errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AuditLogModel } from '../operations/operations.model.js';
import { CategoryModel, ProductModel } from './catalogue.model.js';

type ProductInput = {
  name?: string;
  kind?: 'PHYSICAL' | 'SERVICE';
  categoryId?: string | null;
  sku?: string;
  description?: string | null;
  imageUrl?: string | null;
  purchasePricePaise?: number;
  sellingPricePaise?: number;
  stockQuantity?: number;
  status?: 'ACTIVE' | 'INACTIVE';
};
type CategoryKind = 'PRODUCT' | 'SERVICE';

function fail(statusCode: number, code: string, message: string) {
  return new AuthError(statusCode, code, message);
}

function requirePermission(auth: AuthContext, permission: string) {
  if (auth.role === 'CUSTOMER') throw fail(403, 'FORBIDDEN', 'Access denied.');
  if (auth.role === 'EMPLOYEE' && !auth.permissions.includes(permission))
    throw fail(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
}

function notFound() {
  return fail(404, 'CATALOGUE_RECORD_NOT_FOUND', 'The requested catalogue record was not found.');
}

function productCategoryKind(kind: 'PHYSICAL' | 'SERVICE'): CategoryKind {
  return kind === 'PHYSICAL' ? 'PRODUCT' : 'SERVICE';
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pageResult<T>(items: T[], total: number, page: number, limit: number) {
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

function toPlain(value: { toObject?: () => Record<string, unknown> } & Record<string, unknown>) {
  return typeof value.toObject === 'function' ? value.toObject() : { ...value };
}

async function writeHistory(
  auth: AuthContext,
  action: string,
  entityType: 'Product' | 'Category',
  entityId: Types.ObjectId | string,
  metadata: Record<string, unknown>,
) {
  await AuditLogModel.create({
    actorUserId: auth.userId,
    action,
    entityType,
    entityId,
    metadata,
  });
}

function handleDuplicateKey(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
    const key = 'keyPattern' in error ? (error.keyPattern as Record<string, unknown>) : undefined;
    if (key?.sku) throw fail(409, 'SKU_EXISTS', 'A product with this SKU already exists.');
    if (key?.name) throw fail(409, 'CATEGORY_EXISTS', 'A category with this name already exists.');
  }
  throw error;
}

export async function listProducts(
  auth: AuthContext,
  query: {
    q?: string;
    kind?: 'PHYSICAL' | 'SERVICE';
    status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    categoryId?: string;
    page: number;
    limit: number;
  },
) {
  requirePermission(auth, 'products:read');
  const filter: Record<string, unknown> = {};
  if (query.kind) filter.kind = query.kind;
  if (query.status) filter.status = query.status;
  if (query.categoryId) filter.categoryId = new Types.ObjectId(query.categoryId);
  if (query.q) {
    const term = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: term }, { sku: term }, { description: term }];
  }
  const [items, total] = await Promise.all([
    ProductModel.find(filter)
      .select('-__v')
      .populate('categoryId', 'name kind status')
      .sort({ updatedAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    ProductModel.countDocuments(filter),
  ]);
  return pageResult(items, total, query.page, query.limit);
}

export async function getProduct(productId: string, auth: AuthContext) {
  requirePermission(auth, 'products:read');
  if (!Types.ObjectId.isValid(productId)) throw notFound();
  const product = await ProductModel.findById(productId)
    .populate('categoryId', 'name kind status')
    .lean();
  if (!product) throw notFound();
  return product;
}

export async function createProduct(input: ProductInput, auth: AuthContext) {
  requirePermission(auth, 'products:create');
  if (
    !input.name ||
    !input.kind ||
    input.purchasePricePaise === undefined ||
    input.sellingPricePaise === undefined
  )
    throw fail(
      400,
      'INVALID_PRODUCT',
      'Product name, type, purchase price, and selling price are required.',
    );
  if (input.kind === 'PHYSICAL' && input.stockQuantity === undefined)
    throw fail(400, 'INVALID_STOCK', 'Physical products require a stock quantity.');
  if (input.kind === 'SERVICE' && input.stockQuantity !== undefined)
    throw fail(400, 'INVALID_STOCK', 'Services cannot have a stock quantity.');
  await validateCategory(input.categoryId, input.kind);
  try {
    const product = await ProductModel.create({
      name: input.name,
      kind: input.kind,
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.sku ? { sku: input.sku.trim().toUpperCase() } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      purchasePricePaise: input.purchasePricePaise,
      sellingPricePaise: input.sellingPricePaise,
      pricePaise: input.sellingPricePaise,
      ...(input.kind === 'PHYSICAL' ? { stockQuantity: input.stockQuantity } : {}),
      status: input.status ?? 'ACTIVE',
      currency: 'INR',
    });
    await writeHistory(auth, 'PRODUCT_CREATED', 'Product', product._id, {
      after: product.toObject(),
    });
    return product;
  } catch (error) {
    handleDuplicateKey(error);
  }
}

export async function updateProduct(productId: string, input: ProductInput, auth: AuthContext) {
  requirePermission(auth, 'products:update');
  if (!Types.ObjectId.isValid(productId)) throw notFound();
  const current = await ProductModel.findById(productId);
  if (!current) throw notFound();
  if (current.status === 'ARCHIVED')
    throw fail(409, 'PRODUCT_ARCHIVED', 'Archived products cannot be edited.');
  const nextKind = input.kind ?? current.kind;
  const nextStock = input.stockQuantity ?? current.stockQuantity;
  if (nextKind === 'PHYSICAL' && nextStock === undefined)
    throw fail(400, 'INVALID_STOCK', 'Physical products require a stock quantity.');
  if (
    nextKind === 'SERVICE' &&
    (input.stockQuantity !== undefined || current.stockQuantity !== undefined)
  ) {
    if (
      input.kind !== undefined &&
      input.kind !== current.kind &&
      input.stockQuantity === undefined
    ) {
      // Switching a physical product to a service removes the stock field.
    } else if (input.stockQuantity !== undefined) {
      throw fail(400, 'INVALID_STOCK', 'Services cannot have a stock quantity.');
    }
  }
  const categoryId =
    input.categoryId === undefined
      ? current.categoryId?.toString()
      : (input.categoryId ?? undefined);
  await validateCategory(categoryId, nextKind);

  const before = toPlain(
    current as unknown as Record<string, unknown> & { toObject?: () => Record<string, unknown> },
  );
  if (input.name !== undefined) current.name = input.name;
  if (input.kind !== undefined) current.kind = input.kind;
  if (input.categoryId !== undefined) {
    if (input.categoryId) current.categoryId = new Types.ObjectId(input.categoryId);
    else current.categoryId = undefined;
  }
  if (input.sku !== undefined) current.sku = input.sku.trim().toUpperCase();
  if (input.description !== undefined) current.description = input.description ?? undefined;
  if (input.imageUrl !== undefined) current.imageUrl = input.imageUrl ?? undefined;
  if (input.purchasePricePaise !== undefined) current.purchasePricePaise = input.purchasePricePaise;
  if (input.sellingPricePaise !== undefined) {
    current.sellingPricePaise = input.sellingPricePaise;
    current.pricePaise = input.sellingPricePaise;
  }
  if (input.kind === 'SERVICE') {
    current.stockQuantity = undefined;
  } else if (input.stockQuantity !== undefined) current.stockQuantity = input.stockQuantity;
  if (input.status !== undefined) current.status = input.status;

  try {
    await current.save();
  } catch (error) {
    handleDuplicateKey(error);
  }
  await writeHistory(auth, 'PRODUCT_UPDATED', 'Product', current._id, {
    before,
    after: current.toObject(),
  });
  return ProductModel.findById(current._id).populate('categoryId', 'name kind status').lean();
}

export async function setProductStatus(
  productId: string,
  status: 'ACTIVE' | 'INACTIVE',
  auth: AuthContext,
) {
  requirePermission(auth, 'products:update');
  if (!Types.ObjectId.isValid(productId)) throw notFound();
  const product = await ProductModel.findById(productId);
  if (!product || product.status === 'ARCHIVED') throw notFound();
  const before = { status: product.status };
  product.status = status;
  await product.save();
  await writeHistory(auth, `PRODUCT_${status}`, 'Product', product._id, {
    before,
    after: { status },
  });
  return ProductModel.findById(product._id).populate('categoryId', 'name kind status').lean();
}

export async function archiveProduct(productId: string, auth: AuthContext) {
  requirePermission(auth, 'products:archive');
  if (!Types.ObjectId.isValid(productId)) throw notFound();
  const product = await ProductModel.findById(productId);
  if (!product) throw notFound();
  if (product.status !== 'ARCHIVED') {
    const before = { status: product.status };
    product.status = 'ARCHIVED';
    await product.save();
    await writeHistory(auth, 'PRODUCT_ARCHIVED', 'Product', product._id, {
      before,
      after: { status: 'ARCHIVED' },
    });
  }
  return product;
}

export async function listProductHistory(
  productId: string,
  query: { page: number; limit: number },
  auth: AuthContext,
) {
  requirePermission(auth, 'products:read');
  if (!Types.ObjectId.isValid(productId)) throw notFound();
  if (!(await ProductModel.exists({ _id: productId }))) throw notFound();
  const filter = { entityType: 'Product', entityId: productId };
  const [items, total] = await Promise.all([
    AuditLogModel.find(filter)
      .select('actorUserId action metadata createdAt')
      .populate('actorUserId', 'email')
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    AuditLogModel.countDocuments(filter),
  ]);
  return pageResult(items, total, query.page, query.limit);
}

export async function listCategories(
  auth: AuthContext,
  query: {
    q?: string;
    kind?: CategoryKind;
    status?: 'ACTIVE' | 'ARCHIVED';
    page: number;
    limit: number;
  },
) {
  requirePermission(auth, 'products:read');
  const filter: Record<string, unknown> = {};
  if (query.kind) filter.kind = query.kind;
  if (query.status) filter.status = query.status;
  if (query.q) filter.name = new RegExp(escapeRegex(query.q), 'i');
  const [items, total] = await Promise.all([
    CategoryModel.find(filter)
      .select('name kind status createdAt updatedAt')
      .sort({ name: 1, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    CategoryModel.countDocuments(filter),
  ]);
  return pageResult(items, total, query.page, query.limit);
}

export async function createCategory(
  input: { name: string; kind: CategoryKind },
  auth: AuthContext,
) {
  requirePermission(auth, 'categories:manage');
  try {
    const category = await CategoryModel.create({ ...input, status: 'ACTIVE' });
    await writeHistory(auth, 'CATEGORY_CREATED', 'Category', category._id, {
      after: category.toObject(),
    });
    return category;
  } catch (error) {
    handleDuplicateKey(error);
  }
}

export async function updateCategory(
  categoryId: string,
  input: { name: string },
  auth: AuthContext,
) {
  requirePermission(auth, 'categories:manage');
  if (!Types.ObjectId.isValid(categoryId)) throw notFound();
  const category = await CategoryModel.findById(categoryId);
  if (!category || category.status === 'ARCHIVED') throw notFound();
  const before = { name: category.name };
  category.name = input.name;
  try {
    await category.save();
  } catch (error) {
    handleDuplicateKey(error);
  }
  await writeHistory(auth, 'CATEGORY_UPDATED', 'Category', category._id, {
    before,
    after: { name: category.name },
  });
  return category;
}

export async function archiveCategory(categoryId: string, auth: AuthContext) {
  requirePermission(auth, 'categories:manage');
  if (!Types.ObjectId.isValid(categoryId)) throw notFound();
  const category = await CategoryModel.findById(categoryId);
  if (!category) throw notFound();
  const activeProducts = await ProductModel.countDocuments({
    categoryId: category._id,
    status: { $ne: 'ARCHIVED' },
  });
  if (activeProducts > 0)
    throw fail(409, 'CATEGORY_IN_USE', 'Move or archive products using this category first.');
  if (category.status !== 'ARCHIVED') {
    category.status = 'ARCHIVED';
    await category.save();
    await writeHistory(auth, 'CATEGORY_ARCHIVED', 'Category', category._id, {
      after: { status: 'ARCHIVED' },
    });
  }
  return category;
}

async function validateCategory(
  categoryId: string | null | undefined,
  kind: 'PHYSICAL' | 'SERVICE',
) {
  if (!categoryId) return;
  if (!Types.ObjectId.isValid(categoryId))
    throw fail(400, 'INVALID_CATEGORY', 'Choose a valid category.');
  const category = await CategoryModel.findOne({
    _id: categoryId,
    kind: productCategoryKind(kind),
    status: 'ACTIVE',
  })
    .select('_id')
    .lean();
  if (!category)
    throw fail(400, 'INVALID_CATEGORY', 'Choose an active category for this product type.');
}
