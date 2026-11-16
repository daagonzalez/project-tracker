# Project Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a simple multi-user Kanban project tracker (API + React UI) that runs locally and in production as a single Docker container backed by Postgres.

**Architecture:** npm-workspaces monorepo. Fastify API (`apps/api`) owns all invariants (authorization, WIP limits, ordering, events) and is tested through `app.inject()` against a real Postgres. React SPA (`apps/web`) is tested with Playwright against the Vite dev server with the API mocked via `page.route()`. `packages/shared` holds Zod schemas that are the only link between the two suites.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM + drizzle-kit, Postgres 16, argon2, `fractional-indexing`, Zod, Vitest, React, Vite, TanStack Query, React Router, dnd-kit, Tailwind, react-markdown, Playwright, Docker.

**Spec:** `CLAUDE.md` (stack, TDD workflow, domain rules, security) and `GLOSSARY.md` (vocabulary). Both are authoritative; read them first.

## Global Constraints

- Follow the TDD workflow in `CLAUDE.md`: one failing test, minimum code, refactor, one vertical slice at a time. Show test output before claiming a task done.
- Use `GLOSSARY.md` terms exactly: Project, Ticket, Column, WIP limit, Label, Story points, Link, Comment, Owner, Member, Archive, Ticket event. No "board", "card", "issue" as entities.
- Story points scale: `1, 2, 3, 5, 8, 13` or null.
- WIP limit is hard and enforced server-side; counts non-archived tickets only.
- Ticket order uses `fractional-indexing` string keys (`generateKeyBetween`) in a `position text COLLATE "C"` column.
- Tickets are archived, never deleted. A non-empty Column cannot be deleted.
- Every ticket mutation writes a `ticket_events` row in the same transaction.
- Non-members get `404` (not `403`) for any Project-scoped resource, so existence is not leaked.
- Error body shape: `{ "error": { "code": string, "message": string } }`. Codes used: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `WIP_LIMIT_EXCEEDED` 409, `COLUMN_NOT_EMPTY` 409, `VALIDATION` 400, `CSRF` 403, `RATE_LIMITED` 429.
- Sessions: server-side in Postgres, cookie `sid` `HttpOnly; Secure; SameSite=Lax` (`Secure` off only when `NODE_ENV=development`). Mutating requests must send header `x-csrf-token` equal to the session's token.
- Passwords: argon2id. Users only via CLI. No secrets committed; config from env, fail fast.
- Markdown rendered without raw HTML. Link URLs must be `http:` or `https:`.
- Node 22, ESM, TypeScript `strict`.

## Review Focus

Inputs and failures the spec implies but nothing above spells out, each pinned by a test in the owning task:

1. Two concurrent moves into the last free slot of a limited Column: exactly one succeeds (Task 9).
2. Referencing another Project's Label, assignee, or Column on a Ticket: rejected as validation/not-found, never silently accepted (Tasks 7, 9).
3. Link URL with `javascript:` or `data:` scheme: rejected (Task 10).
4. Markdown containing `<script>` or `<img onerror>`: rendered as inert text (Task 16).
5. Login with unknown email vs wrong password: identical response and status (Task 4).

## Assumptions to confirm (not decided in the design session)

- New Projects are created with default Columns "To Do", "In Progress", "Done" (no WIP limit).
- Column reordering and Project/Column renaming beyond a plain PATCH are out of scope for v1; Columns append at the end.
- Lowering a WIP limit below the current ticket count is rejected (409 `WIP_LIMIT_EXCEEDED`).
- Moving a ticket within its own Column is always allowed, even if the Column is over limit.
- Restoring an archived Ticket returns it to its original Column and is subject to the WIP limit.
- Max lengths: Ticket title 200, Project/Column/Label name 80, description and comment 20 000 chars.

## File Structure

