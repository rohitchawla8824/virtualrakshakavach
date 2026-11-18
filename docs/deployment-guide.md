# Public Preview Deployment Guide

This guide describes a **demo/preview deployment only**. Do not use real customer, employee,
payment, or financial records. Free hosting is not production-grade, and this guide does not deploy
anything, connect a Git provider, buy a domain, or activate live payments.

## Recommended topology

| Part        | Preview host                    | Public address                   | Notes                                                                                                                                                                                 |
| ----------- | ------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React/Vite  | Cloudflare Pages                | `https://<project>.pages.dev`    | Static files are delivered over HTTPS. Pages Functions proxy `/api/*` so the browser sees same-origin requests and the existing `SameSite=Strict` HttpOnly cookies remain usable.     |
| Express API | Render Free Web Service         | `https://<service>.onrender.com` | API URL is the proxy's upstream. Free service sleeps after 15 minutes idle, can take about a minute to wake, has an ephemeral filesystem, and can restart. Suitable for preview only. |
| MongoDB     | MongoDB Atlas Free cluster (M0) | Atlas SRV URI                    | Demo/test data only. Small storage/throughput limits, no standard managed backup, and automatic pause after 30 days without connections.                                              |

The Pages Function source is `functions/api/v1/[[path]].ts`. It forwards the original `/api/v1/...`
request to the Render origin and passes cookies through. The
browser calls the Pages origin, never the cross-site Render origin. Do not change the auth cookies to
`SameSite=None` to work around a missing proxy. `client/public/_routes.json` invokes the Function only
for `/api/*`; static asset requests do not invoke it.

Cloudflare Pages Functions require Git integration; dashboard Direct Upload does not support a
project containing Functions. No push has been made. The source must be present in a Git provider
repository before you can connect the provider and deploy.

## Before creating services

1. Confirm this is a throwaway demo environment and create no real users or records.
2. Run `npm ci`, `npm run lint`, `npm run test:server`, and `npm run build` locally. These commands
   do not test the Pages Function runtime or external providers.
3. Use an Atlas database user restricted to the demo database. Do not use an Atlas project owner as
   the application database user.
4. Install MongoDB Database Tools if you need manual M0 backup/restore; `mongodump` and
   `mongorestore` are not part of this Node project.
5. Do not choose any paid plan, paid backup add-on, custom domain, or payment live mode.

## Step 1: Create a demo Atlas cluster

1. In MongoDB Atlas, create/select a project and create a Free cluster in a suitable region.
2. Create a dedicated database user with read/write access only to this application's demo database.
3. In Network Access, add the outbound CIDR ranges shown on the Render API service's **Connect →
   Outbound** panel for that service's selected region. Keep the list restricted; do not use
   `0.0.0.0/0`. Re-check it if Render changes the service's outbound ranges.
4. Copy the SRV URI privately. URL-encode reserved username/password characters. Never paste the
   credential-bearing URI into chat, screenshots, Git, or frontend settings.
5. Treat Atlas M0 as disposable demo storage. It is limited to 0.5 GB and 100 operations/second and
   can pause after 30 days without a connection. M0 does not generally include standard Atlas Cloud
   Backups; manual `mongodump` is the documented fallback. Atlas has an optional Free-cluster backup
   preview in some accounts that can cost up to USD $3/month and requires a payment method. Do not
   enable it without separate approval.

## Step 2: Create the Render API preview

In Render, create **New → Web Service** from the Git repository after it has been pushed/connected
with your approval. Configure:

| Setting           | Value                            |
| ----------------- | -------------------------------- |
| Root Directory    | repository root (`.` / blank)    |
| Runtime           | Node                             |
| Plan              | Free, for preview only           |
| Build Command     | `npm ci && npm run build:server` |
| Start Command     | `node server/dist/server.js`     |
| Health Check Path | `/api/v1/health/ready`           |

