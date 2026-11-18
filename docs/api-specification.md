# API Specification

## Base and current behavior

The REST API will use `/api/v1`. The only implemented business-independent endpoint in the current
foundation is:

### `GET /api/v1/health`

Returns HTTP `200` when the Express process is responding.

```json
{
  "status": "ok",
  "service": "virtual-raksha-kavach-api",
  "timestamp": "2026-11-15T00:00:00.000Z"
}
```

This is a process liveness check; it does not claim that a database, payment gateway, or other
downstream service is ready.

### `GET /api/v1/health/ready`

Returns `200` when MongoDB is connected and `503` when it is unavailable or not configured. The
response identifies dependency state without including a connection URI or database error details.

## Implemented authentication endpoints

All routes below use `/api/v1/auth`. Access and refresh tokens are delivered only in HttpOnly
cookies; neither token is returned in JSON. Authenticated state-changing requests require the
`x-csrf-token` header. Access is checked against the active user and session records on every request.

| Method and path                    | Access                                      | Behavior                                                                                              |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST /auth/login`                 | Public, rate limited                        | Email/password login; returns safe user data and a CSRF token; sets access and refresh cookies        |
| `POST /auth/logout`                | Refresh cookie + CSRF when a session exists | Revokes the refresh session and clears auth cookies                                                   |
| `POST /auth/refresh`               | Refresh cookie + CSRF                       | Rotates the refresh secret and issues a new access cookie                                             |
| `GET /auth/csrf`                   | Refresh cookie                              | Returns a session-bound CSRF token to the same-origin frontend                                        |
| `GET /auth/me`                     | Authenticated                               | Returns the database-backed active user, role, and server-loaded employee permissions                 |
| `POST /auth/forgot-password`       | Public, rate limited                        | Sends a one-time email link when an active account exists; response does not reveal account existence |
| `POST /auth/reset-password`        | One-time reset token                        | Sets a new password and revokes all existing sessions                                                 |
| `POST /auth/invitations`           | Admin + CSRF                                | Creates Employee/Customer and emails approved 24-hour setup link                                      |
| `POST /auth/invitations/accept`    | One-time invitation token                   | Sets first password, activates the account, and starts a session                                      |
| `PATCH /auth/users/:userId/status` | Admin + CSRF                                | Activates a suspended account or suspends an account and revokes sessions                             |

Customer self-registration is disabled; account creation is invite-only. Invitation links expire after
24 hours as approved on 2026-11-15. A resend endpoint is not implemented because resend limits remain
pending. Password-reset links expire after the technical security window configured in the auth
service (30 minutes).

Session defaults are configurable: access JWT 15 minutes, refresh token 7 days, and absolute session
family limit 30 days. Refresh token use rotates the opaque token; reuse of a rotated token revokes its
session family. Production cookies require HTTPS and use Secure, HttpOnly and SameSite Strict flags.

Unknown paths return HTTP `404` with a stable error code and safe message. Unexpected errors return
HTTP `500` without stack traces or secret values in the response.

## Customer management endpoints

All customer routes require an active session and validate input with Zod. State-changing routes
require the session-bound `x-csrf-token`. Customer list and detail responses never include login
passwords, session identifiers, or invitation/reset tokens.

| Method and path                                                                       | Access                                                          | Behavior                                                                                                                              |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /customers`                                                                      | Admin; Employee with `customers:read`                           | Search by name/email/phone; filter by active/archive status; paginate. Employees see assigned customers only.                         |
| `POST /customers`                                                                     | Admin; Employee with `customers:create`                         | Creates customer profile and sends the 24-hour account invitation. Employee-created customer is assigned to that employee as primary. |
| `GET /customers/:customerId`                                                          | Admin; assigned Employee with `customers:read`; owning Customer | Customer details and financial summary derived from invoice/payment/allocation records.                                               |
| `PATCH /customers/:customerId`                                                        | Admin; assigned Employee with `customers:update`                | Updates name/phone; Admin can update employee assignments and primary assignment. Email changes use a confirmation link.              |
| `DELETE /customers/:customerId`                                                       | Admin                                                           | Archives profile, suspends customer account and revokes active sessions. No customer history is deleted.                              |
| `GET /customers/:customerId/subscriptions`                                            | Admin; assigned Employee with `customers:read`; owning Customer | Paginated subscription records for the customer.                                                                                      |
| `GET /customers/:customerId/invoices`                                                 | Admin; assigned Employee with `customers:read`; owning Customer | Paginated invoice records.                                                                                                            |
| `GET /customers/:customerId/payments`                                                 | Admin; assigned Employee with `customers:read`; owning Customer | Paginated payment records.                                                                                                            |
| `GET /customers/me`                                                                   | Customer                                                        | Own profile and financial summary; the customer ID is derived from the session.                                                       |
| `GET /customers/me/subscriptions`, `/customers/me/invoices`, `/customers/me/payments` | Customer                                                        | Paginated records for the authenticated customer's own account.                                                                       |
| `PATCH /customers/me`                                                                 | Customer                                                        | Updates own display name and phone.                                                                                                   |
| `POST /customers/me/email-change`                                                     | Customer                                                        | Sends a 24-hour confirmation link to the proposed new login address.                                                                  |
| `POST /customers/:customerId/email-change`                                            | Admin; assigned Employee with `customers:update`                | Requests email change for the specified customer; new address remains pending until confirmed.                                        |
| `POST /auth/email-change/confirm`                                                     | One-time token                                                  | Confirms new address, updates the customer login/profile atomically, and revokes active sessions.                                     |
| `GET /employees/assignable`                                                           | Admin                                                           | Returns a paginated, minimal list of active employees for assignment controls.                                                        |

