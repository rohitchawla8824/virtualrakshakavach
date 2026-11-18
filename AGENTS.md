# Permanent Project Rules

## Product constraints

- Build Virtual Raksha Kavach as a responsive web application. Android/mobile apps are out of
  scope unless the product owner changes that decision.
- Use the approved stack: React + TypeScript + Vite; Node.js + Express + TypeScript; MongoDB Atlas
  - Mongoose when persistence is introduced; Tailwind CSS; and the approved validation/testing tools.
- Product UI language is English. Display currency in INR (₹) and format business dates for
  `Asia/Kolkata`.
- Follow the approved black, white, and red brand palette documented in the architecture guide;
  use green/amber only for semantic success and warning states.

## Security and business correctness

- Enforce role, permission, customer ownership, and employee assignment checks in backend services
  and routes. UI visibility is never an authorization boundary.
- Never store plaintext passwords, commit credentials, or expose server secrets through client
  code. Only public configuration may use the `VITE_` prefix.
- Treat payment and invoice history as auditable records. Do not silently edit or delete successful
  payments; use approved reversal/refund records.
- Store money in integer paise. Never use floating-point arithmetic for financial calculations.
- Make payment and webhook processing idempotent. Never trust a payment success state sent only by
  the browser.
- Do not implement unapproved GST rates, tax calculations, legally compliant tax invoices, live
  payment credentials, or SMS/WhatsApp delivery. Track their dependencies in
  `docs/business-decisions.md`.
- Do not use real client/customer records in development or tests.

## Engineering workflow

- Read the architecture, API specification, development plan, and Business Decision Log before
  changing project structure or business behavior.
- Work in the current approved phase. Do not implement future modules as placeholders that appear
  functional; clearly label approved demo-only fixtures if they are ever needed.
- Keep Express controllers thin and business rules in services. Validate external input at
  boundaries and return safe errors without leaking secrets or personal data.
- Add tests for business rules and access boundaries as each feature is introduced. Run relevant
  tests, lint, and builds before reporting completion; never claim an unrun check passed.
- Keep `.env` files, build output, dependencies, logs, and local editor state out of version
  control. Update documentation when interfaces or approved decisions change.
- Do not deploy, push, enable live payments, or expose data without explicit approval.

## Current foundation boundary

Phase 11 includes date-filtered MongoDB aggregation reports, integer-paise financial summaries,
CSV export, notification delivery tracking, and idempotent scheduled customer notifications. Phase
10 includes responsive employee and customer portals using session-derived API access, employee
permission checks, customer ownership and employee-assignment boundaries, and account profile/password
controls. The API foundation includes liveness/readiness endpoints, Mongoose
schemas/indexes, centralized middleware, and invitation-based authentication/session authorization.
Phases 5–8 cover customer, catalogue, subscription, and manual finance workflows. Phase 9 enables
Razorpay Test Mode only with server-side verification and signed, deduplicated webhooks. Live payment
activation, legal GST behavior, and invitation resend limits remain pending; do not implement them
until approved.
