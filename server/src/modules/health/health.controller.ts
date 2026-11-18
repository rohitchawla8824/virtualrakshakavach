import type { RequestHandler } from 'express';
import { getLiveness, getReadiness } from './health.service.js';

export const livenessController: RequestHandler = (_request, response) => {
  response.status(200).json(getLiveness());
};

export const readinessController: RequestHandler = (_request, response) => {
  const readiness = getReadiness();
  response.status(readiness.ready ? 200 : 503).json(readiness);
};
