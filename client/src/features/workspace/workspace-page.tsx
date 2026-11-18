import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Download,
  FileText,
  Filter,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Badge, Button, Dialog, EmptyState, Field, Panel } from '@/components/ui/primitives';
import { useToasts } from '@/components/ui/use-toasts';
import { useQueryClient } from '@tanstack/react-query';
import { signOut } from '@/features/auth/auth-api';

type Role = 'admin' | 'employee' | 'customer';
const titles: Record<Role, string> = {
  admin: 'Admin workspace',
  employee: 'Employee workspace',
  customer: 'Customer portal',
};
const sections: Record<Role, { label: string; href: string; icon: typeof LayoutDashboard }[]> = {
  admin: [
    { label: 'Overview', href: '', icon: LayoutDashboard },
    { label: 'Customers', href: 'customers', icon: Users },
    { label: 'Subscriptions', href: 'subscriptions', icon: ShieldCheck },
    { label: 'Products & services', href: 'catalogue', icon: Package },
    { label: 'Invoices', href: 'invoices', icon: FileText },
    { label: 'Payments', href: 'payments', icon: Wallet },
    { label: 'Reports', href: 'reports', icon: Activity },
    { label: 'Settings', href: 'settings', icon: Settings },
  ],
  employee: [
    { label: 'Overview', href: '', icon: LayoutDashboard },
    { label: 'Assigned customers', href: 'customers', icon: Users },
    { label: 'Products & services', href: 'catalogue', icon: Package },
    { label: 'Subscriptions', href: 'subscriptions', icon: ShieldCheck },
    { label: 'Collections', href: 'collections', icon: Wallet },
  ],
  customer: [
    { label: 'My overview', href: '', icon: LayoutDashboard },
    { label: 'Profile', href: 'profile', icon: Users },
    { label: 'My subscriptions', href: 'subscriptions', icon: ShieldCheck },
    { label: 'Invoices', href: 'invoices', icon: FileText },
    { label: 'Payments', href: 'payments', icon: CreditCard },
  ],
};

const demoCustomers = [
  {
    name: 'Aarav Sharma',
    initials: 'AS',
    email: 'aarav.sharma@example.test',
    plan: 'Kavach Plus',
    amount: '₹ 4,999',
    status: 'Active',
  },
  {
    name: 'Meera Patel',
    initials: 'MP',
    email: 'meera.patel@example.test',
    plan: 'Business Secure',
    amount: '₹ 2,499',
    status: 'Pending',
  },
  {
    name: 'Kabir Verma',
    initials: 'KV',
    email: 'kabir.verma@example.test',
    plan: 'Kavach Basic',
    amount: '₹ 1,299',
    status: 'Active',
  },
  {
    name: 'Isha Nair',
    initials: 'IN',
    email: 'isha.nair@example.test',
    plan: 'Business Secure',
    amount: '₹ 2,499',
    status: 'Overdue',
  },
];

const metricData = [
  {
    label: 'Total customers',
    value: '1,284',
    change: '+12.8%',
    icon: Users,
    color: 'bg-blue-50 text-action',
    note: 'vs last month',
  },
  {
    label: 'Active subscriptions',
    value: '936',
    change: '+8.2%',
    icon: ShieldCheck,
    color: 'bg-cyan-50 text-cyan',
    note: 'vs last month',
  },
  {
    label: 'Collected this month',
    value: '₹ 8.42L',
    change: '+16.4%',
    icon: Wallet,
    color: 'bg-emerald-50 text-success',
    note: 'vs last month',
  },
  {
    label: 'Pending payments',
    value: '₹ 1.26L',
    change: '18 invoices',
    icon: CreditCard,
    color: 'bg-amber-50 text-warning',
    note: 'needs follow-up',
  },
];

