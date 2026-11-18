import { lazy } from 'react';

export const LoginPage = lazy(() =>
  import('@/features/auth/auth-pages').then((page) => ({ default: page.LoginPage })),
);
export const ForgotPasswordPage = lazy(() =>
  import('@/features/auth/auth-pages').then((page) => ({ default: page.ForgotPasswordPage })),
);
export const InvitationAcceptPage = lazy(() =>
  import('@/features/auth/auth-pages').then((page) => ({ default: page.InvitationAcceptPage })),
);
export const PasswordResetPage = lazy(() =>
  import('@/features/auth/auth-pages').then((page) => ({ default: page.PasswordResetPage })),
);
export const EmailChangeConfirmPage = lazy(() =>
  import('@/features/auth/auth-pages').then((page) => ({ default: page.EmailChangeConfirmPage })),
);
export const CustomerManagementPage = lazy(() =>
  import('@/features/customers/customer-page').then((page) => ({
    default: page.CustomerManagementPage,
  })),
);
export const CataloguePage = lazy(() =>
  import('@/features/catalogue/catalogue-page').then((page) => ({ default: page.CataloguePage })),
);
export const SubscriptionsPage = lazy(() =>
  import('@/features/subscriptions/subscriptions-page').then((page) => ({
    default: page.SubscriptionsPage,
  })),
);
export const FinancePage = lazy(() =>
  import('@/features/finance/finance-page').then((page) => ({ default: page.FinancePage })),
);
export const PortalLayout = lazy(() =>
  import('@/features/portals/portal-layout').then((page) => ({ default: page.PortalLayout })),
);
export const EmployeeProfilePage = lazy(() =>
  import('@/features/portals/portal-pages').then((page) => ({ default: page.EmployeeProfilePage })),
);
export const PortalDashboard = lazy(() =>
  import('@/features/portals/portal-pages').then((page) => ({ default: page.PortalDashboard })),
);
export const PortalProductsPage = lazy(() =>
  import('@/features/portals/portal-pages').then((page) => ({ default: page.PortalProductsPage })),
);
export const ReportsPage = lazy(() =>
  import('@/features/reports/reports-page').then((page) => ({ default: page.ReportsPage })),
);
export const AdminDashboardPage = lazy(() =>
  import('@/features/workspace/admin-dashboard').then((page) => ({
    default: page.AdminDashboardPage,
  })),
);
