import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import type { AuthContext } from '../src/modules/auth/auth.types.js';
import { PlanModel } from '../src/modules/catalogue/catalogue.model.js';
import { NotificationModel } from '../src/modules/operations/operations.model.js';
import {
  SubscriptionEventModel,
  SubscriptionModel,
} from '../src/modules/subscriptions/subscription.model.js';
import {
  calculatePeriod,
  listPlans,
  listSubscriptions,
  runSubscriptionExpiryJob,
} from '../src/modules/subscriptions/subscription.service.js';
import {
  assignSubscriptionSchema,
  createPlanSchema,
} from '../src/modules/subscriptions/subscription.schemas.js';

const employee: AuthContext = {
  userId: '665f00000000000000000001',
  sessionId: 'sub-test',
  role: 'EMPLOYEE',
  employeeId: '665f00000000000000000002',
  permissions: [],
};
function chain(value: unknown) {
  const q = {
    select: vi.fn(() => q),
    sort: vi.fn(() => q),
    skip: vi.fn(() => q),
    limit: vi.fn(() => q),
    lean: vi.fn().mockResolvedValue(value),
  };
  return q;
}

describe('subscription rules', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calculates calendar month periods with end-of-month clamping', () => {
    expect(calculatePeriod(new Date('2024-01-31T10:00:00Z'), 'MONTHLY').endsAt.toISOString()).toBe(
      '2024-02-29T10:00:00.000Z',
    );
    expect(calculatePeriod(new Date('2025-01-31T10:00:00Z'), 'MONTHLY').endsAt.toISOString()).toBe(
      '2025-02-28T10:00:00.000Z',
    );
    expect(
      calculatePeriod(new Date('2025-03-31T10:00:00Z'), 'QUARTERLY').endsAt.toISOString(),
    ).toBe('2025-06-30T10:00:00.000Z');
    expect(calculatePeriod(new Date('2025-02-28T10:00:00Z'), 'YEARLY').endsAt.toISOString()).toBe(
      '2026-02-28T10:00:00.000Z',
    );
  });

  it('adds exact custom days and rejects invalid durations', () => {
    expect(
      calculatePeriod(new Date('2025-01-01T00:00:00Z'), 'CUSTOM', 45).endsAt.toISOString(),
    ).toBe('2025-02-15T00:00:00.000Z');
    expect(() => calculatePeriod(new Date(), 'CUSTOM', 0)).toThrowError(
      expect.objectContaining({ code: 'INVALID_DURATION' }),
    );
  });

  it('validates custom plan duration and date inputs', () => {
    expect(
      createPlanSchema.safeParse({ name: 'Monthly', duration: 'MONTHLY', pricePaise: 100 }).success,
    ).toBe(true);
    expect(
      createPlanSchema.safeParse({ name: 'Custom', duration: 'CUSTOM', pricePaise: 100 }).success,
    ).toBe(false);
    expect(
      createPlanSchema.safeParse({
        name: 'Monthly',
        duration: 'MONTHLY',
        customDurationDays: 30,
        pricePaise: -1,
      }).success,
    ).toBe(false);
    expect(
      assignSubscriptionSchema.safeParse({
        customerId: '665f00000000000000000001',
        planId: '665f00000000000000000002',
        startsAt: '2025-01-01',
      }).success,
    ).toBe(false);
  });

  it('denies employee plan reads without permission before database access', async () => {
    const findSpy = vi.spyOn(PlanModel, 'find');
    await expect(listPlans(employee)).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('denies employee subscription portal reads without the subscription permission', async () => {
    const find = vi.spyOn(SubscriptionModel, 'find');
    await expect(listSubscriptions(employee, { page: 1, limit: 20 })).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(find).not.toHaveBeenCalled();
  });

  it('runs expiry and reminder checks idempotently through unique notification keys', async () => {
    vi.spyOn(SubscriptionModel, 'updateMany').mockResolvedValue({ modifiedCount: 2 } as never);
    vi.spyOn(SubscriptionModel, 'updateOne').mockResolvedValue({ modifiedCount: 1 } as never);
    vi.spyOn(SubscriptionModel, 'find')
      .mockReturnValueOnce(
        chain([
          {
            _id: '665f00000000000000000003',
            customerId: '665f00000000000000000004',
            endsAt: new Date('2024-12-30T00:00:00Z'),
          },
        ]) as never,
      )
      .mockReturnValueOnce(
        chain([
          {
            _id: '665f00000000000000000006',
            customerId: '665f00000000000000000004',
            endsAt: new Date('2025-01-05T00:00:00Z'),
          },
        ]) as never,
      );
    const customerQuery = {
      select: vi.fn().mockReturnThis(),
      session: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ userId: '665f00000000000000000005' }),
    };
    const { CustomerModel } = await import('../src/modules/identity/identity.model.js');
    vi.spyOn(CustomerModel, 'findById').mockReturnValue(customerQuery as never);
    vi.spyOn(NotificationModel, 'updateOne').mockResolvedValue({ upsertedCount: 1 } as never);
    vi.spyOn(SubscriptionEventModel, 'create').mockResolvedValue({} as never);
    vi.spyOn(SubscriptionEventModel, 'updateOne').mockResolvedValue({ upsertedCount: 1 } as never);

    const result = await runSubscriptionExpiryJob(new Date('2025-01-01T00:00:00Z'));

    expect(result).toEqual({ expired: 1, remindersChecked: 1 });
    expect(NotificationModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        deduplicationKey: expect.stringContaining('subscription-expiry:'),
      }),
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ channel: 'IN_APP', type: 'SUBSCRIPTION_EXPIRING' }),
      }),
      expect.objectContaining({ upsert: true }),
    );
    expect(SubscriptionEventModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'EXPIRY_REMINDER_SENT' }),
      expect.anything(),
      { upsert: true },
    );
  });

  it('requires authentication for subscription endpoints', async () => {
    const response = await request(app).get('/api/v1/subscriptions');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
