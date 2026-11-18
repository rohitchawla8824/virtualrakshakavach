import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env.js';

export const ACCESS_COOKIE = env.NODE_ENV === 'production' ? '__Host-vrk_access' : 'vrk_access';
export const REFRESH_COOKIE =
  env.NODE_ENV === 'production' ? '__Secure-vrk_refresh' : 'vrk_refresh';
export const accessCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: env.NODE_ENV === 'production' ? '/' : '/api/v1',
  maxAge: env.AUTH_ACCESS_TTL_SECONDS * 1000,
};
export const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: env.NODE_ENV === 'production' ? '/' : '/api/v1/auth',
};

export function clearAuthCookies(response: Response) {
  response.clearCookie(ACCESS_COOKIE, { ...accessCookieOptions, maxAge: undefined });
  response.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
}
