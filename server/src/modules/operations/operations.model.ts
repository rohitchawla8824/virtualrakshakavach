import { model, Schema } from 'mongoose';

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: ['IN_APP', 'EMAIL'], required: true },
    type: { type: String, required: true, trim: true, maxlength: 80 },
    message: { type: String, trim: true, maxlength: 300 },
    entityType: { type: String, trim: true, maxlength: 80 },
    entityId: { type: Schema.Types.ObjectId },
    status: {
      type: String,
      enum: ['QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'READ'],
      default: 'QUEUED',
      required: true,
    },
    scheduledAt: { type: Date },
    sentAt: { type: Date },
    attemptCount: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    lastAttemptAt: { type: Date },
    lastErrorCode: { type: String, trim: true, maxlength: 80 },
    lockedAt: { type: Date },
    deduplicationKey: { type: String, trim: true, maxlength: 160 },
  },
  { timestamps: true, versionKey: false },
);
notificationSchema.index(
  { userId: 1, status: 1, createdAt: -1 },
  { name: 'notifications_user_status' },
);
notificationSchema.index(
  { deduplicationKey: 1 },
  { unique: true, sparse: true, name: 'notifications_deduplication_unique' },
);
notificationSchema.index(
  { status: 1, scheduledAt: 1, createdAt: 1 },
  { name: 'notifications_delivery_queue' },
);

const auditLogSchema = new Schema(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true, trim: true, maxlength: 100 },
    entityType: { type: String, required: true, trim: true, maxlength: 80 },
    entityId: { type: Schema.Types.ObjectId, required: true },
    requestId: { type: String, trim: true, maxlength: 80 },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
auditLogSchema.index(
  { entityType: 1, entityId: 1, createdAt: -1 },
  { name: 'audit_entity_history' },
);
auditLogSchema.index({ actorUserId: 1, createdAt: -1 }, { name: 'audit_actor_history' });

const webhookEventSchema = new Schema(
  {
    provider: { type: String, enum: ['RAZORPAY'], required: true },
    providerEventId: { type: String, required: true, trim: true, maxlength: 160 },
    eventType: { type: String, required: true, trim: true, maxlength: 100 },
    status: {
      type: String,
      enum: ['RECEIVED', 'PROCESSED', 'FAILED'],
      default: 'RECEIVED',
      required: true,
    },
    receivedAt: { type: Date, required: true, default: Date.now },
    processedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);
webhookEventSchema.index(
  { provider: 1, providerEventId: 1 },
  { unique: true, name: 'webhook_provider_event_unique' },
);
webhookEventSchema.index({ status: 1, receivedAt: 1 }, { name: 'webhook_processing_queue' });

export const NotificationModel = model('Notification', notificationSchema);
export const AuditLogModel = model('AuditLog', auditLogSchema);
export const WebhookEventModel = model('WebhookEvent', webhookEventSchema);