```
.gitattributes  .gitignore  .env.example  .dockerignore
package.json (workspaces)  tsconfig.base.json  eslint.config.js
Dockerfile  docker-compose.yml  README.md  SECURITY.md
.github/workflows/ci.yml  .github/dependabot.yml
packages/shared/src/{index,auth,project,column,label,ticket,comment,link,event,errors}.ts
apps/api/
  drizzle.config.ts  drizzle/            (generated SQL migrations)
  src/config.ts  src/db/{client,schema,migrate}.ts  src/app.ts  src/server.ts
  src/plugins/{session,csrf,errors}.ts
  src/modules/{auth,projects,columns,labels,tickets,comments,links,events}/{routes,service}.ts
  src/cli/create-user.ts  src/lib/{ordering,authz}.ts
  test/support/{testApp,factories}.ts  test/*.test.ts
apps/web/
  vite.config.ts  playwright.config.ts  tailwind config
  src/{main,App}.tsx  src/api/{client,hooks}.ts  src/pages/*  src/components/*
  e2e/support/{mockApi,fixtures}.ts  e2e/*.spec.ts
```

---

### Task 1: Monorepo scaffold and tooling

**Files:**
- Create: root `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.gitignore`, `.gitattributes` (`* text=auto eol=lf`), `.env.example`, `packages/shared/{package.json,tsconfig.json,src/index.ts,src/errors.ts}`, `apps/api/{package.json,tsconfig.json}`, `apps/web/package.json` (placeholder), `docker-compose.yml` (Postgres 16 service `db` only for now, credentials via env with dev defaults in `.env.example`)
- Test: `packages/shared/src/errors.test.ts`

**Interfaces:**
- Produces: `errorBodySchema` (Zod: `{ error: { code: string, message: string } }`) and `type ErrorCode` exported from `@tracker/shared`. Root scripts `npm test` (runs `test` in all workspaces), `npm run lint`.

- [ ] **Step 1: Write failing test** `errors.test.ts`: `errorBodySchema.parse({error:{code:"NOT_FOUND",message:"x"}})` succeeds; `errorBodySchema.safeParse({error:{}}).success === false`.
- [ ] **Step 2: Run** `npm test -w packages/shared` → FAIL (module missing).
- [ ] **Step 3: Implement** workspace config (packages named `@tracker/shared`, `@tracker/api`, `@tracker/web`), Vitest in `shared`, and `errors.ts`.
- [ ] **Step 4: Run** `npm test && npm run lint` → PASS.
- [ ] **Step 5: Commit** `chore: scaffold monorepo`.

### Task 2: Database schema, migrations, test harness

**Files:**
- Create: `apps/api/src/config.ts`, `apps/api/src/db/{client,schema,migrate}.ts`, `apps/api/drizzle.config.ts`, `apps/api/test/support/testApp.ts`, `apps/api/test/support/factories.ts`
- Test: `apps/api/test/schema.test.ts`

**Interfaces:**
- Produces: `loadConfig(env = process.env): Config` (`{ databaseUrl, sessionSecret?, nodeEnv, port }`; throws listing every missing var). Drizzle tables: `users(id uuid, email unique citext, passwordHash, createdAt)`, `sessions(id, userId, csrfToken, expiresAt)`, `projects(id, name, ownerId, createdAt)`, `projectMembers(projectId, userId)` PK composite, `columns(id, projectId, name, position text, wipLimit int null)`, `labels(id, projectId, name, color)`, `tickets(id, projectId, columnId, title, description, points int null, assigneeId null, position text collate "C", archivedAt null, createdAt, updatedAt)`, `ticketLabels(ticketId, labelId)`, `ticketLinks(id, ticketId, url, title null)`, `comments(id, ticketId, authorId, body, createdAt, updatedAt)`, `ticketEvents(id, ticketId, actorId, type, data jsonb, createdAt)`. `runMigrations(db)`. Test helpers: `createTestApp(): Promise<{ app: FastifyInstance, db, reset(): Promise<void> }>` (`reset` truncates all tables `CASCADE`; reads `TEST_DATABASE_URL`), and factories `makeUser`, `makeProject({ownerId})`, `makeColumn`, `makeTicket`, `loginAs(app, user): Promise<{ cookie: string, csrf: string }>` (the last wired up in Task 4).
- Check constraints: `points IN (1,2,3,5,8,13)`; `wip_limit >= 1`.

