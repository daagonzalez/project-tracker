# Project Tracker

A small Kanban project tracker, a self-hosted, simpler take on Jira. Multiple **Projects**, each with
one board of **Columns** and **Tickets**; Tickets carry a description, comments, labels, story points,
an assignee and links (e.g. to pull requests). Columns can have a hard **WIP limit**. See
[GLOSSARY.md](GLOSSARY.md) for the exact terms.

Stack: TypeScript monorepo (npm workspaces): Fastify + Drizzle + Postgres API (`apps/api`), React + Vite
web app (`apps/web`), and Zod schemas shared by both (`packages/shared`).

## Quick start (Docker)

```sh
cp .env.example .env            # then edit POSTGRES_PASSWORD (and DATABASE_URL if you use it outside Docker)
docker compose up -d --build    # Postgres + the app on http://localhost:3000
docker compose exec app node dist/cli/create-user.js you@example.com   # prompts for a password (min 12 chars)
```

There is no public sign-up: every user is created with that command. Open http://localhost:3000 and sign in.
Migrations run automatically when the app starts.

### Development with hot reload

```sh
docker compose up -d db
docker compose --profile dev up api-dev web-dev   # API on :3000, web on http://localhost:5173
```

Or without containers for the app: `npm ci`, `docker compose up -d db`, then `npm run dev -w apps/api` and
`npm run dev -w apps/web`.

## Configuration

Config comes from environment variables and the app refuses to start if a required one is missing.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `NODE_ENV` | no | `development` (default), `test`, `production` |
| `PORT` | no | HTTP port, default `3000` |
| `WEB_DIST_DIR` | no | Directory of the built web app to serve (set in the Docker image) |
| `TRUST_PROXY` | no | Set `true` when running behind a reverse proxy you control (TLS terminator). Without it the login rate limit sees only the proxy's address; leave `false` if the app is directly exposed, since clients could forge `X-Forwarded-For` |
| `POSTGRES_PASSWORD` | compose | Password for the local compose database |
| `TEST_DATABASE_URL` | tests | Database used by the API test suite |

`.env.example` holds placeholders only. Never commit a real `.env`.

## Tests

Two separate suites; each mocks the other side (there are no cross-stack end-to-end tests).

```sh
docker compose up -d db                 # the API tests need a real Postgres (never mocked)
npm test -w apps/api                    # Vitest + app.inject() against Postgres
npm run test:e2e -w apps/web            # Playwright against the Vite dev server, API mocked
npm run lint && npm run typecheck
```

CI runs lint, both suites, `npm audit` and a Docker build as separate jobs.

## Deployment

Merges to `main` deploy automatically to a Raspberry Pi behind HTTPS. See
[docs/deploy-pi.md](docs/deploy-pi.md) for the one-time setup.

## Design decisions

- **Server-side sessions, not JWTs.** A session row in Postgres (token stored hashed) behind an
  `HttpOnly` cookie can be revoked instantly and never exposes a bearer token to JavaScript. This is a
  single-origin app, so the usual reasons for JWTs (stateless scaling, cross-service auth) don't apply.
- **One container.** The Fastify container serves `/api` and the built frontend from the same origin.
  That keeps cookies first-party (`SameSite=Lax`), removes CORS, and means production is one image plus
  a database.
- **Authorization, WIP limits and ordering are enforced on the server**, never only in the UI. Ticket
  order uses fractional-index keys so a move rewrites one row.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.