export function WorkspacePage({ role }: { role: Role }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [dark, setDark] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All statuses');
  const [dialog, setDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show, view } = useToasts();
  const customers = useMemo(
    () =>
      demoCustomers.filter(
        (customer) =>
          (customer.name.toLowerCase().includes(search.toLowerCase()) ||
            customer.email.includes(search.toLowerCase())) &&
          (filter === 'All statuses' || customer.status === filter),
      ),
    [search, filter],
  );
  const roleRoot = role === 'customer' ? '/portal' : `/${role}`;
  const activeSection =
    sections[role].find(
      (item) =>
        location.pathname === `${roleRoot}/${item.href}` ||
        (item.href === '' && location.pathname === roleRoot),
    )?.label ??
    (location.pathname.split('/').filter(Boolean).at(-1) ?? 'Overview').replaceAll('-', ' ');
  function nav(href: string) {
    navigate(`${roleRoot}/${href}`);
    setMobileMenu(false);
  }
  async function handleLogout() {
    try {
      await signOut();
      queryClient.clear();
      navigate('/login', { replace: true });
    } catch (error) {
      show(
        error instanceof Error ? error.message : 'Could not sign out. Please try again.',
        'error',
      );
    }
  }
  return (
    <div className={dark ? 'dark min-h-screen' : 'min-h-screen'}>
      <div className="app-surface min-h-screen bg-surface text-slate-900 transition-colors">
        <AnimatePresence>
          {mobileMenu && (
            <motion.button
              aria-label="Close navigation overlay"
              className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenu(false)}
            />
          )}
        </AnimatePresence>
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${mobileMenu ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-5">
            <BrandLogo size="small" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-navy">Virtual Raksha Kavach</p>
              <p className="text-xs text-slate-500">Secure business, simply.</p>
            </div>
            <button
              aria-label="Close menu"
              onClick={() => setMobileMenu(false)}
              className="ml-auto rounded-lg p-2 text-slate-400 lg:hidden"
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-4 pt-5">
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Workspace
            </p>
            <nav className="mt-2 space-y-1">
              {sections[role].map(({ label, href, icon: Icon }) => {
                const selected = activeSection.toLowerCase() === label.toLowerCase();
                return (
                  <button
                    key={label}
                    onClick={() => nav(href)}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${selected ? 'bg-navy text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-navy'}`}
                  >
                    <Icon
                      size={18}
                      className={
                        selected ? 'text-cyan-200' : 'text-slate-400 group-hover:text-cyan'
                      }
                    />
                    {label}
                    {label === 'Payments' && role === 'admin' && (
                      <span
                        className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] ${selected ? 'bg-white/15 text-white' : 'bg-amber-50 text-warning'}`}
                      >
                        4
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="mt-auto p-4">
            <div className="rounded-2xl bg-gradient-to-br from-navy to-[#58111f] p-4 text-white">
              <div className="flex size-9 items-center justify-center rounded-xl bg-white/10">
                <CircleHelp size={18} />
              </div>
              <p className="mt-3 text-sm font-semibold">Need a hand?</p>
              <p className="mt-1 text-xs leading-5 text-blue-100">
                Our support team is here to help you get started.
              </p>
              <button
                onClick={() =>
                  show('Support contact will be available after account setup.', 'info')
                }
                className="mt-3 text-xs font-semibold text-cyan-200 hover:text-white"
              >
                Contact support <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl px-2 py-2">
              <div className="grid size-9 place-items-center rounded-full bg-cyan-100 text-xs font-bold text-cyan">
                {role === 'admin' ? 'RK' : role === 'employee' ? 'AS' : 'AC'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-navy">
                  {role === 'admin'
                    ? 'Rahul Kapoor'
                    : role === 'employee'
                      ? 'Ananya Singh'
                      : 'Aarav Sharma'}
                </p>
                <p className="text-xs capitalize text-slate-500">{role}</p>
              </div>
              <button
                aria-label="Account menu"
                onClick={() => show('Account settings are not connected yet.', 'info')}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
          </div>
        </aside>

        <div className="min-h-screen lg:pl-[272px]">
          <header className="sticky top-0 z-20 flex h-[76px] items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl sm:px-7">
            <button
              aria-label="Open navigation"
              onClick={() => setMobileMenu(true)}
              className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={20} />
            </button>
            <div className="hidden items-center gap-2 text-sm text-slate-400 sm:flex">
              <span>Workspace</span>
              <span>/</span>
              <span className="font-semibold capitalize text-navy">{activeSection}</span>
            </div>
            <label className="ml-auto hidden w-full max-w-[300px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
              <Search size={17} className="text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                aria-label="Search customers"
              />
              <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400">
                ⌘ K
              </kbd>
            </label>
            <button
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setDark(!dark)}
              className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100"
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              aria-label="Notifications"
              onClick={() =>
                show('You’re all caught up. There are no new notifications.', 'success')
              }
              className="relative rounded-xl p-2.5 text-slate-500 hover:bg-slate-100"
            >
              <Bell size={19} />
              <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-cyan" />
            </button>
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <button
              onClick={() => show('Account settings are not connected yet.', 'info')}
              className="flex items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-slate-50"
            >
              <span className="grid size-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-action">
                {role === 'admin' ? 'RK' : role === 'employee' ? 'AS' : 'AC'}
              </span>
              <ChevronDown size={15} className="hidden text-slate-400 sm:block" />
            </button>
            <button
              aria-label="Sign out"
              title="Sign out"
              onClick={() => void handleLogout()}
              className="rounded-xl p-2.5 text-slate-500 hover:bg-red-50 hover:text-danger"
            >
              <LogOut size={18} />
            </button>
          </header>

          <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan">
                    {titles[role]}
                  </p>
                  <Badge tone="amber">Development preview</Badge>
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-navy sm:text-[30px]">
                  {role === 'customer'
                    ? 'Welcome back, Aarav'
                    : role === 'employee'
                      ? 'Good morning, Ananya'
                      : 'Good morning, Rahul'}{' '}
                  <span aria-hidden="true">✦</span>
                </h1>
                <p className="muted mt-1.5 text-sm text-slate-500">
                  Here’s what’s happening with your business today.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="hidden sm:inline-flex"
                  onClick={() =>
                    show('Date range selector is ready for report integration.', 'info')
                  }
                >
                  <CalendarDays size={16} /> Last 30 days <ChevronDown size={15} />
                </Button>
                {role === 'admin' && (
                  <Button onClick={() => setDialog(true)}>
                    <Plus size={17} /> Add customer
                  </Button>
                )}
              </div>
            </div>
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
              <strong>Development mock data:</strong> Every customer and figure below is
              illustrative only. No business records or API-backed actions are connected.
            </div>
            {role === 'customer' ? (
              <CustomerHome
                onAction={() =>
                  show(
                    'This action will be available when customer accounts and payments are implemented.',
                    'info',
                  )
                }
              />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {metricData.map(({ label, value, change, icon: Icon, color, note }, index) => (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.045 }}
                    >
                      <Panel className="p-5">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-slate-500">{label}</p>
                            <p className="mt-2 text-[26px] font-bold tracking-tight text-navy">
                              {value}
                            </p>
                          </div>
                          <div className={`grid size-10 place-items-center rounded-xl ${color}`}>
                            <Icon size={19} />
                          </div>
                        </div>
                        <div className="mt-4 flex items-center gap-1.5 text-xs">
                          <span
                            className={`inline-flex items-center gap-0.5 font-bold ${change.startsWith('+') ? 'text-success' : 'text-warning'}`}
                          >
                            {change.startsWith('+') ? <ArrowUpRight size={14} /> : null}
                            {change}
                          </span>
                          <span className="text-slate-400">{note}</span>
                        </div>
                      </Panel>
                    </motion.div>
                  ))}
                </div>
                <div className="mt-6 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
                  <Panel className="overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                      <div>
                        <h2 className="font-bold text-navy">Revenue overview</h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Collection trend · development preview
                        </p>
                      </div>
                      <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                        {['Overview', 'Revenue', 'Payments'].map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${activeTab === tab ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-navy'}`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="flex items-end gap-2">
                        <span className="text-3xl font-bold tracking-tight text-navy">
                          ₹ 8,42,640
                        </span>
                        <span className="mb-1 inline-flex items-center gap-0.5 text-xs font-semibold text-success">
                          <ArrowUpRight size={14} /> 16.4%
                        </span>
                      </div>
                      <div className="mt-5 flex h-44 items-end gap-2 border-b border-slate-100 px-1 sm:gap-4">
                        {[35, 48, 42, 60, 51, 72, 62, 77, 69, 88, 75, 96].map((height, i) => (
                          <button
                            key={i}
                            aria-label={`Week ${i + 1}, illustrative revenue ${height}`}
                            title={`Week ${i + 1}: illustrative revenue`}
                            onClick={() =>
                              show(
                                'This chart contains illustrative development data only.',
                                'info',
                              )
                            }
                            className={`group relative flex flex-1 items-end justify-center rounded-t-md ${i === 11 ? 'bg-action' : 'bg-blue-100 hover:bg-cyan-200'}`}
                            style={{ height: `${height}%` }}
                          >
                            <span className="absolute -bottom-6 text-[10px] text-slate-400">
                              {['W1', 'W2', 'W3', 'W4'][i % 4]}
                            </span>
                          </button>
                        ))}
                      </div>
                      <p className="mt-9 text-[11px] text-slate-400">
                        Illustrative trend visualization. Connects to reports API in a later phase.
                      </p>
                    </div>
                  </Panel>
                  <Panel>
                    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                      <div>
                        <h2 className="font-bold text-navy">Recent activity</h2>
                        <p className="mt-0.5 text-xs text-slate-500">Sample activity · demo only</p>
                      </div>
                      <button
                        aria-label="View all activity"
                        onClick={() => show('Activity history is not connected yet.', 'info')}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100 px-5">
                      {[
                        {
                          title: 'Payment received',
                          by: 'Aarav Sharma',
                          time: '12 min ago',
                          tone: 'bg-emerald-50 text-success',
                          icon: Check,
                        },
                        {
                          title: 'New subscription',
                          by: 'Meera Patel',
                          time: '48 min ago',
                          tone: 'bg-blue-50 text-action',
                          icon: ShieldCheck,
                        },
                        {
                          title: 'Invoice overdue',
                          by: 'Isha Nair',
                          time: '2 hours ago',
                          tone: 'bg-amber-50 text-warning',
                          icon: FileText,
                        },
                        {
                          title: 'Customer added',
                          by: 'Kabir Verma',
                          time: 'Yesterday',
                          tone: 'bg-cyan-50 text-cyan',
                          icon: Users,
                        },
                      ].map(({ title, by, time, tone, icon: Icon }) => (
                        <button
                          onClick={() =>
                            show('Activity details are sample data and not available.', 'info')
                          }
                          key={title}
                          className="flex w-full items-center gap-3 py-4 text-left"
                        >
                          <span
                            className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}
                          >
                            <Icon size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-700">
                              {title}
                            </span>
                            <span className="block truncate text-xs text-slate-400">{by}</span>
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">{time}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => show('Activity history is not connected yet.', 'info')}
                      className="w-full border-t border-slate-100 py-3 text-xs font-semibold text-action hover:bg-slate-50"
                    >
                      View all activity
                    </button>
                  </Panel>
                </div>
                <Panel className="mt-6 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
                    <div>
                      <h2 className="font-bold text-navy">Recent customers</h2>
                      <p className="mt-0.5 text-xs text-slate-500">
                        A snapshot of your customer base
                      </p>
                    </div>
                    <button
                      onClick={() => nav('customers')}
                      className="text-sm font-semibold text-action hover:text-blue-800"
                    >
                      View all customers <span aria-hidden="true">→</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3 md:hidden">
                    <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                      <Search size={16} className="text-slate-400" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search customers"
                        aria-label="Search customers"
                        className="w-full text-sm outline-none"
                      />
                    </label>
                    <select
                      aria-label="Filter by status"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="field rounded-xl border border-slate-200 bg-white px-3 text-sm"
                    >
                      <option>All statuses</option>
                      <option>Active</option>
                      <option>Pending</option>
                      <option>Overdue</option>
                    </select>
                  </div>
                  <div className="hidden items-center gap-2 px-5 py-3 md:flex">
                    <label className="flex w-64 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                      <Search size={16} className="text-slate-400" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search customers"
                        aria-label="Search customers"
                        className="w-full text-sm outline-none"
                      />
                    </label>
                    <div className="relative">
                      <Filter
                        size={15}
                        className="pointer-events-none absolute left-3 top-3 text-slate-400"
                      />
                      <select
                        aria-label="Filter by status"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="field rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
                      >
                        <option>All statuses</option>
                        <option>Active</option>
                        <option>Pending</option>
                        <option>Overdue</option>
                      </select>
                    </div>
                    <button
                      onClick={() =>
                        show('Export is not connected; demo records are not exported.', 'info')
                      }
                      className="ml-auto inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                    >
                      <Download size={16} /> Export
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-400">
                        <tr>
                          {['Customer', 'Plan', 'Amount', 'Status', ''].map((header) => (
                            <th key={header} className="px-5 py-3 font-semibold">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {customers.length === 0 ? (
                          <tr>
                            <td colSpan={5}>
                              <EmptyState
                                title="No matching customers"
                                description="Try a different search term or status filter."
                                action={
                                  <Button
                                    variant="secondary"
                                    onClick={() => {
                                      setSearch('');
                                      setFilter('All statuses');
                                    }}
                                  >
                                    Clear filters
                                  </Button>
                                }
                              />
                            </td>
                          </tr>
                        ) : (
                          customers.map((customer) => (
                            <tr key={customer.email} className="hover:bg-slate-50/80">
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <span className="grid size-9 place-items-center rounded-full bg-blue-50 text-xs font-bold text-action">
                                    {customer.initials}
                                  </span>
                                  <span>
                                    <span className="block text-sm font-semibold text-slate-700">
                                      {customer.name}
                                    </span>
                                    <span className="block text-xs text-slate-400">
                                      {customer.email}
                                    </span>
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-3.5 text-sm text-slate-600">
                                {customer.plan}
                              </td>
                              <td className="px-5 py-3.5 text-sm font-semibold text-slate-700">
                                {customer.amount}
                              </td>
                              <td className="px-5 py-3.5">
                                <Badge
                                  tone={
                                    customer.status === 'Active'
                                      ? 'green'
                                      : customer.status === 'Pending'
                                        ? 'amber'
                                        : 'red'
                                  }
                                >
                                  {customer.status}
                                </Badge>
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                <button
                                  aria-label={`Options for ${customer.name}`}
                                  onClick={() =>
                                    show(
                                      `${customer.name}: customer profile screen is not connected yet.`,
                                      'info',
                                    )
                                  }
                                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                                >
                                  <MoreHorizontal size={18} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
                    <span>
                      Showing {customers.length} of {demoCustomers.length} demo records
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="secondary"
                        className="min-h-8 px-2.5 py-1 text-xs"
                        onClick={() =>
                          show(
                            'Pagination is available when connected to the customers API.',
                            'info',
                          )
                        }
                      >
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        className="min-h-8 px-2.5 py-1 text-xs"
                        onClick={() =>
                          show(
                            'Pagination is available when connected to the customers API.',
                            'info',
                          )
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </Panel>
              </>
            )}
            <p className="muted mt-7 text-center text-[11px] text-slate-400">
              Virtual Raksha Kavach · Business management workspace · Asia/Kolkata
            </p>
          </main>
        </div>
        <Dialog
          open={dialog}
          title="Add a customer"
          onClose={() => setDialog(false)}
          onConfirm={() => {
            setDialog(false);
            show('Customer creation is not connected yet. No record was saved.', 'info');
          }}
          confirmLabel="Continue"
        >
          <p>
            This form preview is not connected to the customer API. No customer record will be
            created.
          </p>
          <div className="mt-4 space-y-3">
            <Field label="Customer name" placeholder="e.g. Priya Mehta" />
            <Field label="Email address" type="email" placeholder="priya@example.com" />
          </div>
        </Dialog>
        {view}
      </div>
    </div>
  );
}

function CustomerHome({ onAction }: { onAction: () => void }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Active plan', value: 'Kavach Plus', icon: ShieldCheck },
          { label: 'Next renewal', value: '15 Dec 2026', icon: CalendarDays },
          { label: 'Pending balance', value: '₹ 0.00', icon: Wallet },
        ].map(({ label, value, icon: Icon }) => (
          <Panel key={label} className="p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-cyan-50 text-cyan">
                <Icon size={19} />
              </span>
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 font-bold text-navy">{value}</p>
              </div>
            </div>
          </Panel>
        ))}
      </div>
      <Panel className="mt-5">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-bold text-navy">Your account</h2>
          <p className="mt-1 text-xs text-slate-500">Sample portal view · demo only</p>
        </div>
        <EmptyState
          title="Your documents will appear here"
          description="Invoices and payment history will be available once customer accounts are connected."
          action={
            <Button onClick={onAction}>
              <FileText size={16} /> View invoices
            </Button>
          }
        />
      </Panel>
      <Panel className="mt-5 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-bold text-navy">Need to renew your plan?</h2>
          <p className="muted mt-1 text-sm text-slate-500">
            Online payments will be enabled after sandbox integration and approval.
          </p>
        </div>
        <Button onClick={onAction}>
          <CreditCard size={16} /> Make a payment
        </Button>
      </Panel>
    </>
  );
}
