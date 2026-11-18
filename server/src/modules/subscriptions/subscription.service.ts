import { Types } from 'mongoose';
import { AuthError } from '../auth/auth.errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CustomerModel } from '../identity/identity.model.js';
import { InvoiceModel } from '../finance/finance.model.js';
import { PlanModel } from '../catalogue/catalogue.model.js';
import { AuditLogModel } from '../operations/operations.model.js';
import { enqueueForCustomer, enqueueNotification } from '../operations/notification.service.js';
import { SubscriptionEventModel, SubscriptionModel } from './subscription.model.js';

type Duration = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM';
type Period = { startsAt: Date; endsAt: Date };
const deny = () =>
  new AuthError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
const missing = () =>
  new AuthError(404, 'SUBSCRIPTION_NOT_FOUND', 'The requested subscription was not found.');
function permission(auth: AuthContext, key: string) {
  if (auth.role === 'CUSTOMER' || (auth.role === 'EMPLOYEE' && !auth.permissions.includes(key)))
    throw deny();
}

export function calculatePeriod(start: Date, duration: Duration, customDays?: number): Period {
  const startsAt = new Date(start);
  const endsAt = new Date(start);
  if (duration === 'CUSTOM') {
    if (!customDays || !Number.isSafeInteger(customDays) || customDays < 1 || customDays > 3650)
      throw new AuthError(400, 'INVALID_DURATION', 'Custom plan duration must be 1 to 3650 days.');
    endsAt.setUTCDate(endsAt.getUTCDate() + customDays);
  } else {
    const months = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 }[duration];
    const day = startsAt.getUTCDate();
    endsAt.setUTCDate(1);
    endsAt.setUTCMonth(endsAt.getUTCMonth() + months);
    const lastDay = new Date(
      Date.UTC(endsAt.getUTCFullYear(), endsAt.getUTCMonth() + 1, 0),
    ).getUTCDate();
    endsAt.setUTCDate(Math.min(day, lastDay));
  }
  return { startsAt, endsAt };
}

function page<T>(items: T[], total: number, p: number, limit: number) {
  return { items, pagination: { page: p, limit, total, pages: Math.ceil(total / limit) } };
}
function ref(value: unknown) {
  return String(
    value && typeof value === 'object' && '_id' in value ? (value as { _id: unknown })._id : value,
  );
}
function formatPaise(amountPaise: number) {
  const amount = BigInt(amountPaise);
  return `${new Intl.NumberFormat('en-IN').format(amount / 100n)}.${String(amount % 100n).padStart(2, '0')}`;
}

async function customerAccess(
  customerId: string,
  auth: AuthContext,
  permissionKey = 'subscriptions:read',
) {
  if (!Types.ObjectId.isValid(customerId)) throw missing();
  if (auth.role === 'CUSTOMER') {
    if (auth.customerId !== customerId) throw missing();
  } else if (auth.role === 'EMPLOYEE') {
    permission(auth, permissionKey);
    const assigned = await CustomerModel.exists({
      _id: customerId,
      assignedEmployeeIds: auth.employeeId,
      status: 'ACTIVE',
    });
    if (!assigned) throw missing();
  }
  const customer = await CustomerModel.findOne({ _id: customerId, status: 'ACTIVE' })
    .select('_id userId')
    .lean();
  if (!customer) throw missing();
  return customer;
}

async function event(
  subscriptionId: Types.ObjectId | string,
  actorUserId: string | undefined,
  type: 'ASSIGNED' | 'RENEWED' | 'CANCELLED' | 'STATUS_CHANGED' | 'EXPIRY_REMINDER_SENT',
  metadata: Record<string, unknown> = {},
) {
  await SubscriptionEventModel.create({
    subscriptionId,
    actorUserId,
    type,
    metadata,
    occurredAt: new Date(),
  });
}

export async function listPlans(auth: AuthContext, q = '', status = 'ACTIVE', p = 1, limit = 20) {
  permission(auth, 'subscriptions:read');
  const filter: Record<string, unknown> = { status };
  if (q) filter.name = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [items, total] = await Promise.all([
    PlanModel.find(filter)
      .sort({ name: 1 })
      .skip((p - 1) * limit)
      .limit(limit)
      .lean(),
    PlanModel.countDocuments(filter),
  ]);
  return page(items, total, p, limit);
}

