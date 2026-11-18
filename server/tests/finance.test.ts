import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { InvoiceModel, PaymentModel } from '../src/modules/finance/finance.model.js';
import {
  allocateFifo,
  canReserveAllocationRefund,
  calculateInvoiceTotals,
  calculateOutstanding,
  planPaymentAllocation,
} from '../src/modules/finance/finance.calculations.js';
import { paymentFingerprint } from '../src/modules/finance/finance.service.js';
import { listInvoices, recordPayment } from '../src/modules/finance/finance.service.js';
import type { AuthContext } from '../src/modules/auth/auth.types.js';
import { textPdf } from '../src/modules/finance/finance.pdf.js';
import {
  recordPaymentSchema,
  createInvoiceSchema,
} from '../src/modules/finance/finance.schemas.js';

const open = [{ invoiceId: 'a', outstandingPaise: 10_000 }];
const employeeWithoutFinance: AuthContext = {
  userId: '665f00000000000000000010',
  employeeId: '665f00000000000000000011',
  sessionId: 'finance-portal-test',
  role: 'EMPLOYEE',
  permissions: [],
};
describe('financial calculations and safeguards', () => {
  it('allocates a full invoice payment exactly', () =>
    expect(planPaymentAllocation('SUCCEEDED', 10_000, open)).toEqual({
      allocations: [{ invoiceId: 'a', amountPaise: 10_000 }],
      advancePaise: 0,
    }));
  it('supports partial payment without rounding', () =>
    expect(planPaymentAllocation('SUCCEEDED', 3_333, open)).toEqual({
      allocations: [{ invoiceId: 'a', amountPaise: 3_333 }],
      advancePaise: 0,
    }));
  it('applies multiple payments to the remaining balance', () => {
    const first = planPaymentAllocation('SUCCEEDED', 4_000, open).allocations[0].amountPaise;
    const next = planPaymentAllocation('SUCCEEDED', 6_000, [
      { invoiceId: 'a', outstandingPaise: calculateOutstanding(10_000, [first]) },
    ]);
    expect(next.allocations[0].amountPaise).toBe(6_000);
    expect(calculateOutstanding(10_000, [first, next.allocations[0].amountPaise])).toBe(0);
  });
  it('keeps excess payment as customer advance', () =>
    expect(allocateFifo(15_000, open)).toEqual({
      allocations: [{ invoiceId: 'a', amountPaise: 10_000 }],
      advancePaise: 5_000,
    }));
  it('records failed payments without allocating money', () =>
    expect(planPaymentAllocation('FAILED', 10_000, open)).toEqual({
      allocations: [],
      advancePaise: 0,
    }));
  it('adds processed refunds back to invoice outstanding', () =>
    expect(calculateOutstanding(10_000, [10_000], [2_500])).toBe(2_500));
  it('limits a refund to the selected payment’s remaining invoice allocation', () => {
    expect(canReserveAllocationRefund(5_000, 1_500, 3_500)).toBe(true);
    expect(canReserveAllocationRefund(5_000, 1_500, 3_501)).toBe(false);
    expect(canReserveAllocationRefund(5_000, 0, 5_001)).toBe(false);
  });
  it('rejects over-allocation and invalid duplicate invoice allocations', () => {
    expect(() =>
      planPaymentAllocation('SUCCEEDED', 9_000, open, [{ invoiceId: 'a', amountPaise: 10_000 }]),
    ).toThrow();
    expect(() =>
      planPaymentAllocation('SUCCEEDED', 10_000, open, [
        { invoiceId: 'a', amountPaise: 1 },
        { invoiceId: 'a', amountPaise: 1 },
      ]),
    ).toThrow();
  });
  it('calculates exclusive and inclusive configured tax with integer paise', () => {
    expect(calculateInvoiceTotals(10_000, 500, 1_800, 'EXCLUSIVE')).toEqual({
      subtotalPaise: 10_000,
      discountPaise: 500,
      taxPaise: 1_710,
      totalPaise: 11_210,
    });
    expect(calculateInvoiceTotals(10_000, 0, 1_800, 'INCLUSIVE')).toEqual({
      subtotalPaise: 10_000,
      discountPaise: 0,
      taxPaise: 1_525,
      totalPaise: 10_000,
    });
  });
  it('rejects discounts beyond subtotal and non-integer prices', () => {
    expect(() => calculateInvoiceTotals(100, 101)).toThrow();
    expect(() => calculateInvoiceTotals(12.5, 0)).toThrow();
  });
  it('requires idempotency keys and server product references for invoices', () => {
    expect(
      recordPaymentSchema.safeParse({
        customerId: '665f00000000000000000001',
        amountPaise: 1,
        method: 'UPI',
        idempotencyKey: 'unique-key-123',
      }).success,
    ).toBe(true);
    expect(
      recordPaymentSchema.safeParse({
        customerId: '665f00000000000000000001',
        amountPaise: 1.5,
        method: 'CASH',
        idempotencyKey: 'unique-key-123',
      }).success,
    ).toBe(false);
    expect(
      createInvoiceSchema.safeParse({
        customerId: '665f00000000000000000001',
        dueAt: '2025-01-01T00:00:00Z',
        lines: [{ productId: '665f00000000000000000002', quantity: 1 }],
        discountPaise: 0,
        unitPricePaise: 1,
      }).success,
    ).toBe(false);
  });
  it('fingerprints retries consistently and detects changed duplicate request data', () => {
    const input = {
      customerId: 'c',
      amountPaise: 100,
      method: 'CASH',
      idempotencyKey: 'abc-key-123',
    };
    expect(paymentFingerprint(input)).toBe(paymentFingerprint(input));
    expect(paymentFingerprint(input)).not.toBe(paymentFingerprint({ ...input, amountPaise: 101 }));
    const keys = PaymentModel.schema.indexes().find(([fields]) => 'idempotencyKey' in fields);
    expect(keys?.[1].unique).toBe(true);
  });
  it('escapes PDF text and paginates long invoice and receipt documents', () => {
    const pdf = textPdf([
      'Safe (description) \\ line',
      ...Array.from({ length: 49 }, (_, i) => `line ${i}`),
    ]).toString();
    expect(pdf).toContain('/Count 2');
    expect(pdf).toContain('Safe \\(description\\) \\\\ line');
  });
  it('keeps invoice line amounts as immutable snapshots and requires authentication', async () => {
    const lines = InvoiceModel.schema.path('lines') as {
      schema: { path: (key: string) => unknown };
    };
    expect(lines.schema.path('nameSnapshot')).toBeDefined();
    expect(lines.schema.path('unitPricePaise')).toBeDefined();
    const response = await request(app).get('/api/v1/invoices');
    expect(response.status).toBe(401);
  });

  it('denies employee finance history and payment recording without explicit permissions', async () => {
    const invoiceFind = vi.spyOn(InvoiceModel, 'find');
    const paymentCreate = vi.spyOn(PaymentModel, 'create');
    await expect(
      listInvoices(employeeWithoutFinance, { page: 1, limit: 20 }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    await expect(
      recordPayment(
        {
          customerId: '665f00000000000000000012',
          amountPaise: 100,
          method: 'CASH',
          status: 'SUCCEEDED',
          idempotencyKey: 'employee-portal-payment-1',
        },
        employeeWithoutFinance,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(invoiceFind).not.toHaveBeenCalled();
    expect(paymentCreate).not.toHaveBeenCalled();
    invoiceFind.mockRestore();
    paymentCreate.mockRestore();
  });
});
