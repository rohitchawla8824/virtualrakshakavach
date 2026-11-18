import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import type { AuthContext } from '../src/modules/auth/auth.types.js';
import request from 'supertest';
import { app } from '../src/app.js';
import { PaymentModel } from '../src/modules/finance/finance.model.js';
import { CustomerModel } from '../src/modules/identity/identity.model.js';
import { getReport } from '../src/modules/reports/report.service.js';
import { calculateOutstandingPaise, sumPaise } from '../src/modules/reports/report-calculations.js';

const admin: AuthContext = {
  userId: '665f00000000000000000001',
  sessionId: 'report-session',
  role: 'ADMIN',
  permissions: [],
};
const employee: AuthContext = {
  ...admin,
  role: 'EMPLOYEE',
  employeeId: '665f00000000000000000002',
  permissions: ['finance:read'],
};
const query = {
  from: '2026-03-01',
  to: '2026-03-31',
  period: 'daily' as const,
  page: 1,
  limit: 20,
};

describe('report calculations', () => {
  it('reconciles an invoice with partial allocations and a processed refund in integer paise', () => {
    expect(calculateOutstandingPaise('125000', '70000', '5000')).toBe('60000');
    expect(calculateOutstandingPaise('125000', '125000', '0')).toBe('0');
    expect(calculateOutstandingPaise('125000', '140000', '0')).toBe('0');
    expect(calculateOutstandingPaise('125000', '125000', '8000')).toBe('8000');
  });

  it('sums successful collection amounts without floating point arithmetic', () => {
    expect(sumPaise(['1099', '250001', '9900'])).toBe('261000');
  });
});

describe('database-backed reports', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requires an authenticated session for report routes', async () => {
    const response = await request(app).get('/api/v1/reports/collections?from=2026-03-01');
    expect(response.status).toBe(401);
  });

  it('rejects customer report access before aggregation', async () => {
    const aggregate = vi.spyOn(PaymentModel, 'aggregate');
    await expect(
      getReport('collections', query, {
        ...admin,
        role: 'CUSTOMER',
        customerId: '665f00000000000000000003',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('requires finance permission for employee financial reports', async () => {
    const aggregate = vi.spyOn(PaymentModel, 'aggregate');
    await expect(
      getReport('collections', query, { ...employee, permissions: [] }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('aggregates collections in Asia/Kolkata date buckets and preserves paise totals', async () => {
    const aggregate = vi.spyOn(PaymentModel, 'aggregate');
    aggregate
      .mockResolvedValueOnce([
        { date: '2026-03-01', amountPaise: '1099', paymentCount: 2 },
        { date: '2026-03-02', amountPaise: '250001', paymentCount: 1 },
      ] as never)
      .mockResolvedValueOnce([{ amountPaise: '251100', paymentCount: 3 }] as never);
    const result = await getReport('collections', query, admin);
    expect(result).toMatchObject({
      summary: { amountPaise: '251100', paymentCount: 3, currency: 'INR' },
      items: [
        { date: '2026-03-01', amountPaise: '1099', paymentCount: 2 },
        { date: '2026-03-02', amountPaise: '250001', paymentCount: 1 },
      ],
    });
    const pipeline = aggregate.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(pipeline[0]).toMatchObject({ $match: { status: 'SUCCEEDED' } });
    expect(JSON.stringify(pipeline)).toContain('Asia/Kolkata');
    expect(JSON.stringify(pipeline)).toContain('$dateTrunc');
  });

  it('scopes employee collections to assigned customers and payments recorded by that employee', async () => {
    const assignedCustomerId = new Types.ObjectId('665f00000000000000000007');
    vi.spyOn(CustomerModel, 'find').mockReturnValue({
      distinct: vi.fn().mockResolvedValue([assignedCustomerId]),
    } as never);
    const aggregate = vi.spyOn(PaymentModel, 'aggregate');
    aggregate
      .mockResolvedValueOnce([
        { date: '2026-03-01', amountPaise: '1099', paymentCount: 1 },
      ] as never)
      .mockResolvedValueOnce([{ amountPaise: '1099', paymentCount: 1 }] as never);
    await getReport('collections', query, employee);
    const match = (aggregate.mock.calls[0][0] as Array<Record<string, unknown>>)[0]
      .$match as Record<string, unknown>;
    expect(match).toMatchObject({
      status: 'SUCCEEDED',
      customerId: { $in: [assignedCustomerId] },
      createdByUserId: new Types.ObjectId(employee.userId),
    });
  });

  it('rejects reversed date ranges before querying the database', async () => {
    const aggregate = vi.spyOn(PaymentModel, 'aggregate');
    await expect(
      getReport('collections', { ...query, from: '2026-04-01', to: '2026-03-01' }, admin),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_REPORT_RANGE' });
    expect(aggregate).not.toHaveBeenCalled();
  });

  it('restricts employee performance and delivery-status reports to administrators', async () => {
    const aggregate = vi.spyOn(PaymentModel, 'aggregate');
    await expect(getReport('employee-performance', query, employee)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(getReport('notification-delivery', query, employee)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(aggregate).not.toHaveBeenCalled();
  });
});