export async function createPlan(
  input: {
    name: string;
    description?: string;
    duration: Duration;
    customDurationDays?: number;
    pricePaise: number;
  },
  auth: AuthContext,
) {
  permission(auth, 'subscriptions:manage');
  const plan = await PlanModel.create(input);
  await AuditLogModel.create({
    actorUserId: auth.userId,
    action: 'SUBSCRIPTION_PLAN_CREATED',
    entityType: 'Plan',
    entityId: plan._id,
    metadata: { after: plan.toObject() },
  });
  return plan;
}

export async function updatePlan(
  planId: string,
  input: Partial<{
    name: string;
    description: string;
    duration: Duration;
    customDurationDays: number;
    pricePaise: number;
  }>,
  auth: AuthContext,
) {
  permission(auth, 'subscriptions:manage');
  const plan = await PlanModel.findById(planId);
  if (!plan || plan.status !== 'ACTIVE') throw missing();
  const before = plan.toObject();
  Object.assign(plan, input);
  if (input.duration && input.duration !== 'CUSTOM') plan.customDurationDays = undefined;
  await plan.save();
  await AuditLogModel.create({
    actorUserId: auth.userId,
    action: 'SUBSCRIPTION_PLAN_UPDATED',
    entityType: 'Plan',
    entityId: plan._id,
    metadata: { before, after: plan.toObject() },
  });
  return plan;
}

export async function archivePlan(planId: string, auth: AuthContext) {
  permission(auth, 'subscriptions:manage');
  const plan = await PlanModel.findById(planId);
  if (!plan) throw missing();
  plan.status = 'ARCHIVED';
  await plan.save();
  await AuditLogModel.create({
    actorUserId: auth.userId,
    action: 'SUBSCRIPTION_PLAN_ARCHIVED',
    entityType: 'Plan',
    entityId: plan._id,
  });
  return plan;
}

async function createPeriod(
  customerId: string,
  planId: string,
  startsAt: Date,
  auth: AuthContext,
  opts: {
    renewalKey?: string;
    previousId?: string;
    invoiceDueAt?: Date;
    periodNumber?: number;
  } = {},
) {
  const plan = await PlanModel.findOne({ _id: planId, status: 'ACTIVE' }).lean();
  if (!plan) throw new AuthError(400, 'PLAN_UNAVAILABLE', 'Choose an active subscription plan.');
  const period = calculatePeriod(
    startsAt,
    plan.duration as Duration,
    plan.customDurationDays ?? undefined,
  );
  const status = period.startsAt > new Date() ? 'UPCOMING' : 'ACTIVE';
  const subscription = await SubscriptionModel.create({
    customerId,
    planId,
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    status,
    renewalKey: opts.renewalKey,
    previousSubscriptionId: opts.previousId,
    periodNumber: opts.periodNumber ?? 1,
  });
  const invoiceId = new Types.ObjectId();
  const invoiceNumber = `SUB-${invoiceId.toString().toUpperCase()}`;
  const sourceKey = opts.renewalKey
    ? `subscription:${opts.renewalKey}`
    : `subscription:${subscription.id}:initial`;
  try {
    const invoice = await InvoiceModel.create({
      _id: invoiceId,
      invoiceNumber,
      customerId,
      subscriptionId: subscription._id,
      sourceKey,
      issuedAt: new Date(),
      dueAt: opts.invoiceDueAt ?? new Date(),
      lines: [
        {
          nameSnapshot: plan.name,
          quantity: 1,
          unitPricePaise: plan.pricePaise,
          lineTotalPaise: plan.pricePaise,
        },
      ],
      subtotalPaise: plan.pricePaise,
      discountPaise: 0,
      taxPaise: 0,
      totalPaise: plan.pricePaise,
      currency: 'INR',
      status: 'ISSUED',
      taxConfigurationStatus: 'PENDING_APPROVAL',
    });
    subscription.invoiceId = invoice._id;
    await subscription.save();
  } catch (error) {
    await SubscriptionModel.deleteOne({ _id: subscription._id });
    throw error;
  }
  await event(subscription._id, auth.userId, opts.previousId ? 'RENEWED' : 'ASSIGNED', {
    invoiceId: invoiceId.toString(),
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    periodNumber: subscription.periodNumber,
  });
  const dueLabel = formatPaise(plan.pricePaise);
  await enqueueForCustomer({
    customerId,
    type: 'INVOICE_GENERATED',
    message: `Invoice ${invoiceNumber} was generated for subscription ${plan.name} (₹${dueLabel}).`,
    entityType: 'Invoice',
    entityId: invoiceId,
    deduplicationKey: `invoice-generated:${invoiceId}`,
  });
  if (opts.previousId) {
    await enqueueForCustomer({
      customerId,
      type: 'SUBSCRIPTION_RENEWED',
      message: `Your ${plan.name} subscription has been renewed through ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(period.endsAt)}.`,
      entityType: 'Subscription',
      entityId: subscription._id,
      deduplicationKey: `subscription-renewed:${subscription._id}`,
    });
  }
  return subscription;
}

