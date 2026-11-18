import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  LayoutDashboard,
  LoaderCircle,
  Package,
  Plus,
  ReceiptText,
  ShieldCheck,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button, Field, Skeleton } from '@/components/ui/primitives';
import { useToasts } from '@/components/ui/use-toasts';
import { authenticatedApiRequest } from '@/features/auth/auth-api';
import { fetchCustomers } from '@/features/customers/customer-api';
import { fetchReport, type ReportPayload } from '@/features/reports/report-api';

const sections = [
  {
    to: '/admin/customers',
    label: 'Customers',
    description: 'Profiles, account access and assignments',
    icon: Users,
  },
  {
    to: '/admin/catalogue',
    label: 'Products & services',
    description: 'Catalogue, categories and stock',
    icon: Package,
  },
  {
    to: '/admin/subscriptions',
    label: 'Subscriptions',
    description: 'Plans, renewals and expiry',
    icon: CalendarDays,
  },
  {
    to: '/admin/invoices',
    label: 'Invoices',
    description: 'Create invoices and review balances',
    icon: ReceiptText,
  },
  {
    to: '/admin/payments',
    label: 'Payments',
    description: 'Collections, allocations and refunds',
    icon: CreditCard,
  },
  {
    to: '/admin/reports',
    label: 'Reports',
    description: 'Business performance and exports',
    icon: BarChart3,
  },
];
const employeePermissions = [
  ['customers:read', 'View assigned customers'],
  ['customers:create', 'Add customers'],
  ['customers:update', 'Update customer details'],
  ['subscriptions:read', 'View subscriptions'],
  ['subscriptions:assign', 'Assign subscriptions'],
  ['subscriptions:manage', 'Manage subscription plans'],
  ['finance:read', 'View invoices and collections'],
  ['invoices:create', 'Create invoices'],
  ['payments:record', 'Record payments'],
  ['refunds:request', 'Request refunds'],
  ['products:read', 'View products'],
] as const;

