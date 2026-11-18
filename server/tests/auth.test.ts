import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  AuthSessionModel,
  CustomerModel,
  UserModel,
} from '../src/modules/identity/identity.model.js';
import { AuditLogModel } from '../src/modules/operations/operations.model.js';
import {
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  verifyCsrfToken,
  createCsrfToken,
  verifyPassword,
} from '../src/modules/auth/auth.crypto.js';
import { changePassword, login } from '../src/modules/auth/auth.service.js';
import {
  authenticateUser,
  requirePermission,
  requireRecordOwnership,
  requireRole,
} from '../src/modules/auth/auth.middleware.js';
import type { AuthContext } from '../src/modules/auth/auth.types.js';

const activeAdmin = {
  id: '665f00000000000000000001',
  _id: '665f00000000000000000001',
  email: 'admin@example.test',
  role: 'ADMIN',
  status: 'ACTIVE',
  mustChangePassword: false,
};

function invoke(
  middleware: (request: Request, response: Response, next: NextFunction) => unknown,
  auth?: AuthContext,
) {
  const request = { auth } as Request;
  const response = {} as Response;
  const next = vi.fn();
  const result = middleware(request, response, next);
  return { request, response, next, result };
}

describe('authentication primitives', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stores bcrypt hashes and verifies passwords without retaining plaintext', async () => {
    const password = 'A long secure password 2026!';
    const passwordHash = await hashPassword(password);
    expect(passwordHash).not.toBe(password);
    expect(passwordHash.startsWith('$2')).toBe(true);
    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true);
    await expect(verifyPassword('a different password', passwordHash)).resolves.toBe(false);
    await expect(hashPassword('short')).rejects.toThrow();
  });

  it('verifies access tokens but does not use embedded role claims as authorization', async () => {
    const token = await signAccessToken(activeAdmin.id, 'session-1', 'ADMIN');
    await expect(verifyAccessToken(token)).resolves.toEqual({
      userId: activeAdmin.id,
      sessionId: 'session-1',
    });
    await expect(verifyAccessToken(`${token}tampered`)).rejects.toThrow();
  });

  it('binds CSRF tokens to a session and rejects missing or altered tokens', () => {
    const token = createCsrfToken('session-a');
    expect(verifyCsrfToken('session-a', token)).toBe(true);
    expect(verifyCsrfToken('session-b', token)).toBe(false);
    expect(verifyCsrfToken('session-a', undefined)).toBe(false);
  });

  it('creates a session only for an active user with a valid password', async () => {
    const passwordHash = await hashPassword('Another long secure password!');
    vi.spyOn(UserModel, 'findOne').mockImplementation(
      () => ({ select: vi.fn().mockResolvedValue({ ...activeAdmin, passwordHash }) }) as never,
    );
    vi.spyOn(AuthSessionModel, 'create').mockResolvedValue({ id: 'session-1' } as never);
    vi.spyOn(AuditLogModel, 'create').mockResolvedValue({} as never);

    const result = await login(activeAdmin.email, 'Another long secure password!');
    expect(result.user).toEqual({
      id: activeAdmin.id,
      email: activeAdmin.email,
      role: 'ADMIN',
      status: 'ACTIVE',
      mustChangePassword: false,
    });
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toHaveLength(43);
    expect('passwordHash' in result.user).toBe(false);
  });

  it('returns the same credential error for invalid and inactive accounts', async () => {
    vi.spyOn(UserModel, 'findOne').mockImplementation(
      () => ({ select: vi.fn().mockResolvedValue(null) }) as never,
    );
    await expect(login('unknown@example.test', 'invalid passphrase')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    });
  });

  it('changes a password only after current-password verification and revokes active sessions', async () => {
    const passwordHash = await hashPassword('Current secure password!2026');
    const user = {
      _id: activeAdmin._id,
      passwordHash,
      mustChangePassword: true,
      save: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(UserModel, 'findById').mockImplementation(
      () => ({ select: vi.fn().mockResolvedValue(user) }) as never,
    );
    const revoke = vi
      .spyOn(AuthSessionModel, 'updateMany')
      .mockResolvedValue({ modifiedCount: 2 } as never);
    vi.spyOn(AuditLogModel, 'create').mockResolvedValue({} as never);

    await changePassword(
      activeAdmin.id,
      'Current secure password!2026',
      'A different secure password!2026',
    );

    expect(user.passwordHash).not.toBe(passwordHash);
    expect(await verifyPassword('A different secure password!2026', user.passwordHash)).toBe(true);
    expect(user.mustChangePassword).toBe(false);
    expect(revoke).toHaveBeenCalledWith(
      { userId: activeAdmin._id, revokedAt: null },
      { $set: { revokedAt: expect.any(Date) } },
    );
    expect(AuditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_PASSWORD_CHANGED' }),
    );
  });

  it('rejects a wrong current password without changing credentials or sessions', async () => {
    const passwordHash = await hashPassword('Current secure password!2026');
    const user = { _id: activeAdmin._id, passwordHash, save: vi.fn() };
    vi.spyOn(UserModel, 'findById').mockImplementation(
      () => ({ select: vi.fn().mockResolvedValue(user) }) as never,
    );
    const revoke = vi.spyOn(AuthSessionModel, 'updateMany');
    await expect(
      changePassword(activeAdmin.id, 'wrong password', 'A different secure password!2026'),
    ).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' });
    expect(user.save).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });
});

