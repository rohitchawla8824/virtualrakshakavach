import { Types } from 'mongoose';
import { AuthError } from '../auth/auth.errors.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CustomerModel, EmployeeModel } from '../identity/identity.model.js';
import { NotificationModel } from '../operations/operations.model.js';
import { SubscriptionModel } from '../subscriptions/subscription.model.js';
import { InvoiceModel, PaymentModel, RefundModel } from '../finance/finance.model.js';
import { calculateOutstandingPaise, sumPaise } from './report-calculations.js';

export type ReportId =
  | 'collections'
  | 'outstanding'
  | 'overdue-invoices'
  | 'product-sales'
  | 'subscriptions'
  | 'employee-performance'
  | 'refunds'
  | 'notification-delivery';
export type ReportQuery = {
  from?: string;
  to?: string;
  period: 'daily' | 'weekly' | 'monthly';
  status?: 'ACTIVE' | 'EXPIRED' | 'UPCOMING';
  page: number;
  limit: number;
};

const denied = () =>
  new AuthError(403, 'FORBIDDEN', 'You do not have permission to view this report.');
const isoDayMs = 86_400_000;
function dateRange(query: ReportQuery, now = new Date()) {
  const todayInIndia = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const to = query.to ?? todayInIndia;
  const from =
    query.from ??
    new Date(new Date(`${to}T00:00:00+05:30`).getTime() - 29 * isoDayMs).toISOString().slice(0, 10);
  const start = new Date(`${from}T00:00:00+05:30`);
  const endExclusive = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + isoDayMs);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(endExclusive.getTime()) ||
    start >= endExclusive ||
    endExclusive.getTime() - start.getTime() > 3660 * isoDayMs
  )
    throw new AuthError(
      400,
      'INVALID_REPORT_RANGE',
      'Choose a valid report range of at most 10 years.',
    );
  return { start, endExclusive, from, to };
}
function paging<T>(items: T[], total: number, query: ReportQuery) {
  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}
function decimal(field: string) {
  return { $toDecimal: field };
}
function collectionCustomerIds(auth: AuthContext) {
  if (auth.role !== 'EMPLOYEE') return undefined;
  return CustomerModel.find({ assignedEmployeeIds: auth.employeeId, status: 'ACTIVE' }).distinct(
    '_id',
  );
}
function requireFinanceReport(auth: AuthContext) {
  if (
    auth.role === 'CUSTOMER' ||
    (auth.role === 'EMPLOYEE' && !auth.permissions.includes('finance:read'))
  )
    throw denied();
}

async function invoiceOutstandingPipeline(match: Record<string, unknown>) {
  return [
    { $match: match },
    {
      $lookup: {
        from: 'paymentallocations',
        let: { invoiceId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$invoiceId', '$$invoiceId'] } } },
          {
            $lookup: {
              from: 'payments',
              localField: 'paymentId',
              foreignField: '_id',
              as: 'payment',
            },
          },
          { $unwind: '$payment' },
          { $match: { 'payment.status': 'SUCCEEDED' } },
          { $group: { _id: null, value: { $sum: { $toDecimal: '$amountPaise' } } } },
        ],
        as: 'allocationTotals',
      },
    },
    {
      $lookup: {
        from: 'refunds',
        let: { invoiceId: '$_id' },
        pipeline: [
          {
            $match: {
              status: 'PROCESSED',
              $expr: { $eq: ['$invoiceId', '$$invoiceId'] },
            },
          },
          { $group: { _id: null, value: { $sum: { $toDecimal: '$amountPaise' } } } },
        ],
        as: 'refundTotals',
      },
    },
    {
      $addFields: {
        allocatedPaise: { $ifNull: [{ $first: '$allocationTotals.value' }, { $toDecimal: '0' }] },
        refundedPaise: { $ifNull: [{ $first: '$refundTotals.value' }, { $toDecimal: '0' }] },
      },
    },
    {
      $addFields: {
        outstandingPaise: {
          $max: [
            { $toDecimal: '0' },
            {
              $subtract: [
                { $toDecimal: '$totalPaise' },
                { $subtract: ['$allocatedPaise', '$refundedPaise'] },
              ],
            },
          ],
        },
      },
    },
    { $match: { $expr: { $gt: ['$outstandingPaise', { $toDecimal: '0' }] } } },
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer',
      },
    },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
  ];
}

