import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import type { AuthContext } from '../src/modules/auth/auth.types.js';
import { EmployeeModel } from '../src/modules/identity/identity.model.js';
import { AuditLogModel } from '../src/modules/operations/operations.model.js';
import {
  getOwnEmployeeProfile,
  updateOwnEmployeeProfile,
} from '../src/modules/employees/employee.service.js';

const employeeAuth: AuthContext = {
  userId: '665f00000000000000000001',
  employeeId: '665f00000000000000000002',
  sessionId: 'portal-session',
  role: 'EMPLOYEE',
  permissions: ['customers:read'],
};

describe('employee portal profile access', () => {
  afterEach(() => vi.restoreAllMocks());

  it('denies non-employee roles before querying employee profile data', async () => {
    const find = vi.spyOn(EmployeeModel, 'findOne');
    await expect(
      getOwnEmployeeProfile({
        ...employeeAuth,
        role: 'CUSTOMER',
        customerId: '665f00000000000000000003',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(find).not.toHaveBeenCalled();
  });

  it('requires an authenticated employee session for portal profile routes', async () => {
    const profile = await request(app).get('/api/v1/employees/me');
    const update = await request(app)
      .patch('/api/v1/employees/me')
      .send({ displayName: 'New Name' });
    expect(profile.status).toBe(401);
    expect(update.status).toBe(401);
  });

  it('binds employee profile lookup to both authenticated user and employee IDs', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ displayName: 'Employee', permissions: ['customers:read'] }),
    };
    const find = vi.spyOn(EmployeeModel, 'findOne').mockReturnValue(query as never);
    await expect(getOwnEmployeeProfile(employeeAuth)).resolves.toMatchObject({
      displayName: 'Employee',
    });
    expect(find).toHaveBeenCalledWith({
      _id: employeeAuth.employeeId,
      userId: employeeAuth.userId,
      status: 'ACTIVE',
    });
  });

  it('updates only the authenticated employee profile and audits the change', async () => {
    const employeeDoc = {
      _id: employeeAuth.employeeId,
      displayName: 'Old name',
      phone: '111',
      save: vi.fn().mockResolvedValue(undefined),
    };
    const find = vi.spyOn(EmployeeModel, 'findOne');
    find.mockReturnValueOnce(Promise.resolve(employeeDoc) as never);
    find.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({ displayName: 'New name', phone: '222', permissions: [] }),
    } as never);
    const audit = vi.spyOn(AuditLogModel, 'create').mockResolvedValue({} as never);

    await expect(
      updateOwnEmployeeProfile({ displayName: 'New name', phone: '222' }, employeeAuth),
    ).resolves.toMatchObject({ displayName: 'New name' });
    expect(find).toHaveBeenNthCalledWith(1, {
      _id: employeeAuth.employeeId,
      userId: employeeAuth.userId,
      status: 'ACTIVE',
    });
    expect(employeeDoc.save).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: employeeAuth.userId, entityId: employeeDoc._id }),
    );
  });
});