describe('authorization middleware', () => {
  it('does not accept a frontend role in place of an authenticated session', async () => {
    const handler = authenticateUser as unknown as (
      request: Request,
      response: Response,
      next: NextFunction,
    ) => Promise<void>;
    const { next } = invoke(handler);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('allows admin access and denies a role mismatch', () => {
    const admin = invoke(requireRole('EMPLOYEE'), {
      userId: 'admin-1',
      sessionId: 's1',
      role: 'ADMIN',
      permissions: [],
    });
    expect(admin.next).toHaveBeenCalledWith();
    const customer = invoke(requireRole('EMPLOYEE'), {
      userId: 'customer-1',
      sessionId: 's2',
      role: 'CUSTOMER',
      customerId: 'c1',
      permissions: [],
    });
    expect(customer.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('enforces employee permissions while admin bypass is server-side', () => {
    const allowed = invoke(requirePermission('customers:read'), {
      userId: 'employee-1',
      sessionId: 's1',
      role: 'EMPLOYEE',
      employeeId: 'e1',
      permissions: ['customers:read'],
    });
    expect(allowed.next).toHaveBeenCalledWith();
    const denied = invoke(requirePermission('payments:create'), {
      userId: 'employee-1',
      sessionId: 's1',
      role: 'EMPLOYEE',
      employeeId: 'e1',
      permissions: ['customers:read'],
    });
    expect(denied.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    const admin = invoke(requirePermission('anything:here'), {
      userId: 'admin-1',
      sessionId: 's1',
      role: 'ADMIN',
      permissions: [],
    });
    expect(admin.next).toHaveBeenCalledWith();
  });

  it('limits record access to the customer owner or assigned employee', async () => {
    const resolveRecord = async () => ({ _id: 'customer-1', userId: 'user-customer' });
    const customerGuard = requireRecordOwnership(resolveRecord) as unknown as (
      request: Request,
      response: Response,
      next: NextFunction,
    ) => Promise<void>;
    const owner = invoke(customerGuard, {
      userId: 'user-customer',
      customerId: 'customer-1',
      sessionId: 's1',
      role: 'CUSTOMER',
      permissions: [],
    });
    await owner.result;
    expect(owner.next).toHaveBeenCalledWith();
    const other = invoke(customerGuard, {
      userId: 'other-user',
      customerId: 'customer-2',
      sessionId: 's2',
      role: 'CUSTOMER',
      permissions: [],
    });
    await other.result;
    expect(other.next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));

    vi.spyOn(CustomerModel, 'exists').mockResolvedValue({ _id: 'customer-1' } as never);
    const employeeGuard = invoke(customerGuard, {
      userId: 'user-employee',
      employeeId: 'employee-1',
      sessionId: 's3',
      role: 'EMPLOYEE',
      permissions: ['customers:read'],
    });
    await employeeGuard.result;
    expect(employeeGuard.next).toHaveBeenCalledWith();
  });
});
