# Principal Engineering Review — Client Delivery

**Review date:** 2026-11-18  
**Scope:** Application source, API routes/services/models, client routes/screens, security and deployment configuration, tests, and delivery documentation for phases 1–11.  
**Deployment:** Not performed. No live customer data or payment credentials were used.

## Executive result

The current code builds and lint passes. The backend suite passes **93/93 tests across 11 files**. Four verified issues were corrected during this review: the default admin route exposed the demo workspace, invoice-linked refunds were not limited to the selected payment's allocation, the client bundled all route screens into one large entry chunk, and Express 5 query validation attempted to assign to a getter-only `request.query`, causing customer and employee list APIs to return 500. The initial client chunk is now 345.29 kB minified, with no Vite chunk-size advisory.

This review does **not** approve production use or client acceptance with real records. The tests use mocked services/models for HTTP workflows and do not exercise the deployed Atlas database, MongoDB transaction races, a real Razorpay sandbox account, SMTP delivery, browser rendering, or backup/restore. No host has been deployed or verified.

## Features working in the reviewed code

- Invitation-based authentication, password recovery/reset, server-derived roles and permissions, session revocation/refresh, HttpOnly cookies, CSRF checks, and active-account checks.
- Admin/employee/customer customer workflows, with service-level ownership and employee-assignment checks.
- Product/category CRUD, history records, and invoice line snapshots.
- Subscription plan and period APIs, historical period records, renewal/cancellation paths, and scheduled expiry/reconciliation code.
- Invoice and manual-payment APIs, integer-paise calculations, allocation/advance handling, refund approval records, PDFs, ledger and reports.
- Razorpay test-mode paths use server-side verification, test-key validation, raw-body webhook signatures, idempotency keys, and event deduplication. No real sandbox transaction was run.
- Separate employee/customer portal routes and API-backed screens exist. Backend checks remain the security boundary.
- The main admin route now opens a real admin dashboard with links to the management areas. The development workspace with demo records and no-op actions is no longer mounted by the admin router.

“Working” here means the source paths exist and the stated automated checks pass; it is not a claim of external-service or production verification.

## Fixes made and verified

1. **Admin landing exposed demo data and no-op actions.** `/admin` now renders a real admin dashboard; the development workspace is not the default/live admin screen.
2. **Refund could exceed the selected payment's allocation to an invoice.** Added an allocation-level refund reservation with a conditional atomic update. Pending requests reserve capacity; rejection releases payment, invoice, and allocation reservations; processed refunds keep the reservation as consumed capacity. Added a boundary test for remaining allocation capacity.
3. **All feature routes were in one client entry chunk.** Applied route-level lazy loading with a suspense loading state. The initial minified entry dropped from about 686 kB to 344.91 kB, and the build no longer emits the 500 kB advisory.
4. **Customer and employee list APIs returned 500 under Express 5.** The request-validation middleware tried to assign to the getter-only `request.query` property. It now installs the validated value safely, and an HTTP regression test covers query parsing/defaults. Also replaced deprecated Mongoose `new: true` options with `returnDocument: 'after'`.

## Verification results

| Check                            | Result        | Evidence and limits                                                                                                                   |
| -------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Backend unit/service/API suite   | PASS          | `npm run test:server`: 93 tests, 11 files. HTTP tests required loopback permission in this environment.                               |
| Frontend production build        | PASS          | `npm run build`; client TypeScript + Vite and server TypeScript builds pass. Initial JS entry is 345.29 kB minified.                  |
| Lint                             | PASS          | `npm run lint`; no lint warnings after separating lazy route components.                                                              |
| Frontend component/browser tests | NOT AVAILABLE | No frontend test script or client test files were found. Build is not a substitute for rendered interaction tests.                    |
| Atlas integration/transactions   | NOT VERIFIED  | No Atlas connection, database-backed integration test, or transaction race test was run during this review.                           |
| Razorpay sandbox E2E             | NOT VERIFIED  | Unit/API safeguards are tested; no provider order, capture, webhook retry, failure, or cancellation smoke test was run.               |
| SMTP delivery                    | NOT VERIFIED  | No invitation/recovery or notification email was delivered through a staging provider.                                                |
| Backup/restore                   | NOT VERIFIED  | Backup and restore guidance exists, but no Atlas backup or isolated restore rehearsal was performed.                                  |
| Responsive/browser accessibility | NOT VERIFIED  | Source breakpoints and responsive navigation exist, but no viewport/browser/device or keyboard screen review was executed.            |
| Deployment/health through host   | NOT DEPLOYED  | No public host, production URLs, CORS chain, HTTPS, or deployed health/readiness checks were verified.                                |