Employees and customer self-service may directly edit only display name and phone. Email remains the
login identifier and is never directly overwritten: an authorized email-change request sends a
confirmation link to the new address that expires after 24 hours, and successful confirmation revokes
existing sessions. Employee assignment changes are Admin-only. The `primaryEmployeeId`, when present,
must be among the active assigned employees. Archiving is soft and preserves linked invoices,
payments, and history.

## Product and service catalogue endpoints

All endpoints require an authenticated Admin or appropriately permissioned Employee. Customers are
denied. Mutating requests require the session-bound CSRF header. Employee permissions are
`products:read`, `products:create`, `products:update`, `products:archive`; category changes require
`categories:manage`. List endpoints accept `q`, filters, `page`, and `limit` and return items plus
pagination metadata.

| Method and path                     | Access                                   | Behavior                                                                                                                                              |
| ----------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /products`                     | Admin; Employee with `products:read`     | Search/filter/paginate by text, type, status, and category.                                                                                           |
| `POST /products`                    | Admin; Employee with `products:create`   | Create PHYSICAL or SERVICE item; prices are non-negative safe integer paise; PHYSICAL requires non-negative integer stock; SERVICE cannot have stock. |
| `GET /products/:productId`          | Admin; Employee with `products:read`     | Return one product and category.                                                                                                                      |
| `PATCH /products/:productId`        | Admin; Employee with `products:update`   | Update allowed catalogue fields and record before/after audit history.                                                                                |
| `PATCH /products/:productId/status` | Admin; Employee with `products:update`   | Set ACTIVE or INACTIVE.                                                                                                                               |
| `DELETE /products/:productId`       | Admin; Employee with `products:archive`  | Soft archive; historical records remain intact.                                                                                                       |
| `GET /products/:productId/history`  | Admin; Employee with `products:read`     | Paginated audit history.                                                                                                                              |
| `GET /categories`                   | Admin; Employee with `products:read`     | Search/filter/paginate categories by name, kind, status.                                                                                              |
| `POST /categories`                  | Admin; Employee with `categories:manage` | Create PRODUCT or SERVICE category.                                                                                                                   |
| `PATCH /categories/:categoryId`     | Admin; Employee with `categories:manage` | Rename an active category.                                                                                                                            |
| `DELETE /categories/:categoryId`    | Admin; Employee with `categories:manage` | Archive only when no non-archived product uses it.                                                                                                    |

Image URLs must be HTTPS and are rendered by the browser; the server does not fetch remote images.
Prices are stored as integer paise. Existing invoice line descriptions and prices are immutable
snapshots and do not change when a product is edited or archived. Subscription plans remain part of
the later subscription phase.

## Subscription management endpoints

All routes require an authenticated session and CSRF on writes. Admins have full access. Employees
need `subscriptions:read` for lists/history and `subscriptions:assign` for assignments, renewals, and
cancellation; assigned-customer scope is enforced. Customers can read only their own subscriptions.

| Method and path                              | Access                                                          | Behavior                                                                  |
| -------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /subscriptions/plans`                   | Admin; Employee with `subscriptions:read`                       | Search and paginate active plans.                                         |
| `POST /subscriptions/plans`                  | Admin; Employee with `subscriptions:manage`                     | Create a plan with integer-paise price and a standard or custom duration. |
| `PATCH /subscriptions/plans/:planId`         | Admin; Employee with `subscriptions:manage`                     | Update an active plan; prior invoice snapshots are unchanged.             |
| `DELETE /subscriptions/plans/:planId`        | Admin; Employee with `subscriptions:manage`                     | Archive the plan.                                                         |
| `GET /subscriptions`                         | Admin; Employee with `subscriptions:read`; Customer own records | Filter/paginate by status, customer, and upcoming expiry window.          |
| `POST /subscriptions`                        | Admin; Employee with `subscriptions:assign`                     | Assign a plan, calculate the period, and create/link an invoice snapshot. |
| `POST /subscriptions/:subscriptionId/renew`  | Admin; Employee with `subscriptions:assign`                     | Idempotently create a linked next period using `renewalKey`.              |
| `POST /subscriptions/:subscriptionId/cancel` | Admin; Employee with `subscriptions:assign`                     | Cancel the period without deleting history or automatically refunding.    |
| `GET /subscriptions/:subscriptionId/history` | Admin; assigned Employee; owning Customer                       | Read paginated immutable event history.                                   |

