import { authenticatedApiRequest } from '@/features/auth/auth-api';

export type EmployeeOption = { id: string; displayName: string; status: string };
export type CustomerRecord = {
  id: string;
  displayName: string;
  email?: string;
  phone?: string;
  status: 'ACTIVE' | 'INACTIVE';
  assignedEmployeeIds?: (EmployeeOption | string)[];
  primaryEmployeeId?: EmployeeOption | string | null;
  createdAt?: string;
};
export type CustomerPage = {
  items: CustomerRecord[];
  pagination: { page: number; limit: number; total: number; pages: number };
};
export type CustomerDetail = {
  customer: CustomerRecord;
  financialSummary: {
    invoiceCount: number;
    paymentCount: number;
    invoicedPaise: number;
    receivedPaise: number;
    allocatedPaise: number;
    outstandingPaise: number;
    advancePaise: number;
    currency: 'INR';
  };
};

export async function fetchCustomers(params: {
  q: string;
  status: string;
  page: number;
  limit: number;
}): Promise<CustomerPage> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status !== 'ALL') query.set('status', params.status);
  query.set('page', String(params.page));
  query.set('limit', String(params.limit));
  return authenticatedApiRequest<CustomerPage>(`/customers?${query.toString()}`);
}

export function fetchCustomer(customerId: string): Promise<CustomerDetail> {
  return authenticatedApiRequest<CustomerDetail>(`/customers/${customerId}`);
}

export function fetchOwnCustomer(): Promise<CustomerDetail> {
  return authenticatedApiRequest<CustomerDetail>('/customers/me');
}

export type EmployeeProfile = {
  _id: string;
  displayName: string;
  phone?: string;
  permissions: string[];
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
};
export const fetchOwnEmployeeProfile = () =>
  authenticatedApiRequest<{ profile: EmployeeProfile }>('/employees/me');
export const updateOwnEmployeeProfile = (input: { displayName?: string; phone?: string | null }) =>
  authenticatedApiRequest<{ profile: EmployeeProfile }>('/employees/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export function fetchCustomerRecords(
  customerId: string | undefined,
  kind: 'subscriptions' | 'invoices' | 'payments',
  page = 1,
  limit = 10,
) {
  const path = customerId ? `/customers/${customerId}/${kind}` : `/customers/me/${kind}`;
  return authenticatedApiRequest<{
    items: Record<string, unknown>[];
    pagination: { page: number; limit: number; total: number; pages: number };
  }>(`${path}?page=${page}&limit=${limit}`);
}

export function fetchAssignableEmployees() {
  return authenticatedApiRequest<{ items: EmployeeOption[] }>('/employees/assignable?limit=100');
}

export function createCustomer(input: {
  displayName: string;
  email: string;
  phone?: string;
  assignedEmployeeIds?: string[];
  primaryEmployeeId?: string;
}) {
  return authenticatedApiRequest<{
    customerId: string;
    invitation: { email: string; expiresAt: string };
  }>('/customers', { method: 'POST', body: JSON.stringify(input) });
}

export function updateCustomer(
  customerId: string,
  input: {
    displayName?: string;
    phone?: string | null;
    assignedEmployeeIds?: string[];
    primaryEmployeeId?: string | null;
  },
) {
  return authenticatedApiRequest<{ customer: CustomerRecord }>(`/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function updateOwnCustomer(input: { displayName?: string; phone?: string | null }) {
  return authenticatedApiRequest<{ customer: CustomerRecord }>('/customers/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function archiveCustomer(customerId: string) {
  return authenticatedApiRequest<{ customer: CustomerRecord }>(`/customers/${customerId}`, {
    method: 'DELETE',
  });
}

export function requestCustomerEmailChange(customerId: string, email: string) {
  return authenticatedApiRequest<{ result: string; message: string }>(
    `/customers/${customerId}/email-change`,
    { method: 'POST', body: JSON.stringify({ email }) },
  );
}

export function requestOwnEmailChange(email: string) {
  return authenticatedApiRequest<{ result: string; message: string }>(
    '/customers/me/email-change',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
  );
}
