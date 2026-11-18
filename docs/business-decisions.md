# Business Decision Log

This log is the source of truth for business rules. **Agreed** decisions guide implementation.
**Pending** decisions must remain configurable or blocked; do not infer a value from examples or
common practice. Record future approvals here with date, owner, and affected modules.

## Agreed decisions

| Area                  | Decision                                                                                                                                                 | Implementation guardrail                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Product identity      | Virtual Raksha Kavach business management system; responsive web only; Admin, Employee, Customer; English UI; INR; Asia/Kolkata; navy/white/cyan brand   | No Android app in this scope; format display values consistently                                                                              |
| Tax configuration     | Architecture must support configurable tax-inclusive and tax-exclusive prices                                                                            | Do not calculate actual GST or claim legal GST invoice compliance yet                                                                         |
| Payment allocation    | FIFO by oldest outstanding invoice by default; authorized Admin/Employee may select invoices; partial payment supported; excess remains customer advance | Use allocation records and auditable immutable payment history; no direct payment deletion                                                    |
| Subscription renewal  | Before expiry extends from existing expiry; after expiry starts from new payment/activation date; configurable grace period                              | Keep historical periods and renewal events; repeated jobs must be safe                                                                        |
| Cancellation/refund   | Mid-period cancellation does not auto-refund; refund requires Admin approval                                                                             | Record refund/reversal as a separate auditable transaction                                                                                    |
| Account provisioning  | Admin creates accounts; email is primary login, phone optional; secure invitation; first login sets password                                             | Client confirmed one-time secure email links with 24-hour expiry on 2026-11-15; OTP remains a future extension                                |
| Customer email change | Customer or authorized staff may request a customer's primary email change; update only after confirmation at the new address                            | Confirmation link expires in 24 hours; successful change revokes all sessions. Confirmed on 2026-11-15                                        |
| Employee access       | A customer may have multiple assigned employees and one primary employee                                                                                 | Enforce role/permission checks and assignment checks on the backend                                                                           |
| Online payments       | Razorpay sandbox/test mode only; online checkout, server verification and signed webhooks implemented in Phase 9                                         | Live mode remains disabled and requires explicit client approval; server accepts only rzp_test_ key IDs and keeps the test secret server-side |
| Reminders             | Start with in-app and email notifications                                                                                                                | SMS/WhatsApp are blocked pending provider selection and client consent                                                                        |
| Data safety           | Do not use real client/customer data in development or tests                                                                                             | Use synthetic records only if later explicitly labeled as test/demo fixtures                                                                  |

## Pending decisions and module dependencies

| Pending decision                                                                                           | Owner to confirm  | Blocked or conditional modules                                         |
| ---------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------- |
| GST applicability, rates, tax rules, inclusive/exclusive calculation details, and compliant invoice format | Client/accountant | Tax calculations, tax invoice rendering, invoice tax labels and totals |
| Live Razorpay credentials, account ownership, activation approval and production webhook configuration     | Client            | Live payment mode and production collection; sandbox work may proceed  |
| SMS/WhatsApp provider, templates, consent and cost approval                                                | Client            | SMS/WhatsApp delivery; in-app/email may proceed                        |

## Rules for handling unresolved items

- Keep affected capabilities disabled or explicitly configurable until approval is documented.
- Do not encode placeholder tax rates as defaults or present sandbox payments as real collections.
- When a pending decision is approved, record the chosen rule, approver, and date here before
  implementation; update the architecture and API docs if contracts change.
- Client confirmed secure email invitation links with a 24-hour expiry on 2026-11-15. Invitation
  resend limits remain pending and must not be implemented until approved.
