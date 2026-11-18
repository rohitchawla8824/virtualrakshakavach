# Virtual Raksha Kavach

Virtual Raksha Kavach is a web-only business management system for the business owner, employees,
and customers, using the supplied black, white, and red brand identity. This repository currently contains the runnable project foundation: a React client,
an Express health API, shared tooling, and architecture documentation. Business workflows are added
in later approved phases.

## Technology

- Client: React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form,
  Zod, and Framer Motion
- Server: Node.js, Express 5, TypeScript, Mongoose, MongoDB Atlas, Zod, Helmet, CORS, rate limiting,
  and Pino structured logging
- Tooling: a single root npm manifest for the client/server monorepo, ESLint, Prettier, and TypeScript
- Persistence: MongoDB Atlas with Mongoose (connection configured through the server environment)

## Requirements

- Node.js 22.12 or newer (the Vite toolchain requires a recent Node.js release)
- npm 10 or newer

## Setup

```sh
npm install
```

Copy `client/.env.example` to `client/.env` only if you need to change client defaults. For MongoDB,
copy `server/.env.example` to `server/.env` and replace its URI placeholder with a private Atlas URI.
Without `MONGODB_URI`, the API still serves liveness but readiness reports `503`. Never commit `.env`
files or put secrets in `VITE_` variables; those values are included in the browser build.

## Run locally

Start the client and API together:

```sh
npm run dev
```

- Client: <http://127.0.0.1:5173>
- API health: <http://127.0.0.1:4000/api/v1/health>
- Database readiness: <http://127.0.0.1:4000/api/v1/health/ready>

Vite proxies `/api` requests to the local API. Atlas setup, environment variables, collections,
indexes, API conventions, and the development-only seed guard are described in
[Database and Environment Guide](docs/database-and-environment.md).

Run server API integration tests with:

```sh
npm run test:server
```

For the first administrator only, configure `MONGODB_URI` and generate `JWT_ACCESS_SECRET` in
`server/.env`, then run `npm run auth:create-admin` in an interactive terminal. The password prompt
is hidden and there is no default admin credential. Use the Admin account to invite Employees and
Customers; public self-registration is disabled. SMTP must be configured to deliver invitation and
password-reset links.

For local development when SMTP is unavailable, reset an existing active administrator password
with `npm run auth:reset-admin`. This command is restricted to `NODE_ENV=development`, prompts for
the admin email and new password in an interactive terminal, and revokes existing sessions and
pending password-reset links. Production password resets must use the emailed one-time link.

The development seed is opt-in. Set `ENABLE_DEV_SEED=true` in `server/.env` only when
`NODE_ENV=development`, then run `npm run seed:dev`. It creates only clearly labelled catalogue
categories, never customer or account data.

## Quality checks

```sh
npm run lint
npm run build
npm run format:check
```

## Project guide

- [Permanent project rules](AGENTS.md)
- [Architecture](docs/architecture.md)
- [Development plan](docs/development-plan.md)
- [API specification](docs/api-specification.md)
- [Database and environment guide](docs/database-and-environment.md)
- [Public preview deployment guide](docs/deployment-guide.md)
- [Deployment environment setup](docs/environment-setup.md)
- [Production readiness checklist](docs/production-checklist.md)
- [Business Decision Log](docs/business-decisions.md)

Do not use real customer data in local development. Do not enable live payments or finalize GST
calculations until the pending decisions are approved and documented.
