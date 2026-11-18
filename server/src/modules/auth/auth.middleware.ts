import type { RequestHandler } from 'express';
import {
  AuthSessionModel,
  CustomerModel,
  EmployeeModel,
  UserModel,
} from '../identity/identity.model.js';
import { hashOpaqueToken, verifyAccessToken, verifyCsrfToken } from './auth.crypto.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.cookies.js';
import { AuthError } from './auth.errors.js';
import type { AuthContext, UserRole } from './auth.types.js';

function unauthorized() {
  return new AuthError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
}

export const authenticateUser: RequestHandler = async (request, _response, next) => {
  try {
    const token = request.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string') throw unauthorized();
    const claims = await verifyAccessToken(token);
    const [session, user] = await Promise.all([
      AuthSessionModel.findOne({
        _id: claims.sessionId,
        userId: claims.userId,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
        familyExpiresAt: { $gt: new Date() },
      }),
      UserModel.findById(claims.userId),
    ]);
    if (!session || !user || user.status !== 'ACTIVE') throw unauthorized();

    const auth: AuthContext = {
      userId: user.id,
      role: user.role as UserRole,
      sessionId: session.id,
      permissions: [],
    };
    if (auth.role === 'EMPLOYEE') {
      const employee = await EmployeeModel.findOne({ userId: user._id, status: 'ACTIVE' });
      if (!employee) throw unauthorized();
      auth.employeeId = employee.id;
      auth.permissions = employee.permissions;
    } else if (auth.role === 'CUSTOMER') {
      const customer = await CustomerModel.findOne({ userId: user._id, status: 'ACTIVE' });
      if (!customer) throw unauthorized();
      auth.customerId = customer.id;
    }
    request.auth = auth;
    next();
  } catch (error) {
    next(error instanceof AuthError ? error : unauthorized());
  }
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) return next(unauthorized());
    if (request.auth.role === 'ADMIN' && !roles.includes('ADMIN')) return next();
    if (roles.includes(request.auth.role)) return next();
    next(new AuthError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
  };
}

export function requirePermission(permission: string): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) return next(unauthorized());
    if (request.auth.role === 'ADMIN' || request.auth.permissions.includes(permission))
      return next();
    next(new AuthError(403, 'FORBIDDEN', 'You do not have permission to perform this action.'));
  };
}

type OwnedRecord = {
  userId?: { toString(): string } | string;
  customerId?: { toString(): string } | string;
  _id?: { toString(): string } | string;
};
type OwnershipResolver = (request: Parameters<RequestHandler>[0]) => Promise<OwnedRecord | null>;

const customerByRouteId: OwnershipResolver = async (request) => {
  const customerId = request.params.customerId ?? request.params.id;
  if (!customerId) return null;
  return CustomerModel.findById(customerId)
    .select('_id userId assignedEmployeeIds')
    .lean() as Promise<OwnedRecord | null>;
};

export function requireRecordOwnership(
  resolveRecord: OwnershipResolver = customerByRouteId,
): RequestHandler {
  return async (request, _response, next) => {
    try {
      const auth = request.auth;
      if (!auth) throw unauthorized();
      const record = await resolveRecord(request);
      if (!record)
        throw new AuthError(404, 'RECORD_NOT_FOUND', 'The requested record was not found.');
      if (auth.role === 'ADMIN') return next();
      if (
        auth.role === 'CUSTOMER' &&
        (record._id?.toString() === auth.customerId || record.userId?.toString() === auth.userId)
      )
        return next();
      const customerId = record.customerId?.toString() ?? record._id?.toString();
      if (auth.role === 'EMPLOYEE' && auth.employeeId && customerId) {
        const assigned = await CustomerModel.exists({
          _id: customerId,
          assignedEmployeeIds: auth.employeeId,
          status: 'ACTIVE',
        });
        if (assigned) return next();
      }
      throw new AuthError(404, 'RECORD_NOT_FOUND', 'The requested record was not found.');
    } catch (error) {
      next(error);
    }
  };
}

export const requireCsrf: RequestHandler = (request, _response, next) => {
  if (!request.auth) return next(unauthorized());
  if (verifyCsrfToken(request.auth.sessionId, request.get('x-csrf-token'))) return next();
  next(
    new AuthError(
      403,
      'CSRF_INVALID',
      'The request could not be verified. Refresh the page and try again.',
    ),
  );
};

export const requireRefreshCsrf: RequestHandler = async (request, _response, next) => {
  try {
    const refreshToken = request.cookies?.[REFRESH_COOKIE];
    if (typeof refreshToken !== 'string') throw unauthorized();
    const session = await AuthSessionModel.findOne({
      refreshTokenHash: hashOpaqueToken(refreshToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      familyExpiresAt: { $gt: new Date() },
    });
    if (!session) throw unauthorized();
    if (!verifyCsrfToken(session.id, request.get('x-csrf-token'))) {
      throw new AuthError(
        403,
        'CSRF_INVALID',
        'The request could not be verified. Refresh the page and try again.',
      );
    }
    next();
  } catch (error) {
    next(error instanceof AuthError ? error : unauthorized());
  }
};

export const requireRefreshCsrfWhenPresent: RequestHandler = (request, response, next) => {
  if (request.cookies?.[REFRESH_COOKIE]) return requireRefreshCsrf(request, response, next);
  if (request.cookies?.[ACCESS_COOKIE]) {
    return authenticateUser(request, response, (error) => {
      if (error) return next(error);
      return requireCsrf(request, response, next);
    });
  }
  return next();
};

export const authenticateCsrfSource: RequestHandler = (request, response, next) => {
  if (request.cookies?.[REFRESH_COOKIE]) return next();
  return authenticateUser(request, response, next);
};
