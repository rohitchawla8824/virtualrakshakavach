import type { RequestHandler } from 'express';
import { AuthSessionModel } from '../identity/identity.model.js';
import { AuthError } from './auth.errors.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  clearAuthCookies,
  refreshCookieOptions,
} from './auth.cookies.js';
import { createCsrfToken, hashOpaqueToken } from './auth.crypto.js';
import {
  acceptInvitation,
  confirmEmailChange,
  createInvitation,
  changePassword,
  issuePasswordReset,
  loadPublicUser,
  login,
  resetPassword,
  requestEmailChange,
  revokeRefreshToken,
  rotateRefreshToken,
  setAccountStatus,
} from './auth.service.js';

function setSessionCookies(
  response: Parameters<RequestHandler>[1],
  session: Awaited<ReturnType<typeof login>>,
) {
  response.cookie(ACCESS_COOKIE, session.accessToken, accessCookieOptions);
  response.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...refreshCookieOptions,
    maxAge: session.refreshExpiresAt.getTime() - Date.now(),
  });
}

export const loginController: RequestHandler = async (request, response) => {
  const session = await login(request.body.email, request.body.password, request.get('user-agent'));
  setSessionCookies(response, session);
  response.status(200).json({ user: session.user, csrfToken: session.csrfToken });
};

export const changePasswordController: RequestHandler = async (request, response) => {
  if (!request.auth) throw new AuthError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  await changePassword(request.auth.userId, request.body.currentPassword, request.body.password);
  clearAuthCookies(response);
  response.status(204).end();
};

export const refreshController: RequestHandler = async (request, response) => {
  const refreshToken = request.cookies[REFRESH_COOKIE] as string;
  const session = await rotateRefreshToken(refreshToken, request.get('user-agent'));
  setSessionCookies(response, session);
  response.status(200).json({ user: session.user, csrfToken: session.csrfToken });
};

export const csrfController: RequestHandler = async (request, response) => {
  const refreshToken = request.cookies[REFRESH_COOKIE] as string | undefined;
  const session = refreshToken
    ? await AuthSessionModel.findOne({
        refreshTokenHash: hashOpaqueToken(refreshToken),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
        familyExpiresAt: { $gt: new Date() },
      })
    : request.auth
      ? await AuthSessionModel.findOne({
          _id: request.auth.sessionId,
          userId: request.auth.userId,
          revokedAt: null,
          expiresAt: { $gt: new Date() },
        })
      : null;
  if (!session) throw new AuthError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  response.status(200).json({ csrfToken: createCsrfToken(session.id) });
};

export const logoutController: RequestHandler = async (request, response) => {
  const refreshToken = request.cookies?.[REFRESH_COOKIE];
  if (typeof refreshToken === 'string') await revokeRefreshToken(refreshToken);
  else if (request.auth)
    await AuthSessionModel.updateOne(
      { _id: request.auth.sessionId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  clearAuthCookies(response);
  response.setHeader('Clear-Site-Data', '"cache"');
  response.status(204).end();
};

export const currentUserController: RequestHandler = async (request, response) => {
  const user = await loadPublicUser(request.auth!.userId);
  if (!user) throw new AuthError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  response.status(200).json({
    user: { ...user, permissions: request.auth!.permissions },
  });
};

export const forgotPasswordController: RequestHandler = async (request, response) => {
  await issuePasswordReset(request.body.email);
  response.status(202).json({
    message: 'If an active account uses that address, password reset instructions will be sent.',
  });
};

export const resetPasswordController: RequestHandler = async (request, response) => {
  await resetPassword(request.body.token, request.body.password);
  clearAuthCookies(response);
  response.status(204).end();
};

export const requestEmailChangeController: RequestHandler = async (request, response) => {
  const result = await requestEmailChange(
    request.body.userId,
    request.body.email,
    request.auth!.userId,
  );
  response.status(202).json({ result });
};

export const confirmEmailChangeController: RequestHandler = async (request, response) => {
  await confirmEmailChange(request.body.token);
  clearAuthCookies(response);
  response.status(200).json({ message: 'Email address confirmed. Please sign in again.' });
};

export const createInvitationController: RequestHandler = async (request, response) => {
  const invitation = await createInvitation(request.body, request.auth!.userId);
  response.status(201).json({ invitation });
};

export const acceptInvitationController: RequestHandler = async (request, response) => {
  const session = await acceptInvitation(
    request.body.token,
    request.body.password,
    request.get('user-agent'),
  );
  setSessionCookies(response, session);
  response.status(200).json({ user: session.user, csrfToken: session.csrfToken });
};

export const setAccountStatusController: RequestHandler = async (request, response) => {
  const user = await setAccountStatus(
    String(request.params.userId),
    request.body.status,
    request.auth!.userId,
  );
  response.status(200).json({ user });
};
