import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { app } from '../src/app.js';
import { AuthSessionModel, UserModel } from '../src/modules/identity/identity.model.js';
import { AuditLogModel } from '../src/modules/operations/operations.model.js';
import { hashPassword } from '../src/modules/auth/auth.crypto.js';
import type { AuthContext } from '../src/modules/auth/auth.types.js';
import { currentUserController } from '../src/modules/auth/auth.controller.js';
import { errorHandler } from '../src/middleware/error-handler.js';

const adminId = '665f00000000000000000001';

describe('authentication API', () => {
  afterEach(() => vi.restoreAllMocks());

  it('issues HttpOnly same-site cookies and returns no bearer tokens or password hash', async () => {
    const password = 'A secure admin password 2026!';
    const passwordHash = await hashPassword(password);
    const admin = {
      id: adminId,
      _id: adminId,
      email: 'owner@example.test',
      role: 'ADMIN',
      status: 'ACTIVE',
      mustChangePassword: false,
      passwordHash,
    };
    vi.spyOn(UserModel, 'findOne').mockImplementation(
      () => ({ select: vi.fn().mockResolvedValue(admin) }) as never,
    );
    vi.spyOn(AuthSessionModel, 'create').mockResolvedValue({
      id: '665f00000000000000000002',
    } as never);
    vi.spyOn(AuditLogModel, 'create').mockResolvedValue({} as never);

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password });
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: adminId, role: 'ADMIN', status: 'ACTIVE' });
    expect(response.body.passwordHash).toBeUndefined();
    expect(response.body.accessToken).toBeUndefined();
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.body.csrfToken).toBeTypeOf('string');
    const cookies = (response.headers['set-cookie'] as string[]).join(';');
    expect(cookies).toContain('vrk_access=');
    expect(cookies).toContain('vrk_refresh=');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('SameSite=Strict');
  });

  it('rejects a role supplied by the client during login', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@example.test', password: 'a valid password here', role: 'ADMIN' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects forged access cookies regardless of a claimed frontend role', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'vrk_access=forged.token.value')
      .set('x-frontend-role', 'ADMIN');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('requires a session-bound CSRF token for logout when a refresh cookie is present', async () => {
    vi.spyOn(AuthSessionModel, 'findOne').mockResolvedValue({
      id: '665f00000000000000000002',
      expiresAt: new Date(Date.now() + 60_000),
      familyExpiresAt: new Date(Date.now() + 60_000),
    } as never);
    const response = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', 'vrk_refresh=opaque-refresh-secret');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_INVALID');
  });

  it('returns employee permissions from the server-authenticated context', async () => {
    vi.spyOn(UserModel, 'findById').mockResolvedValue({
      id: adminId,
      _id: adminId,
      email: 'employee@example.test',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      mustChangePassword: false,
    } as never);
    const auth: AuthContext = {
      userId: adminId,
      employeeId: '665f00000000000000000003',
      sessionId: 'employee-session',
      role: 'EMPLOYEE',
      permissions: ['customers:read', 'customers:create'],
    };
    const testApp = express();
    testApp.get(
      '/me',
      (request, _response, next) => {
        request.auth = auth;
        next();
      },
      currentUserController,
    );
    testApp.use(errorHandler);

    const response = await request(testApp).get('/me');

    expect(response.status).toBe(200);
    expect(response.body.user.permissions).toEqual(['customers:read', 'customers:create']);
    expect(response.body.user.passwordHash).toBeUndefined();
  });
});
