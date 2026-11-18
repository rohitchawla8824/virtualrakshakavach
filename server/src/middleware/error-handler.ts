import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  const error = Object.assign(new Error(`No route for ${request.method} ${request.path}`), {
    statusCode: 404,
    code: 'NOT_FOUND',
  });
  next(error);
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  void _next;
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: error.issues.map(({ path, message }) => ({ path: path.join('.'), message })),
      },
    });
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    response
      .status(400)
      .json({ error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' } });
    return;
  }

  const candidate = error as { statusCode?: number; code?: string; message?: string };
  const statusCode =
    candidate.statusCode && candidate.statusCode >= 400 && candidate.statusCode < 500
      ? candidate.statusCode
      : 500;
  const code = statusCode === 404 ? 'NOT_FOUND' : (candidate.code ?? 'INTERNAL_SERVER_ERROR');
  if (statusCode >= 500)
    logger.error(
      {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorCode: candidate.code,
        requestId: request.id,
      },
      'Unhandled request error',
    );
  response.status(statusCode).json({
    error: {
      code,
      message:
        statusCode === 404
          ? 'The requested endpoint was not found.'
          : statusCode >= 500
            ? 'An unexpected server error occurred.'
            : (candidate.message ?? 'The request could not be processed.'),
    },
  });
};