async function collectionReport(auth: AuthContext, query: ReportQuery) {
  const { start, endExclusive } = dateRange(query);
  const customerIds = await collectionCustomerIds(auth);
  const match: Record<string, unknown> = {
    status: 'SUCCEEDED',
    $expr: {
      $and: [
        { $gte: [{ $ifNull: ['$receivedAt', '$createdAt'] }, start] },
        { $lt: [{ $ifNull: ['$receivedAt', '$createdAt'] }, endExclusive] },
      ],
    },
  };
  if (customerIds) match.customerId = { $in: customerIds };
  if (auth.role === 'EMPLOYEE') match.createdByUserId = new Types.ObjectId(auth.userId);
  const unit = query.period === 'monthly' ? 'month' : query.period === 'weekly' ? 'week' : 'day';
  const [items, total] = await Promise.all([
    PaymentModel.aggregate([
      { $match: match },
      {
        $addFields: {
          reportDate: {
            $dateTrunc: {
              date: { $ifNull: ['$receivedAt', '$createdAt'] },
              unit,
              ...(unit === 'week' ? { startOfWeek: 'monday' } : {}),
              timezone: 'Asia/Kolkata',
            },
          },
          amountDecimal: decimal('$amountPaise'),
        },
      },
      {
        $group: {
          _id: '$reportDate',
          amountPaise: { $sum: '$amountDecimal' },
          paymentCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: { $dateToString: { date: '$_id', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
          amountPaise: { $toString: '$amountPaise' },
          paymentCount: 1,
        },
      },
    ]),
    PaymentModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          amountPaise: { $sum: { $toDecimal: '$amountPaise' } },
          paymentCount: { $sum: 1 },
        },
      },
    ]),
  ]);
  return {
    items,
    summary: {
      amountPaise: String(total[0]?.amountPaise ?? '0'),
      paymentCount: total[0]?.paymentCount ?? 0,
      currency: 'INR',
    },
  };
}

async function outstandingReport(auth: AuthContext, query: ReportQuery, overdueOnly = false) {
  const customerIds = await collectionCustomerIds(auth);
  const match: Record<string, unknown> = { status: { $nin: ['DRAFT', 'VOID'] } };
  if (customerIds) match.customerId = { $in: customerIds };
  if (overdueOnly) {
    const range = dateRange(query);
    const end = range.endExclusive < new Date() ? range.endExclusive : new Date();
    match.dueAt = { $gte: range.start, $lt: end };
  }
  const base = await invoiceOutstandingPipeline(match);
  if (overdueOnly) {
    base.push({ $match: { dueAt: { $lt: new Date() } } });
  }
  const [summaryRows, itemRows, totalRows] = await Promise.all([
    InvoiceModel.aggregate([
      ...base,
      {
        $group: { _id: null, totalPaise: { $sum: '$outstandingPaise' }, invoiceCount: { $sum: 1 } },
      },
    ]),
    InvoiceModel.aggregate([
      ...base,
      { $sort: overdueOnly ? { dueAt: 1, _id: 1 } : { issuedAt: -1, _id: 1 } },
      { $skip: (query.page - 1) * query.limit },
      { $limit: query.limit },
      {
        $project: {
          invoiceId: { $toString: '$_id' },
          invoiceNumber: 1,
          customerId: { $toString: '$customerId' },
          customerName: '$customer.displayName',
          issuedAt: 1,
          dueAt: 1,
          status: 1,
          totalPaise: { $toString: { $toDecimal: '$totalPaise' } },
          allocatedPaise: { $toString: '$allocatedPaise' },
          refundedPaise: { $toString: '$refundedPaise' },
          outstandingPaise: { $toString: '$outstandingPaise' },
        },
      },
    ]),
    InvoiceModel.aggregate([...base, { $count: 'total' }]),
  ]);
  const items = itemRows.map((row) => ({
    ...row,
    outstandingPaise: calculateOutstandingPaise(
      String(row.totalPaise),
      String(row.allocatedPaise),
      String(row.refundedPaise),
    ),
  }));
  return {
    ...paging(items, totalRows[0]?.total ?? 0, query),
    summary: {
      totalPaise: String(summaryRows[0]?.totalPaise ?? '0'),
      invoiceCount: summaryRows[0]?.invoiceCount ?? 0,
      currency: 'INR',
    },
  };
}

