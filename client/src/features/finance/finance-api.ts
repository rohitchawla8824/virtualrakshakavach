import { authenticatedApiRequest } from '@/features/auth/auth-api';
export type Invoice = {
  id: string;
  invoiceNumber: string;
  customerId: string;
  lines: Array<{
    nameSnapshot: string;
    quantity: number;
    unitPricePaise: number;
    lineTotalPaise: number;
  }>;
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  status: string;
  issuedAt: string;
  dueAt: string;
};
export type Payment = {
  id: string;
  customerId: string;
  amountPaise: number;
  method: string;
  status: string;
  reference?: string;
  createdAt: string;
};
export const fetchInvoices = () =>
  authenticatedApiRequest<{
    items: Invoice[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>('/invoices?limit=100');
export const fetchPayments = () =>
  authenticatedApiRequest<{ items: Payment[] }>('/payments?limit=100');
export const fetchPaymentDetails = (id: string) =>
  authenticatedApiRequest<{
    allocations: Array<{ invoiceId: { id: string; invoiceNumber: string }; amountPaise: number }>;
  }>(`/payments/${id}`);
export const fetchTaxConfigurations = () =>
  authenticatedApiRequest<{
    items: Array<{ id: string; name: string; rateBps: number; mode: 'EXCLUSIVE' | 'INCLUSIVE' }>;
  }>('/tax-configurations');
export const createTaxConfiguration = (data: unknown) =>
  authenticatedApiRequest('/tax-configurations', { method: 'POST', body: JSON.stringify(data) });
export const createInvoice = (data: unknown) =>
  authenticatedApiRequest<{ invoice: Invoice }>('/invoices', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const recordPayment = (data: unknown) =>
  authenticatedApiRequest<{ payment: Payment }>('/payments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const createRefund = (data: unknown) =>
  authenticatedApiRequest<{ refund: { id: string } }>('/refunds', {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const fetchRefunds = () =>
  authenticatedApiRequest<{
    items: Array<{
      id: string;
      paymentId: string;
      invoiceId?: string;
      amountPaise: number;
      status: string;
      reason: string;
    }>;
  }>('/refunds');
export const decideRefund = (refundId: string, approve: boolean) =>
  authenticatedApiRequest<{ refund: { id: string } }>(`/refunds/${refundId}/decision`, {
    method: 'PATCH',
    body: JSON.stringify({ approve }),
  });
export const createOnlineOrder = (invoiceId: string, idempotencyKey: string) =>
  authenticatedApiRequest<{
    orderId: string;
    keyId: string;
    amountPaise: number;
    currency: 'INR';
    invoiceNumber: string;
    customerName?: string;
    customerEmail?: string;
  }>('/payments/razorpay/orders', {
    method: 'POST',
    body: JSON.stringify({ invoiceId, idempotencyKey }),
  });
export const verifyOnlinePayment = (data: {
  orderId: string;
  paymentId: string;
  signature: string;
}) =>
  authenticatedApiRequest<{ paymentId: string; alreadyPaid: boolean }>(
    '/payments/razorpay/verify',
    { method: 'POST', body: JSON.stringify(data) },
  );
export const cancelOnlineOrder = (orderId: string) =>
  authenticatedApiRequest(`/payments/razorpay/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
export const fetchNotifications = () =>
  authenticatedApiRequest<{
    items: Array<{ id: string; type: string; message?: string; createdAt: string }>;
  }>('/notifications');
export const fetchLedger = (customerId: string) =>
  authenticatedApiRequest<{ summary: Record<string, number | string>; invoices: Invoice[] }>(
    `/ledger/${customerId}`,
  );
