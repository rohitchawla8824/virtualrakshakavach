import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Panel,
  Skeleton,
} from '@/components/ui/primitives';
import { useToasts } from '@/components/ui/use-toasts';
import { getCurrentUser } from '@/features/auth/auth-api';
import { fetchCustomers } from '@/features/customers/customer-api';
import {
  assignSubscription,
  cancelSubscription,
  createPlan,
  fetchPlans,
  fetchSubscriptions,
  fetchSubscriptionHistory,
  renewSubscription,
  type Subscription,
} from './subscription-api';

const indiaDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(
    new Date(value),
  );
const inr = (paise: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
const statusTone = (status: string) =>
  status === 'ACTIVE'
    ? 'green'
    : status === 'UPCOMING'
      ? 'cyan'
      : status === 'EXPIRED'
        ? 'amber'
        : 'red';

export function SubscriptionsPage({ role }: { role: 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER' }) {
  const [status, setStatus] = useState('');
  const [showPlan, setShowPlan] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [duration, setDuration] = useState('MONTHLY');
  const [history, setHistory] = useState<Subscription | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [planId, setPlanId] = useState('');
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const queryClient = useQueryClient();
  const { show, view } = useToasts();
  const userQuery = useQuery({ queryKey: ['current-user'], queryFn: getCurrentUser });
  const plansQuery = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: fetchPlans,
    enabled: role !== 'CUSTOMER',
  });
  const listQuery = useQuery({
    queryKey: ['subscriptions', status],
    queryFn: () => fetchSubscriptions(status),
  });
  const customersQuery = useQuery({
    queryKey: ['subscription-customers'],
    queryFn: () => fetchCustomers({ q: '', status: 'ACTIVE', page: 1, limit: 100 }),
    enabled: role !== 'CUSTOMER' && showAssign,
  });
  const canManage =
    role === 'ADMIN' || (userQuery.data?.permissions ?? []).includes('subscriptions:manage');
  const canAssign =
    role === 'ADMIN' || (userQuery.data?.permissions ?? []).includes('subscriptions:assign');
  const planMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => createPlan(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
      setShowPlan(false);
      show('Plan created.', 'success');
    },
    onError: (e) => show(e instanceof Error ? e.message : 'Could not create plan.', 'error'),
  });
  const assignMutation = useMutation({
    mutationFn: () => assignSubscription({ customerId, planId, startsAt }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      setShowAssign(false);
      show('Subscription assigned and invoice created.', 'success');
    },
    onError: (e) =>
      show(e instanceof Error ? e.message : 'Could not assign subscription.', 'error'),
  });
  const cancelMutation = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      show('Subscription cancelled.', 'success');
    },
    onError: (e) => show(e instanceof Error ? e.message : 'Could not cancel.', 'error'),
  });
  const renewMutation = useMutation({
    mutationFn: renewSubscription,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      show('Renewal period and invoice created.', 'success');
    },
    onError: (e) => show(e instanceof Error ? e.message : 'Could not renew.', 'error'),
  });
  const historyQuery = useQuery({
    queryKey: ['subscription-history', history?.id],
    queryFn: () => fetchSubscriptionHistory(history!.id),
    enabled: Boolean(history),
  });
  const statusOptions = ['', 'UPCOMING', 'ACTIVE', 'EXPIRED', 'CANCELLED'];
  return (
    <main className="space-y-6 p-4 sm:p-7">
      {view}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-red-700">Subscriptions</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Plans & coverage periods</h1>
          <p className="mt-1 text-sm text-slate-500">Dates display in India Standard Time.</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button variant="secondary" onClick={() => setShowPlan(true)}>
              Create plan
            </Button>
          )}
          {canAssign && role !== 'CUSTOMER' && (
            <Button onClick={() => setShowAssign(true)}>Assign subscription</Button>
          )}
        </div>
      </header>
      {role !== 'CUSTOMER' && (
        <Panel className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Subscription plans</h2>
            <span className="text-xs text-slate-500">
              {plansQuery.data?.pagination.total ?? 0} plans
            </span>
          </div>
          {plansQuery.isLoading ? (
            <Skeleton className="h-16" />
          ) : plansQuery.error ? (
            <ErrorState retry={() => void plansQuery.refetch()} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {(plansQuery.data?.items ?? []).map((plan) => (
                <div key={plan.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="font-semibold">{plan.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {plan.duration === 'CUSTOM'
                      ? `${plan.customDurationDays} days`
                      : plan.duration.replace('_', ' ').toLowerCase()}
                  </p>
                  <p className="mt-2 font-bold">{inr(plan.pricePaise)}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <h2 className="font-semibold">Customer subscriptions</h2>
          <select
            aria-label="Filter subscriptions"
            className="field rounded-lg border border-slate-200 px-3 py-2"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statusOptions.map((v) => (
              <option key={v} value={v}>
                {v || 'All statuses'}
              </option>
            ))}
          </select>
        </div>
        {listQuery.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : listQuery.error ? (
          <div className="p-5">
            <ErrorState retry={() => void listQuery.refetch()} />
          </div>
        ) : !listQuery.data?.items.length ? (
          <EmptyState
            title="No subscriptions found"
            description="Assigned plans and coverage periods will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    'Plan',
                    'Customer',
                    'Start date',
                    'End date',
                    'Invoice',
                    'Status',
                    'Actions',
                  ].map((x) => (
                    <th key={x} className="px-4 py-3">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listQuery.data.items.map((sub) => {
                  const plan = typeof sub.planId === 'object' ? sub.planId : undefined;
                  const invoice = typeof sub.invoiceId === 'object' ? sub.invoiceId : undefined;
                  return (
                    <tr key={sub.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium">{plan?.name ?? 'Plan'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{sub.customerId}</td>
                      <td className="px-4 py-3">{indiaDate(sub.startsAt)}</td>
                      <td className="px-4 py-3">{indiaDate(sub.endsAt)}</td>
                      <td className="px-4 py-3">{invoice?.invoiceNumber ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(sub.status)}>{sub.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            className="min-h-8 px-2"
                            onClick={() => setHistory(sub)}
                          >
                            History
                          </Button>
                          {canAssign && sub.status !== 'CANCELLED' && (
                            <Button
                              variant="ghost"
                              className="min-h-8 px-2"
                              onClick={() => {
                                if (window.confirm('Create a new renewal period and invoice?'))
                                  renewMutation.mutate(sub.id);
                              }}
                            >
                              Renew
                            </Button>
                          )}
                          {canAssign && ['ACTIVE', 'UPCOMING'].includes(sub.status) && (
                            <Button
                              variant="ghost"
                              className="min-h-8 px-2 text-red-700"
                              onClick={() => {
                                if (window.confirm('Cancel this subscription?'))
                                  cancelMutation.mutate(sub.id);
                              }}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {showPlan && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <Panel className="w-full max-w-lg p-6">
            <h2 className="mb-4 text-xl font-bold">Create subscription plan</h2>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                planMutation.mutate({
                  name: f.get('name'),
                  description: f.get('description'),
                  duration,
                  pricePaise: Math.round(Number(f.get('price')) * 100),
                  ...(duration === 'CUSTOM' ? { customDurationDays: Number(f.get('days')) } : {}),
                });
              }}
            >
              <Field label="Plan name" name="name" required />
              <Field label="Description" name="description" />
              <label className="block text-sm">
                Duration
                <select
                  className="field mt-1 w-full rounded-xl border p-2.5"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                >
                  {['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              {duration === 'CUSTOM' && (
                <Field label="Days" name="days" type="number" min="1" max="3650" required />
              )}
              <Field label="Price (₹)" name="price" type="number" min="0" step="0.01" required />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setShowPlan(false)}>
                  Close
                </Button>
                <Button disabled={planMutation.isPending}>Save plan</Button>
              </div>
            </form>
          </Panel>
        </div>
      )}
      {showAssign && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <Panel className="w-full max-w-lg p-6">
            <h2 className="mb-4 text-xl font-bold">Assign subscription</h2>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                assignMutation.mutate();
              }}
            >
              <label className="block text-sm">
                Customer
                <select
                  required
                  className="field mt-1 w-full rounded-xl border p-2.5"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">Select a customer</option>
                  {customersQuery.data?.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Plan
                <select
                  required
                  className="field mt-1 w-full rounded-xl border p-2.5"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                >
                  <option value="">Select a plan</option>
                  {plansQuery.data?.items.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Start date"
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
              <p className="text-xs text-slate-500">
                An invoice will be created and linked to this period.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setShowAssign(false)}>
                  Close
                </Button>
                <Button disabled={assignMutation.isPending}>Assign</Button>
              </div>
            </form>
          </Panel>
        </div>
      )}
      {history && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <Panel className="max-h-[80vh] w-full max-w-lg overflow-auto p-6">
            <div className="mb-4 flex justify-between">
              <h2 className="text-xl font-bold">Subscription history</h2>
              <button aria-label="Close history" onClick={() => setHistory(null)}>
                ×
              </button>
            </div>
            {historyQuery.isLoading ? (
              <Skeleton className="h-16" />
            ) : historyQuery.error ? (
              <ErrorState retry={() => void historyQuery.refetch()} />
            ) : (
              historyQuery.data?.items.map((event, i) => (
                <div key={String(event.id ?? i)} className="border-t py-3">
                  <p className="font-medium">{String(event.type)}</p>
                  <p className="text-xs text-slate-500">
                    {event.occurredAt ? indiaDate(String(event.occurredAt)) : ''}
                  </p>
                </div>
              ))
            )}
          </Panel>
        </div>
      )}
    </main>
  );
}