export async function assignSubscription(
  input: { customerId: string; planId: string; startsAt: string; invoiceDueAt?: string },
  auth: AuthContext,
) {
  if (auth.role === 'CUSTOMER') throw deny();
  permission(auth, 'subscriptions:assign');
  await customerAccess(input.customerId, auth, 'subscriptions:assign');
  const startsAt = new Date(input.startsAt);
  if (!Number.isFinite(startsAt.getTime()))
    throw new AuthError(400, 'INVALID_DATE', 'Provide a valid subscription start date.');
  return createPeriod(input.customerId, input.planId, startsAt, auth, {
    invoiceDueAt: input.invoiceDueAt ? new Date(input.invoiceDueAt) : undefined,
  });
}

export async function renewSubscription(
  subscriptionId: string,
  input: { renewalKey: string; planId?: string; startsAt?: string; invoiceDueAt?: string },
  auth: AuthContext,
) {
  if (auth.role === 'CUSTOMER') throw deny();
  permission(auth, 'subscriptions:assign');
  if (!Types.ObjectId.isValid(subscriptionId)) throw missing();
  const current = await SubscriptionModel.findById(subscriptionId);
  if (!current || current.status === 'CANCELLED') throw missing();
  await customerAccess(ref(current.customerId), auth, 'subscriptions:assign');
  const existing = await SubscriptionModel.findOne({ renewalKey: input.renewalKey });
  if (existing) return existing;
  const startsAt = input.startsAt
    ? new Date(input.startsAt)
    : new Date(Math.max(current.endsAt.getTime(), Date.now()));
  let next;
  try {
    next = await createPeriod(
      ref(current.customerId),
      input.planId ?? ref(current.planId),
      startsAt,
      auth,
      {
        renewalKey: input.renewalKey,
        previousId: current.id,
        periodNumber: current.periodNumber + 1,
        invoiceDueAt: input.invoiceDueAt ? new Date(input.invoiceDueAt) : undefined,
      },
    );
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      const raced = await SubscriptionModel.findOne({ renewalKey: input.renewalKey });
      if (raced) return raced;
    }
    throw error;
  }
  await event(current._id, auth.userId, 'RENEWED', {
    nextSubscriptionId: next.id,
    renewalKey: input.renewalKey,
  });
  return next;
}

export async function cancelSubscription(subscriptionId: string, auth: AuthContext) {
  if (auth.role === 'CUSTOMER') throw deny();
  permission(auth, 'subscriptions:assign');
  if (!Types.ObjectId.isValid(subscriptionId)) throw missing();
  const subscription = await SubscriptionModel.findById(subscriptionId);
  if (!subscription) throw missing();
  await customerAccess(ref(subscription.customerId), auth, 'subscriptions:assign');
  if (subscription.status !== 'CANCELLED') {
    const before = subscription.status;
    subscription.status = 'CANCELLED';
    await subscription.save();
    await event(subscription._id, auth.userId, 'CANCELLED', { previousStatus: before });
  }
  return subscription;
}

