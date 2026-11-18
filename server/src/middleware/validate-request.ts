import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

type RequestSchemas = {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
};

export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (request, _response, next) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(request[key]);
      if (!result.success) {
        next(result.error);
        return;
      }
      Object.defineProperty(request, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: result.data,
      });
    }
    next();
  };
}
