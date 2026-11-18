import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { z } from 'zod';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const optionalEnvString = (schema: z.ZodType<string>) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema.optional(),
  );

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    MONGODB_URI: optionalEnvString(z.string().trim().min(1)),
    JWT_ACCESS_SECRET: optionalEnvString(z.string().min(32)),
    AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    AUTH_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    AUTH_SESSION_MAX_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    FRONTEND_URL: z.string().url().default('http://127.0.0.1:5173'),
    SMTP_HOST: optionalEnvString(z.string().trim().min(1)),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_USER: optionalEnvString(z.string().trim()),
    SMTP_PASSWORD: optionalEnvString(z.string()),
    SMTP_FROM: optionalEnvString(z.string().trim().min(3)),
    CORS_ORIGINS: z.string().default('http://127.0.0.1:5173,http://localhost:5173'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
    ENABLE_DEV_SEED: z.enum(['true', 'false']).default('false'),
    RAZORPAY_TEST_KEY_ID: optionalEnvString(z.string().regex(/^rzp_test_[A-Za-z0-9]+$/)),
    RAZORPAY_TEST_KEY_SECRET: optionalEnvString(z.string().min(1)),
    RAZORPAY_TEST_WEBHOOK_SECRET: optionalEnvString(z.string().min(1)),
  })
  .superRefine((values, context) => {
    if (values.RAZORPAY_TEST_KEY_ID && !values.RAZORPAY_TEST_KEY_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['RAZORPAY_TEST_KEY_SECRET'],
        message: 'RAZORPAY_TEST_KEY_SECRET is required when the test key ID is configured.',
      });
    }
    if (values.NODE_ENV === 'production' && !values.MONGODB_URI) {
      context.addIssue({
        code: 'custom',
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI is required in production.',
      });
    }
    if (values.NODE_ENV === 'production' && !values.JWT_ACCESS_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET is required in production.',
      });
    }
    if (values.NODE_ENV === 'production' && (!values.SMTP_HOST || !values.SMTP_FROM)) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST and SMTP_FROM are required in production for account recovery emails.',
      });
    }
    const corsOrigins = values.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (values.NODE_ENV === 'production' && corsOrigins.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'At least one deployed browser origin must be configured in production.',
      });
    }
    if (
      values.NODE_ENV === 'production' &&
      corsOrigins.some((origin) => /localhost|127\.0\.0\.1/.test(origin))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Production CORS origins must be explicitly set to deployed application origins.',
      });
    }
    if (values.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(values.FRONTEND_URL)) {
      context.addIssue({
        code: 'custom',
        path: ['FRONTEND_URL'],
        message: 'FRONTEND_URL must point to the deployed application in production.',
      });
    }
  });

const result = environmentSchema.safeParse(process.env);
if (!result.success) {
  const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid server environment configuration: ${issues.join('; ')}`);
}

export const env = result.data;