Set environment variables using [environment-setup.md](environment-setup.md). Set `HOST=0.0.0.0`;
leave `PORT` unset because Render supplies it. `NODE_ENV=production` makes the API require the
MongoDB URI, JWT secret, SMTP host/from, non-local frontend URL, and production CORS configuration.

For the expected Pages URL, choose the Pages project name first and configure:

- `FRONTEND_URL=https://<project>.pages.dev`
- `CORS_ORIGINS=https://<project>.pages.dev`

Use the exact origin with no trailing slash. Do not add wildcard, localhost, or arbitrary preview
origins. Render assigns an HTTPS `onrender.com` URL after the service is created; save it as the
Pages Function `API_ORIGIN` in Step 3. Confirm
`https://<service>.onrender.com/api/v1/health` returns `200` and
`https://<service>.onrender.com/api/v1/health/ready` returns `200` before connecting the UI.

### Render free-host caveats

- The process sleeps after 15 idle minutes; the first request can wait about a minute.
- The local filesystem is ephemeral. Never save uploads, backups, or persistent state there.
- It has a monthly 750 free instance-hour allowance; exhaustion suspends free services until the
  allowance resets. Free service may restart at any time and cannot scale horizontally.
- It cannot run one-off jobs. Subscription expiry, overdue-invoice, and notification timers run in
  this API process, so they are not dependable while it is asleep or restarted. Treat reminders as
  best-effort preview behavior only.
- Render Free blocks outbound SMTP ports 25, 465, and 587. The current API uses Nodemailer SMTP;
  invitation, password-reset, and notification email will not work with providers using those ports.
  Do not invite users until an approved relay using a supported port is configured and tested, or a
  server-side HTTPS email adapter is implemented. No email provider is selected here.
- Render's outbound IP ranges are shared and may change. Allowlist the currently displayed ranges
  in Atlas and monitor for changes; a fixed dedicated IP is a paid feature.

These restrictions make Render Free inappropriate for a real business or production workloads.

## Step 3: Create Cloudflare Pages

Create a Git-connected Pages project using the project name selected in Step 2. In **Build &
deployments** use:

| Setting                | Value                                                         |
| ---------------------- | ------------------------------------------------------------- |
| Root directory         | repository root (`/`)                                         |
| Build command          | `npm ci && npm run build:client`                              |
| Build output directory | `client/dist`                                                 |
| Node.js build version  | `22.12.0` (or a tested compatible version at least `22.12.0`) |

Set these Pages variables:

| Variable            | Value                            | Visibility                                              |
| ------------------- | -------------------------------- | ------------------------------------------------------- |
| `VITE_API_BASE_URL` | `/api/v1`                        | Build-time public path; bundled into client             |
| `API_ORIGIN`        | `https://<service>.onrender.com` | Pages Function runtime config; hostname is not a secret |

Never put a database URI, JWT secret, SMTP credential, or Razorpay secret into `VITE_*` variables.
Keep preview-branch environments disconnected from the demo database, or disable previews.

The repository provides:

- `functions/api/v1/[[path]].ts` — Pages Function reverse proxy for API requests.
- `client/public/_routes.json` — restricts Function invocation to `/api/*`.
- `client/public/_headers` — security headers for static frontend assets. API responses use Express
  Helmet. CSP permits the Razorpay Test checkout host and inline chart height styles already used by
  the UI.

Pages Functions requests count against Cloudflare Workers Free usage (currently 100,000 requests per
day shared with Workers; limits can change). Static assets do not invoke Functions with the provided
route configuration. Set the Pages Function limit behavior to fail closed if available, so exhausted
proxy quota does not silently serve an app whose authenticated API calls cannot work.

## Step 4: Verify preview behavior

After Pages deploys, use only synthetic demo data and verify:

