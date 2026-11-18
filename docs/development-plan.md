# Development Plan

This plan builds one verified vertical slice at a time. Phase 9 implements online payments in Razorpay test mode only.

| Phase                                   | Scope                                                                                                 | Completion evidence                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1. Project Foundation                   | Monorepo, React/Vite/Tailwind shell, Express/TypeScript health API, tooling and environment examples  | Client/API start, lint and production builds pass                                  |
| 2. Frontend Design System               | Approved branded shell, responsive primitives, route/layout patterns, accessible states               | Login, role workspaces, reusable UI states, lint/build pass                        |
| 3. Backend and Database                 | Modular API foundation, MongoDB Atlas config, Mongoose connection, indexes, logging and errors        | API tests pass; Atlas verification requires configured URI                         |
| 4. Authentication and Permissions       | Email invitation, cookie session, roles, employee permissions and ownership checks                    | Admin/employee/customer access tests pass                                          |
| 5. Customers and Employees              | Customer CRUD, employee profiles, assignments, self-service and financial read views                  | Customer service/API tests and frontend lint/build pass; Atlas-backed UAT pending  |
| 6. Products and Services                | Product/service catalogue, categories, images, integer-paise pricing, stock, status, search/history   | Catalogue validation/API tests and responsive client build pass; Atlas UAT pending |
| 7. Subscriptions                        | Plans, assignment, renewal, cancellation, history and expiry detection                                | Date boundary and repeat-safe job scenarios pass                                   |
| 8. Invoices, Ledger and Manual Payments | Invoice snapshots, FIFO/manual allocations, partial/advance payments, refunds and receipts            | Financial reconciliation scenarios pass                                            |
| 9. Sandbox Payments and Notifications   | Razorpay test mode, server verification/webhooks, in-app/email reminders                              | Duplicate and invalid webhook scenarios rejected                                   |
| 10. Employee and Customer Portals       | Separate responsive portals, ownership-scoped database APIs, account/profile controls                 | Role and ownership tests plus client build pass                                    |
| 11. Reports and Notifications           | MongoDB aggregations, date filters, CSV export, charts, deduplicated notifications and delivery state | Known paise totals, access boundaries, delivery retries and builds pass            |
| 12. QA and Deployment Preparation       | UAT, security review, backups/restore, staging, monitoring and handover                               | Release checklist and client acceptance completed                                  |

## Working rhythm

Implement a reviewable vertical slice across UI/API/data, then update decisions and acceptance notes.
Keep future modules visibly out of scope; do not add fake controls or hardcoded business records that
look real.

## Current phase boundary

Phase 1 established the client shell and API health endpoint. Phase 2 added the branded UI foundation
and explicitly labelled development-only sample presentation data. Phase 3 added MongoDB connection
infrastructure, schemas/indexes, validation, and API hardening. Phase 4 added invitation-based
authentication and authorization. Phase 5 includes customer management APIs, employee assignment
scoping, customer self-service, financial-history read views, and permission-aware customer actions.
Phase 6 adds catalogue models, permission-checked APIs, product/category audit history, invoice
snapshot protection, and responsive catalogue screens. Phase 7 adds plans, customer periods, renewal
and cancellation history, invoice association, expiry reconciliation and deduplicated in-app expiry
notifications. Phase 8 adds immutable invoice and payment history, integer-paise backend totals,
monthly invoice numbering, generic configurable taxes, manual payment allocation, customer ledger,
reserved refund approvals, PDF receipts, overdue reconciliation, and role-scoped finance screens. Phase 9 adds test-only Razorpay orders, server-side verification, signed/deduplicated webhooks, invoice allocation, and in-app payment notices. Phase 10 adds separate responsive Employee and Customer portals backed by authorized customer, subscription, invoice, payment, product snapshot, profile, receipt and notification APIs, plus employee self-profile and password settings. Phase 11 adds MongoDB aggregation reports, date-range filters, CSV export, report charts, event-deduplicated subscription/payment/invoice notices, and tracked/retried in-app and configured email delivery.
Automated checks are included; Atlas-backed UAT remains pending until the database connection is
available. Tax legality, live payment, SMS/WhatsApp, and invitation resend policy remain subject to
the [Business Decision Log](business-decisions.md).
