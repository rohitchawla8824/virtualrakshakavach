import type { Request } from 'express';

export type UserRole = 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';

export type AuthContext = {
  userId: string;
  role: UserRole;
  sessionId: string;
  employeeId?: string;
  customerId?: string;
  permissions: string[];
};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export type AuthenticatedRequest = Request & { auth: AuthContext };
