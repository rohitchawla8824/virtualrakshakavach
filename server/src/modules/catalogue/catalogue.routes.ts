import { Router } from 'express';
import { validateRequest } from '../../middleware/validate-request.js';
import { authenticateUser, requireCsrf } from '../auth/auth.middleware.js';
import {
  archiveCategoryController,
  archiveProductController,
  createCategoryController,
  createProductController,
  getProductController,
  listCategoriesController,
  listProductHistoryController,
  listProductsController,
  setProductStatusController,
  updateCategoryController,
  updateProductController,
} from './catalogue.controller.js';
import {
  catalogueIdParamsSchema,
  categoryIdParamsSchema,
  categoryListQuerySchema,
  createCategorySchema,
  createProductSchema,
  productListQuerySchema,
  productStatusSchema,
  relatedListQuerySchema,
  updateCategorySchema,
  updateProductSchema,
} from './catalogue.schemas.js';

export const productRouter = Router();
productRouter.use(authenticateUser);
productRouter.get('/', validateRequest({ query: productListQuerySchema }), listProductsController);
productRouter.post(
  '/',
  requireCsrf,
  validateRequest({ body: createProductSchema }),
  createProductController,
);
productRouter.get(
  '/:productId/history',
  validateRequest({ params: catalogueIdParamsSchema, query: relatedListQuerySchema }),
  listProductHistoryController,
);
productRouter.get(
  '/:productId',
  validateRequest({ params: catalogueIdParamsSchema }),
  getProductController,
);
productRouter.patch(
  '/:productId/status',
  requireCsrf,
  validateRequest({ params: catalogueIdParamsSchema, body: productStatusSchema }),
  setProductStatusController,
);
productRouter.patch(
  '/:productId',
  requireCsrf,
  validateRequest({ params: catalogueIdParamsSchema, body: updateProductSchema }),
  updateProductController,
);
productRouter.delete(
  '/:productId',
  requireCsrf,
  validateRequest({ params: catalogueIdParamsSchema }),
  archiveProductController,
);

export const categoryRouter = Router();
categoryRouter.use(authenticateUser);
categoryRouter.get(
  '/',
  validateRequest({ query: categoryListQuerySchema }),
  listCategoriesController,
);
categoryRouter.post(
  '/',
  requireCsrf,
  validateRequest({ body: createCategorySchema }),
  createCategoryController,
);
categoryRouter.patch(
  '/:categoryId',
  requireCsrf,
  validateRequest({ params: categoryIdParamsSchema, body: updateCategorySchema }),
  updateCategoryController,
);
categoryRouter.delete(
  '/:categoryId',
  requireCsrf,
  validateRequest({ params: categoryIdParamsSchema }),
  archiveCategoryController,
);
