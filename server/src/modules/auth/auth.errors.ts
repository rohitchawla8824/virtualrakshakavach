export class AuthError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const invalidCredentials = () =>
  new AuthError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

export const authUnavailable = () =>
  new AuthError(503, 'AUTH_NOT_CONFIGURED', 'Authentication is not configured on this server.');
