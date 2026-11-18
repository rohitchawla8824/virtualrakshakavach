const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export type AccountRole = 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';
export type CurrentUser = {
  id: string;
  email: string;
  role: AccountRole;
  status: string;
  mustChangePassword: boolean;
  permissions?: string[];
};
let csrfToken: string | undefined;

export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string | number,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string | number };
    } | null;
    throw new AuthApiError(
      payload?.error?.message ?? 'Request failed. Please try again.',
      response.status,
      payload?.error?.code,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function authenticatedApiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrfToken) await fetchCsrfToken();
    init = { ...init, headers: { ...init.headers, ...csrfHeaders() } };
  }
  return apiRequest<T>(path, init);
}

export async function authenticatedApiDownload(path: string): Promise<Blob> {
  await getCurrentUser();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    headers: { Accept: 'text/csv' },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string | number };
    } | null;
    throw new AuthApiError(
      payload?.error?.message ?? 'Download failed. Please try again.',
      response.status,
      payload?.error?.code,
    );
  }
  return response.blob();
}

function csrfHeaders() {
  if (!csrfToken) throw new AuthApiError('Your session needs to be refreshed. Sign in again.', 401);
  return { 'x-csrf-token': csrfToken };
}

export async function signIn(email: string, password: string) {
  const session = await apiRequest<{ user: CurrentUser; csrfToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  csrfToken = session.csrfToken;
  return session.user;
}

async function fetchCsrfToken() {
  const result = await apiRequest<{ csrfToken: string }>('/auth/csrf');
  csrfToken = result.csrfToken;
  return result.csrfToken;
}

async function refreshSession() {
  const token = await fetchCsrfToken();
  const result = await apiRequest<{ user: CurrentUser; csrfToken: string }>('/auth/refresh', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
  });
  csrfToken = result.csrfToken;
  return result.user;
}

export async function getCurrentUser() {
  try {
    return (await apiRequest<{ user: CurrentUser }>('/auth/me')).user;
  } catch (error) {
    if (!(error instanceof AuthApiError) || error.status !== 401) throw error;
    await refreshSession();
    return (await apiRequest<{ user: CurrentUser }>('/auth/me')).user;
  }
}

export async function signOut() {
  if (!csrfToken) {
    try {
      await fetchCsrfToken();
    } catch (error) {
      if (!(error instanceof AuthApiError) || error.status !== 401) throw error;
    }
  }
  try {
    await apiRequest<void>('/auth/logout', {
      method: 'POST',
      headers: csrfToken ? csrfHeaders() : {},
    });
  } finally {
    csrfToken = undefined;
  }
}

export async function updatePassword(currentPassword: string, password: string) {
  await authenticatedApiRequest<void>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, password }),
  });
  csrfToken = undefined;
}

export async function requestPasswordReset(email: string) {
  return apiRequest<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string) {
  await apiRequest<void>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
  csrfToken = undefined;
}

export async function acceptInvitation(token: string, password: string) {
  const session = await apiRequest<{ user: CurrentUser; csrfToken: string }>(
    '/auth/invitations/accept',
    { method: 'POST', body: JSON.stringify({ token, password }) },
  );
  csrfToken = session.csrfToken;
  return session.user;
}

export async function confirmEmailChange(token: string) {
  const result = await apiRequest<{ message: string }>('/auth/email-change/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  csrfToken = undefined;
  return result;
}
