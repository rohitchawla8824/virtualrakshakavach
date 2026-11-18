# Database and Environment Guide

## MongoDB Atlas setup

1. Create a MongoDB Atlas project and database user with the minimum privileges needed for the
   development database. Do not use an Atlas administrator account as the application user.
2. Restrict the Atlas network access list to the developer's current IP for local work. Avoid
   `0.0.0.0/0` for a real database.
3. Copy `server/.env.example` to `server/.env` and replace the URI placeholders locally. URL-encode
   reserved characters in database usernames/passwords. Never paste the URI into source code,
   screenshots, chat, or a committed file.
4. Start with `npm run dev:server`. `GET /api/v1/health` reports process liveness;
   `GET /api/v1/health/ready` reports whether the MongoDB connection is ready.
5. Back up production data and validate restore procedures before relying on Atlas backups. Public
   free-tier/demo hosting is not automatically appropriate for financial production data.

The server uses Mongoose. When `MONGODB_URI` is present, it connects before opening the HTTP listener.
In local development, the URI can be omitted to run API liveness and non-database tests; readiness is
then `503`. Production configuration requires the URI. Connection errors are logged server-side and
are never returned to API clients. Auto-indexing is enabled outside production and disabled in
production; review production index changes before applying them.

## Environment variables

| Variable                                        | Required          | Purpose                                                                                        |
| ----------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                      | No                | `development`, `test`, or `production`; defaults to development                                |
| `HOST`                                          | No                | Bind address; defaults to `127.0.0.1`                                                          |
| `PORT`                                          | No                | HTTP port; defaults to `4000`                                                                  |
| `MONGODB_URI`                                   | Production        | Private Atlas connection URI; optional only for local development without database-backed work |
| `JWT_ACCESS_SECRET`                             | Auth / production | Random secret of at least 32 characters; generate with the command in `server/.env.example`    |
| `AUTH_ACCESS_TTL_SECONDS`                       | No                | Access token lifetime; defaults to 900 seconds                                                 |
| `AUTH_REFRESH_TTL_DAYS`                         | No                | Refresh token rotation lifetime; defaults to 7 days                                            |
| `AUTH_SESSION_MAX_DAYS`                         | No                | Absolute session-family lifetime; defaults to 30 days                                          |
| `BCRYPT_ROUNDS`                                 | No                | Password hash cost; defaults to 12, permitted range 10–15                                      |
| `FRONTEND_URL`                                  | Email links       | Base URL for invitation/reset links; defaults to the local Vite frontend                       |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`           | Production        | SMTP transport settings; production requires a host                                            |
| `SMTP_USER`/`SMTP_PASSWORD`                     | No                | Optional SMTP authentication; keep credentials only in local/server secret storage             |
| `SMTP_FROM`                                     | Production        | Verified sender address for invitations and password reset                                     |
| `CORS_ORIGINS`                                  | Production        | Comma-separated deployed browser origins; local origins are rejected in production             |
| `CORS_ORIGINS`                                  | No                | Defaults to the two local Vite origins in development                                          |
| `LOG_LEVEL`                                     | No                | Pino level; defaults to `info`                                                                 |
| `RATE_LIMIT_WINDOW_MS`                          | No                | API rate-limit window in milliseconds; defaults to `60000`                                     |
| `RATE_LIMIT_MAX`                                | No                | Maximum API requests per client/IP per window; defaults to `120`                               |
| `ENABLE_DEV_SEED`                               | No                | Must be explicitly set to `true` along with `NODE_ENV=development` to allow seed fixtures      |
| RAZORPAY_TEST_KEY_ID / RAZORPAY_TEST_KEY_SECRET | Online checkout   | Optional Test Mode credentials; server-only, never add to client environment                   |
| RAZORPAY_TEST_WEBHOOK_SECRET                    | Webhook delivery  | Optional secret shared with the Test Mode webhook configuration                                |

Environment variables are parsed by Zod at startup. In production, missing required database,
authentication, email, and deployed-origin configuration prevents startup. Client environment
values must never contain server credentials.

## Initial collections and ownership

Schemas live beside their owning modules under `server/src/modules`. Mongoose pluralizes collection
names by default.

| Collection           | Initial fields/relationships                                                                                                                                                   | Important indexes                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `users`              | Email, password hash (excluded from normal queries), role, account status, first-login change flag                                                                             | Unique normalized email; role/status                             |
| `authSessions`       | User, session family, hashed refresh token, expiry/revocation/rotation metadata                                                                                                | Unique refresh hash; user/active lookup; expiry TTL              |
| `oneTimeTokens`      | User, invitation/password-reset/email-change purpose, hashed token, optional target email and expiry                                                                           | Unique token hash; purpose/expiry lookup; expiry TTL             |
| `employees`          | User reference, display name, optional phone, permissions, status                                                                                                              | Unique user; status/name                                         |
| `customers`          | Optional user reference, display name/contact, assigned employee refs, primary employee ref, status                                                                            | User; employee assignments; primary employee                     |
| `categories`         | Name, PRODUCT/SERVICE kind, active/archived status                                                                                                                             | Unique name/kind; status/kind                                    |
| `products`           | Name, PHYSICAL/SERVICE type, category/SKU, description/image URL, integer paise purchase/selling price, physical stock quantity, INR currency, active/inactive/archived status | Sparse unique SKU; category/status                               |
| `plans`              | Name/description, standard or custom duration days, integer paise price, INR currency, status                                                                                  | Name/status                                                      |
| `subscriptions`      | Customer/plan/invoice refs, status, period dates, period number, previous period, idempotency key                                                                              | Customer/status/end; expiry scan; unique renewal key             |
| `subscriptionEvents` | Subscription/user refs, event type, timestamp and metadata                                                                                                                     | Subscription/time; unique expiry reminder date                   |
| `invoices`           | Customer/subscription refs, number, source key, dates, immutable line snapshots, discounts/tax and integer-paise totals                                                        | Unique invoice number/source key; customer/date; status/due date |
| `invoiceCounters`    | Asia/Kolkata monthly invoice-number sequence                                                                                                                                   | Unique period                                                    |
| `taxConfigurations`  | Generic label, integer basis-point rate, inclusive/exclusive mode, active state                                                                                                | Active lookup                                                    |
| `payments`           | Customer, integer paise, INR, method/status, idempotency key, recorder                                                                                                         | Unique idempotency key; customer/date; status/date               |
| `paymentAllocations` | Payment/invoice refs, integer paise, allocator                                                                                                                                 | Unique payment/invoice pair; invoice history                     |
| `refunds`            | Payment ref, integer paise, reason, request/approval users, state                                                                                                              | Payment history; approval queue                                  |
| `notifications`      | User, in-app/email channel, type/status, schedule, attempts, delivery timestamps/error code, deduplication key                                                                 | User/status/date; delivery queue; unique deduplication key       |
| `auditLogs`          | Actor, action, entity ref, request ID, metadata                                                                                                                                | Entity history; actor history                                    |
| `webhookEvents`      | Provider, provider event ID/type, processing status                                                                                                                            | Unique provider/event ID; processing queue                       |
| `razorpayOrders`     | Customer/invoice, idempotency key, provider IDs, integer-paise amount, checkout state                                                                                          | Unique order, customer/request key and provider payment indexes  |

Password hashes use bcrypt and are excluded from normal Mongoose projections. Access JWTs are short
lived; refresh secrets are opaque, rotate on use, and only their SHA-256 hashes are stored. Session
families have an absolute expiry. Invitation and reset token records store one-way hashes only.

Amounts are represented in integer paise. Schema indexes are declared close to the models. Cross-
document consistency, authorization, immutable transaction workflows, and business validation belong
in services and will be implemented with their feature phases; a Mongoose reference alone is not an
authorization or integrity check. GST applicability and actual tax fields/calculations remain pending
client/accountant confirmation.

## Development seed safeguard

`npm run seed:dev` can insert two categories labelled `DEMO ONLY` for local catalogue development.
It creates no users, customers, passwords, payments, or invoices. It refuses to run unless both
`NODE_ENV=development` and `ENABLE_DEV_SEED=true` are set and a MongoDB URI is configured. Disable
the flag again after the one-time run. Never point a development seed at production data.

## API and error conventions

- API base path: `/api/v1`; health endpoints are `/health` and `/health/ready`.
- Validate body, query, and path input with Zod middleware before controllers call services.
- Controllers only translate HTTP input/output; services own workflows; Mongoose models define
  storage, validation, and indexes.
- Errors use `{ "error": { "code": "...", "message": "..." } }`. Validation errors may include
  safe field paths. Server errors never expose stacks, credentials, or raw database errors.
- Helmet, configured-origin credentialed CORS, request IDs, redacted structured request logs, and
  API rate limits apply centrally.

## Razorpay test-mode configuration

`RAZORPAY_TEST_KEY_ID` (Test Mode key ID with an `rzp_test_` prefix), `RAZORPAY_TEST_KEY_SECRET`, and `RAZORPAY_TEST_WEBHOOK_SECRET` are optional. Leave them blank to disable online checkout. Secret values stay server-side. Copy the complete `server/.env.example` template to the ignored `server/.env`; never set secrets under `VITE_` names. Live key prefixes are rejected. See [the safe sandbox smoke test](api-specification.md#razorpay-online-checkout-test-mode-only).
