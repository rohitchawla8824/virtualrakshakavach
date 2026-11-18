import { Types } from 'mongoose';
import { AuthError } from '../auth/auth.errors.js';
import { createInvitation, requestEmailChange } from '../auth/auth.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import {
  CustomerModel,
  EmployeeModel,
  AuthSessionModel,
  UserModel,
} from '../identity/identity.model.js';
import { AuditLogModel } from '../operations/operations.model.js';
import { InvoiceModel, PaymentAllocationModel, PaymentModel } from '../finance/finance.model.js';
import { SubscriptionModel } from '../subscriptions/subscription.model.js';

type CustomerCreateInput = {
  displayName: string;
  email: string;
  phone?: string;
  assignedEmployeeIds?: string[];
  primaryEmployeeId?: string;
};

type CustomerUpdateInput = {
  displayName?: string;
  phone?: string | null;
  assignedEmployeeIds?: string[];
  primaryEmployeeId?: string | null;
};

function forbidden() {
  return new AuthError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
}

function notFound() {
  return new AuthError(404, 'CUSTOMER_NOT_FOUND', 'The requested customer was not found.');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pageResult<T>(items: T[], total: number, page: number, limit: number) {
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

function refString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && '_id' in value)
    return String((value as { _id: unknown })._id);
  return String(value);
}

function requireEmployeePermission(auth: AuthContext, permission: string) {
  if (auth.role === 'EMPLOYEE' && !auth.permissions.includes(permission)) throw forbidden();
}

function assertPaiseTotal(values: number[]) {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new AuthError(
      500,
      'FINANCIAL_TOTAL_OVERFLOW',
      'The financial summary exceeds the supported range.',
    );
  return Number(total);
}

async function findAccessibleCustomer(customerId: string, auth: AuthContext) {
  if (!Types.ObjectId.isValid(customerId)) throw notFound();
  const filter: Record<string, unknown> = { _id: customerId };
  if (auth.role === 'CUSTOMER') {
    if (!auth.customerId || auth.customerId !== customerId) throw notFound();
  } else if (auth.role === 'EMPLOYEE') {
    requireEmployeePermission(auth, 'customers:read');
    if (!auth.employeeId) throw notFound();
    filter.assignedEmployeeIds = auth.employeeId;
  }
  const customer = await CustomerModel.findOne(filter)
    .populate('assignedEmployeeIds', 'displayName status')
    .populate('primaryEmployeeId', 'displayName status')
    .lean();
  if (!customer) throw notFound();
  return customer;
}

async function getFinancialSummary(customerId: string) {
  const invoices = await InvoiceModel.find({
    customerId,
    status: { $nin: ['DRAFT', 'VOID'] },
  })
    .select('_id totalPaise')
    .lean();
  const payments = await PaymentModel.find({ customerId, status: 'SUCCEEDED' })
    .select('_id amountPaise')
    .lean();
  const invoiceIds = invoices.map((invoice) => invoice._id);
  const paymentIds = payments.map((payment) => payment._id);
  const allocations =
    invoiceIds.length && paymentIds.length
      ? await PaymentAllocationModel.find({
          invoiceId: { $in: invoiceIds },
          paymentId: { $in: paymentIds },
        })
          .select('amountPaise')
          .lean()
      : [];
  const invoicedPaise = assertPaiseTotal(invoices.map((invoice) => invoice.totalPaise));
  const receivedPaise = assertPaiseTotal(payments.map((payment) => payment.amountPaise));
  const allocatedPaise = assertPaiseTotal(allocations.map((allocation) => allocation.amountPaise));
  return {
    invoiceCount: invoices.length,
    paymentCount: payments.length,
    invoicedPaise,
    receivedPaise,
    allocatedPaise,
    outstandingPaise: Math.max(0, invoicedPaise - allocatedPaise),
    advancePaise: Math.max(0, receivedPaise - allocatedPaise),
    currency: 'INR' as const,
  };
}

async function validateAssignments(employeeIds: string[], primaryEmployeeId?: string | null) {
  const normalizedIds = [...new Set(employeeIds)];
  if (normalizedIds.length !== employeeIds.length)
    throw new AuthError(
      400,
      'INVALID_ASSIGNMENT',
      'An employee cannot be assigned more than once.',
    );
  if (primaryEmployeeId && !normalizedIds.includes(primaryEmployeeId))
    throw new AuthError(
      400,
      'INVALID_PRIMARY_EMPLOYEE',
      'The primary employee must be included in the assigned employee list.',
    );
  const activeEmployees = await EmployeeModel.find({
    _id: { $in: normalizedIds },
    status: 'ACTIVE',
  })
    .select('_id')
    .lean();
  if (activeEmployees.length !== normalizedIds.length)
    throw new AuthError(400, 'INVALID_ASSIGNMENT', 'Choose active employee accounts only.');
  return { employeeIds: normalizedIds, primaryEmployeeId: primaryEmployeeId ?? undefined };
}

