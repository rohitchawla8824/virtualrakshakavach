import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import type { AuthContext } from '../src/modules/auth/auth.types.js';
import { createInvitation } from '../src/modules/auth/auth.service.js';
import { CustomerModel, EmployeeModel } from '../src/modules/identity/identity.model.js';
import { AuditLogModel } from '../src/modules/operations/operations.model.js';
import {
  archiveCustomer,
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
} from '../src/modules/customers/customer.service.js';
import {
  createCustomerSchema,
  customerListQuerySchema,
} from '../src/modules/customers/customer.schemas.js';

vi.mock('../src/modules/auth/auth.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/auth/auth.service.js')>();
  return { ...actual, createInvitation: vi.fn() };
});

const admin: AuthContext = {
  userId: '665f00000000000000000001',
  sessionId: 'session-admin',
  role: 'ADMIN',
  permissions: [],
};
const employee: AuthContext = {
  userId: '665f00000000000000000002',
  employeeId: '665f00000000000000000003',
  sessionId: 'session-employee',
  role: 'EMPLOYEE',
  permissions: ['customers:read', 'customers:create', 'customers:update'],
};

function chain(value: unknown) {
  const query = {
    select: vi.fn(() => query),
    populate: vi.fn(() => query),
    sort: vi.fn(() => query),
    skip: vi.fn(() => query),
    limit: vi.fn(() => query),
    lean: vi.fn().mockResolvedValue(value),
  };
  return query;
}

