import { EmployeeModel } from '../identity/identity.model.js';
import { AuditLogModel } from '../operations/operations.model.js';
import { AuthError } from '../auth/auth.errors.js';
import type { AuthContext } from '../auth/auth.types.js';

export async function listAssignableEmployees(page: number, limit: number) {
  const filter = { status: 'ACTIVE' as const };
  const [items, total] = await Promise.all([
    EmployeeModel.find(filter)
      .select('displayName status')
      .sort({ displayName: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    EmployeeModel.countDocuments(filter),
  ]);
  return {
    items: items.map(({ _id, displayName, status }) => ({
      id: _id.toString(),
      displayName,
      status,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

export async function getOwnEmployeeProfile(auth: AuthContext) {
  if (auth.role !== 'EMPLOYEE' || !auth.employeeId)
    throw new AuthError(403, 'FORBIDDEN', 'Employee profile access is required.');
  const employee = await EmployeeModel.findOne({
    _id: auth.employeeId,
    userId: auth.userId,
    status: 'ACTIVE',
  })
    .select('displayName phone permissions status createdAt updatedAt')
    .lean();
  if (!employee) throw new AuthError(404, 'EMPLOYEE_NOT_FOUND', 'Employee profile was not found.');
  return employee;
}

export async function updateOwnEmployeeProfile(
  input: { displayName?: string; phone?: string | null },
  auth: AuthContext,
) {
  if (auth.role !== 'EMPLOYEE' || !auth.employeeId)
    throw new AuthError(403, 'FORBIDDEN', 'Employee profile access is required.');
  const employee = await EmployeeModel.findOne({
    _id: auth.employeeId,
    userId: auth.userId,
    status: 'ACTIVE',
  });
  if (!employee) throw new AuthError(404, 'EMPLOYEE_NOT_FOUND', 'Employee profile was not found.');
  if (input.displayName !== undefined) employee.displayName = input.displayName;
  if (input.phone !== undefined) employee.phone = input.phone ?? undefined;
  await employee.save();
  await AuditLogModel.create({
    actorUserId: auth.userId,
    action: 'EMPLOYEE_PROFILE_UPDATED',
    entityType: 'Employee',
    entityId: employee._id,
  });
  return getOwnEmployeeProfile(auth);
}
