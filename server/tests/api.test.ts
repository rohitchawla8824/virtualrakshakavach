import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import express from 'express';
import { z } from 'zod';
import { app } from '../src/app.js';
import { logger } from '../src/config/logger.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { validateRequest } from '../src/middleware/validate-request.js';
import { CategoryModel } from '../src/modules/catalogue/catalogue.model.js';
import { PaymentModel } from '../src/modules/finance/finance.model.js';

describe('API foundation', () => {
  logger.level = 'silent';
  afterAll(async () => mongoose.disconnect());

  it('serves the versioned liveness endpoint without database credentials', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'virtual-raksha-kavach-api' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('does not grant credentialed CORS access to an unapproved origin', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://unapproved-origin.invalid');

    expect(response.status).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('reports database readiness separately from process liveness', async () => {
    const response = await request(app).get('/api/v1/health/ready');
    expect([200, 503]).toContain(response.status);
    expect(response.body.checks).toHaveProperty('database');
  });

  it('returns a safe structured 404 for unknown paths', async () => {
    const response = await request(app).get('/api/v1/not-a-real-module');
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects malformed JSON bodies', async () => {
    const response = await request(app)
      .post('/api/v1/unknown')
      .set('Content-Type', 'application/json')
      .send('{invalid');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('validates request bodies before a controller runs', async () => {
    const validationApp = express();
    validationApp.use(express.json());
    validationApp.post(
      '/checked',
      validateRequest({ body: z.object({ name: z.string().min(2) }) }),
      (request, response) => {
        response.json({ received: request.body });
      },
    );
    validationApp.use(errorHandler);

    const rejected = await request(validationApp).post('/checked').send({ name: 'x' });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe('VALIDATION_ERROR');

    const accepted = await request(validationApp).post('/checked').send({ name: 'Valid name' });
    expect(accepted.status).toBe(200);
    expect(accepted.body.received.name).toBe('Valid name');
  });

  it('validates and replaces Express 5 query getter values without a server error', async () => {
    const validationApp = express();
    validationApp.get(
      '/checked',
      validateRequest({
        query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
      }),
      (request, response) => {
        response.json({ received: request.query });
      },
    );
    validationApp.use(errorHandler);

    const accepted = await request(validationApp).get('/checked?page=2');
    expect(accepted.status).toBe(200);
    expect(accepted.body.received).toEqual({ page: 2 });

    const defaulted = await request(validationApp).get('/checked');
    expect(defaulted.status).toBe(200);
    expect(defaulted.body.received).toEqual({ page: 1 });
  });

  it('declares unique and lookup indexes in initial models', () => {
    const categoryIndexes = CategoryModel.schema.indexes();
    const paymentIndexes = PaymentModel.schema.indexes();
    expect(categoryIndexes.some(([keys, options]) => keys.name === 1 && options.unique)).toBe(true);
    expect(
      paymentIndexes.some(([keys, options]) => keys.idempotencyKey === 1 && options.unique),
    ).toBe(true);
  });
});
