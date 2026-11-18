import { model, Schema } from 'mongoose';

const subscriptionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    renewalKey: { type: String, trim: true, maxlength: 128 },
    previousSubscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription' },
    periodNumber: { type: Number, min: 1, validate: Number.isSafeInteger, default: 1 },
    status: { type: String, enum: ['UPCOMING', 'ACTIVE', 'EXPIRED', 'CANCELLED'], required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    gracePeriodDays: { type: Number, min: 0, max: 365, default: 0, required: true },
  },
  { timestamps: true, versionKey: false },
);
subscriptionSchema.index(
  { customerId: 1, status: 1, endsAt: 1 },
  { name: 'subscriptions_customer_status_end' },
);
subscriptionSchema.index({ status: 1, endsAt: 1 }, { name: 'subscriptions_expiry_scan' });
subscriptionSchema.index(
  { renewalKey: 1 },
  { unique: true, sparse: true, name: 'subscriptions_renewal_key_unique' },
);

const subscriptionEventSchema = new Schema(
  {
    subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: ['ASSIGNED', 'RENEWED', 'CANCELLED', 'STATUS_CHANGED', 'EXPIRY_REMINDER_SENT'],
      required: true,
    },
    occurredAt: { type: Date, required: true, default: Date.now },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false },
);
subscriptionEventSchema.index(
  { subscriptionId: 1, occurredAt: -1 },
  { name: 'subscription_events_history' },
);
subscriptionEventSchema.index(
  { subscriptionId: 1, type: 1, 'metadata.reminderForDate': 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'EXPIRY_REMINDER_SENT' },
    name: 'subscription_reminder_dedupe',
  },
);

export const SubscriptionModel = model('Subscription', subscriptionSchema);
export const SubscriptionEventModel = model('SubscriptionEvent', subscriptionEventSchema);