function indiaDay(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
}
function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00+05:30`);
  date.setUTCDate(date.getUTCDate() + days);
  return indiaDay(date);
}
function money(paise: unknown) {
  try {
    const amount = BigInt(String(paise ?? 0));
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(Number(amount / 100n));
  } catch {
    return '—';
  }
}
function metric(report: ReportPayload | undefined, key: string) {
  return report?.summary && !Array.isArray(report.summary) ? report.summary[key] : undefined;
}
function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  loading,
  accent = false,
}: {
  label: string;
  value?: string;
  detail: string;
  icon: typeof Users;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <article
      style={
        accent
          ? { backgroundColor: '#C8102E', borderColor: '#C8102E', color: '#FFFFFF' }
          : undefined
      }
      className={`rounded-2xl border p-5 shadow-sm ${accent ? 'border-[#C8102E] bg-[#C8102E] text-white' : 'border-slate-200 bg-white text-slate-900'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-sm font-medium ${accent ? 'text-red-100' : 'text-slate-500'}`}>
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-32" />
          ) : (
            <p className="mt-2 text-3xl font-bold tracking-tight">{value ?? '—'}</p>
          )}
        </div>
        <span
          className={`grid size-10 place-items-center rounded-xl ${accent ? 'bg-white/15' : 'bg-rose-50 text-[#C8102E]'}`}
        >
          <Icon size={19} />
        </span>
      </div>
      <p className={`mt-3 text-xs ${accent ? 'text-red-100' : 'text-slate-500'}`}>{detail}</p>
    </article>
  );
}

function EmployeeInviteDialog({ onClose }: { onClose: () => void }) {
  const { show } = useToasts();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [permissions, setPermissions] = useState<string[]>(['customers:read']);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ profileId: string; email: string; expiresAt: string }>();
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await authenticatedApiRequest<{
        invitation: { profileId: string; email: string; invitationExpiresAt: string };
      }>('/auth/invitations', {
        method: 'POST',
        body: JSON.stringify({
          displayName: name,
          email,
          phone: phone || undefined,
          role: 'EMPLOYEE',
          permissions,
        }),
      });
      setCreated({
        profileId: result.invitation.profileId,
        email: result.invitation.email,
        expiresAt: result.invitation.invitationExpiresAt,
      });
      show('Employee invitation sent.', 'success');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not send the employee invitation.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-invite-title"
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#C8102E]">
              Team access
            </p>
            <h2 id="employee-invite-title" className="mt-1 text-2xl font-bold">
              Invite an employee
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              We’ll create their employee profile and send a secure setup link.
            </p>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        {created ? (
          <div
            className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
            role="status"
          >
            <div className="flex items-center gap-2 font-semibold text-emerald-800">
              <Check size={18} /> Invitation sent to {created.email}
            </div>
            <p className="mt-3 text-sm text-slate-700">Employee ID</p>
            <code className="mt-1 block break-all rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900">
              {created.profileId}
            </code>
            <p className="mt-3 text-xs text-slate-600">
              The employee must accept the email invitation to set a password and sign in.
            </p>
            <Button className="mt-5" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Employee name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={160}
              />
              <Field
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
              />
            </div>
            <Field
              label="Phone (optional)"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={32}
            />
            <fieldset className="rounded-2xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold">Employee permissions</legend>
              <p className="mb-3 text-xs text-slate-500">
                Choose only the work this account should access.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {employeePermissions.map(([permission, label]) => (
                  <label
                    key={permission}
                    className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={permissions.includes(permission)}
                      onChange={() =>
                        setPermissions((current) =>
                          current.includes(permission)
                            ? current.filter((item) => item !== permission)
                            : [...current, permission],
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <LoaderCircle size={16} className="animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <UserPlus size={16} /> Send invitation
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

export function AdminDashboardPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const today = useMemo(() => indiaDay(new Date()), []);
  const start = useMemo(() => addDays(today, -29), [today]);
  const end = useMemo(() => addDays(today, 30), [today]);
  const customers = useQuery({
    queryKey: ['admin-dashboard', 'customers'],
    queryFn: () => fetchCustomers({ q: '', status: 'ALL', page: 1, limit: 1 }),
    retry: false,
  });
  const collections = useQuery({
    queryKey: ['admin-dashboard', 'collections', start, today],
    queryFn: () =>
      fetchReport('collections', { from: start, to: today, period: 'daily', page: 1, limit: 30 }),
    retry: false,
  });
  const outstanding = useQuery({
    queryKey: ['admin-dashboard', 'outstanding'],
    queryFn: () =>
      fetchReport('outstanding', { from: start, to: today, period: 'daily', page: 1, limit: 1 }),
    retry: false,
  });
  const overdue = useQuery({
    queryKey: ['admin-dashboard', 'overdue'],
    queryFn: () =>
      fetchReport('overdue-invoices', {
        from: start,
        to: today,
        period: 'daily',
        page: 1,
        limit: 1,
      }),
    retry: false,
  });
  const renewals = useQuery({
    queryKey: ['admin-dashboard', 'renewals', today, end],
    queryFn: () =>
      fetchReport('subscriptions', {
        from: today,
        to: end,
        period: 'daily',
        status: 'UPCOMING',
        page: 1,
        limit: 1,
      }),
    retry: false,
  });
  const collectionItems = collections.data?.items ?? [];
  const chartMax = Math.max(1, ...collectionItems.map((item) => Number(item.amountPaise ?? 0)));
  const navLinks = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard },
    ...sections.map(({ to, label, icon }) => ({ to, label, icon })),
  ];
  const prettyDate = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'full',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-slate-900 lg:flex">
      <aside
        style={{ backgroundColor: '#121316', color: '#FFFFFF' }}
        className="hidden w-64 shrink-0 flex-col bg-[#121316] px-5 py-6 text-white lg:flex"
      >
        <Link to="/admin" className="flex items-center gap-3">
          <BrandLogo size="small" />
          <div>
            <p className="text-xs font-bold tracking-wide">VIRTUAL RAKSHA</p>
            <p className="text-[10px] tracking-[.2em] text-slate-400">KAVACH</p>
          </div>
        </Link>
        <p className="mb-3 mt-10 px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">
          Workspace
        </p>
        <nav className="space-y-1" aria-label="Admin navigation">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${to === '/admin' ? 'bg-[#C8102E] font-semibold text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
              style={to === '/admin' ? { backgroundColor: '#C8102E', color: '#FFFFFF' } : undefined}
            >
              <Icon size={17} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.04] p-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-rose-300">
            <ShieldCheck size={18} />
          </div>
          <p className="mt-3 text-sm font-semibold">Secure workspace</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Account access is invitation-based. Customer login setup is sent by email.
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-7 lg:px-10 lg:py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 lg:hidden">
            <BrandLogo size="small" />
            <span className="text-sm font-bold">Virtual Raksha Kavach</span>
          </div>
          <div className="hidden lg:block">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#C8102E]">
              Admin workspace
            </p>
            <h1 className="mt-1 text-2xl font-bold">Overview</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{prettyDate}</span>
            <button
              aria-label="Notifications"
              className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600"
            >
              <Bell size={18} />
            </button>
            <button
              onClick={() => setInviteOpen(true)}
              style={{ backgroundColor: '#C8102E', color: '#FFFFFF' }}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#C8102E] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#a30d25]"
            >
              <Plus size={17} />
              <span className="hidden sm:inline">Add employee</span>
            </button>
          </div>
        </header>

        <section
          style={{ backgroundColor: '#17181C', color: '#FFFFFF' }}
          className="relative mt-6 overflow-hidden rounded-3xl bg-[#17181c] px-6 py-7 text-white shadow-lg sm:px-9 sm:py-9"
        >
          <div className="absolute -right-12 -top-24 size-72 rounded-full bg-[#C8102E]/25 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-rose-300">
                Business at a glance
              </p>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Good to see you, Admin</h2>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                A live view of customers, collections and upcoming renewals from your records.
              </p>
            </div>
            <Link
              to="/admin/reports"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold hover:bg-white/10"
            >
              View reports <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        <section
          aria-label="Business summary"
          className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4"
        >
          <MetricCard
            label="Customers"
            value={
              customers.data
                ? new Intl.NumberFormat('en-IN').format(customers.data.pagination.total)
                : undefined
            }
            detail="Registered customer accounts"
            icon={Users}
            loading={customers.isLoading}
          />
          <MetricCard
            label="Collected · 30 days"
            value={collections.data ? money(metric(collections.data, 'amountPaise')) : undefined}
            detail="Successful payments received"
            icon={CircleDollarSign}
            loading={collections.isLoading}
            accent
          />
          <MetricCard
            label="Outstanding"
            value={outstanding.data ? money(metric(outstanding.data, 'totalPaise')) : undefined}
            detail={`${metric(outstanding.data, 'invoiceCount') ?? '—'} open invoices`}
            icon={Wallet}
            loading={outstanding.isLoading}
          />
          <MetricCard
            label="Renewals · next 30 days"
            value={
              renewals.data?.pagination
                ? new Intl.NumberFormat('en-IN').format(renewals.data.pagination.total)
                : undefined
            }
            detail="Subscriptions ending soon"
            icon={Clock3}
            loading={renewals.isLoading}
          />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">Collection trend</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Daily successful collections · last 30 days
                </p>
              </div>
              <Link
                to="/admin/reports"
                className="text-sm font-semibold text-[#C8102E] hover:underline"
              >
                Full report <ArrowUpRight className="ml-1 inline" size={15} />
              </Link>
            </div>
            {collections.isLoading ? (
              <Skeleton className="mt-6 h-52 w-full" />
            ) : collections.isError ? (
              <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                Collection data couldn’t load.{' '}
                <button
                  className="ml-1 font-semibold underline"
                  onClick={() => void collections.refetch()}
                >
                  Retry
                </button>
              </div>
            ) : collectionItems.length === 0 ? (
              <div className="mt-6 grid h-52 place-items-center rounded-xl bg-slate-50 text-sm text-slate-500">
                No successful collections in this period.
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <div className="flex h-52 min-w-[500px] items-end gap-2 border-b border-slate-100 px-2">
                  {collectionItems.map((item, index) => {
                    const amount = Number(item.amountPaise ?? 0);
                    const height = Math.max(4, (amount / chartMax) * 150);
                    return (
                      <div
                        key={`${item.date}-${index}`}
                        className="group flex h-full min-w-0 flex-1 flex-col justify-end"
                      >
                        <span className="mb-1 truncate text-center text-[9px] text-slate-500 opacity-0 group-hover:opacity-100">
                          {money(item.amountPaise)}
                        </span>
                        <div
                          title={`${String(item.date)} · ${money(item.amountPaise)}`}
                          className="rounded-t-md bg-[#C8102E] transition hover:bg-[#8f0b21]"
                          style={{ height }}
                        />
                        <span className="mt-2 truncate text-center text-[9px] text-slate-400">
                          {String(item.date ?? '').slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold">Needs attention</h2>
                <p className="mt-1 text-xs text-slate-500">Current items to review</p>
              </div>
              <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-amber-700">
                <ArrowDownRight size={18} />
              </span>
            </div>
            {overdue.isLoading ? (
              <Skeleton className="mt-5 h-16 w-full" />
            ) : overdue.isError ? (
              <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                Overdue invoice data unavailable.{' '}
                <button className="underline" onClick={() => void overdue.refetch()}>
                  Retry
                </button>
              </p>
            ) : (
              <Link
                to="/admin/invoices"
                className="mt-5 flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/60 p-4 hover:border-amber-300"
              >
                <span>
                  <span className="block text-sm font-semibold">Overdue invoices</span>
                  <span className="mt-1 block text-xs text-slate-600">Past their due date</span>
                </span>
                <span className="flex items-center gap-2 text-lg font-bold text-amber-800">
                  {overdue.data?.pagination?.total ?? 0}
                  <ChevronRight size={18} />
                </span>
              </Link>
            )}
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                Quick actions
              </p>
              <div className="space-y-1">
                <Link
                  to="/admin/customers"
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <Users size={16} className="text-[#C8102E]" /> Add a customer
                  </span>
                  <ChevronRight size={16} className="text-slate-400" />
                </Link>
                <button
                  onClick={() => setInviteOpen(true)}

                  className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <UserPlus size={16} className="text-[#C8102E]" /> Invite an employee
                  </span>
                  <ChevronRight size={16} className="text-slate-400" />
                </button>
                <Link
                  to="/admin/invoices"
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2">
                    <ReceiptText size={16} className="text-[#C8102E]" /> Create an invoice
                  </span>
                  <ChevronRight size={16} className="text-slate-400" />
                </Link>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-7">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Manage your business</h2>
              <p className="mt-1 text-sm text-slate-500">Open a workspace to continue.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sections.map(({ to, label, description, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-[#C8102E]">
                  <Icon size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{label}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">{description}</span>
                </span>
                <ArrowUpRight
                  size={17}
                  className="shrink-0 text-slate-400 group-hover:text-[#C8102E]"
                />
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <p className="text-slate-600">
            <span className="font-semibold text-slate-900">Customer login:</span> Add customers from
            Customers; they receive a secure email link to set up their own sign-in.
          </p>
          <Link to="/admin/customers" className="font-semibold text-[#C8102E] hover:underline">
            Manage customer access <ArrowRight className="ml-1 inline" size={15} />
          </Link>
        </section>
      </main>
      {inviteOpen && <EmployeeInviteDialog onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