async function productSales(auth: AuthContext, query: ReportQuery) {
  const { start, endExclusive } = dateRange(query);
  const customerIds = await collectionCustomerIds(auth);
  const match: Record<string, unknown> = {
    status: { $nin: ['DRAFT', 'VOID'] },
    issuedAt: { $gte: start, $lt: endExclusive },
  };
  if (customerIds) match.customerId = { $in: customerIds };
  const [items, countRows, summary] = await Promise.all([
    InvoiceModel.aggregate([
      { $match: match },
      { $unwind: '$lines' },
      {
        $group: {
          _id: '$lines.nameSnapshot',
          quantity: { $sum: '$lines.quantity' },
          salesPaise: { $sum: { $toDecimal: '$lines.lineTotalPaise' } },
        },
      },
      { $sort: { salesPaise: -1, _id: 1 } },
      { $skip: (query.page - 1) * query.limit },
      { $limit: query.limit },
      {
        $project: {
          _id: 0,
          product: '$_id',
          quantity: 1,
          salesPaise: { $toString: '$salesPaise' },
        },
      },
    ]),
    InvoiceModel.aggregate([
      { $match: match },
      { $unwind: '$lines' },
      { $group: { _id: '$lines.nameSnapshot' } },
      { $count: 'total' },
    ]),
    InvoiceModel.aggregate([
      { $match: match },
      { $unwind: '$lines' },
      {
        $group: {
          _id: null,
          salesPaise: { $sum: { $toDecimal: '$lines.lineTotalPaise' } },
          quantity: { $sum: '$lines.quantity' },
        },
      },
    ]),
  ]);
  return {
    ...paging(items, countRows[0]?.total ?? 0, query),
    summary: {
      salesPaise: String(summary[0]?.salesPaise ?? '0'),
      quantity: summary[0]?.quantity ?? 0,
      currency: 'INR',
    },
    note: 'Sales are from immutable invoice line-item snapshots and exclude invoice-level discounts and taxes.',
  };
}

