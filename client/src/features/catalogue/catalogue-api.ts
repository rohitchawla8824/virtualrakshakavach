import { authenticatedApiRequest } from '@/features/auth/auth-api';

export type ProductKind = 'PHYSICAL' | 'SERVICE';
export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type CategoryKind = 'PRODUCT' | 'SERVICE';
export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  status: 'ACTIVE' | 'ARCHIVED';
};
export type Product = {
  id: string;
  name: string;
  kind: ProductKind;
  categoryId?: string;
  category?: { id: string; name: string; kind: CategoryKind; status: string };
  sku?: string;
  description?: string;
  imageUrl?: string;
  purchasePricePaise: number;
  sellingPricePaise: number;
  pricePaise: number;
  stockQuantity?: number;
  currency: 'INR';
  status: ProductStatus;
  createdAt?: string;
  updatedAt?: string;
};
export type Page<T> = {
  items: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
};
export type ProductInput = {
  name: string;
  kind: ProductKind;
  categoryId?: string | null;
  sku?: string;
  description?: string | null;
  imageUrl?: string | null;
  purchasePricePaise: number;
  sellingPricePaise: number;
  stockQuantity?: number;
};

export function fetchProducts(params: {
  q: string;
  kind: string;
  status: string;
  categoryId: string;
  page: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.kind !== 'ALL') query.set('kind', params.kind);
  if (params.status !== 'ALL') query.set('status', params.status);
  if (params.categoryId) query.set('categoryId', params.categoryId);
  query.set('page', String(params.page));
  query.set('limit', String(params.limit ?? 20));
  return authenticatedApiRequest<Page<Product>>(`/products?${query.toString()}`);
}

export function fetchCategories(
  params: {
    q?: string;
    kind?: CategoryKind;
    status?: 'ACTIVE' | 'ARCHIVED';
    page?: number;
    limit?: number;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.kind) query.set('kind', params.kind);
  if (params.status) query.set('status', params.status);
  query.set('page', String(params.page ?? 1));
  query.set('limit', String(params.limit ?? 100));
  return authenticatedApiRequest<Page<Category>>(`/categories?${query.toString()}`);
}

export function createProduct(input: ProductInput) {
  return authenticatedApiRequest<{ product: Product }>('/products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProduct(productId: string, input: Partial<ProductInput>) {
  return authenticatedApiRequest<{ product: Product }>(`/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function setProductStatus(productId: string, status: 'ACTIVE' | 'INACTIVE') {
  return authenticatedApiRequest<{ product: Product }>(`/products/${productId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function archiveProduct(productId: string) {
  return authenticatedApiRequest<{ product: Product }>(`/products/${productId}`, {
    method: 'DELETE',
  });
}

export function fetchProductHistory(productId: string, page = 1) {
  return authenticatedApiRequest<Page<Record<string, unknown>>>(
    `/products/${productId}/history?page=${page}&limit=10`,
  );
}

export function createCategory(input: { name: string; kind: CategoryKind }) {
  return authenticatedApiRequest<{ category: Category }>('/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateCategory(categoryId: string, input: { name: string }) {
  return authenticatedApiRequest<{ category: Category }>(`/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function archiveCategory(categoryId: string) {
  return authenticatedApiRequest<{ category: Category }>(`/categories/${categoryId}`, {
    method: 'DELETE',
  });
}