1. `https://<project>.pages.dev` loads and client-side routes survive refresh.
2. `https://<project>.pages.dev/api/v1/health` returns the API health response through the proxy.
3. `https://<project>.pages.dev/api/v1/health/ready` returns `200` while Atlas is connected.
4. Browser developer tools show API calls to the Pages origin (not direct `onrender.com` calls),
   with cookies marked HttpOnly, Secure, and SameSite Strict.
5. Login, session refresh, logout, CSRF-protected mutations, password reset/invitations, PDF download,
   and Razorpay Test Mode checkout/webhook flow are smoke-tested. Do not use live credentials.
6. Requests with an unapproved `Origin` do not receive credentialed CORS access.
7. Render logs contain request IDs and safe error names only; no cookies, passwords, tokens, database
   URIs, personal records, or payment credentials appear.
8. Check that API rate limiting distinguishes expected clients behind the Pages Function and Render
   proxy chain. The server currently trusts one proxy hop; do not increase the trust count until the
   actual forwarded-header chain is verified, since trusting client-supplied forwarding headers can
   weaken rate limits and request attribution.

`health/ready` is the database readiness check; `/health` is process liveness only. Do not interpret
a public health response as proof that email, the payment provider, scheduled jobs, or backups work.

## Manual backup and restore

M0 manual exports are not automatic backups. Use an encrypted local/approved backup location and a
separate demo target for rehearsal. Never restore over live or source data as part of this preview.
The `--config` file stores the credential-bearing URI outside process command-line arguments; keep
it outside Git with owner-only filesystem permissions.

Example PowerShell workflow (replace placeholders locally; do not paste real values into shared
logs):

```powershell
# Create a private temporary YAML config file with this content:
# uri: "mongodb+srv://<encoded-user>:<encoded-password>@<cluster>/<database>?retryWrites=true&w=majority"
# Restrict the file ACL to your Windows account before use.
$env:ATLAS_CONFIG = "C:\secure\atlas-tools.yml"
$env:BACKUP_ARCHIVE = "C:\secure\vrk-demo-YYYYMMDD.archive.gz"

mongodump --config=$env:ATLAS_CONFIG --archive=$env:BACKUP_ARCHIVE --gzip

# Restore only into a separately created empty demo cluster/database:
mongorestore --config=$env:ATLAS_CONFIG --archive=$env:BACKUP_ARCHIVE --gzip --stopOnError

Remove-Item Env:ATLAS_CONFIG
Remove-Item Env:BACKUP_ARCHIVE
```

Verify the archive exists, store it encrypted and access-controlled, and record its date/size and
restore target. After rehearsal, verify collection counts, indexes, health readiness, and expected
synthetic records. The connection config must point at the **target** cluster during restore. Never
use `--drop` against the source. See the official [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/)
and [mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/) manuals.

## File storage

The current application has no upload API or object-storage adapter. Product images are optional
HTTPS `imageUrl` references; the logo and frontend assets are static files bundled by Vite. Do not
upload images to the Render filesystem: it is ephemeral. Do not add fake storage environment
variables; there is no server-side storage configuration to set yet. A future approved upload feature
must add an object-storage adapter, access controls, file validation, retention rules, and secret
configuration before accepting user uploads.

## Rollback and stop conditions

- Do not add customer/employee production data to free demo services.
- Do not enable live Razorpay keys or live checkout.
- Stop before service upgrades, paid backups, paid egress IPs, domains, or other paid add-ons.
- Roll back a bad preview through provider deployment history. This does not roll back database
  writes; use synthetic data only and restore only to an isolated target.
- Any failure of auth cookies, readiness, CORS, or the test-payment flow blocks sharing the preview.

Provider docs: [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/),
[Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/),
[Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/),
[Render free services](https://render.com/docs/free), [Render web services](https://render.com/docs/web-services),
[Render outbound IPs](https://render.com/docs/outbound-ip-addresses), and
[Atlas Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/),
and [Free cluster backup preview details](https://www.mongodb.com/docs/atlas/backup/cloud-backup/free-cluster-backup/).