Statuses are UPCOMING, ACTIVE, EXPIRED, and CANCELLED. Date inputs use ISO-8601 instants; UI dates
are displayed in Asia/Kolkata. A server job reconciles expired/upcoming statuses on startup and every
five minutes. Expiry notifications are queued in-app with unique deduplication keys.

## Financial management endpoints

All manual financial writes require cookie authentication plus CSRF. Admins have full access;
Employees need `invoices:create`, `payments:record`, `refunds:request`, or `finance:read` as applicable
and are restricted to assigned customers. Customers can read their own invoices, payments, and ledger.
Amounts are integer paise; clients submit product IDs and quantities, never invoice prices or balances.

| Method and path                        | Access                                           | Behavior                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /invoices`                       | Admin; Employee with `invoices:create`           | Create invoice from active product price snapshots; backend calculates totals, discount/tax, and invoice number.                                                |
| `GET /invoices`                        | Admin/Employee with `finance:read`; Customer own | Search/filter/page invoices.                                                                                                                                    |
| `GET /invoices/:invoiceId/pdf`         | Admin; assigned Employee; owning Customer        | Download invoice PDF with line and amount snapshots.                                                                                                            |
| `POST /payments`                       | Admin; Employee with `payments:record`           | Record CASH, UPI, or BANK_TRANSFER as SUCCEEDED or FAILED; idempotency key required. Allocations are server-calculated FIFO by default; excess remains advance. |
| `GET /payments`                        | Admin/Employee with `finance:read`; Customer own | Paginated immutable payment records.                                                                                                                            |
| `GET /payments/:paymentId`             | Admin; assigned Employee; owning Customer        | Read a payment and invoice allocations for receipt/refund context.                                                                                              |
| `GET /payments/:paymentId/receipt.pdf` | Admin; assigned Employee; owning Customer        | Download payment receipt PDF.                                                                                                                                   |
| `GET /ledger/:customerId`              | Admin; assigned Employee; owning Customer        | Reconciled invoice, payment, refund and balance history.                                                                                                        |
| `POST /refunds`                        | Admin; Employee with `refunds:request`           | Request a refund; requires invoice association for allocated payments.                                                                                          |
| `GET /refunds`                         | Admin                                            | Read refund history and approval queue.                                                                                                                         |
| `PATCH /refunds/:refundId/decision`    | Admin                                            | Approve/process or reject pending refund. Processed refunds reduce net allocation; payment rows remain unchanged.                                               |
| `GET /tax-configurations`              | Admin/Employee with `finance:read`               | List active configurable rate/mode entries.                                                                                                                     |
| `POST /tax-configurations`             | Admin                                            | Configure generic inclusive/exclusive rate in basis points. This does not certify GST compliance.                                                               |

Invoice numbering uses an atomic Asia/Kolkata monthly counter. Payment idempotency keys are unique;
reusing a key with different request data returns conflict. Financial writes use MongoDB transactions.
Expiry/overdue checks run on startup and every five minutes. Tax settings remain subject to the
accountant/client decisions in the Business Decision Log. Live payment processing is not enabled.

## Planned API areas

The paths below define module ownership and intended capability only. Detailed methods, payloads,
authorization matrices, pagination, and status transitions will be specified with each feature.

| Area                                              | Planned responsibility                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `/auth`, `/users`                                 | Login/session lifecycle, invitations, first-login password setup, current identity |
| `/customers`                                      | Customer records, assigned employees, profile and ledger views                     |
| `/employees`                                      | Employee records, permissions, primary/additional customer assignments             |
| `/categories`, `/products`, `/services`, `/plans` | Catalogue and subscription plan administration                                     |
| `/subscriptions`                                  | Assignment, period history, renewal, cancellation and expiry views                 |
| `/invoices`                                       | Invoice lifecycle, line-item snapshots, PDF/receipt access                         |
| `/payments`, `/payment-allocations`, `/refunds`   | Manual/sandbox payments, allocations, advances, reversals/refunds                  |
| `/notifications`                                  | In-app/email reminder preferences and delivery status                              |
| `/reports`                                        | Collection, outstanding, sales and subscription summaries                          |
| `/settings`, `/audit-logs`                        | Approved business settings and sensitive-action traceability                       |
| `/webhooks/razorpay`                              | Signed provider events with idempotent server-side processing                      |

## Cross-cutting API rules

- Validate request parameters, body, and query data at the boundary; do not pass unvalidated input
  directly into database filters.
- Protected handlers enforce role and permission plus record ownership or employee assignment.
- Customer-scoped endpoints derive the customer from the authenticated principal.
- Financial writes use integer paise, immutable transaction records, approved allocation rules,
  audit entries, and idempotency. Online payment status is verified server-side.
- Never return password hashes, invitation secrets, JWTs, gateway credentials, or internal stack
  traces.
- GST/tax fields and invoice behavior remain subject to accountant/client approval; no unapproved
  rates or legal invoice claims may be encoded.
- Request validation uses Zod at the HTTP boundary. Validation errors use HTTP `400` and return a
  safe list of field paths and messages. Unknown routes use `404`; unexpected errors use a generic
  `500` response. Responses do not include stacks or database connection details.
- Helmet supplies security headers. Credentialed CORS accepts only configured origins, and `/api`
  routes are rate limited. Request logs include generated request IDs and redact authorization and
  cookie headers.
- Passwords are validated and bcrypt-hashed. Password hashes are selected explicitly only for
  credential verification and are never serialized to API responses. Authentication role is loaded
  from MongoDB for every request; role values supplied by a client are ignored.
- Employees require both a permission grant and an active customer assignment for protected
  customer-scoped records. Customer record access is limited to the authenticated customer's own
  account. Admin access still passes authentication and account status checks.

See [Database and Environment Guide](database-and-environment.md) for MongoDB setup and exact
environment variables.

## Pending contract decisions

Some authentication delivery, GST fields, and report definitions remain subject to the documented
business decisions. Razorpay's test-mode webhook contract is documented below. See
[Business Decision Log](business-decisions.md).

## Razorpay online checkout (test mode only)

The online flow is intentionally restricted to Razorpay Test Mode. Leave the three `RAZORPAY_TEST_*` values blank to disable checkout. Configure a Test Mode key ID (`rzp_test_...`), its secret, and a webhook secret in the ignored `server/.env` file; the server rejects live key ID prefixes. Never add provider secrets to client environment variables.

| Method and path                                  | Access                                            | Behavior                                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /payments/razorpay/orders`                 | Authenticated owning Customer + CSRF              | Body: `{ invoiceId, idempotencyKey }`. Server derives customer ownership and the current outstanding balance in integer paise, reserves it, then creates a Razorpay test order.                    |
| `POST /payments/razorpay/verify`                 | Authenticated owning Customer + CSRF              | Body: `{ orderId, paymentId, signature }`. Validates Checkout HMAC and independently fetches/captures the provider payment before recording or allocating it.                                      |
| `POST /payments/razorpay/orders/:orderId/cancel` | Authenticated owning Customer + CSRF              | Releases an unpaid checkout reservation after the customer closes Checkout.                                                                                                                        |
| `POST /webhooks/razorpay`                        | Public provider callback, HMAC signature required | Verifies signature against the exact raw request bytes and deduplicates by `x-razorpay-event-id`. Handles `payment.captured` and `payment.failed`; retries of failed event processing remain safe. |
| `GET /notifications`                             | Authenticated user                                | Returns only that user's in-app payment notifications.                                                                                                                                             |

