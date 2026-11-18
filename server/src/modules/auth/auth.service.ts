import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import {
  AuthSessionModel,
  CustomerModel,
  EmployeeModel,
  OneTimeTokenModel,
  UserModel,
} from '../identity/identity.model.js';
import { AuditLogModel } from '../operations/operations.model.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AuthError, invalidCredentials } from './auth.errors.js';
import {
  assertAuthConfiguration,
  createCsrfToken,
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  signAccessToken,
  verifyPassword,
} from './auth.crypto.js';
import { emailDeliveryConfigured, sendAccountLink } from './auth.mailer.js';
import type { UserRole } from './auth.types.js';

const dummyPasswordHash = bcrypt.hash(randomBytes(32).toString('hex'), env.BCRYPT_ROUNDS);
const TOKEN_RESET_TTL_MS = 30 * 60 * 1000;
const INVITATION_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

export type PublicUser = {
  id: string;
  email: string;
  role: UserRole;
  status: string;
  mustChangePassword: boolean;
};
export type IssuedSession = {
  user: PublicUser;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  refreshExpiresAt: Date;
};

function publicUser(user: {
  id: string;
  email: string;
  role: UserRole;
  status: string;
  mustChangePassword: boolean;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
  };
}

async function createSession(
  user: { id: string; role: UserRole; email: string },
  familyId: string = randomUUID(),
  familyExpiresAt?: Date,
  userAgent?: string,
): Promise<IssuedSession> {
  assertAuthConfiguration();
  const now = new Date();
  const absoluteExpiry =
    familyExpiresAt ?? new Date(now.getTime() + env.AUTH_SESSION_MAX_DAYS * 24 * 60 * 60 * 1000);
  const refreshExpiresAt = new Date(
    Math.min(
      now.getTime() + env.AUTH_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
      absoluteExpiry.getTime(),
    ),
  );
  const refreshToken = createOpaqueToken();
  const session = await AuthSessionModel.create({
    userId: user.id,
    familyId,
    refreshTokenHash: hashOpaqueToken(refreshToken),
    expiresAt: refreshExpiresAt,
    familyExpiresAt: absoluteExpiry,
    userAgent: userAgent?.slice(0, 300),
    lastUsedAt: now,
  });
  const accessToken = await signAccessToken(user.id, session.id);
  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      status: 'ACTIVE',
      mustChangePassword: false,
    },
    sessionId: session.id,
    accessToken,
    refreshToken,
    csrfToken: createCsrfToken(session.id),
    refreshExpiresAt,
  };
}

export async function login(email: string, password: string, userAgent?: string) {
  assertAuthConfiguration();
  const user = await UserModel.findOne({ email: email.trim().toLowerCase() }).select(
    '+passwordHash',
  );
  const hash = user?.passwordHash ?? (await dummyPasswordHash);
  const passwordMatches = await verifyPassword(password, hash).catch(() => false);
  if (!user || !passwordMatches || user.status !== 'ACTIVE') throw invalidCredentials();
  const session = await createSession(
    { id: user.id, role: user.role as UserRole, email: user.email },
    randomUUID(),
    undefined,
    userAgent,
  );
  await AuditLogModel.create({
    actorUserId: user._id,
    action: 'AUTH_LOGIN',
    entityType: 'User',
    entityId: user._id,
  });
  return { ...session, user: publicUser(user) };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  nextPassword: string,
) {
  assertAuthConfiguration();
  if (currentPassword === nextPassword)
    throw new AuthError(
      400,
      'PASSWORD_UNCHANGED',
      'Choose a new password different from the current one.',
    );
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash).catch(() => false)))
    throw new AuthError(400, 'CURRENT_PASSWORD_INVALID', 'The current password is incorrect.');
  user.passwordHash = await hashPassword(nextPassword);
  user.mustChangePassword = false;
  await user.save();
  await AuthSessionModel.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  await AuditLogModel.create({
    actorUserId: user._id,
    action: 'AUTH_PASSWORD_CHANGED',
    entityType: 'User',
    entityId: user._id,
  });
}

