import { model, Schema } from 'mongoose';

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    kind: { type: String, enum: ['PRODUCT', 'SERVICE'], required: true },
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE', required: true },
    seedTag: { type: String, select: false },
  },
  { timestamps: true, versionKey: false },
);
categorySchema.index({ name: 1, kind: 1 }, { unique: true, name: 'categories_name_kind_unique' });
categorySchema.index({ status: 1, kind: 1 }, { name: 'categories_status_kind' });

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    kind: { type: String, enum: ['PHYSICAL', 'SERVICE'], required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    sku: { type: String, trim: true, uppercase: true, maxlength: 64 },
    description: { type: String, trim: true, maxlength: 2_000 },
    imageUrl: { type: String, trim: true, maxlength: 2_048 },
    purchasePricePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    sellingPricePaise: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    pricePaise: { type: Number, min: 0, validate: Number.isSafeInteger },
    stockQuantity: { type: Number, min: 0, validate: Number.isSafeInteger },
    currency: { type: String, enum: ['INR'], default: 'INR', required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      default: 'ACTIVE',
      required: true,
    },
  },
  { timestamps: true, versionKey: false },
);
productSchema.pre('validate', function () {
  if (this.kind === 'PHYSICAL' && this.stockQuantity === undefined) {
    this.invalidate('stockQuantity', 'Physical products require a stock quantity.');
  }
  if (this.kind === 'SERVICE' && this.stockQuantity !== undefined) {
    this.invalidate('stockQuantity', 'Services cannot have a stock quantity.');
  }
  if (this.pricePaise === undefined && this.sellingPricePaise !== undefined) {
    this.pricePaise = this.sellingPricePaise;
  }
});
productSchema.index({ sku: 1 }, { unique: true, sparse: true, name: 'products_sku_unique' });
productSchema.index({ categoryId: 1, status: 1 }, { name: 'products_category_status' });

const planSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    duration: {
      type: String,
      enum: ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM'],
      required: true,
    },
    customDurationDays: { type: Number, min: 1, max: 3_650, validate: Number.isSafeInteger },
    pricePaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    description: { type: String, trim: true, maxlength: 2_000 },
    currency: { type: String, enum: ['INR'], default: 'INR', required: true },
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE', required: true },
  },
  { timestamps: true, versionKey: false },
);
planSchema.index({ name: 1, status: 1 }, { name: 'plans_name_status' });

export const CategoryModel = model('Category', categorySchema);
export const ProductModel = model('Product', productSchema);
export const PlanModel = model('Plan', planSchema);