Only server-confirmed captured payments are allocated. Provider payment IDs and webhook event IDs have unique database indexes. Successful settlement, invoice allocation/status, audit history, notification records and checkout state are committed transactionally. A verified late capture can follow a failure notification; it upgrades the same provider payment record idempotently. Razorpay sandbox refunds are blocked until a provider refund workflow is separately implemented. Live mode, live keys and production payment collection are out of scope and require explicit client approval.

### Safe sandbox smoke test

1. In Razorpay Dashboard, switch to **Test Mode** and create test API keys and a webhook secret. Do not use or paste live credentials.
2. Copy `server/.env.example` to ignored `server/.env` if needed, then fill `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET`, and `RAZORPAY_TEST_WEBHOOK_SECRET` with the Test Mode values. Keep the secret values private.
3. Configure a Test Mode webhook for `payment.captured` and `payment.failed`, pointing at `https://<your-temporary-https-host>/api/v1/webhooks/razorpay`. A local server needs a trusted temporary HTTPS tunnel for Razorpay callbacks. Set the identical webhook secret in the server environment.
4. Start MongoDB and the API, sign in as a customer with an issued invoice, and use **Pay online (test)**. Use only Razorpay's current Test Mode payment instructions and test instruments from its official docs; never enter real payment credentials.
5. Confirm the invoice allocation, payment history, audit log, and in-app customer/admin notification. To check webhook dedupe, resend the same signed event ID from the provider dashboard and confirm it does not create another payment/allocation.
6. Stop the tunnel when done, remove test keys from the local environment if no longer needed, and never deploy them as live credentials.

