# Deployment and Production Readiness Checklist

This checklist distinguishes a public **demo preview** from real production. Cloudflare Pages Free,
Render Free, and Atlas Free are suitable only for learning/demo evaluation under their provider
limits. Completing the preview steps below does **not** make the service production-ready.

## Before a public demo preview

### Source and build

- [ ] Review the exact commit and confirm no `.env`, database URI, credentials, backup archive, or
      real customer data is included.
- [ ] `npm ci` completes from the lockfile.
- [ ] `npm run lint` passes.
- [ ] `npm run test:server` passes.
- [ ] `npm run build` passes; review the known Vite large-bundle advisory.
- [ ] Confirm Cloudflare Pages builds Node 22.12+ and uploads `client/dist`.
- [ ] Confirm the Pages Function `/api/v1/*` routes only to the configured HTTPS Render origin.
- [ ] Confirm `_routes.json` invokes Pages Functions only for `/api/*` and static assets bypass them.
- [ ] Test Pages route refreshes (login, reset, dashboards) on the deployed static host.

### Environment and transport security

- [ ] `NODE_ENV=production`; `HOST=0.0.0.0`; use Render-injected `PORT`.
- [ ] Server variables are entered only in server hosting secret/config fields.
- [ ] Client has only `VITE_API_BASE_URL=/api/v1`; no server secret has a `VITE_` prefix.
- [ ] Production `FRONTEND_URL` and `CORS_ORIGINS` contain only the exact Pages origin.
- [ ] `API_ORIGIN` is HTTPS, has no embedded credentials, and points to the intended Render preview.
- [ ] Verify API cookies are HttpOnly, Secure, SameSite Strict, scoped to the Pages origin via proxy,
      and state-changing requests require valid CSRF protection.
- [ ] Verify unapproved origins receive no credentialed CORS access.
- [ ] Verify rate-limit client-IP behavior through the Pages Function and Render proxy chain. The
      API currently trusts one proxy hop; configure any different hop count only after verifying the
      hosting chain and forwarded headers.
- [ ] Verify HTTPS for Pages and Render hostnames, API health/readiness, Helmet/API headers, and static
      `_headers` responses.
- [ ] Restrict Atlas Network Access to the current Render outbound CIDRs; do not use `0.0.0.0/0`.
- [ ] Use a least-privilege Atlas application database user; disable dev seed and use synthetic data.
- [ ] Review logs for redaction; confirm tokens, cookies, credentials, customer data, and payment data
      are not logged.

### External services and operations

- [ ] Confirm Render Free SMTP port compatibility with the selected approved relay before inviting
      any user; default SMTP ports 25/465/587 are blocked on Render Free.
- [ ] Test cold-start delay, rate limits, session behavior through the Pages proxy, and API readiness
      after wake/restart.
- [ ] Test Razorpay Test Mode only, with a sandbox order/signature/webhook if test credentials are
      approved. No live key or live payment is permitted.
- [ ] Confirm no product/customer uploads are attempted; the app only stores external HTTPS image
      references and bundled static images.
- [ ] Configure manual M0 dump and rehearse restore only into an isolated empty demo target. Do not
      claim a backup exists until archive creation and restore are verified.
- [ ] Record the public preview URLs and current free-tier limitations for the owner.

## Production blockers

Do not accept real customer/payment data or call the application production-ready until all are
resolved and approved:

- [ ] Hosting plan has durable availability, adequate capacity, monitored uptime, rollback, and a
      maintained background-job strategy. Render Free sleeps/restarts; its in-process expiry, overdue,
      and notification schedulers cannot be relied upon.
- [ ] Database plan, storage, isolation, backups, retention, point-in-time recovery expectations,
      disaster recovery, and a successful restore rehearsal have been approved. Atlas M0's standard
      backup limitations are incompatible with an assumption of managed recovery.
- [ ] Atlas access is restricted to stable, approved network paths and least-privilege users.
- [ ] Invitation/password recovery email is reliable and delivered over an approved transport.
- [ ] Object/file storage is designed and implemented if uploads become a requirement; ephemeral app
      disks must never be used for user files.
- [ ] Frontend/browser tests, MongoDB transaction/idempotency integration tests, external sandbox
      tests, accessibility review, and responsive device/viewport review are complete.
- [ ] Tax/invoice legal requirements, monitoring/incident response, audit retention, and data
      protection obligations have owner approval.
- [ ] Live payment activation (if ever in scope), domain purchase, service upgrades, and deployment
      receive separate explicit approval.

## Go/no-go record

| Item                                             | Current state                    |
| ------------------------------------------------ | -------------------------------- |
| Deployment performed by this QA/preparation work | No                               |
| Real customer data allowed in free preview       | No                               |
| Live Razorpay enabled                            | No                               |
| Domain or paid service purchased/upgraded        | No                               |
| Production readiness                             | Not approved; see blockers above |

The owner must approve any push/deployment and any paid service/domain separately. For step-by-step
preview instructions, see [deployment-guide.md](deployment-guide.md) and
[environment-setup.md](environment-setup.md).
