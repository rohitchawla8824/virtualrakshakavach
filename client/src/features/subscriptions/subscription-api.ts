import { authenticatedApiRequest } from '@/features/auth/auth-api';

export type Plan = {
  id: string;
  name: string;
  description?: string;
  duration: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | 'CUSTOM';
  customDurationDays?: number;
  pricePaise: number;
  status: 'ACTIVE' | 'ARCHIVED';
};
export type Subscription = {
  id: string;
  customerId: string;
  planId: Plan | string;
  invoiceId?: { invoiceNumber: string; totalPaise: number; status: string } | string;
  startsAt: string;
  endsAt: string;
  status: 'UPCOMING' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  periodNumber: number;
};
export type Page<T> = {
  items: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
};
export const fetchPlans = () => authenticatedApiRequest<Page<Plan>>('/subscriptions/plans');
export const createPlan = (input: Partial<Plan>) =>
  authenticatedApiRequest('/subscriptions/plans', { method: 'POST', body: JSON.stringify(input) });
export const fetchSubscriptions = (status = '') =>
  authenticatedApiRequest<Page<Subscription>>(
    `/subscriptions?limit=100${status ? `&status=${status}` : ''}`,
  );
export const assignSubscription = (input: {
  customerId: string;
  planId: string;
  startsAt: string;
}) =>
  authenticatedApiRequest('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      startsAt: new Date(`${input.startsAt}T12:00:00+05:30`).toISOString(),
    }),
  });
export const renewSubscription = (id: string) =>
  authenticatedApiRequest(`/subscriptions/${id}/renew`, {
    method: 'POST',
    body: JSON.stringify({ renewalKey: crypto.randomUUID() }),
  });
export const cancelSubscription = (id: string) =>
  authenticatedApiRequest(`/subscriptions/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
export const fetchSubscriptionHistory = (id: string) =>
  authenticatedApiRequest<Page<Record<string, unknown>>>(`/subscriptions/${id}/history`);