The automated suite stubs outbound provider HTTP calls; it does not charge a real payment or require provider credentials. Atlas-backed transaction smoke tests require a replica-set MongoDB connection.

## Employee and customer portals

Portal pages use separate employee/customer navigation shells. Both are protected by role-specific client routes, while the API derives identity from the authenticated session and limits all customer records to the customer's own profile or an employee's assigned customers and granted permissions. The dashboards use paginated customer, subscription, invoice, payment, ledger, and notification APIs; empty or failed API responses are shown as such, with no synthetic customer/account totals.

| Method and path                               | Access                                    | Behavior                                                                                                            |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /employees/me`                           | Authenticated Employee                    | Returns the signed-in employee's own profile and server-managed permissions.                                        |
| `PATCH /employees/me`                         | Authenticated Employee + CSRF             | Updates only the signed-in employee's display name and phone; records an audit event.                               |
| `POST /auth/change-password`                  | Any authenticated role + CSRF             | Verifies current password, stores a bcrypt hash of the new password, revokes all sessions, and clears auth cookies. |
| `GET /customers/me` and `/customers/me/:kind` | Owning Customer                           | Returns profile/financial summary and that customer's subscriptions, invoices, or payment history.                  |
| `GET /payments/:paymentId/receipt.pdf`        | Owning Customer; Admin; assigned Employee | Streams the receipt for an accessible payment record.                                                               |

Employee customer creation, profile updates, payment recording, invoice visibility, and subscription access remain controlled by the existing server permissions and assignment checks. Customer profile changes use the self-service profile/email-confirmation APIs. Customer products are displayed from immutable invoice line-item snapshots. Customer online payment remains the Phase 9 Test Mode flow. Dates display in Asia/Kolkata, and the portal provides loading, retry, and empty states.

## Reports and notification delivery

Reports use server-side MongoDB aggregations. The caller's authenticated role determines data scope:
customers cannot access management reports; employees require `finance:read` and are restricted to
assigned customers and their own recorded collections; employee-performance and delivery-status
reports are Admin-only. Date values are ISO calendar dates interpreted in `Asia/Kolkata`. The
default range is the last 30 days; ranges are limited to 10 years. `format=csv` exports up to 10,000
rows and neutralizes spreadsheet formulas.

| Method and path                      | Access                              | Behavior                                                                          |
| ------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------- |
| `GET /reports/collections`           | Admin; Employee with `finance:read` | Successful payment collection grouped by `period=daily                            | weekly | monthly`; exact integer-paise totals. |
| `GET /reports/outstanding`           | Admin; Employee with `finance:read` | Current outstanding after successful allocations and processed invoice refunds.   |
| `GET /reports/overdue-invoices`      | Admin; Employee with `finance:read` | Paginated non-zero overdue invoices, filtered by due date.                        |
| `GET /reports/product-sales`         | Admin; Employee with `finance:read` | Paginated quantity and sales from immutable invoice line snapshots.               |
| `GET /reports/subscriptions`         | Admin; Employee with `finance:read` | Paginated active, expired, or upcoming renewal periods, filtered by end date.     |
| `GET /reports/employee-performance`  | Admin                               | Successful manually recorded payments grouped by active employee and date range.  |
| `GET /reports/refunds`               | Admin; Employee with `finance:read` | Paginated refund records and exact totals grouped by refund status.               |
| `GET /reports/notification-delivery` | Admin                               | Paginated delivery records without message bodies, grouped by channel and status. |
| `GET /notifications`                 | Authenticated user                  | Lists only the authenticated user's in-app notifications and delivery status.     |

Report queries accept `from`, `to`, `page`, `limit`, and `format=json|csv`. Collections also accept
`period`; subscription queries accept `status=ACTIVE|EXPIRED|UPCOMING`. Financial totals use MongoDB
Decimal128 accumulators and are returned as paise strings. Outstanding is `max(0, invoice total -
successful allocation + processed refund)`.

Scheduled notifications cover upcoming/expired subscriptions, invoice generation, subscription
renewal, successful payment, and overdue invoices. Event keys include the entity and recipient, with
a unique index to prevent duplicate deliveries. In-app notifications and configured email messages
use a delivery queue with attempt counts, sent timestamps, safe error codes, retry backoff, and
terminal `FAILED` status after five attempts. The delivery worker runs on startup and every minute;
stale worker leases are recovered on the next pass.
