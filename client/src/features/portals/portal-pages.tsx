import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  FileText,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
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
import { getCurrentUser, updatePassword } from '@/features/auth/auth-api';
import {
  fetchCustomers,
  fetchOwnCustomer,
  fetchOwnEmployeeProfile,
  updateOwnEmployeeProfile,
} from '@/features/customers/customer-api';
import { fetchInvoices, fetchNotifications, fetchPayments } from '@/features/finance/finance-api';
import { fetchSubscriptions } from '@/features/subscriptions/subscription-api';
import type { PortalRole } from './portal-layout';

const money = (paise: number) => {
  const amount = BigInt(Math.max(0, Math.trunc(paise || 0)));
  return `₹${new Intl.NumberFormat('en-IN').format(amount / 100n)}.${String(amount % 100n).padStart(2, '0')}`;
};
const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(
        new Date(value),
      )
    : '—';

function Stat({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  note?: string;
}) {
  return (
    <Panel className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
        </div>
        <span className="grid size-10 place-items-center rounded-xl bg-red-50 text-[#C8102E]">
          <Icon size={19} />
        </span>
      </div>
    </Panel>
  );
}

export function PortalDashboard({ role }: { role: PortalRole }) {
  const user = useQuery({ queryKey: ['current-user'], queryFn: getCurrentUser });
  const own = useQuery({
    queryKey: ['own-customer'],
    queryFn: fetchOwnCustomer,
    enabled: role === 'CUSTOMER',
  });
  const canCustomerRead =
    role === 'CUSTOMER' || user.data?.permissions?.includes('customers:read') === true;
  const canSubsRead =
    role === 'CUSTOMER' || user.data?.permissions?.includes('subscriptions:read') === true;
  const canFinanceRead =
    role === 'CUSTOMER' || user.data?.permissions?.includes('finance:read') === true;
  const customers = useQuery({
    queryKey: ['portal-assigned-customers'],
    queryFn: () => fetchCustomers({ q: '', status: 'ACTIVE', page: 1, limit: 6 }),
    enabled: role === 'EMPLOYEE' && canCustomerRead,
  });
  const subscriptions = useQuery({
    queryKey: ['portal-subscriptions'],
    queryFn: () => fetchSubscriptions(),
    enabled: canSubsRead,
  });
  const invoices = useQuery({
    queryKey: ['portal-invoices'],
    queryFn: fetchInvoices,
    enabled: canFinanceRead,
  });
  const payments = useQuery({
    queryKey: ['portal-payments'],
    queryFn: fetchPayments,
    enabled: canFinanceRead,
  });
  const notices = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    enabled: role === 'CUSTOMER',
  });
  const activeSubs = subscriptions.data?.items.filter((item) => item.status === 'ACTIVE') ?? [];
  const upcomingSubs = subscriptions.data?.items.filter((item) => item.status === 'UPCOMING') ?? [];
  const paidPaise =
    payments.data?.items
      .filter((item) => item.status === 'SUCCEEDED')
      .reduce((sum, item) => sum + item.amountPaise, 0) ?? 0;
  const unpaidInvoices =
    invoices.data?.items.filter((item) => !['PAID', 'VOID', 'DRAFT'].includes(item.status)) ?? [];
  const outstanding =
    role === 'CUSTOMER'
      ? (own.data?.financialSummary.outstandingPaise ?? 0)
      : unpaidInvoices.reduce((sum, item) => sum + item.totalPaise, 0);
  const productRows = (invoices.data?.items ?? [])
    .flatMap((invoice) =>
      invoice.lines.map((line) => ({
        ...line,
        invoice: invoice.invoiceNumber,
        issuedAt: invoice.issuedAt,
      })),
    )
    .slice(0, 5);
  const loading =
    user.isLoading ||
    (role === 'CUSTOMER' && own.isLoading) ||
    (canSubsRead && subscriptions.isLoading) ||
    (canFinanceRead && (invoices.isLoading || payments.isLoading)) ||
    (role === 'EMPLOYEE' && canCustomerRead && customers.isLoading);
  const failed =
    user.isError ||
    (role === 'CUSTOMER' && own.isError) ||
    (canSubsRead && subscriptions.isError) ||
    (canFinanceRead && (invoices.isError || payments.isError)) ||
    (role === 'EMPLOYEE' && canCustomerRead && customers.isError);
  const retry = () => {
    void own.refetch();
    void subscriptions.refetch();
    void invoices.refetch();
    void payments.refetch();
    void customers.refetch();
  };
  if (loading)
    return (
      <div className="space-y-6" aria-label="Loading portal dashboard">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  if (failed) return <ErrorState retry={retry} />;

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#C8102E]">
            {role === 'EMPLOYEE' ? 'Employee portal' : 'Customer portal'}
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            {role === 'EMPLOYEE'
              ? 'Your assigned work'
              : `Welcome, ${own.data?.customer.displayName ?? 'back'}`}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Your portal data is loaded from your authorized account records.
          </p>
        </div>
        <Badge tone="green">Live account data</Badge>
      </header>
      {role === 'EMPLOYEE' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {canCustomerRead && (
              <Stat
                label="Assigned active customers"
                value={String(customers.data?.pagination.total ?? 0)}
                icon={Users}
              />
            )}
            {canSubsRead && (
              <Stat
                label="Active subscriptions"
                value={String(activeSubs.length)}
                icon={ShieldCheck}
                note={`${upcomingSubs.length} upcoming`}
              />
            )}
            {canFinanceRead && (
              <Stat
                label="Payments collected"
                value={money(paidPaise)}
                icon={Wallet}
                note="Successful records only"
              />
            )}
            {canFinanceRead && (
              <Stat label="Open invoice totals" value={money(outstanding)} icon={CreditCard} />
            )}
          </div>
          {canCustomerRead && (
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div>
                  <h2 className="font-semibold">Assigned customers</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Active customer records assigned to your account.
                  </p>
                </div>
                <Link
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#C8102E]"
                  to="/employee/customers"
                >
                  View all <ArrowRight size={16} />
                </Link>
              </div>
              {customers.data?.items.length ? (
                <div className="divide-y divide-slate-100">
                  {customers.data.items.map((customer) => (
                    <Link
                      key={customer.id}
                      to={`/employee/customers/${customer.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-semibold">{customer.displayName}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {customer.email ?? customer.phone ?? 'Contact details unavailable'}
                        </p>
                      </div>
                      <Badge tone="green">{customer.status}</Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No assigned customers"
                  description="Customers assigned to your employee account will appear here."
                />
              )}
            </Panel>
          )}
          {canFinanceRead && (
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div>
                  <h2 className="font-semibold">Collection history</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Recent successful and failed payment records.
                  </p>
                </div>
                <Link className="text-sm font-semibold text-[#C8102E]" to="/employee/collections">
                  Open collections
                </Link>
              </div>
              {payments.data?.items.length ? (
                <div className="divide-y divide-slate-100">
                  {payments.data.items.slice(0, 5).map((payment) => (
                    <div key={payment.id} className="flex justify-between gap-3 px-5 py-4">
                      <div>
                        <p className="font-semibold">{money(payment.amountPaise)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {payment.method.replaceAll('_', ' ')} · {date(payment.createdAt)}
                        </p>
                      </div>
                      <Badge tone={payment.status === 'SUCCEEDED' ? 'green' : 'amber'}>
                        {payment.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No collection records"
                  description="Authorized payment records will show here."
                />
              )}
            </Panel>
          )}
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Outstanding balance"
              value={money(outstanding)}
              icon={Wallet}
              note="Calculated from your account ledger"
            />
            <Stat
              label="Active subscriptions"
              value={String(activeSubs.length)}
              icon={ShieldCheck}
              note={`${upcomingSubs.length} upcoming`}
            />
            <Stat
              label="Invoices"
              value={String(invoices.data?.pagination.total ?? 0)}
              icon={FileText}
            />
            <Stat
              label="Successful payments"
              value={String(
                payments.data?.items.filter((item) => item.status === 'SUCCEEDED').length ?? 0,
              )}
              icon={CreditCard}
            />
          </div>
          {activeSubs.length > 0 && (
            <Panel className="p-5">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 text-[#C8102E]" />
                <div>
                  <h2 className="font-semibold">Subscription expiry</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {activeSubs
                      .map(
                        (sub) =>
                          `${typeof sub.planId === 'object' ? sub.planId.name : 'Subscription'} expires ${date(sub.endsAt)}`,
                      )
                      .join(' · ')}
                  </p>
                </div>
              </div>
            </Panel>
          )}
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <h2 className="font-semibold">My products</h2>
                <Link className="text-sm font-semibold text-[#C8102E]" to="/portal/products">
                  View all
                </Link>
              </div>
              {productRows.length ? (
                <div className="divide-y divide-slate-100">
                  {productRows.map((item, index) => (
                    <div
                      key={`${item.invoice}-${item.nameSnapshot}-${index}`}
                      className="flex justify-between gap-3 px-5 py-4"
                    >
                      <div>
                        <p className="font-semibold">{item.nameSnapshot}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Invoice {item.invoice} · Qty {item.quantity}
                        </p>
                      </div>
                      <span className="text-sm text-slate-500">{date(item.issuedAt)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No purchased products yet"
                  description="Products recorded on your invoices will appear here."
                />
              )}
            </Panel>
            <Panel className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <h2 className="font-semibold">Recent invoices</h2>
                <Link className="text-sm font-semibold text-[#C8102E]" to="/portal/invoices">
                  View all
                </Link>
              </div>
              {invoices.data?.items.length ? (
                <div className="divide-y divide-slate-100">
                  {invoices.data.items.slice(0, 5).map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between gap-3 px-5 py-4"
                    >
                      <div>
                        <p className="font-semibold">{invoice.invoiceNumber}</p>
                        <p className="mt-1 text-xs text-slate-500">Due {date(invoice.dueAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{money(invoice.totalPaise)}</p>
                        <Badge tone={invoice.status === 'PAID' ? 'green' : 'amber'}>
                          {invoice.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No invoices yet"
                  description="Invoices issued to your account will appear here."
                />
              )}
            </Panel>
          </div>
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <h2 className="font-semibold">Notifications</h2>
              <span className="text-xs text-slate-500">Recent account updates</span>
            </div>
            {notices.data?.items.length ? (
              <div className="divide-y divide-slate-100">
                {notices.data.items.slice(0, 5).map((notice) => (
                  <div key={notice.id} className="px-5 py-4">
                    <p className="text-sm">{notice.message ?? notice.type.replaceAll('_', ' ')}</p>
                    <p className="mt-1 text-xs text-slate-500">{date(notice.createdAt)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No notifications"
                description="Payment and subscription updates will appear here."
              />
            )}
          </Panel>
        </>
      )}
    </main>
  );
}

export function PortalProductsPage() {
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: fetchInvoices });
  const rows =
    invoices.data?.items.flatMap((invoice) =>
      invoice.lines.map((line, index) => ({
        key: `${invoice.id}-${index}`,
        ...line,
        invoiceNumber: invoice.invoiceNumber,
        issuedAt: invoice.issuedAt,
      })),
    ) ?? [];
  return (
    <main className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#C8102E]">
          Customer records
        </p>
        <h1 className="mt-2 text-3xl font-bold">My products</h1>
        <p className="mt-2 text-sm text-slate-500">Product and service items from your invoices.</p>
      </header>
      {invoices.isLoading ? (
        <Skeleton className="h-64" />
      ) : invoices.isError ? (
        <ErrorState retry={() => void invoices.refetch()} />
      ) : (
        <Panel className="overflow-hidden">
          {rows.length ? (
            <div className="divide-y divide-slate-100">
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="flex flex-wrap items-center justify-between gap-3 p-5"
                >
                  <div>
                    <p className="font-semibold">{row.nameSnapshot}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Invoice {row.invoiceNumber} · Quantity {row.quantity} · {date(row.issuedAt)}
                    </p>
                  </div>
                  <p className="font-semibold">{money(row.lineTotalPaise)}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No products on your account"
              description="Purchased items will be listed after they appear on an invoice."
            />
          )}
        </Panel>
      )}
    </main>
  );
}

export function EmployeeProfilePage() {
  const profile = useQuery({ queryKey: ['employee-profile'], queryFn: fetchOwnEmployeeProfile });
  const qc = useQueryClient();
  const { show, view } = useToasts();
  const save = useMutation({
    mutationFn: updateOwnEmployeeProfile,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['employee-profile'] });
      show('Profile updated.', 'success');
    },
    onError: (error) =>
      show(error instanceof Error ? error.message : 'Could not update profile.', 'error'),
  });
  if (profile.isLoading) return <Skeleton className="h-80" />;
  if (profile.isError || !profile.data) return <ErrorState retry={() => void profile.refetch()} />;
  const employee = profile.data.profile;
  return (
    <main className="space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#C8102E]">
          Employee account
        </p>
        <h1 className="mt-2 text-3xl font-bold">Profile & security</h1>
        <p className="mt-2 text-sm text-slate-500">
          Update your contact profile or change your account password.
        </p>
      </header>
      {view}
      <div className="grid gap-6 xl:grid-cols-2">
        <ProfileForm
          initialName={employee.displayName}
          initialPhone={employee.phone ?? ''}
          busy={save.isPending}
          onSave={(displayName, phone) => save.mutate({ displayName, phone: phone || null })}
        />
        <PasswordForm />
      </div>
      <Panel className="p-5">
        <h2 className="font-semibold">Your permissions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {employee.permissions.length ? (
            employee.permissions.map((permission) => (
              <Badge key={permission} tone="slate">
                {permission}
              </Badge>
            ))
          ) : (
            <p className="text-sm text-slate-500">
              No additional employee permissions are enabled.
            </p>
          )}
        </div>
      </Panel>
    </main>
  );
}

function ProfileForm({
  initialName,
  initialPhone,
  busy,
  onSave,
}: {
  initialName: string;
  initialPhone: string;
  busy: boolean;
  onSave: (name: string, phone: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  return (
    <Panel className="p-5">
      <h2 className="text-lg font-semibold">Personal details</h2>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(name, phone);
        }}
      >
        <Field
          label="Display name"
          required
          minLength={1}
          maxLength={160}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Field
          label="Phone"
          maxLength={32}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </Button>
      </form>
    </Panel>
  );
}

function PasswordForm() {
  const navigate = useNavigate();
  const { show } = useToasts();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const change = useMutation({
    mutationFn: () => updatePassword(current, next),
    onSuccess: () => {
      show('Password changed. Sign in again with your new password.', 'success');
      navigate('/login', { replace: true });
    },
    onError: (error) =>
      show(error instanceof Error ? error.message : 'Could not change password.', 'error'),
  });
  return (
    <Panel className="p-5">
      <h2 className="text-lg font-semibold">Change password</h2>
      <p className="mt-1 text-sm text-slate-500">
        All active sessions will be signed out after a successful change.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (next !== confirm) {
            show('New passwords do not match.', 'error');
            return;
          }
          change.mutate();
        }}
      >
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <Field
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <Button type="submit" disabled={change.isPending}>
          {change.isPending ? 'Changing…' : 'Change password'}
        </Button>
      </form>
    </Panel>
  );
}
