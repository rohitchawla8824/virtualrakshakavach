# Deployment Environment Setup

Use separate preview and production environments. This document provides **preview configuration**;
free-tier services are not production-grade. Never commit environment files or store secrets in the
React client. The server validates environment variables at startup in
`server/src/config/env.ts`.

## URLs and request path

| Name             | Example                          | Used by                                            |
| ---------------- | -------------------------------- | -------------------------------------------------- |
| Frontend origin  | `https://<project>.pages.dev`    | `FRONTEND_URL`, exact allowed `CORS_ORIGINS` entry |
| API origin       | `https://<service>.onrender.com` | Pages Function `API_ORIGIN` only                   |
| Browser API base | `/api/v1`                        | `VITE_API_BASE_URL`; same-origin path on Pages     |

Browser requests must go to the Pages origin. `SameSite=Strict` cookies are incompatible with direct
browser requests from `pages.dev` to `onrender.com`; the Pages Function forwards `/api/*` to the
Render API while keeping cookies on the frontend origin. Set CORS to the exact Pages origin. Do not
set `VITE_API_BASE_URL` to the Render URL.

## Render API service variables

Configure these in the Render service's environment settings. Do not add a `.env` file to the Git
repository or print secret values in deployment logs.

| Name                           | Value / rule                                                                                     | Secret?                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `NODE_ENV`                     | `production`                                                                                     | No                                                  |
| `NODE_VERSION`                 | `22.12.0` or a tested compatible version at least `22.12.0`                                      | No                                                  |
| `HOST`                         | `0.0.0.0` (Render public services require this bind address)                                     | No                                                  |
| `PORT`                         | Leave unset; Render injects the listener port                                                    | No                                                  |
| `MONGODB_URI`                  | Atlas demo-cluster URI; URL-encode reserved credential characters; use a least-privilege DB user | **Yes**                                             |
| `JWT_ACCESS_SECRET`            | Random, unique secret with at least 32 characters; generate locally, never reuse/commit          | **Yes**                                             |
| `FRONTEND_URL`                 | Exact stable frontend origin, e.g. `https://<project>.pages.dev`                                 | No                                                  |
| `CORS_ORIGINS`                 | Same exact origin only; no wildcard, localhost, or branch-preview domains                        | No                                                  |
| `SMTP_HOST`                    | Approved mail relay host (required by production schema)                                         | No                                                  |
| `SMTP_PORT`                    | Relay port reachable from the chosen backend host                                                | No                                                  |
| `SMTP_SECURE`                  | `true` when the relay requires implicit TLS; otherwise `false` as agreed with provider           | No                                                  |
| `SMTP_USER`                    | Relay account username if needed                                                                 | **Yes**                                             |
| `SMTP_PASSWORD`                | Relay account password/token if needed                                                           | **Yes**                                             |
| `SMTP_FROM`                    | Verified sender address                                                                          | No                                                  |
| `LOG_LEVEL`                    | `info`                                                                                           | No                                                  |
| `RATE_LIMIT_WINDOW_MS`         | `60000`                                                                                          | No                                                  |
| `RATE_LIMIT_MAX`               | `120` (adjust only after reviewing abuse/capacity needs)                                         | No                                                  |
| `ENABLE_DEV_SEED`              | `false`                                                                                          | No                                                  |
| `RAZORPAY_TEST_KEY_ID`         | Blank to disable checkout; otherwise an `rzp_test_...` key only                                  | Public test identifier, still keep in server config |
| `RAZORPAY_TEST_KEY_SECRET`     | Blank unless matching test ID is configured                                                      | **Yes**                                             |
| `RAZORPAY_TEST_WEBHOOK_SECRET` | Test webhook secret if webhook testing is configured                                             | **Yes**                                             |

Render supplies `PORT`; the app default is only for local development. The API's production startup
rejects missing MongoDB, JWT, SMTP host/from, local frontend URLs, and local CORS origins. SMTP is
mandatory in production because account invitation and recovery links are email-based.

### SMTP caveat for Render Free

Render Free blocks outbound ports `25`, `465`, and `587`; many SMTP providers require one of those.
The application's current mail adapter speaks SMTP, not an email provider's HTTPS API. Before using
Render Free, confirm an approved relay supports a permitted port (for example, a provider-supported
alternate submission port), and test invitation, reset, and notification messages. If not, email
features are a blocker for this hosting choice; do not enter customer accounts that cannot recover
access. Do not select a paid provider or host without approval.

## Cloudflare Pages variables

Set build and Function variables in the Pages project's **Production** environment. Keep preview
branches disconnected from the demo database unless they have an isolated database of their own.

| Name                | Value                                         | Purpose                                                   |
| ------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `NODE_VERSION`      | `22.12.0` (or tested compatible >= `22.12.0`) | Pages build runtime                                       |
| `VITE_API_BASE_URL` | `/api/v1`                                     | Public build-time API path; deliberately same-origin      |
| `API_ORIGIN`        | `https://<service>.onrender.com`              | Pages Function upstream; runtime variable, no credentials |

Only `VITE_*` values are compiled into JavaScript. Never put MongoDB, JWT, SMTP, or Razorpay secrets
there. `VITE_API_PROXY_TARGET` is for local Vite development and must not be set to a secret or used
as the production browser API URL.

## Local secret generation and backup files

Generate a unique JWT secret locally with Node:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Paste it directly into the hosting provider's secret field. Never paste it into chat, source code,
frontend build variables, screenshots, or a committed `.env`. Keep backup-tool config files and
database archives outside the repository in encrypted, access-controlled storage; see
[deployment-guide.md](deployment-guide.md#manual-backup-and-restore).

## Rotation and cleanup

1. If a secret is exposed, rotate it at the issuer (MongoDB user, SMTP provider, JWT, or Razorpay
   Test Mode) and replace the server secret. Rotating the JWT secret invalidates signed access
   cookies; revoke/expire sessions as required by the auth behavior.
2. Remove unused preview environment variables, preview deployments, and Atlas demo users/clusters
   when the experiment ends.
3. Keep live Razorpay credentials absent. This project explicitly supports Test Mode only until the
   owner separately approves live integration and deployment.
