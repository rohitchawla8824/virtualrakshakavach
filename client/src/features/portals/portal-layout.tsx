import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  Users,
  Wallet,
  X,
  UserRound,
  KeyRound,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Badge, Button, Panel, Skeleton } from '@/components/ui/primitives';
import { signOut, getCurrentUser } from '@/features/auth/auth-api';
import { fetchNotifications } from '@/features/finance/finance-api';
import { useToasts } from '@/components/ui/use-toasts';

export type PortalRole = 'EMPLOYEE' | 'CUSTOMER';
const links = {
  EMPLOYEE: [
    { to: '/employee', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/employee/customers', label: 'Assigned customers', icon: Users },
    { to: '/employee/subscriptions', label: 'Subscriptions', icon: ShieldCheck },
    { to: '/employee/collections', label: 'Collections', icon: Wallet },
    { to: '/employee/profile', label: 'Profile & security', icon: KeyRound },
  ],
  CUSTOMER: [
    { to: '/portal', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/portal/products', label: 'My products', icon: Package },
    { to: '/portal/subscriptions', label: 'My subscriptions', icon: ShieldCheck },
    { to: '/portal/invoices', label: 'My invoices', icon: FileText },
    { to: '/portal/payments', label: 'Payment history', icon: Wallet },
    { to: '/portal/profile', label: 'Personal profile', icon: UserRound },
  ],
} satisfies Record<PortalRole, Array<{ to: string; label: string; icon: typeof Users }>>;

export function PortalLayout({ role }: { role: PortalRole }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show } = useToasts();
  const user = useQuery({ queryKey: ['current-user'], queryFn: getCurrentUser });
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: fetchNotifications });
  const title = role === 'EMPLOYEE' ? 'Employee workspace' : 'Customer portal';
  async function logout() {
    try {
      await signOut();
      queryClient.clear();
      navigate('/login', { replace: true });
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not sign out. Try again.', 'error');
    }
  }
  const visibleLinks =
    role === 'CUSTOMER'
      ? links.CUSTOMER
      : links.EMPLOYEE.filter((link) => {
          if (link.to === '/employee' || link.to === '/employee/profile') return true;
          if (link.to === '/employee/customers')
            return user.data?.permissions?.includes('customers:read') === true;
          if (link.to === '/employee/subscriptions')
            return user.data?.permissions?.includes('subscriptions:read') === true;
          if (link.to === '/employee/collections')
            return (
              user.data?.permissions?.includes('finance:read') === true ||
              user.data?.permissions?.includes('payments:record') === true
            );
          return false;
        });
  const activeLabel = links[role].find((link) => link.to === location.pathname)?.label ?? title;
  return (
    <div className="min-h-screen bg-[#f5f5f6] text-slate-900">
      {mobileOpen && (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-white transition-transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-slate-100 px-5">
          <BrandLogo size="small" />
          <div>
            <p className="text-sm font-bold text-slate-900">Virtual Raksha Kavach</p>
            <p className="text-xs text-slate-500">{title}</p>
          </div>
          <button
            className="ml-auto rounded-lg p-2 lg:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label={`${title} navigation`} className="space-y-1 p-4">
          {visibleLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              end={to === '/employee' || to === '/portal'}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${isActive ? 'bg-[#111111] text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-[#C8102E]'}`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <Panel className="p-4">
            <div className="flex items-start gap-3">
              <Bell size={17} className="mt-0.5 text-[#C8102E]" />
              <div>
                <p className="text-sm font-semibold">Notifications</p>
                {notifications.isLoading ? (
                  <Skeleton className="mt-2 h-4 w-24" />
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    {notifications.data?.items.length ?? 0} recent updates
                  </p>
                )}
              </div>
            </div>
          </Panel>
          <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
            <div className="grid size-9 place-items-center rounded-full bg-red-50 text-sm font-bold text-[#C8102E]">
              {user.data?.email?.slice(0, 1).toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.data?.email ?? 'Account'}</p>
              <Badge tone="slate">{role === 'EMPLOYEE' ? 'Employee' : 'Customer'}</Badge>
            </div>
            <button
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-[#C8102E]"
              onClick={() => void logout()}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 flex h-20 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
          <button
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-slate-600 lg:hidden"
          >
            <Menu size={20} />
          </button>
          <p className="font-semibold text-slate-700">{activeLabel}</p>
          <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
            <span className="hidden sm:inline">Signed in as</span>
            <span className="max-w-48 truncate font-medium text-slate-800">
              {user.data?.email ?? 'Loading account…'}
            </span>
          </div>
          <Button
            variant="ghost"
            className="hidden sm:inline-flex"
            onClick={() => navigate(role === 'EMPLOYEE' ? '/employee/profile' : '/portal/profile')}
          >
            Account
          </Button>
        </header>
        <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-7 sm:py-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