export async function rotateRefreshToken(refreshToken: string, userAgent?: string) {
  assertAuthConfiguration();
  const refreshTokenHash = hashOpaqueToken(refreshToken);
  const session = await AuthSessionModel.findOne({ refreshTokenHash }).select('+refreshTokenHash');
  if (!session)
    throw new AuthError(401, 'INVALID_SESSION', 'Your session has expired. Please sign in again.');
  if (session.revokedAt) {
    if (session.replacedBySessionId) {
      await AuthSessionModel.updateMany(
        { familyId: session.familyId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    }
    throw new AuthError(401, 'INVALID_SESSION', 'Your session has expired. Please sign in again.');
  }

  const now = new Date();
  if (session.expiresAt <= now || session.familyExpiresAt <= now) {
    await AuthSessionModel.updateOne(
      { _id: session._id, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw new AuthError(401, 'INVALID_SESSION', 'Your session has expired. Please sign in again.');
  }
  const user = await UserModel.findById(session.userId);
  if (!user || user.status !== 'ACTIVE') {
    await AuthSessionModel.updateMany(
      { familyId: session.familyId, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw new AuthError(401, 'INVALID_SESSION', 'Your session has expired. Please sign in again.');
  }

  const next = await createSession(
    { id: user.id, role: user.role as UserRole, email: user.email },
    session.familyId,
    session.familyExpiresAt,
    userAgent,
  );
  const rotated = await AuthSessionModel.updateOne(
    { _id: session._id, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now, replacedBySessionId: next.sessionId } },
  );
  if (rotated.modifiedCount !== 1) {
    await AuthSessionModel.updateOne(
      { refreshTokenHash: hashOpaqueToken(next.refreshToken) },
      { $set: { revokedAt: now } },
    );
    await AuthSessionModel.updateMany(
      { familyId: session.familyId, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw new AuthError(401, 'INVALID_SESSION', 'Your session has expired. Please sign in again.');
  }
  return next;
}

export async function revokeRefreshToken(refreshToken: string) {
  await AuthSessionModel.updateOne(
    { refreshTokenHash: hashOpaqueToken(refreshToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function getActiveSession(sessionId: string, userId: string) {
  return AuthSessionModel.findOne({
    _id: sessionId,
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    familyExpiresAt: { $gt: new Date() },
  });
}

export async function loadPublicUser(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user || user.status !== 'ACTIVE') return null;
  return publicUser(user);
}

export async function issuePasswordReset(email: string) {
  const user = await UserModel.findOne({ email: email.trim().toLowerCase(), status: 'ACTIVE' });
  if (!user || !emailDeliveryConfigured()) return;
  await OneTimeTokenModel.updateMany(
    { userId: user._id, purpose: 'PASSWORD_RESET', consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  const token = createOpaqueToken();
  await OneTimeTokenModel.create({
    userId: user._id,
    tokenHash: hashOpaqueToken(token),
    purpose: 'PASSWORD_RESET',
    expiresAt: new Date(Date.now() + TOKEN_RESET_TTL_MS),
  });
  try {
    await sendAccountLink(user.email, 'password reset', token);
  } catch (error) {
    logger.warn(
      { errorName: error instanceof Error ? error.name : 'UnknownError' },
      'Password reset delivery failed',
    );
  }
}

export async function requestEmailChange(
  userId: string,
  targetEmailInput: string,
  actorUserId: string,
) {
  const targetEmail = targetEmailInput.trim().toLowerCase();
  const user = await UserModel.findById(userId);
  if (!user || user.status !== 'ACTIVE')
    throw new AuthError(404, 'CUSTOMER_NOT_FOUND', 'The customer account was not found.');
  const customer = await CustomerModel.findOne({ userId: user._id }).select('_id');
  if (!customer)
    throw new AuthError(404, 'CUSTOMER_NOT_FOUND', 'The customer account was not found.');
  if (user.email === targetEmail) return { status: 'UNCHANGED' as const };
  if (await UserModel.exists({ email: targetEmail }))
    throw new AuthError(409, 'EMAIL_IN_USE', 'That email address is already linked to an account.');
  if (!emailDeliveryConfigured())
    throw new AuthError(503, 'EMAIL_NOT_CONFIGURED', 'Account email delivery is not configured.');

  const token = createOpaqueToken();
  await OneTimeTokenModel.updateMany(
    { userId: user._id, purpose: 'EMAIL_CHANGE', consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  await OneTimeTokenModel.create({
    userId: user._id,
    tokenHash: hashOpaqueToken(token),
    purpose: 'EMAIL_CHANGE',
    targetEmail,
    expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
  });
  try {
    await sendAccountLink(targetEmail, 'email change', token);
  } catch {
    await OneTimeTokenModel.updateOne(
      { tokenHash: hashOpaqueToken(token), purpose: 'EMAIL_CHANGE', consumedAt: null },
      { $set: { consumedAt: new Date() } },
    );
    throw new AuthError(503, 'EMAIL_DELIVERY_FAILED', 'The confirmation email could not be sent.');
  }
  await AuditLogModel.create({
    actorUserId,
    action: 'CUSTOMER_EMAIL_CHANGE_REQUESTED',
    entityType: 'Customer',
    entityId: customer._id,
    metadata: { confirmationExpiresInHours: 24 },
  });
  return { status: 'CONFIRMATION_SENT' as const };
}

export async function confirmEmailChange(token: string) {
  const tokenHash = hashOpaqueToken(token);
  const now = new Date();
  const pending = await OneTimeTokenModel.findOne({
    tokenHash,
    purpose: 'EMAIL_CHANGE',
    consumedAt: null,
    expiresAt: { $gt: now },
  });
  if (!pending?.targetEmail)
    throw new AuthError(
      400,
      'INVALID_EMAIL_CHANGE',
      'This email confirmation link is invalid or expired.',
    );

  const targetEmail = pending.targetEmail.trim().toLowerCase();
  if (await UserModel.exists({ email: targetEmail, _id: { $ne: pending.userId } }))
    throw new AuthError(409, 'EMAIL_IN_USE', 'That email address is already linked to an account.');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const consumed = await OneTimeTokenModel.findOneAndUpdate(
        { _id: pending._id, consumedAt: null, expiresAt: { $gt: now } },
        { $set: { consumedAt: now } },
        { new: false, session },
      );
      if (!consumed)
        throw new AuthError(
          400,
          'INVALID_EMAIL_CHANGE',
          'This email confirmation link is invalid or expired.',
        );
      const updatedUser = await UserModel.findOneAndUpdate(
        { _id: pending.userId, status: 'ACTIVE' },
        { $set: { email: targetEmail } },
        { returnDocument: 'after', session },
      );
      if (!updatedUser)
        throw new AuthError(
          400,
          'INVALID_EMAIL_CHANGE',
          'This email confirmation link is invalid or expired.',
        );
      await CustomerModel.updateOne(
        { userId: pending.userId },
        { $set: { email: targetEmail } },
        { session },
      );
      await AuthSessionModel.updateMany(
        { userId: pending.userId, revokedAt: null },
        { $set: { revokedAt: now } },
        { session },
      );
      const customer = await CustomerModel.findOne({ userId: pending.userId })
        .select('_id')
        .session(session);
      if (!customer)
        throw new AuthError(
          400,
          'INVALID_EMAIL_CHANGE',
          'This email confirmation link is invalid or expired.',
        );
      await AuditLogModel.create(
        [
          {
            actorUserId: pending.userId,
            action: 'CUSTOMER_EMAIL_CHANGED',
            entityType: 'Customer',
            entityId: customer._id,
          },
        ],
        { session },
      );
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw new AuthError(
        409,
        'EMAIL_IN_USE',
        'That email address is already linked to an account.',
      );
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function resetPassword(token: string, password: string) {
  const now = new Date();
  const consumed = await OneTimeTokenModel.findOneAndUpdate(
    {
      tokenHash: hashOpaqueToken(token),
      purpose: 'PASSWORD_RESET',
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
    { new: false },
  );
  if (!consumed)
    throw new AuthError(
      400,
      'INVALID_RESET_TOKEN',
      'This password reset link is invalid or expired.',
    );
  const passwordHash = await hashPassword(password);
  await UserModel.updateOne(
    { _id: consumed.userId, status: 'ACTIVE' },
    { $set: { passwordHash, mustChangePassword: false } },
  );
  await AuthSessionModel.updateMany(
    { userId: consumed.userId, revokedAt: null },
    { $set: { revokedAt: now } },
  );
}

export async function acceptInvitation(token: string, password: string, userAgent?: string) {
  assertAuthConfiguration();
  const now = new Date();
  const consumed = await OneTimeTokenModel.findOneAndUpdate(
    {
      tokenHash: hashOpaqueToken(token),
      purpose: 'INVITATION',
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { consumedAt: now } },
    { new: false },
  );
  if (!consumed)
    throw new AuthError(400, 'INVALID_INVITATION', 'This invitation link is invalid or expired.');
  const passwordHash = await hashPassword(password);
  const user = await UserModel.findOneAndUpdate(
    { _id: consumed.userId, status: 'INVITED' },
    { $set: { passwordHash, status: 'ACTIVE', mustChangePassword: false } },
    { returnDocument: 'after' },
  );
  if (!user)
    throw new AuthError(400, 'INVALID_INVITATION', 'This invitation link is invalid or expired.');
  await AuditLogModel.create({
    actorUserId: user._id,
    action: 'AUTH_INVITATION_ACCEPTED',
    entityType: 'User',
    entityId: user._id,
  });
  return createSession(
    { id: user.id, role: user.role as UserRole, email: user.email },
    randomUUID(),
    undefined,
    userAgent,
  );
}

export async function createInvitation(
  input: {
    email: string;
    displayName: string;
    role: 'EMPLOYEE' | 'CUSTOMER';
    phone?: string;
    permissions?: string[];
    assignedEmployeeIds?: string[];
    primaryEmployeeId?: string;
  },
  actorUserId: string,
) {
  if (!emailDeliveryConfigured())
    throw new AuthError(503, 'EMAIL_NOT_CONFIGURED', 'Account email delivery is not configured.');
  const email = input.email.trim().toLowerCase();
  if (await UserModel.exists({ email }))
    throw new AuthError(409, 'ACCOUNT_EXISTS', 'An account already exists for this email address.');
  const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
  const user = await UserModel.create({
    email,
    passwordHash,
    role: input.role,
    status: 'INVITED',
    mustChangePassword: true,
  });
  try {
    let profileId: string;
    if (input.role === 'EMPLOYEE') {
      const employee = await EmployeeModel.create({
        userId: user._id,
        displayName: input.displayName,
        phone: input.phone,
        permissions: input.permissions ?? [],
      });
      profileId = employee.id;
    } else {
      const customer = await CustomerModel.create({
        userId: user._id,
        displayName: input.displayName,
        email,
        phone: input.phone,
        assignedEmployeeIds: input.assignedEmployeeIds,
        primaryEmployeeId: input.primaryEmployeeId,
      });
      profileId = customer.id;
    }
    const token = createOpaqueToken();
    await OneTimeTokenModel.create({
      userId: user._id,
      tokenHash: hashOpaqueToken(token),
      purpose: 'INVITATION',
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });
    await sendAccountLink(email, 'invitation', token);
    await AuditLogModel.create({
      actorUserId: actorUserId,
      action: 'AUTH_INVITATION_SENT',
      entityType: input.role === 'EMPLOYEE' ? 'Employee' : 'Customer',
      entityId: profileId,
    });
    return {
      id: user.id,
      profileId,
      email: user.email,
      role: user.role,
      invitationExpiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    };
  } catch (error) {
    await Promise.all([
      UserModel.deleteOne({ _id: user._id, status: 'INVITED' }),
      EmployeeModel.deleteOne({ userId: user._id }),
      CustomerModel.deleteOne({ userId: user._id }),
      OneTimeTokenModel.deleteMany({ userId: user._id, purpose: 'INVITATION' }),
    ]);
    throw error;
  }
}

export async function setAccountStatus(
  userId: string,
  status: 'ACTIVE' | 'SUSPENDED',
  actorUserId: string,
) {
  const existingUser = await UserModel.findById(userId);
  if (!existingUser)
    throw new AuthError(404, 'USER_NOT_FOUND', 'The requested account was not found.');
  if (existingUser.status === 'INVITED' && status === 'ACTIVE') {
    throw new AuthError(
      409,
      'INVITATION_PENDING',
      'The account must be activated through its invitation link.',
    );
  }
  const user = await UserModel.findByIdAndUpdate(
    userId,
    { $set: { status } },
    { returnDocument: 'after' },
  );
  if (!user) throw new AuthError(404, 'USER_NOT_FOUND', 'The requested account was not found.');
  if (status === 'SUSPENDED')
    await AuthSessionModel.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  await AuditLogModel.create({
    actorUserId,
    action: status === 'ACTIVE' ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
    entityType: 'User',
    entityId: user._id,
  });
  return publicUser(user);
}

export async function verifyRawPassword(password: string, passwordHash: string) {
  try {
    return await verifyPassword(password, passwordHash);
  } catch {
    return false;
  }
}
