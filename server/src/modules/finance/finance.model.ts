import { model, Schema } from 'mongoose';

const invoiceLineSchema = new Schema(
  {
    nameSnapshot: { type: String, required: true, maxlength: 160 },
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    unitPricePaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    lineTotalPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  },
  { _id: false },
);
const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, trim: true, maxlength: 64 },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    sourceKey: { type: String, trim: true, maxlength: 128 },
    discountPaise: { type: Number, min: 0, validate: Number.isSafeInteger, default: 0 },
    subtotalPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    taxLabel: { type: String, trim: true, maxlength: 80 },
    taxRateBps: { type: Number, min: 0, max: 10_000, validate: Number.isSafeInteger, default: 0 },
    taxMode: { type: String, enum: ['EXCLUSIVE', 'INCLUSIVE'] },
    taxPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, default: 0 },
    issuedAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    lines: { type: [invoiceLineSchema], required: true },
    totalPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    refundReservedPaise: {
      type: Number,
      min: 0,
      validate: Number.isSafeInteger,
      default: 0,
      select: false,
    },
    onlineReservedPaise: {
      type: Number,
      min: 0,
      validate: Number.isSafeInteger,
      default: 0,
      select: false,
    },
    currency: { type: String, enum: ['INR'], default: 'INR', required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE'],
      required: true,
    },
    taxConfigurationStatus: {
      type: String,
      enum: ['NOT_CONFIGURED', 'PENDING_APPROVAL'],
      default: 'PENDING_APPROVAL',
      required: true,
    },
  },
  { timestamps: true, versionKey: false },
);
invoiceSchema.index({ invoiceNumber: 1 }, { unique: true, name: 'invoices_number_unique' });
invoiceSchema.index({ customerId: 1, issuedAt: -1 }, { name: 'invoices_customer_issued' });
invoiceSchema.index({ status: 1, dueAt: 1 }, { name: 'invoices_status_due' });
invoiceSchema.index(
  { sourceKey: 1 },
  { unique: true, sparse: true, name: 'invoices_source_key_unique' },
);

const invoiceCounterSchema = new Schema(
  {
    period: { type: String, required: true, unique: true },
    value: { type: Number, required: true, validate: Number.isSafeInteger },
  },
  { timestamps: true, versionKey: false },
);

const paymentSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    refundReservedPaise: {
      type: Number,
      min: 0,
      validate: Number.isSafeInteger,
      default: 0,
      select: false,
    },
    currency: { type: String, enum: ['INR'], default: 'INR', required: true },
    method: {
      type: String,
      enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'RAZORPAY_SANDBOX', 'OTHER'],
      required: true,
    },
    status: { type: String, enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'REVERSED'], required: true },
    idempotencyKey: { type: String, required: true, trim: true, maxlength: 128 },
    receivedAt: { type: Date },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    reference: { type: String, trim: true, maxlength: 120 },
    providerPaymentId: { type: String, trim: true, maxlength: 80, select: false },
    requestFingerprint: { type: String, select: false },
  },
  { timestamps: true, versionKey: false },
);
paymentSchema.index({ idempotencyKey: 1 }, { unique: true, name: 'payments_idempotency_unique' });
paymentSchema.index({ customerId: 1, createdAt: -1 }, { name: 'payments_customer_date' });
paymentSchema.index({ status: 1, createdAt: -1 }, { name: 'payments_status_date' });
paymentSchema.index(
  { providerPaymentId: 1 },
  { unique: true, sparse: true, name: 'payments_provider_payment_unique' },
);

const allocationSchema = new Schema(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    refundReservedPaise: {
      type: Number,
      min: 0,
      validate: Number.isSafeInteger,
      default: 0,
      select: false,
    },
    allocatedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false },
);
allocationSchema.index(
  { paymentId: 1, invoiceId: 1 },
  { unique: true, name: 'allocations_payment_invoice_unique' },
);
allocationSchema.index({ invoiceId: 1, createdAt: 1 }, { name: 'allocations_invoice_history' });

const refundSchema = new Schema(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    status: {
      type: String,
      enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PROCESSED'],
      required: true,
    },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    requestedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false },
);
refundSchema.index({ paymentId: 1, createdAt: -1 }, { name: 'refunds_payment_history' });
refundSchema.index({ status: 1, createdAt: 1 }, { name: 'refunds_approval_queue' });

const taxConfigurationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    rateBps: { type: Number, required: true, min: 0, max: 10_000, validate: Number.isSafeInteger },
    mode: { type: String, enum: ['EXCLUSIVE', 'INCLUSIVE'], required: true },
    active: { type: Boolean, default: true, required: true },
  },
  { timestamps: true, versionKey: false },
);
taxConfigurationSchema.index({ active: 1, updatedAt: -1 }, { name: 'tax_config_active' });

export const InvoiceModel = model('Invoice', invoiceSchema);
export const PaymentModel = model('Payment', paymentSchema);
export const PaymentAllocationModel = model('PaymentAllocation', allocationSchema);
export const RefundModel = model('Refund', refundSchema);
export const InvoiceCounterModel = model('InvoiceCounter', invoiceCounterSchema);
export const TaxConfigurationModel = model('TaxConfiguration', taxConfigurationSchema);

const razorpayOrderSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    requestKey: { type: String, required: true, trim: true, maxlength: 128 },
    receipt: { type: String, required: true, trim: true, maxlength: 64 },
    orderId: { type: String, trim: true, maxlength: 80, select: false },
    providerPaymentId: { type: String, trim: true, maxlength: 80, select: false },
    paymentRecordId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    currency: { type: String, enum: ['INR'], default: 'INR', required: true },
    status: {
      type: String,
      enum: ['CREATING', 'CREATED', 'PAID', 'FAILED', 'CANCELLED'],
      default: 'CREATING',
      required: true,
    },
    failureCode: { type: String, trim: true, maxlength: 80 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false },
);
razorpayOrderSchema.index(
  { orderId: 1 },
  { unique: true, sparse: true, name: 'razorpay_order_unique' },
);
razorpayOrderSchema.index(
  { customerId: 1, requestKey: 1 },
  { unique: true, name: 'razorpay_request_key_unique' },
);
razorpayOrderSchema.index(
  { providerPaymentId: 1 },
  { unique: true, sparse: true, name: 'razorpay_payment_unique' },
);
razorpayOrderSchema.index({ customerId: 1, createdAt: -1 }, { name: 'razorpay_customer_history' });
export const RazorpayOrderModel = model('RazorpayOrder', razorpayOrderSchema);