export async function listCustomers(
  auth: AuthContext,
  query: { q?: string; status?: 'ACTIVE' | 'INACTIVE'; page: number; limit: number },
) {
  if (auth.role === 'CUSTOMER') throw forbidden();
  requireEmployeePermission(auth, 'customers:read');
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (auth.role === 'EMPLOYEE') {
    if (!auth.employeeId) throw forbidden();
    filter.assignedEmployeeIds = auth.employeeId;
  }
  if (query.q) {
    const term = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ displayName: term }, { email: term }, { phone: term }];
  }
  const [items, total] = await Promise.all([
    CustomerModel.find(filter)
      .select(
        'displayName email phone assignedEmployeeIds primaryEmployeeId status createdAt updatedAt',
      )
      .populate('assignedEmployeeIds', 'displayName status')
      .populate('primaryEmployeeId', 'displayName status')
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    CustomerModel.countDocuments(filter),
  ]);
  return pageResult(items, total, query.page, query.limit);
}

export async function getCustomer(customerId: string, auth: AuthContext) {
  const customer = await findAccessibleCustomer(customerId, auth);
  const financialSummary = await getFinancialSummary(customer._id.toString());
  return { customer, financialSummary };
}

export async function getOwnCustomer(auth: AuthContext) {
  if (auth.role !== 'CUSTOMER' || !auth.customerId) throw forbidden();
  return getCustomer(auth.customerId, auth);
}

export async function createCustomer(input: CustomerCreateInput, auth: AuthContext) {
  if (auth.role === 'CUSTOMER') throw forbidden();
  requireEmployeePermission(auth, 'customers:create');
  if (await CustomerModel.exists({ email: input.email.trim().toLowerCase() }))
    throw new AuthError(
      409,
      'CUSTOMER_EXISTS',
      'A customer profile already uses this email address.',
    );

  let assignedEmployeeIds = input.assignedEmployeeIds ?? [];
  let primaryEmployeeId = input.primaryEmployeeId;
  if (auth.role === 'EMPLOYEE') {
    if (!auth.employeeId) throw forbidden();
    assignedEmployeeIds = [auth.employeeId];
    primaryEmployeeId = auth.employeeId;
  } else if (assignedEmployeeIds.length || primaryEmployeeId) {
    const validated = await validateAssignments(assignedEmployeeIds, primaryEmployeeId);
    assignedEmployeeIds = validated.employeeIds;
    primaryEmployeeId = validated.primaryEmployeeId;
  }

  const invitation = await createInvitation(
    {
      ...input,
      role: 'CUSTOMER',
      assignedEmployeeIds,
      primaryEmployeeId,
    },
    auth.userId,
  );
  await AuditLogModel.create({
    actorUserId: auth.userId,
    action: 'CUSTOMER_CREATED',
    entityType: 'Customer',
    entityId: invitation.profileId,
  });
  return invitation;
}

export async function updateCustomer(
  customerId: string,
  input: CustomerUpdateInput,
  auth: AuthContext,
) {
  if (auth.role === 'CUSTOMER') throw forbidden();
  if (auth.role === 'EMPLOYEE') {
    requireEmployeePermission(auth, 'customers:update');
    if ('assignedEmployeeIds' in input || 'primaryEmployeeId' in input) throw forbidden();
  }
  const current = await findAccessibleCustomer(customerId, auth);
  const update: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  if (input.displayName !== undefined) update.displayName = input.displayName;
  if (input.phone !== undefined) {
    if (input.phone === null) unset.phone = '';
    else update.phone = input.phone;
  }
  if (auth.role === 'ADMIN' && input.assignedEmployeeIds !== undefined) {
    const primary =
      input.primaryEmployeeId === undefined
        ? current.primaryEmployeeId
          ? refString(current.primaryEmployeeId)
          : undefined
        : input.primaryEmployeeId;
    const validated = await validateAssignments(input.assignedEmployeeIds, primary);
    update.assignedEmployeeIds = validated.employeeIds;
    if (validated.primaryEmployeeId) update.primaryEmployeeId = validated.primaryEmployeeId;
    else unset.primaryEmployeeId = '';
  } else if (auth.role === 'ADMIN' && input.primaryEmployeeId !== undefined) {
    const assignments = current.assignedEmployeeIds.map(refString);
    const validated = await validateAssignments(assignments, input.primaryEmployeeId);
    if (validated.primaryEmployeeId) update.primaryEmployeeId = validated.primaryEmployeeId;
    else unset.primaryEmployeeId = '';
  }
  const change: Record<string, unknown> = {};
  if (Object.keys(update).length) change.$set = update;
  if (Object.keys(unset).length) change.$unset = unset;
  const customer = await CustomerModel.findByIdAndUpdate(customerId, change, {
    returnDocument: 'after',
    runValidators: true,
  })
    .populate('assignedEmployeeIds', 'displayName status')
    .populate('primaryEmployeeId', 'displayName status')
    .lean();
  if (!customer) throw notFound();
  await AuditLogModel.create({
    actorUserId: auth.userId,
    action: 'CUSTOMER_UPDATED',
    entityType: 'Customer',
    entityId: customer._id,
    metadata: { fields: Object.keys(update) },
  });
  return customer;
}

