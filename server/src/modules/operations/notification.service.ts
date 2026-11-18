import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { emailDeliveryConfigured, sendOperationalNotification } from '../auth/auth.mailer.js';
import { CustomerModel, UserModel } from '../identity/identity.model.js';
import { NotificationModel } from './operations.model.js';

export async function enqueueNotification(input: {
  userId: Types.ObjectId | string;
  type: string;
  message: string;
  entityType?: string;
  entityId?: Types.ObjectId | string;
  deduplicationKey: string;
  session?: ClientSession;
}) {
  const channels: Array<'IN_APP' | 'EMAIL'> = ['IN_APP'];
  if (emailDeliveryConfigured()) channels.push('EMAIL');
  await Promise.all(
    channels.map((channel) =>
      NotificationModel.updateOne(
        { deduplicationKey: `${input.deduplicationKey}:${input.userId}:${channel}` },
        {
          $setOnInsert: {
            userId: input.userId,
            channel,
            type: input.type,
            message: input.message,
            entityType: input.entityType,
            entityId: input.entityId,
            status: 'QUEUED',
            scheduledAt: new Date(),
            deduplicationKey: `${input.deduplicationKey}:${input.userId}:${channel}`,
            attemptCount: 0,
          },
        },
        { upsert: true, session: input.session },
      ),
    ),
  );
}

export async function enqueueForCustomer(input: {
  customerId: Types.ObjectId | string;
  type: string;
  message: string;
  entityType?: string;
  entityId?: Types.ObjectId | string;
  deduplicationKey: string;
  session?: ClientSession;
}) {
  const customer = await CustomerModel.findById(input.customerId)
    .select('userId')
    .session(input.session ?? null)
    .lean();
  if (!customer?.userId) return;
  await enqueueNotification({ ...input, userId: customer.userId });
}

export async function enqueueForActiveAdmins(input: {
  type: string;
  message: string;
  entityType?: string;
  entityId?: Types.ObjectId | string;
  deduplicationKey: string;
  session?: ClientSession;
}) {
  const admins = await UserModel.find({ role: 'ADMIN', status: 'ACTIVE' })
    .select('_id')
    .session(input.session ?? null)
    .lean();
  await Promise.all(admins.map((admin) => enqueueNotification({ ...input, userId: admin._id })));
}

const maxAttempts = 5;

export async function runNotificationDeliveryJob(now = new Date(), batchSize = 100) {
  let delivered = 0;
  let failed = 0;
  for (let index = 0; index < batchSize; index += 1) {
    const notification = await NotificationModel.findOneAndUpdate(
      {
        status: 'QUEUED',
        scheduledAt: { $lte: now },
        $or: [{ attemptCount: { $lt: maxAttempts } }, { attemptCount: { $exists: false } }],
      },
      {
        $set: { status: 'PROCESSING', lockedAt: now, lastAttemptAt: now },
        $inc: { attemptCount: 1 },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!notification) break;
    try {
      if (notification.channel === 'EMAIL') {
        const recipient = await UserModel.findOne({ _id: notification.userId, status: 'ACTIVE' })
          .select('email')
          .lean();
        if (!recipient) throw new Error('RECIPIENT_NOT_FOUND');
        await sendOperationalNotification(
          recipient.email,
          notification.type.replaceAll('_', ' '),
          notification.message ?? notification.type.replaceAll('_', ' '),
        );
      }
      await NotificationModel.updateOne(
        { _id: notification._id, status: 'PROCESSING' },
        {
          $set: { status: 'SENT', sentAt: new Date() },
          $unset: { lockedAt: 1, lastErrorCode: 1 },
        },
      );
      delivered += 1;
    } catch (error) {
      const attempts = notification.attemptCount ?? 1;
      const errorCode =
        error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message)
          ? error.message
          : 'DELIVERY_FAILED';
      const retryAt = new Date(now.getTime() + Math.min(60, 2 ** attempts) * 60_000);
      await NotificationModel.updateOne(
        { _id: notification._id, status: 'PROCESSING' },
        attempts >= maxAttempts
          ? { $set: { status: 'FAILED', lastErrorCode: errorCode }, $unset: { lockedAt: 1 } }
          : {
              $set: { status: 'QUEUED', scheduledAt: retryAt, lastErrorCode: errorCode },
              $unset: { lockedAt: 1 },
            },
      );
      failed += 1;
    }
  }
  return { delivered, failed };
}

export async function recoverStaleNotificationDeliveries(now = new Date()) {
  const staleBefore = new Date(now.getTime() - 10 * 60_000);
  const retryable = await NotificationModel.updateMany(
    {
      status: 'PROCESSING',
      lockedAt: { $lt: staleBefore },
      $or: [{ attemptCount: { $lt: maxAttempts } }, { attemptCount: { $exists: false } }],
    },
    {
      $set: { status: 'QUEUED', scheduledAt: now, lastErrorCode: 'DELIVERY_WORKER_RESTARTED' },
      $unset: { lockedAt: 1 },
    },
  );
  const exhausted = await NotificationModel.updateMany(
    { status: 'PROCESSING', lockedAt: { $lt: staleBefore } },
    { $set: { status: 'FAILED', lastErrorCode: 'MAX_DELIVERY_ATTEMPTS' }, $unset: { lockedAt: 1 } },
  );
  return { retryable: retryable.modifiedCount, exhausted: exhausted.modifiedCount };
}
