import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env.js';
import { authUnavailable } from './auth.errors.js';

function signingKey() {
  if (!env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET.length < 32) throw authUnavailable();
  return new TextEncoder().encode(env.JWT_ACCESS_SECRET);
}

export function assertAuthConfiguration() {
  signingKey();
}

export async function hashPassword(password: string) {
  assertPasswordLength(password);
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  if (Buffer.byteLength(password, 'utf8') < 1 || Buffer.byteLength(password, 'utf8') > 72)
    return false;
  return bcrypt.compare(password, passwordHash);
}

export function assertPasswordLength(password: string) {
  if (Buffer.byteLength(password, 'utf8') < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Password must contain 12 to 72 UTF-8 bytes.');
  }
}

export function hashOpaqueToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function createCsrfToken(sessionId: string) {
  return createHmac('sha256', signingKey()).update(`csrf:v1:${sessionId}`).digest('base64url');
}

export function verifyCsrfToken(sessionId: string, candidate: string | undefined) {
  if (!candidate) return false;
  const expected = Buffer.from(createCsrfToken(sessionId));
  const actual = Buffer.from(candidate);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function signAccessToken(userId: string, sessionId: string) {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('virtual-raksha-kavach-api')
    .setAudience('virtual-raksha-kavach-web')
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${env.AUTH_ACCESS_TTL_SECONDS}s`)
    .sign(signingKey());
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, signingKey(), {
    algorithms: ['HS256'],
    issuer: 'virtual-raksha-kavach-api',
    audience: 'virtual-raksha-kavach-web',
  });
  if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
    throw new Error('Invalid access claims.');
  return { userId: payload.sub, sessionId: payload.sid };
}