export async function updateOwnCustomer(input: CustomerUpdateInput, auth: AuthContext) {
  if (auth.role !== 'CUSTOMER' || !auth.customerId) throw forbidden();
  if ('assignedEmployeeIds' in input || 'primaryEmployeeId' in input) throw forbidden();
  const update: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  if (input.displayName !== undefined) update.displayName = input.displayName;
  if (input.phone !== undefined) {
    if (input.phone === null) unset.phone = '';
    else update.phone = input.phone;
  }
  const change: Record<string, unknown> = {};
  if (Object.keys(update).length) change.$set = update;
  if (Object.keys(unset).length) change.$unset = unset;
  const customer = await CustomerModel.findOneAndUpdate(
    { _id: auth.customerId, userId: auth.userId, status: 'ACTIVE' },
    change,
    { returnDocument: 'after', runValidators: true },
  )
    .select('displayName email phone status')
    .lean();
  if (!customer) throw notFound();
  await AuditLogModel.create({
    actorUserId: auth.userId,
    action: 'CUSTOMER_SELF_UPDATED',
    entityType: 'Customer',
    entityId: customer._id,
    metadata: { fields: Object.keys(update) },
  });
  return customer;
}

export async function archiveCustomer(customerId: string, auth: AuthContext) {
  if (auth.role !== 'ADMIN') throw forbidden();
  const customer = await CustomerModel.findById(customerId);
  if (!customer) throw notFound();
  if (customer.status === 'INACTIVE') return customer;
  customer.status = 'INACTIVE';
  await customer.save();
  if (customer.userId) {
    await UserModel.updateOne({ _id: customer.userId }, { $set: { status: 'SUSPENDED' } });
    await AuthSessionModel.updateMany(
      { userId: customer.userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
  await AuditLogModel.create({
    actorUserId: auth.userId,
    action: 'CUSTOMER_ARCHIVED',
    entityType: 'Customer',
    entityId: customer._id,
  });
  return customer;
}

export async function requestCustomerEmailChange(
  customerId: string,
  email: string,
  auth: AuthContext,
) {
  const customer = await findAccessibleCustomer(customerId, auth);
  if (auth.role === 'EMPLOYEE') requireEmployeePermission(auth, 'customers:update');
  if (!customer.userId)
    throw new AuthError(409, 'NO_CUSTOMER_LOGIN', 'This customer has no login account.');
  return requestEmailChange(customer.userId.toString(), email, auth.userId);
}

export async function requestOwnEmailChange(email: string, auth: AuthContext) {
  if (auth.role !== 'CUSTOMER' || !auth.customerId) throw forbidden();
  const customer = await CustomerModel.findOne({
    _id: auth.customerId,
    userId: auth.userId,
    status: 'ACTIVE',
  });
  if (!customer) throw notFound();
  return requestEmailChange(auth.userId, email, auth.userId);
}

export async function listCustomerRecords(
  customerId: string,
  kind: 'subscriptions' | 'invoices' | 'payments',
  query: { page: number; limit: number },
  auth: AuthContext,
) {
  await findAccessibleCustomer(customerId, auth);
  const filter = { customerId };
  let loadItems: () => Promise<unknown[]>;
  let loadCount: () => Promise<number>;
  if (kind === 'subscriptions') {
    loadItems = () =>
      SubscriptionModel.find(filter)
        .select('planId status startsAt endsAt gracePeriodDays createdAt updatedAt')
        .populate('planId', 'name pricePaise currency')
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean();
    loadCount = () => SubscriptionModel.countDocuments(filter);
  } else if (kind === 'invoices') {
    loadItems = () =>
      InvoiceModel.find(filter)
        .select(
          'invoiceNumber issuedAt dueAt lines totalPaise currency status taxConfigurationStatus createdAt updatedAt',
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean();
    loadCount = () => InvoiceModel.countDocuments(filter);
  } else {
    loadItems = () =>
      PaymentModel.find(filter)
        .select('amountPaise currency method status receivedAt createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean();
    loadCount = () => PaymentModel.countDocuments(filter);
  }
  const [items, total] = await Promise.all([loadItems(), loadCount()]);
  return pageResult(items, total, query.page, query.limit);
}
