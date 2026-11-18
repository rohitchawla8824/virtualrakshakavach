import type { RequestHandler } from 'express';
import {
  listAssignableEmployees,
  getOwnEmployeeProfile,
  updateOwnEmployeeProfile,
} from './employee.service.js';
import { AuthError } from '../auth/auth.errors.js';

export const listAssignableEmployeesController: RequestHandler = async (request, response) => {
  const { page, limit } = request.query as unknown as { page: number; limit: number };
  response.status(200).json(await listAssignableEmployees(page, limit));
};

function auth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) throw new AuthError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return request.auth;
}

export const ownEmployeeProfileController: RequestHandler = async (request, response) => {
  response.status(200).json({ profile: await getOwnEmployeeProfile(auth(request)) });
};

export const updateOwnEmployeeProfileController: RequestHandler = async (request, response) => {
  response
    .status(200)
    .json({ profile: await updateOwnEmployeeProfile(request.body, auth(request)) });
};