export async function listSubscriptions(
  auth: AuthContext,
  args: {
    page: number;
    limit: number;
    q?: string;
    status?: string;
    expiringWithinDays?: number;
    customerId?: string;
  },
) {
  const filter: Record<string, unknown> = {};
  if (auth.role === 'CUSTOMER') filter.customerId = auth.customerId;
  else {
    permission(auth, 'subscriptions:read');
    if (auth.role === 'EMPLOYEE') {
      const customers = await CustomerModel.find({
        assignedEmployeeIds: auth.employeeId,
        status: 'ACTIVE',
      }).distinct('_id');
      filter.customerId = { $in: customers };
    }
    if (args.customerId) {
      await customerAccess(args.customerId, auth);
      filter.customerId = args.customerId;
    }
  }
  if (args.status) filter.status = args.status;
  if (args.expiringWithinDays) {
    filter.status = 'ACTIVE';
    filter.endsAt = {
      $gte: new Date(),
      $lte: new Date(Date.now() + args.expiringWithinDays * 86_400_000),
    };
  }
  const [items, total] = await Promise.all([
    SubscriptionModel.find(filter)
      .populate('planId', 'name duration customDurationDays pricePaise')
      .populate('invoiceId', 'invoiceNumber totalPaise status')
      .sort({ startsAt: -1 })
      .skip((args.page - 1) * args.limit)
      .limit(args.limit)
      .lean(),
    SubscriptionModel.countDocuments(filter),
  ]);
  return page(items, total, args.page, args.limit);
}

export async function subscriptionHistory(
  subscriptionId: string,
  auth: AuthContext,
  p = 1,
  limit = 20,
) {
  const sub = await SubscriptionModel.findById(subscriptionId).select('customerId');
  if (!sub) throw missing();
  await customerAccess(ref(sub.customerId), auth);
  const [items, total] = await Promise.all([
    SubscriptionEventModel.find({ subscriptionId })
      .sort({ occurredAt: -1 })
      .skip((p - 1) * limit)
      .limit(limit)
      .lean(),
    SubscriptionEventModel.countDocuments({ subscriptionId }),
  ]);
  return page(items, total, p, limit);
}

export async function runSubscriptionExpiryJob(now = new Date()) {
  const expiredRecords = await SubscriptionModel.find({
    status: { $in: ['UPCOMING', 'ACTIVE'] },
    endsAt: { $lt: now },
  })
    .select('_id customerId endsAt')
    .lean();
  let expiredCount = 0;
  for (const subscription of expiredRecords) {
    const changed = await SubscriptionModel.updateOne(
      { _id: subscription._id, status: { $in: ['UPCOMING', 'ACTIVE'] }, endsAt: { $lt: now } },
      { $set: { status: 'EXPIRED' } },
    );
    if (!changed.modifiedCount) continue;
    expiredCount += 1;
    const expiryDate = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeZone: 'Asia/Kolkata',
    }).format(subscription.endsAt);
    await enqueueForCustomer({
      customerId: subscription.customerId,
      type: 'SUBSCRIPTION_EXPIRED',
      message: `Your subscription expired on ${expiryDate}. Contact us to renew your protection.`,
      entityType: 'Subscription',
      entityId: subscription._id,
      deduplicationKey: `subscription-expired:${subscription._id}`,
    });
    await event(subscription._id, undefined, 'STATUS_CHANGED', { status: 'EXPIRED' });
  }
  await SubscriptionModel.updateMany(
    { status: 'UPCOMING', startsAt: { $lte: now }, endsAt: { $gte: now } },
    { $set: { status: 'ACTIVE' } },
  );
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const expiring = await SubscriptionModel.find({
    status: 'ACTIVE',
    endsAt: { $gte: now, $lte: soon },
  })
    .select('_id customerId endsAt')
    .lean();
  for (const sub of expiring) {
    const customer = await CustomerModel.findById(sub.customerId).select('userId').lean();
    if (!customer?.userId) continue;
    const dateKey = sub.endsAt.toISOString().slice(0, 10);
    const expiryDate = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeZone: 'Asia/Kolkata',
    }).format(sub.endsAt);
    await enqueueNotification({
      userId: customer.userId,
      type: 'SUBSCRIPTION_EXPIRING',
      message: `Your subscription expires on ${expiryDate}. Renew soon to keep your protection active.`,
      entityType: 'Subscription',
      entityId: sub._id,
      deduplicationKey: `subscription-expiry:${sub._id}:${dateKey}`,
    });
    await SubscriptionEventModel.updateOne(
      {
        subscriptionId: sub._id,
        type: 'EXPIRY_REMINDER_SENT',
        'metadata.reminderForDate': dateKey,
      },
      {
        $setOnInsert: {
          subscriptionId: sub._id,
          type: 'EXPIRY_REMINDER_SENT',
          occurredAt: now,
          metadata: { reminderForDate: dateKey },
        },
      },
      { upsert: true },
    );
  }
  return { expired: expiredCount, remindersChecked: expiring.length };
}

export async function expireMissedPeriods() {
  return runSubscriptionExpiryJob(new Date());
}