## Security and correctness findings

- **Credential exposure:** Database and signing-secret values were shared in conversation screenshots/messages during setup. Treat the exposed credentials as compromised and rotate the MongoDB database-user password and JWT signing secret before any shared preview. Never paste credentials into chat or commit them. `.env` was not read or printed during this review.
- **Refund allocation:** The verified per-payment allocation cap is fixed and unit-tested. MongoDB transaction/parallel-request behavior still needs an isolated database integration test.
- **Authorization:** Routes/services contain server-side role, permission, ownership, and assignment checks. Existing automated tests cover representative denial paths. There is no comprehensive database-backed test matrix for every protected endpoint.
- **Financial arithmetic:** Source calculations use integer paise/BigInt helpers and safe-integer checks. Tax behavior remains pending accountant/client approval; the application does not claim GST/legal invoice compliance.
- **Webhook/payment:** Test-mode safeguards exist, but provider signatures and idempotency have not been exercised against a real sandbox account. Razorpay refunds are explicitly unavailable in this phase.
- **CORS, CSRF, headers, request validation:** Express config and API tests cover security headers, approved-origin rejection, CSRF, malformed JSON, and schemas. Deployed proxy IP attribution and cookie behavior remain to be checked on the exact hosting chain.
- **Demo UI:** Demo fixture code remains in the source as an explicitly labeled development presentation screen, but is no longer used by the admin route. Remove it or maintain a separate demo-only route before a client-facing release if it is not needed.
- **Version control:** The repository has no commit on `master`; all project directories/files are currently untracked. No files were staged or committed during this review. Create a reviewed baseline commit before preparing a handoff or deployment so the deliverable is reproducible and has an auditable change history.

## Incomplete features and known limitations

- No browser-level/component tests, visual regression, accessibility audit, or actual mobile/desktop viewport check.
- No Atlas-backed validation of schema indexes, transactions, invoice/payment/refund reconciliation, unique-key race behavior, or data migration procedures.
- Scheduled expiry, overdue, and notification jobs run in-process. Restarts, sleeping free hosts, multiple instances, or missed intervals can delay work; use a durable external scheduler/queue before relying on them operationally.
- Free hosting constraints are documented in [deployment-guide.md](deployment-guide.md) and [production-checklist.md](production-checklist.md); those services are demo/preview targets, not production-grade availability or backup guarantees.
- SMTP, Razorpay sandbox E2E, Atlas backup/restore, and deployed readiness checks are pending.
- GST/tax rules, live Razorpay activation, SMS/WhatsApp, and invitation resend limits remain pending approved decisions.
- File uploads/object storage are not implemented; product imagery uses HTTPS references/static assets.
- Deployment has not been performed. No real customer data should be entered.

## Delivery and production readiness

**Client delivery:** suitable for a controlled code review/demo after rotating exposed credentials and documenting the unverified areas above; not accepted as a verified operational system.  
**Production readiness:** **NOT APPROVED.** Complete Atlas-backed integration and restore rehearsal, staging provider checks, browser/responsive/accessibility QA, durable job operations, tax/legal approval, production secret/CORS/proxy verification, monitoring/rollback planning, and stakeholder sign-off first. No deployment, push, paid upgrade, domain purchase, or live payment activation was performed.