- [ ] **Step 1: Write failing tests** in `schema.test.ts`: inserting a ticket with `points = 4` throws a check violation; inserting a column with `wipLimit = 0` throws; deleting a project cascades to its columns/tickets; `loadConfig({})` throws an error naming `DATABASE_URL`.
- [ ] **Step 2: Run** `npm test -w apps/api -- schema` → FAIL.
- [ ] **Step 3: Implement** schema, `drizzle-kit generate` to commit SQL migrations, `runMigrations`, `loadConfig`, test support. `createTestApp` runs migrations once per process.
- [ ] **Step 4: Run** `docker compose up -d db && npm test -w apps/api` → PASS.
- [ ] **Step 5: Commit** `feat(api): database schema and test harness`.

### Task 3: Fastify app factory, errors, security headers, validation

**Files:**
- Create: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/plugins/errors.ts`
- Test: `apps/api/test/app.test.ts`

**Interfaces:**
- Produces: `buildApp(deps: { db: Db, config: Config }): FastifyInstance` with `GET /api/health → {status:"ok"}`; a route helper `defineRoute` (or Fastify Zod type provider) so every route validates body/params/query with Zod and returns `400 VALIDATION` in the standard error shape; unknown errors return `500` with a generic message (no stack trace).
- Consumes: Task 2 `Config`, `Db`.

- [ ] **Step 1: Write failing tests** via `app.inject()`: health returns 200; response has helmet headers (`x-content-type-options: nosniff`, `content-security-policy` present); an invalid body on a test-only route returns 400 with `errorBodySchema`-valid JSON and code `VALIDATION`; a thrown `Error("secret")` returns 500 whose body does not contain "secret".
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): app factory with errors and headers`.

### Task 4: Authentication (sessions, CSRF, rate limit, create-user CLI)

**Files:**
- Create: `apps/api/src/plugins/{session,csrf}.ts`, `apps/api/src/modules/auth/{routes,service}.ts`, `apps/api/src/cli/create-user.ts`, `packages/shared/src/auth.ts`
- Test: `apps/api/test/auth.test.ts`

**Interfaces:**
- Produces: `POST /api/auth/login {email,password} → 200 {user:{id,email}, csrfToken}` + `Set-Cookie sid`; `POST /api/auth/logout → 204`; `GET /api/auth/me → 200 {user, csrfToken} | 401`. `requireUser(request): User` throws `UNAUTHENTICATED`. CSRF hook on all non-GET/HEAD `/api` routes except `/api/auth/login`. CLI: `node dist/cli/create-user.js <email>` reads password from `TRACKER_NEW_USER_PASSWORD` env or a hidden prompt; hashes with argon2id. Shared: `loginRequestSchema`, `sessionResponseSchema`, `userSchema`. Test helper `loginAs` (Task 2) implemented here.

