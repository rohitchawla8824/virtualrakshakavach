import type { RequestHandler } from 'express';
import { AuthError } from '../auth/auth.errors.js';
import {
  archiveCategory,
  archiveProduct,
  createCategory,
  createProduct,
  getProduct,
  listCategories,
  listProductHistory,
  listProducts,
  setProductStatus,
  updateCategory,
  updateProduct,
} from './catalogue.service.js';

function auth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) throw new AuthError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return request.auth;
}

function serialize(value: unknown) {
  const record =
    typeof value === 'object' && value !== null && 'toObject' in value
      ? (value as { toObject: () => Record<string, unknown> }).toObject()
      : typeof value === 'object' && value !== null
        ? { ...(value as Record<string, unknown>) }
        : {};
  const id = record._id ? String(record._id) : undefined;
  delete record._id;
  delete record.__v;
  const category = record.categoryId;
  if (typeof category === 'object' && category !== null && '_id' in category) {
    const categoryRecord = category as Record<string, unknown>;
    record.category = {
      id: String(categoryRecord._id),
      name: categoryRecord.name,
      kind: categoryRecord.kind,
      status: categoryRecord.status,
    };
    delete record.categoryId;
  } else if (category) {
    record.categoryId = String(category);
  }
  return { id, ...record };
}

export const listProductsController: RequestHandler = async (request, response) => {
  const result = await listProducts(auth(request), request.query as never);
  response.status(200).json({ items: result.items.map(serialize), pagination: result.pagination });
};

export const getProductController: RequestHandler = async (request, response) => {
  const product = await getProduct(String(request.params.productId), auth(request));
  response.status(200).json({ product: serialize(product) });
};

export const createProductController: RequestHandler = async (request, response) => {
  const product = await createProduct(request.body, auth(request));
  response.status(201).json({ product: serialize(product) });
};

export const updateProductController: RequestHandler = async (request, response) => {
  const product = await updateProduct(
    String(request.params.productId),
    request.body,
    auth(request),
  );
  response.status(200).json({ product: serialize(product) });
};

export const setProductStatusController: RequestHandler = async (request, response) => {
  const product = await setProductStatus(
    String(request.params.productId),
    request.body.status,
    auth(request),
  );
  response.status(200).json({ product: serialize(product) });
};

export const archiveProductController: RequestHandler = async (request, response) => {
  const product = await archiveProduct(String(request.params.productId), auth(request));
  response.status(200).json({ product: serialize(product) });
};

export const listProductHistoryController: RequestHandler = async (request, response) => {
  const result = await listProductHistory(
    String(request.params.productId),
    request.query as never,
    auth(request),
  );
  response.status(200).json({ items: result.items.map(serialize), pagination: result.pagination });
};

export const listCategoriesController: RequestHandler = async (request, response) => {
  const result = await listCategories(auth(request), request.query as never);
  response.status(200).json({ items: result.items.map(serialize), pagination: result.pagination });
};

export const createCategoryController: RequestHandler = async (request, response) => {
  const category = await createCategory(request.body, auth(request));
  response.status(201).json({ category: serialize(category) });
};

export const updateCategoryController: RequestHandler = async (request, response) => {
  const category = await updateCategory(
    String(request.params.categoryId),
    request.body,
    auth(request),
  );
  response.status(200).json({ category: serialize(category) });
};

export const archiveCategoryController: RequestHandler = async (request, response) => {
  const category = await archiveCategory(String(request.params.categoryId), auth(request));
  response.status(200).json({ category: serialize(category) });
};