async function subscriptionsReport(auth: AuthContext, query: ReportQuery) {
  const { start, endExclusive } = dateRange(query);
  const customerIds = await collectionCustomerIds(auth);
  const status = query.status ?? 'ACTIVE';
  const filter: Record<string, unknown> = {
    status: status === 'UPCOMING' ? { $in: ['ACTIVE', 'UPCOMING'] } : status,
    endsAt: { $gte: start, $lt: endExclusive },
  };
  if (customerIds) filter.customerId = { $in: customerIds };
  const [items, total] = await Promise.all([
    SubscriptionModel.find(filter)
      .populate('customerId', 'displayName')
      .populate('planId', 'name duration')
      .sort({ endsAt: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    SubscriptionModel.countDocuments(filter),
  ]);
  return paging(items, total, query);
}

async function employeePerformance(auth: AuthContext, query: ReportQuery) {
  if (auth.role !== 'ADMIN') throw denied();
  const { start, endExclusive } = dateRange(query);
  const employees = await EmployeeModel.find({ status: 'ACTIVE' })
    .select('_id userId displayName')
    .lean();
  const userIds = employees.map((employee) => employee.userId);
  const rows = await PaymentModel.aggregate([
    {
      $match: {
        status: 'SUCCEEDED',
        createdByUserId: { $in: userIds },
        $expr: {
          $and: [
            { $gte: [{ $ifNull: ['$receivedAt', '$createdAt'] }, start] },
            { $lt: [{ $ifNull: ['$receivedAt', '$createdAt'] }, endExclusive] },
          ],
        },
      },
    },
    {
      $group: {
        _id: '$createdByUserId',
        amountPaise: { $sum: { $toDecimal: '$amountPaise' } },
        paymentCount: { $sum: 1 },
      },
    },
  ]);
  const byUser = new Map(rows.map((row) => [String(row._id), row]));
  const all = employees
    .map((employee) => {
      const row = byUser.get(String(employee.userId));
      return {
        employeeId: String(employee._id),
        employee: employee.displayName,
        amountPaise: String(row?.amountPaise ?? '0'),
        paymentCount: row?.paymentCount ?? 0,
      };
    })
    .sort((a, b) =>
      BigInt(b.amountPaise) > BigInt(a.amountPaise)
        ? 1
        : BigInt(b.amountPaise) < BigInt(a.amountPaise)
          ? -1
          : a.employee.localeCompare(b.employee),
    );
  const totalPaise = sumPaise(all.map((row) => row.amountPaise));
  return {
    ...paging(
      all.slice((query.page - 1) * query.limit, query.page * query.limit),
      all.length,
      query,
    ),
    summary: {
      totalPaise,
      paymentCount: all.reduce((sum, row) => sum + row.paymentCount, 0),
      currency: 'INR',
    },
  };
}

async function refundsReport(auth: AuthContext, query: ReportQuery) {
  const { start, endExclusive } = dateRange(query);
  const customerIds = await collectionCustomerIds(auth);
  if (customerIds) {
    const payments = await PaymentModel.find({ customerId: { $in: customerIds } }).distinct('_id');
    const filter = { paymentId: { $in: payments }, createdAt: { $gte: start, $lt: endExclusive } };
    const [items, total, summary] = await Promise.all([
      RefundModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      RefundModel.countDocuments(filter),
      RefundModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            amountPaise: { $sum: { $toDecimal: '$amountPaise' } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);
    return {
      ...paging(items, total, query),
      summary: summary.map((row) => ({
        status: row._id,
        amountPaise: String(row.amountPaise),
        count: row.count,
      })),
    };
  }
  const filter = { createdAt: { $gte: start, $lt: endExclusive } };
  const [items, total, summary] = await Promise.all([
    RefundModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    RefundModel.countDocuments(filter),
    RefundModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          amountPaise: { $sum: { $toDecimal: '$amountPaise' } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);
  return {
    ...paging(items, total, query),
    summary: summary.map((row) => ({
      status: row._id,
      amountPaise: String(row.amountPaise),
      count: row.count,
    })),
  };
}

async function notificationDeliveryReport(auth: AuthContext, query: ReportQuery) {
  if (auth.role !== 'ADMIN') throw denied();
  const { start, endExclusive } = dateRange(query);
  const filter = { createdAt: { $gte: start, $lt: endExclusive } };
  const [items, total, summary] = await Promise.all([
    NotificationModel.find(filter)
      .select('-message -deduplicationKey')
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    NotificationModel.countDocuments(filter),
    NotificationModel.aggregate([
      { $match: filter },
      { $group: { _id: { channel: '$channel', status: '$status' }, count: { $sum: 1 } } },
    ]),
  ]);
  return {
    ...paging(items, total, query),
    summary: summary.map((row) => ({
      channel: row._id.channel,
      status: row._id.status,
      count: row.count,
    })),
  };
}

export async function getReport(report: ReportId, query: ReportQuery, auth: AuthContext) {
  if (report === 'notification-delivery') return notificationDeliveryReport(auth, query);
  if (report === 'employee-performance') return employeePerformance(auth, query);
  requireFinanceReport(auth);
  if (report === 'collections') return collectionReport(auth, query);
  if (report === 'outstanding') return outstandingReport(auth, query);
  if (report === 'overdue-invoices') return outstandingReport(auth, query, true);
  if (report === 'product-sales') return productSales(auth, query);
  if (report === 'subscriptions') return subscriptionsReport(auth, query);
  return refundsReport(auth, query);
}
