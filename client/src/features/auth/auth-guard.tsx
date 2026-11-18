import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/primitives';
import { getCurrentUser, type AccountRole } from './auth-api';

const rolePaths: Record<AccountRole, string> = {
  ADMIN: '/admin',
  EMPLOYEE: '/employee',
  CUSTOMER: '/portal',
};

export function AuthGuard({ role, children }: { role: AccountRole; children: ReactNode }) {
  const location = useLocation();
  const session = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 60_000,
  });
  if (session.isPending)
    return (
      <main className="mx-auto max-w-7xl space-y-4 px-6 py-10">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  if (session.isError || !session.data)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.data.role !== role) return <Navigate to={rolePaths[session.data.role]} replace />;
  return children;
}

export function PermissionGuard({
  anyOf,
  allOf = [],
  children,
}: {
  anyOf: string[];
  allOf?: string[];
  children: ReactNode;
}) {
  const session = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 60_000,
  });
  if (session.isPending)
    return (
      <main className="mx-auto max-w-7xl space-y-4 px-6 py-10">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </main>
    );
  if (session.isError || !session.data) return <Navigate to="/login" replace />;
  if (
    session.data.role === 'ADMIN' ||
    anyOf.some((permission) => session.data.permissions?.includes(permission)) ||
    (allOf.length > 0 &&
      allOf.every((permission) => session.data.permissions?.includes(permission)))
  )
    return children;
  return <Navigate to="/employee" replace />;
}
