# Project Tracker

A simple Kanban project tracker. Read `GLOSSARY.md` first and use its terms exactly (Project, Ticket, Column, WIP limit, etc.) in code, tests, and commit messages.

## Stack

- Monorepo (npm workspaces): `apps/api`, `apps/web`, `packages/shared`
- API: TypeScript, Fastify, Drizzle ORM (SQL migrations committed), Postgres
- Web: React, Vite, TypeScript, TanStack Query, React Router, dnd-kit, Tailwind, react-markdown (no raw HTML)
- `packages/shared`: Zod schemas and types. This is the contract between API and web.

## TDD workflow (mandatory)

Work test-first, one vertical slice at a time. A slice is one user-visible behaviour, not a layer.

1. **Red**: write one failing test for the next behaviour. Run it and confirm it fails for the right reason.
2. **Green**: write the minimum code to pass. Nothing more.
3. **Refactor**: clean up with the tests green.
4. Repeat. Never write production code without a failing test that demands it. Never write all tests up front.

Test through the public edge of each side, never internals:

- **API**: Vitest + `app.inject()` against a **real Postgres**. Do not mock the database. Tests simulate HTTP calls and assert on responses and persisted state. Mock only genuinely external services (none in v1).
- **Web**: Playwright Test against the Vite dev server, with the **API mocked** via `page.route()`. Tests simulate user interactions (drag, click, type). Do not use React Testing Library.
- Vitest is also fine for pure utility logic (e.g. fractional-index helpers).
- There are no cross-stack end-to-end tests. Each suite mocks the other side.

**Contract drift guard**: API tests validate every response against the shared Zod schemas, and Playwright mock fixtures are typed and validated against the same schemas. If you change an API shape, change the schema in `packages/shared` first.

**Priority order for invariants**: authorization, then WIP limits, then ordering. Cover these before UI polish.

Before claiming work is done, run both suites and show the output.

## Domain rules (enforce server-side, never only in the UI)

- Every request checks authorization: only Project members can see a Project; only the Owner can delete it or manage members.
- WIP limits are hard: a move that would exceed a Column's limit is rejected.
- Ticket order within a Column uses fractional-index string keys.
- Tickets are archived, never hard-deleted. A non-empty Column cannot be deleted.
- Each ticket change writes a Ticket event in the same transaction.
- Only a Comment's author can edit or delete it.

## Security (public repo)

- Never commit secrets. `.env.example` holds placeholders only; config comes from env vars and fails fast if missing.
- Auth: server-side sessions in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie stored in Postgres; argon2id password hashing; CSRF protection; login rate limiting. No public sign-up; users are created via a CLI command.
- Validate every route's input with Zod. Use helmet for security headers.
- Render Markdown without raw HTML.

## Deployment

Single multi-stage Dockerfile; the Fastify container serves `/api` and the built frontend from one origin, runs as non-root, and runs migrations on startup. `docker-compose.yml` provides local Postgres plus a dev profile with hot reload. Production runs only the app container with `DATABASE_URL`.

## Conventions

- Keep `GLOSSARY.md` free of implementation details; update it when a domain term is resolved.
- CI runs lint, both test suites separately, and `npm audit`.
