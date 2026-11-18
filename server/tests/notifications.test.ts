import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { NotificationModel } from '../src/modules/operations/operations.model.js';
import {
  enqueueNotification,
  runNotificationDeliveryJob,
} from '../src/modules/operations/notification.service.js';

describe('notification delivery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('marks in-app deliveries as sent and records a delivery attempt', async () => {
    const now = new Date('2026-03-10T10:00:00.000Z');
    const notification = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      channel: 'IN_APP',
      type: 'PAYMENT_RECEIVED',
      message: 'Payment received.',
      attemptCount: 1,
    };
    const claim = vi.spyOn(NotificationModel, 'findOneAndUpdate');
    claim
      .mockReturnValueOnce({ lean: () => Promise.resolve(notification) } as never)
      .mockReturnValueOnce({ lean: () => Promise.resolve(null) } as never);
    const update = vi.spyOn(NotificationModel, 'updateOne').mockResolvedValue({} as never);
    await expect(runNotificationDeliveryJob(now)).resolves.toEqual({ delivered: 1, failed: 0 });
    expect(claim).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'QUEUED', scheduledAt: { $lte: now } }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'PROCESSING' }) }),
      { returnDocument: 'after' },
    );
    expect(update).toHaveBeenCalledWith(
      { _id: notification._id, status: 'PROCESSING' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'SENT' }) }),
    );
  });

  it('uses a stable event and recipient key for idempotent scheduled notifications', async () => {
    const userId = new Types.ObjectId();
    const update = vi.spyOn(NotificationModel, 'updateOne').mockResolvedValue({} as never);
    const input = {
      userId,
      type: 'SUBSCRIPTION_EXPIRING',
      message: 'Renew soon.',
      deduplicationKey: 'subscription-expiry:subscription-id:2026-03-10',
    };
    await enqueueNotification(input);
    await enqueueNotification(input);
    const keys = update.mock.calls.map(
      ([filter]) => (filter as { deduplicationKey: string }).deduplicationKey,
    );
    expect(keys.length).toBeGreaterThanOrEqual(2);
    const channelsPerEnqueue = keys.length / 2;
    expect(Number.isInteger(channelsPerEnqueue)).toBe(true);
    expect(new Set(keys.slice(0, channelsPerEnqueue)).size).toBe(channelsPerEnqueue);
    expect(keys.slice(0, channelsPerEnqueue)).toEqual(keys.slice(channelsPerEnqueue));
    expect(
      keys.every((key) => key.includes(input.deduplicationKey) && key.includes(String(userId))),
    ).toBe(true);
    expect(
      update.mock.calls.every(([, , options]) => (options as { upsert?: boolean }).upsert),
    ).toBe(true);
  });
});
