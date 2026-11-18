# Phase 12 Quality Assurance Report

**Review date:** 2026-11-18  
**Scope:** Virtual Raksha Kavach application phases 1–11  
**Deployment:** Not performed

## Executive result

The repository checks completed in this environment: the backend/API test suite passed **93/93
tests across 11 files**, ESLint passed, and the production client and server build passed. An
additional Supertest check verifies that unapproved origins receive no credentialed CORS grant;
the API suite also asserts the configured Helmet headers.

This is not production sign-off. There is no frontend component/browser test suite, no live MongoDB
Atlas backup and restore drill was performed, and provider/API integration tests use test doubles
rather than real external services. No critical or high-severity defect was reproduced by the
checks that could run; the unverified areas below remain release blockers until validated.

## Verification results

| Check                                    | Result        | Evidence / boundary                                                                                                                                                                    |
| ---------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit and service tests           | PASS          | `npm run test:server`: 93 tests in 11 files                                                                                                                                            |
| API integration tests                    | PASS          | Supertest exercises Express routes, cookies, auth, validation, CORS/security headers; services/models are mocked where the test is not specifically a pure calculation or schema check |
| Frontend tests                           | NOT AVAILABLE | No client test files or frontend test script/dependencies were found. TypeScript/Vite production build verifies compilation only, not rendered behavior                                |
| Production builds                        | PASS          | `npm run build` compiled the client and server. Route-level lazy loading reduced the initial JS entry to 345.29 kB minified; no chunk-size advisory is emitted                         |
| Lint                                     | PASS          | `npm run lint`                                                                                                                                                                         |
| Atlas connection / DB-backed integration | NOT RUN       | QA did not connect to Atlas or read/print `.env` credentials; tests use mocked model/service behavior                                                                                  |
| Razorpay sandbox transaction             | NOT RUN       | Signature, request-shape, and test-mode safeguards are unit/API tested; no actual sandbox account transaction was initiated                                                            |
| Backup and restore                       | NOT RUN       | Manual backup/restore guidance is documented; no Atlas archive or isolated restore rehearsal was performed                                                                             |
| Responsive browser/device review         | NOT RUN       | Responsive Tailwind breakpoints and mobile navigation were inspected in source, but no browser automation or viewport screenshots were available                                       |

## Coverage map

The 93 passing tests exercise the following areas, with the scope limits above:

- **Authentication and authorization:** password hashing, active-user login, cookie/session handling,
  CSRF binding, forged tokens, server-derived role/permissions, customer ownership, employee
  assignment and permission denial.
- **Customer and product management:** service-level create/update/archive/search and assignment
  restrictions, input schemas, pagination, and immutable invoice product snapshots.
- **Subscriptions:** duration/date calculation, custom duration validation, permission boundaries,
  expiry transition and deduplicated reminder scheduling.
- **Finance:** integer-paise invoice/tax calculations, full/partial/multiple/advance/failed payment
  allocation calculations, outstanding balance, over-allocation rejection, refund balance effects,
  idempotency fingerprints/index declarations, and PDF text generation/escaping.
- **Online payments:** test-key restrictions, server-side HMAC signature verification, webhook raw
  body signature rejection, provider request amount validation, and duplicate-key index declarations.
- **Reports and notifications:** report aggregation shape/timezone/scoping and exact paise helpers,
  notification dedupe key and delivery status behavior.
- **HTTP/security:** unauthenticated route denial, safe errors, malformed JSON and Zod validation,
  Helmet response headers, request ID, and CORS rejection of an unapproved origin.
- **Express 5 query validation:** HTTP regression coverage ensures parsed/defaulted query values are accepted without assigning to Express's getter-only query property.

## Bugs and known limitations

### Reproduced bugs

- The customer and employee list APIs returned HTTP 500 because the validation middleware attempted to assign to Express 5's getter-only `request.query`. Fixed the middleware and added a regression test; the full backend suite passes 93/93 afterward.

### Remaining verification gaps

1. Add a client test stack (React Testing Library plus a DOM environment) and cover protected routing,
   portal workflows, report interactions, and narrow/wide responsive behavior.
2. Add isolated MongoDB integration tests for transactions, uniqueness/idempotency races, customer
   record isolation, invoice/payment allocation reconciliation, notification queue retries, and
   subscription expiry across date boundaries. Current route integration uses Supertest with
   mocked database services/models; it does not prove Atlas behavior or transaction support.
3. Create a provider-approved Razorpay Test Mode environment and run a safe end-to-end order,
   signature, webhook retry/deduplication, cancellation and failure smoke test. No live keys should
   be used.
4. Add an Atlas-specific backup/restore runbook with owners, frequency/retention, encrypted storage,
   restore target isolation, and verification steps; perform a restore rehearsal and record its
   result before production use.
5. Route-level lazy loading reduced the initial minified client entry to 345.29 kB and removed the
   > 500 kB advisory. Continue monitoring route chunk sizes as features grow.
6. Confirm operational email delivery and scheduled worker recovery/retry behavior with a staging
   SMTP provider. Unit tests do not prove external email delivery.

## Production readiness checklist

- [ ] Real Atlas staging connection and transaction-capability check.
- [ ] Automated backup policy configured and successful restore rehearsal recorded.
- [ ] Isolated staging integration suite against MongoDB, including duplicate/race conditions.
- [ ] Frontend component and browser tests; keyboard/accessibility and mobile/desktop viewport review.
- [ ] Razorpay Test Mode end-to-end smoke test, including webhook retries and idempotent allocation.
- [ ] SMTP delivery and notification retry/recovery smoke test.
- [ ] Production CORS origins, TLS, secrets, database least privilege, monitoring/alerts, and rollback
      plan reviewed for the target host.
- [ ] Finance owner/accountant confirms tax behavior and invoice/legal requirements; pending decisions
      remain in `docs/business-decisions.md`.
- [ ] Final stakeholder sign-off and explicit deployment approval.

**Disposition:** QA build/test checks pass, but production readiness is **NOT APPROVED** until the
unchecked operational and external-integration items above are completed. No deployment was made.
