import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthGuard, PermissionGuard } from '@/features/auth/auth-guard';
import {
  CataloguePage,
  CustomerManagementPage,
  AdminDashboardPage,
  EmailChangeConfirmPage,
  EmployeeProfilePage,
  FinancePage,
  ForgotPasswordPage,
  InvitationAcceptPage,
  LoginPage,
  PasswordResetPage,
  PortalDashboard,
  PortalLayout,
  PortalProductsPage,
  ReportsPage,
  SubscriptionsPage,
} from './lazy-pages';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/admin" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <PasswordResetPage /> },
  { path: '/invite/accept', element: <InvitationAcceptPage /> },
  { path: '/verify-email-change', element: <EmailChangeConfirmPage /> },
  {
    path: '/employee',
    element: (
      <AuthGuard role="EMPLOYEE">
        <PortalLayout role="EMPLOYEE" />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <PortalDashboard role="EMPLOYEE" /> },
      {
        path: 'customers',
        element: (
          <PermissionGuard anyOf={['customers:read', 'customers:create']}>
            <CustomerManagementPage role="EMPLOYEE" />
          </PermissionGuard>
        ),
      },
      {
        path: 'customers/:customerId',
        element: (
          <PermissionGuard anyOf={['customers:read']}>
            <CustomerManagementPage role="EMPLOYEE" />
          </PermissionGuard>
        ),
      },
      {
        path: 'subscriptions',
        element: (
          <PermissionGuard anyOf={['subscriptions:read']}>
            <SubscriptionsPage role="EMPLOYEE" />
          </PermissionGuard>
        ),
      },
      {
        path: 'collections',
        element: (
          <PermissionGuard anyOf={['finance:read']} allOf={['customers:read', 'payments:record']}>
            <FinancePage role="EMPLOYEE" />
          </PermissionGuard>
        ),
      },
      {
        path: 'invoices',
        element: (
          <PermissionGuard anyOf={['finance:read']}>
            <FinancePage role="EMPLOYEE" />
          </PermissionGuard>
        ),
      },
      { path: 'profile', element: <EmployeeProfilePage /> },
      { path: 'catalogue', element: <CataloguePage role="EMPLOYEE" /> },
    ],
  },
  {
    path: '/portal',
    element: (
      <AuthGuard role="CUSTOMER">
        <PortalLayout role="CUSTOMER" />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <PortalDashboard role="CUSTOMER" /> },
      { path: 'profile', element: <CustomerManagementPage role="CUSTOMER" /> },
      { path: 'products', element: <PortalProductsPage /> },
      { path: 'subscriptions', element: <SubscriptionsPage role="CUSTOMER" /> },
      { path: 'invoices', element: <FinancePage role="CUSTOMER" /> },
      { path: 'payments', element: <FinancePage role="CUSTOMER" /> },
    ],
  },
  {
    path: '/admin/reports',
    element: (
      <AuthGuard role="ADMIN">
        <ReportsPage />
      </AuthGuard>
    ),
  },
  {
    path: '/admin/invoices',
    element: (
      <AuthGuard role="ADMIN">
        <FinancePage role="ADMIN" />
      </AuthGuard>
    ),
  },
  {
    path: '/admin/payments',
    element: (
      <AuthGuard role="ADMIN">
        <FinancePage role="ADMIN" />
      </AuthGuard>
    ),
  },
  {
    path: '/admin/subscriptions',
    element: (
      <AuthGuard role="ADMIN">
        <SubscriptionsPage role="ADMIN" />
      </AuthGuard>
    ),
  },
  {
    path: '/admin/catalogue',
    element: (
      <AuthGuard role="ADMIN">
        <CataloguePage role="ADMIN" />
      </AuthGuard>
    ),
  },
  {
    path: '/admin/customers',
    element: (
      <AuthGuard role="ADMIN">
        <CustomerManagementPage role="ADMIN" />
      </AuthGuard>
    ),
  },
  {
    path: '/admin/customers/:customerId',
    element: (
      <AuthGuard role="ADMIN">
        <CustomerManagementPage role="ADMIN" />
      </AuthGuard>
    ),
  },
  {
    path: '/admin',
    element: (
      <AuthGuard role="ADMIN">
        <AdminDashboardPage />
      </AuthGuard>
    ),
  },
  { path: '*', element: <Navigate to="/admin" replace /> },
]);