describe('customer management service', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('limits employee customer searches to assigned records and paginates', async () => {
    const query = chain([]);
    vi.spyOn(CustomerModel, 'find').mockReturnValue(query as never);
    vi.spyOn(CustomerModel, 'countDocuments').mockResolvedValue(0);

    const result = await listCustomers(employee, {
      q: 'Asha',
      status: 'ACTIVE',
      page: 2,
      limit: 10,
    });

    expect(CustomerModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ assignedEmployeeIds: employee.employeeId, status: 'ACTIVE' }),
    );
    expect(query.skip).toHaveBeenCalledWith(10);
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 0, pages: 0 });
  });

  it('denies employees without the customer read permission', async () => {
    const restricted = { ...employee, permissions: [] };
    const findSpy = vi.spyOn(CustomerModel, 'find');
    await expect(
      listCustomers(restricted, { status: undefined, page: 1, limit: 20 }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('denies employee customer creation without the create permission', async () => {
    const restricted = { ...employee, permissions: ['customers:read'] };
    const invitationSpy = vi.mocked(createInvitation);
    await expect(
      createCustomer({ displayName: 'Asha Rao', email: 'asha@example.test' }, restricted),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(invitationSpy).not.toHaveBeenCalled();
  });

  it('denies employee profile updates without the update permission', async () => {
    const restricted = { ...employee, permissions: ['customers:read'] };
    const findSpy = vi.spyOn(CustomerModel, 'findOne');
    await expect(
      updateCustomer('665f00000000000000000008', { displayName: 'Changed name' }, restricted),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('prevents customers from resolving another customer profile', async () => {
    const ownCustomer: AuthContext = {
      userId: '665f00000000000000000010',
      customerId: '665f00000000000000000011',
      sessionId: 'session-customer',
      role: 'CUSTOMER',
      permissions: [],
    };
    const findSpy = vi.spyOn(CustomerModel, 'findOne');
    await expect(getCustomer('665f00000000000000000012', ownCustomer)).rejects.toMatchObject({
      statusCode: 404,
      code: 'CUSTOMER_NOT_FOUND',
    });
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('automatically assigns an employee-created customer to the creator', async () => {
    vi.spyOn(CustomerModel, 'exists').mockResolvedValue(null);
    vi.mocked(createInvitation).mockResolvedValue({
      id: '665f00000000000000000004',
      profileId: '665f00000000000000000005',
      email: 'asha@example.test',
      role: 'CUSTOMER',
      invitationExpiresAt: new Date('2026-11-16T00:00:00.000Z'),
    });
    vi.spyOn(AuditLogModel, 'create').mockResolvedValue({} as never);

    await createCustomer({ displayName: 'Asha Rao', email: 'asha@example.test' }, employee);

    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'CUSTOMER',
        assignedEmployeeIds: [employee.employeeId],
        primaryEmployeeId: employee.employeeId,
      }),
      employee.userId,
    );
  });

  it('does not let employees change assignments, even with profile edit access', async () => {
    const findOneSpy = vi.spyOn(CustomerModel, 'findOne');
    await expect(
      updateCustomer(
        '665f00000000000000000008',
        { assignedEmployeeIds: ['665f00000000000000000003'] },
        employee,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(findOneSpy).not.toHaveBeenCalled();
  });

  it('allows Admin to update the profile and a valid primary assignment', async () => {
    const employeeId = '665f00000000000000000003';
    const currentQuery = chain({
      _id: '665f00000000000000000008',
      assignedEmployeeIds: [],
      primaryEmployeeId: null,
    });
    const resultQuery = chain({
      _id: '665f00000000000000000008',
      displayName: 'Updated customer',
      assignedEmployeeIds: [{ _id: employeeId, displayName: 'Employee One', status: 'ACTIVE' }],
      primaryEmployeeId: { _id: employeeId, displayName: 'Employee One', status: 'ACTIVE' },
    });
    vi.spyOn(CustomerModel, 'findOne').mockReturnValue(currentQuery as never);
    vi.spyOn(EmployeeModel, 'find').mockReturnValue(chain([{ _id: employeeId }]) as never);
    const updateSpy = vi
      .spyOn(CustomerModel, 'findByIdAndUpdate')
      .mockReturnValue(resultQuery as never);
    vi.spyOn(AuditLogModel, 'create').mockResolvedValue({} as never);

    const result = await updateCustomer(
      '665f00000000000000000008',
      {
        displayName: 'Updated customer',
        assignedEmployeeIds: [employeeId],
        primaryEmployeeId: employeeId,
      },
      admin,
    );

    expect(result.displayName).toBe('Updated customer');
    expect(updateSpy).toHaveBeenCalledWith(
      '665f00000000000000000008',
      {
        $set: {
          displayName: 'Updated customer',
          assignedEmployeeIds: [employeeId],
          primaryEmployeeId: employeeId,
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('archives without deleting the customer profile', async () => {
    const customer = {
      _id: '665f00000000000000000008',
      status: 'ACTIVE',
      userId: null,
      save: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(CustomerModel, 'findById').mockResolvedValue(customer as never);
    vi.spyOn(AuditLogModel, 'create').mockResolvedValue({} as never);
    const deleteSpy = vi.spyOn(CustomerModel, 'deleteOne');

    const result = await archiveCustomer(customer._id, admin);

    expect(result.status).toBe('INACTIVE');
    expect(customer.save).toHaveBeenCalledOnce();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('rejects a primary employee who is not assigned to the customer', async () => {
    const customerQuery = chain({
      _id: '665f00000000000000000008',
      assignedEmployeeIds: [],
      primaryEmployeeId: null,
    });
    vi.spyOn(CustomerModel, 'findOne').mockReturnValue(customerQuery as never);
    const employeeFindSpy = vi.spyOn(EmployeeModel, 'find');
    await expect(
      updateCustomer(
        '665f00000000000000000008',
        {
          assignedEmployeeIds: ['665f00000000000000000003'],
          primaryEmployeeId: '665f00000000000000000009',
        },
        admin,
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PRIMARY_EMPLOYEE' });
    expect(employeeFindSpy).not.toHaveBeenCalled();
  });
});

describe('customer API access boundaries', () => {
  it('requires authentication before customer records can be listed', async () => {
    const response = await request(app).get('/api/v1/customers');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects invalid search, pagination and customer input', () => {
    expect(
      customerListQuerySchema.safeParse({ page: '0', limit: '500', unexpected: 'x' }).success,
    ).toBe(false);
    expect(
      createCustomerSchema.safeParse({ displayName: 'Asha', email: 'not-an-email' }).success,
    ).toBe(false);
  });
});