- [ ] **Step 1: Write failing tests:** login with valid credentials sets an `HttpOnly; SameSite=Lax` cookie and returns csrfToken; **unknown email and wrong password return identical status and body** (`UNAUTHENTICATED`); `/me` without cookie → 401; a POST with a valid cookie but no/incorrect `x-csrf-token` → 403 `CSRF`; logout invalidates the session (`/me` → 401 afterwards); expired session → 401; 6th failed login within the window → 429 `RATE_LIMITED`; stored `passwordHash` starts with `$argon2id$`; `create-user` service function creates a user and refuses a duplicate email.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (session id = 32 random bytes base64url, store only its SHA-256 hash; use `@fastify/rate-limit` on login keyed by IP+email). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): sessions, csrf, login rate limiting, create-user cli`.

### Task 5: Projects and membership (authorization invariant)

**Files:**
- Create: `apps/api/src/lib/authz.ts`, `apps/api/src/modules/projects/{routes,service}.ts`, `packages/shared/src/project.ts`
- Test: `apps/api/test/projects.test.ts`

**Interfaces:**
- Produces: `assertMember(db, userId, projectId): Promise<{ isOwner: boolean }>` (throws `NOT_FOUND` for non-members/unknown ids) and `assertOwner(...)` (member non-owner → `FORBIDDEN`). Routes: `GET /api/projects` (only own memberships), `POST /api/projects {name}` (creator becomes Owner and Member; seeds default Columns), `GET/PATCH /api/projects/:projectId`, `DELETE /api/projects/:projectId` (Owner), `GET /api/projects/:projectId/members`, `POST .../members {email}` (Owner; unknown email → 404), `DELETE .../members/:userId` (Owner; cannot remove the Owner). Shared: `projectSchema`, `createProjectSchema`, `memberSchema`.
- Later tasks must call `assertMember` first in every Project-scoped handler, resolving the Project from the resource (ticket → project, etc.).

- [ ] **Step 1: Write failing tests:** unauthenticated → 401 on each route; user B cannot GET/PATCH/DELETE user A's project (404 each); `GET /api/projects` lists only the caller's projects; Owner adds member by email and the member can then GET it; member (non-owner) DELETE → 403 and add-member → 403; Owner cannot be removed; new project has 3 default Columns.
- [ ] **Step 2–4:** run FAIL, implement, run PASS. **Step 5: Commit** `feat(api): projects and membership`.

### Task 6: Columns and WIP limits

**Files:**
- Create: `apps/api/src/modules/columns/{routes,service}.ts`, `packages/shared/src/column.ts`
- Test: `apps/api/test/columns.test.ts`

**Interfaces:**
- Produces: `POST /api/projects/:projectId/columns {name, wipLimit: int>=1|null}` (appended via `generateKeyBetween(lastPosition, null)`), `PATCH /api/columns/:columnId {name?, wipLimit?}`, `DELETE /api/columns/:columnId`. Shared: `columnSchema`, `createColumnSchema`, `updateColumnSchema`.
- Consumes: `assertMember` from Task 5 (resolve project via column).

- [ ] **Step 1: Write failing tests:** non-member → 404 on all three; create sets order after existing; `wipLimit: 0` → 400; PATCH lowering limit below current non-archived count → 409 `WIP_LIMIT_EXCEEDED`, archived tickets not counted; DELETE non-empty → 409 `COLUMN_NOT_EMPTY`; DELETE column holding only archived tickets also → 409 (archived tickets still reference it).
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Commit** `feat(api): columns and wip limits`.

### Task 7: Labels and Ticket CRUD, archive, events

**Files:**
- Create: `apps/api/src/modules/labels/*`, `apps/api/src/modules/tickets/{routes,service}.ts`, `apps/api/src/lib/ordering.ts`, `packages/shared/src/{label,ticket,event}.ts`
- Test: `apps/api/test/labels.test.ts`, `apps/api/test/tickets.test.ts`

**Interfaces:**
- Produces: Labels: `POST /api/projects/:projectId/labels {name,color:#rrggbb}`, `PATCH/DELETE /api/labels/:labelId`. Tickets: `POST /api/columns/:columnId/tickets {title, description?, points?, assigneeId?, labelIds?}` (appended to column end, subject to WIP), `GET /api/tickets/:ticketId`, `PATCH /api/tickets/:ticketId {title?, description?, points?, assigneeId?, labelIds?}`, `POST /api/tickets/:ticketId/archive`, `POST /api/tickets/:ticketId/restore`, `GET /api/projects/:projectId/board → { project, columns: [{...column, ticketCount, pointsTotal, tickets: Ticket[]}], labels, members }` (non-archived tickets ordered by position), `GET /api/projects/:projectId/archived`. `ordering.ts`: `positionBetween(before: string|null, after: string|null): string` and `appendPosition(db, columnId)`. Internal `recordEvent(tx, {ticketId, actorId, type, data})` with types `created | moved | label_added | label_removed | points_changed | assignee_changed | archived | restored | title_changed`.
- Shared `ticketSchema` includes `labelIds`, `commentCount`-free; `eventSchema`.

- [ ] **Step 1: Write failing tests:** non-member → 404 on every route; create with `points: 4` → 400; assignee who is not a Member → 400 `VALIDATION`; `labelIds` from another Project → 400; board response is shaped per `boardSchema` and `pointsTotal` sums only non-archived tickets; PATCH points/assignee/labels each writes the matching event with `data` containing from/to; archive removes the ticket from the board and from WIP counts, restore brings it back (and 409 if the original Column is now full); create into a full Column → 409 `WIP_LIMIT_EXCEEDED`; no route deletes a ticket (assert `DELETE /api/tickets/:id` → 404).
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Commit** `feat(api): labels and tickets with events`.

### Task 8: Ticket history endpoint

**Files:**
- Modify: `apps/api/src/modules/tickets/routes.ts`
- Create: `apps/api/src/modules/events/{routes,service}.ts`
- Test: `apps/api/test/events.test.ts`

**Interfaces:**
- Produces: `GET /api/tickets/:ticketId/events → TicketEvent[]` oldest first, with actor `{id,email}`.

- [ ] **Step 1: Write failing tests:** history of a ticket that was created, moved (via direct service call until Task 9), and points-changed lists three events in order; non-member → 404; a failed change (rejected by WIP) writes **no** event.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Commit** `feat(api): ticket history`.

### Task 9: Moving tickets (WIP enforcement and ordering)

**Files:**
- Create: `apps/api/src/modules/tickets/move.ts` (service) ; Modify: `tickets/routes.ts`
- Test: `apps/api/test/move.test.ts`

**Interfaces:**
- Produces: `POST /api/tickets/:ticketId/move {columnId, afterTicketId: uuid|null, beforeTicketId: uuid|null}` → 200 updated Ticket. Semantics: place between the two neighbours (both null = empty-column or end placement); neighbours must be non-archived tickets in the target `columnId`, otherwise 400. Service runs in one transaction: `SELECT … FOR UPDATE` on the target Column row, count non-archived tickets, reject with `WIP_LIMIT_EXCEEDED` if moving across Columns and `count >= wipLimit`, compute `positionBetween`, update, write `moved` event `{fromColumnId, toColumnId}`.
- Consumes: Task 7 `positionBetween`, `recordEvent`.

- [ ] **Step 1: Write failing tests:** move to another Column places the ticket between the named neighbours (board order asserted); reorder within a Column keeps Column and changes order, allowed even when the Column is over its limit; move into a full Column → 409 and ticket unchanged and no event; move from a full Column into one with room succeeds; target Column in another Project → 404/400 and ticket unchanged; neighbour in a different Column → 400; **concurrency:** with a Column of limit 1 holding 0 tickets, `Promise.all` of two moves from different Columns → exactly one 200 and one 409; 50 successive moves to the top of a Column keep strictly ordered positions.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Commit** `feat(api): ticket moves with wip and ordering`.

### Task 10: Comments and Links

**Files:**
- Create: `apps/api/src/modules/{comments,links}/{routes,service}.ts`, `packages/shared/src/{comment,link}.ts`
- Test: `apps/api/test/comments.test.ts`, `apps/api/test/links.test.ts`

**Interfaces:**
- Produces: `GET /api/tickets/:ticketId/comments`, `POST /api/tickets/:ticketId/comments {body}`, `PATCH/DELETE /api/comments/:commentId` (author only; another Member → 403; non-member → 404). `POST /api/tickets/:ticketId/links {url, title?}`, `DELETE /api/links/:linkId`, links included in `GET /api/tickets/:ticketId`.

- [ ] **Step 1: Write failing tests:** member can comment; other Member editing/deleting someone's comment → 403; author edit updates `updatedAt`; non-member → 404 on every route; empty body → 400; link `https://github.com/o/r/pull/1` accepted; `javascript:alert(1)` and `data:text/html,x` → 400; `ftp://x` → 400; title optional.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Commit** `feat(api): comments and links`.

### Task 11: Web scaffold, Playwright harness, auth UI

**Files:**
- Create: `apps/web/{package.json,vite.config.ts,playwright.config.ts,index.html}`, `src/{main,App}.tsx`, `src/api/client.ts`, `src/pages/LoginPage.tsx`, `e2e/support/{mockApi,fixtures}.ts`, Tailwind config
- Test: `apps/web/e2e/auth.spec.ts`

**Interfaces:**
- Produces: `apiFetch<T>(path, schema: ZodType<T>, init?)` (adds `credentials: 'include'`, `x-csrf-token` from in-memory store, parses response with the shared Zod schema, throws `ApiError{code,status}`); React Router routes `/login`, `/`, `/projects/:projectId`. Test support: `mockApi(page): MockApi` with `.on(method, pathPattern, handler)` built on `page.route('**/api/**')`, where every fixture response is **validated against the shared schema before being fulfilled** (throws in test if invalid), plus fixture builders `fixtures.user()`, `fixtures.project()`, `fixtures.board()`.
- Playwright `webServer` starts `vite` (API proxy irrelevant because everything is mocked).

- [ ] **Step 1: Write failing tests:** unauthenticated visit to `/` redirects to `/login` (mock `/api/auth/me` → 401); valid login (mock) lands on project list and sends no password to any other request; wrong credentials (mock 401) shows "Invalid email or password"; a `mockApi` fixture violating the shared schema makes the test fail with a validation error (meta-test).
- [ ] **Step 2: Run** `npm run test:e2e -w apps/web` → FAIL. **Step 3: Implement. Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(web): scaffold, playwright harness, login`.

### Task 12: Project list and creation UI

**Files:**
- Create: `apps/web/src/pages/ProjectsPage.tsx`, `src/api/hooks.ts` (`useProjects`, `useCreateProject`)
- Test: `apps/web/e2e/projects.spec.ts`

- [ ] **Step 1: Write failing tests:** lists the projects returned by the mock; empty state message; "New project" form posts `{name}` with the `x-csrf-token` header and shows the new project; server 400 shows an inline error; clicking a project navigates to `/projects/:id`.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Commit** `feat(web): project list`.

### Task 13: Project view (Columns and Tickets)

**Files:**
- Create: `apps/web/src/pages/ProjectPage.tsx`, `src/components/{ColumnView,TicketCard,LabelChip}.tsx`, `useBoard(projectId)` in hooks (refetch on window focus + 30s interval)
- Test: `apps/web/e2e/project-view.spec.ts`

- [ ] **Step 1: Write failing tests:** renders each Column with name, ticket count, WIP limit as `3 / 5`, and points total; Column at its limit shows an "at limit" state; Ticket card shows title, label chips with colours, points badge, assignee initials; "Add ticket" in a Column posts to `/api/columns/:id/tickets` and the card appears; a `409 WIP_LIMIT_EXCEEDED` on create shows "Column is at its WIP limit" and no card; board refetches when the page regains focus (mock call count increases).
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Commit** `feat(web): project view`.

### Task 14: Drag-and-drop moves

**Files:**
- Create: `apps/web/src/components/DndBoard.tsx` (dnd-kit), `useMoveTicket` mutation
- Test: `apps/web/e2e/move.spec.ts`

- [ ] **Step 1: Write failing tests:** dragging a card to another Column sends `POST /api/tickets/:id/move` with the correct `columnId`, `afterTicketId`, `beforeTicketId` for the drop position; the card moves optimistically; on mock `409 WIP_LIMIT_EXCEEDED` the card snaps back and a toast explains the limit; dragging within a Column reorders with the right neighbours; keyboard drag (dnd-kit keyboard sensor) works for one move.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Commit** `feat(web): drag-and-drop moves`.

### Task 15: Ticket detail panel

**Files:**
- Create: `apps/web/src/components/{TicketPanel,Markdown,CommentList,LinkList,HistoryList}.tsx`
- Test: `apps/web/e2e/ticket-panel.spec.ts`

- [ ] **Step 1: Write failing tests:** opening a card shows description, comments, links, history; editing description/points/assignee/labels sends the right PATCH; adding a comment shows it; only the current user's comments show Edit/Delete; adding link `https://github.com/o/r/pull/1` shows it with a safe `rel="noopener noreferrer" target="_blank"`; archive removes the card from the Column; **Markdown containing `<script>alert(1)</script>` and `<img src=x onerror=...>` renders as visible text and no dialog/`onerror` fires**; description with a `javascript:` markdown link renders without a clickable `href`.
- [ ] **Step 2–4:** FAIL, implement (`react-markdown` without `rehype-raw`, `urlTransform` allowing only http/https/mailto), PASS. **Step 5: Commit** `feat(web): ticket panel`.

### Task 16: Project settings UI (Columns, Labels, Members, archive)

**Files:**
- Create: `apps/web/src/pages/ProjectSettingsPage.tsx`, `src/components/{ColumnSettings,LabelSettings,MemberSettings,ArchivedList}.tsx`
- Test: `apps/web/e2e/settings.spec.ts`

- [ ] **Step 1: Write failing tests:** add Column with WIP limit; edit limit and see 409 message when too low; deleting a non-empty Column shows the server's `COLUMN_NOT_EMPTY` message; add/edit/delete Label; Owner sees "Add member by email" and member list, non-Owner Members do not see member management or Delete project; Delete project asks for confirmation; archived list can restore a Ticket and shows WIP error on 409.
- [ ] **Step 2–4:** FAIL, implement, PASS. **Step 5: Commit** `feat(web): project settings`.

### Task 17: Docker image, static serving, dev profile

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `apps/api/src/static.ts`; Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `docker-compose.yml` (add `app` service and `dev` profile with Vite dev server proxying `/api` to the API with bind mounts)
- Test: `apps/api/test/static.test.ts`

**Interfaces:**
- Produces: when `WEB_DIST_DIR` is set, `@fastify/static` serves it and non-`/api` GET falls back to `index.html`; `/api/*` unknown routes stay JSON 404. Server entrypoint runs `runMigrations` then listens. Image: `node:22-alpine`, multi-stage, `USER node`, `HEALTHCHECK` on `/api/health`.

- [ ] **Step 1: Write failing tests:** with a temp `WEB_DIST_DIR`, `GET /` returns the index; `GET /projects/abc` returns the index (SPA fallback); `GET /api/nope` returns JSON 404 not HTML; responses include the CSP header.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Verify build:** `docker compose build app && docker compose up -d` then `docker compose exec app node dist/cli/create-user.js you@example.com`, log in at `http://localhost:3000`; `docker compose exec app id -u` is not `0`. Record the result.
- [ ] **Step 6: Commit** `feat: docker image and compose`.

### Task 18: CI, security docs, README

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`, `SECURITY.md`, `README.md`

**Interfaces:**
- CI jobs run separately so failures localise: `lint`, `api-tests` (Postgres service container, `TEST_DATABASE_URL`), `web-e2e` (Playwright browsers installed, uploads report on failure), `audit` (`npm audit --audit-level=high`), `docker-build`. Dependabot covers npm (weekly) and GitHub Actions.

- [ ] **Step 1:** Write the files. `SECURITY.md`: how to report privately, supported versions, no-public-signup note. `README.md`: what/why, quick start (compose), create first user, env vars, running both test suites, why sessions over JWTs and why one container (short rationale, per the decision to skip ADRs).
- [ ] **Step 2: Verify:** run every CI command locally (`npm run lint`, `npm test -w apps/api`, `npm run test:e2e -w apps/web`, `npm audit --audit-level=high`) and confirm green; `grep -rn "password\|secret" .env.example` shows placeholders only.
- [ ] **Step 3: Commit** `chore: ci, security policy, readme`.

---

## Self-Review

- **Spec coverage:** multi-user + CLI users (T4), one-to-one Project/board (T5/T13), hard WIP (T6/T9/T14), labels per Project and Fibonacci points with column sums (T7/T13), manual Links (T10/T15), Markdown descriptions and comments (T15), assignee (T7), fractional order (T9), archive and column-delete rules (T6/T7/T16), ticket events (T7/T8/T15), sessions/CSRF/rate-limit/argon2id (T4), helmet/Zod/no-secrets (T3, T2, T18), polling (T13), Docker + dev profile (T17), Dependabot/SECURITY/CI audit (T18), layered TDD with mocked boundaries and schema drift guard (T2, T11).
- **Type consistency:** `assertMember`, `positionBetween`, `recordEvent`, `boardSchema`, `apiFetch`, `mockApi` are each defined in one task and only consumed after it.
- **Proportion:** tasks give interfaces and test assertions; implementers write bodies.
