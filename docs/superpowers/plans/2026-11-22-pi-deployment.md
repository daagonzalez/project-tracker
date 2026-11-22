# Raspberry Pi Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merging to `main` with green CI automatically rebuilds and restarts project-tracker on the user's Raspberry Pi, served over trusted HTTPS at `tracker.daagonzalez.com` on the LAN only.

**Architecture:** A separate compose project (`docker-compose.prod.yml`) runs `db`, `app` (the existing single image) and `caddy` (custom build with the Cloudflare DNS plugin, terminating TLS via Let's Encrypt DNS-01). A `deploy.yml` workflow on a self-hosted ARM64 runner fast-forwards a checkout on the Pi and runs `docker compose up -d --build --wait`. Because there is no cross-stack test for infrastructure, "tests" here are a validation script run locally and in CI that asserts the security-relevant shape of the config, plus a manual first-deploy verification on the Pi.

**Tech Stack:** Docker Compose, Caddy 2 (xcaddy + `github.com/caddy-dns/cloudflare`), GitHub Actions (self-hosted runner), actionlint, bash + node for the validation script.

**Spec:** `docs/superpowers/specs/2026-11-20-pi-deployment-design.md`

## Global Constraints

- Hostname is `tracker.daagonzalez.com`; DNS (Cloudflare, already moved) has an `A` record to the Pi's LAN IP, DNS-only. Never expose the app to the internet.
- No secrets in the repo. `.env` files and the Cloudflare token exist only on the Pi. Templates hold placeholders only.
- Config fails fast when required variables are missing (`${VAR:?message}` in compose).
- Only `caddy` publishes host ports (80, 443). `db` and `app` are reachable only on the compose network.
- `TRUST_PROXY=true` on `app` (already supported by `apps/api/src/config.ts`) so client IPs and login rate limiting work behind Caddy.
- Separate compose project from the user's existing `ui-services`; planner's nginx proxy on port 4200 is untouched.
- Self-hosted runner label: `tracker-deploy` (full `runs-on`: `[self-hosted, linux, ARM64, tracker-deploy]`).
- Deploy triggers only on CI success for a `push` to `main`, or manual `workflow_dispatch`. Never on `pull_request` (the repo is public).
- Prod compose file: `docker-compose.prod.yml`. Pi checkout path: `/home/dgonz/project-tracker`.
- Use `GLOSSARY.md` terms in any commit messages or docs that mention domain concepts. CI runs lint, both test suites separately, and `npm audit`; do not disturb them.

## Review Focus

- Postgres or the app port accidentally published on the LAN. Expected: validation fails the build. (Task 1)
- A missing secret silently producing a broken stack. Expected: `docker compose config` exits non-zero naming the variable. (Task 1)
- Login rate limiting seeing Caddy's IP for every user. Expected: `TRUST_PROXY=true` on `app`. (Task 1)
- Certificate issuance failing because the Pi's resolver cannot see the Cloudflare TXT record. Expected: Caddy uses `1.1.1.1` for propagation checks. (Task 1)
- A pull request from a fork running code on the Pi. Expected: `deploy.yml` has no `pull_request` trigger and deploys only on `push` to `main`. (Task 2)
- `argon2` native module failing on ARM64/musl (CI smoke test only runs on amd64). Expected: a user can log in on the Pi. (Task 4, manual)

---

### Task 1: Production stack (compose, Caddy image, env template) with CI validation

**Files:**
- Create: `scripts/validate-deploy.sh`
- Create: `docker-compose.prod.yml`
- Create: `deploy/caddy/Dockerfile`
- Create: `deploy/caddy/Caddyfile`
- Create: `.env.prod.example`
- Modify: `.github/workflows/ci.yml` (add job `deploy-config`)

**Interfaces:**
- Produces: compose project name `project-tracker`; services `db`, `app`, `caddy`; env vars `POSTGRES_PASSWORD` (required), `POSTGRES_USER` (default `tracker`), `POSTGRES_DB` (default `tracker`), `TRACKER_HOSTNAME` (required), `CLOUDFLARE_API_TOKEN` (required). Task 2 and Task 3 rely on these names and on `scripts/validate-deploy.sh` accepting more checks.

- [ ] **Step 1: Write the failing validation script `scripts/validate-deploy.sh`**

`set -euo pipefail`, run from repo root, using dummy env `POSTGRES_PASSWORD=x TRACKER_HOSTNAME=tracker.example.test CLOUDFLARE_API_TOKEN=x`. Assertions, each printing a clear failure message and exiting non-zero:
  1. `docker compose -f docker-compose.prod.yml config --format json` succeeds with the dummy env.
  2. The same command with `POSTGRES_PASSWORD` unset exits non-zero and its stderr mentions `POSTGRES_PASSWORD` (repeat for `TRACKER_HOSTNAME` and `CLOUDFLARE_API_TOKEN`).
  3. Parsing the JSON with an inline `node -e`: `db` and `app` have no `ports`; `caddy` publishes exactly host ports 80 and 443; `app.environment.TRUST_PROXY === "true"` and `app.environment.NODE_ENV === "production"`; `app.depends_on.db.condition === "service_healthy"`; `caddy.depends_on.app.condition === "service_healthy"`; all three have `restart: unless-stopped`.
  4. `docker build -t tracker-caddy:validate deploy/caddy` succeeds, then `docker run --rm -e TRACKER_HOSTNAME=tracker.example.test -e CLOUDFLARE_API_TOKEN=x -v "$PWD/deploy/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" tracker-caddy:validate caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` succeeds.
  5. `deploy/caddy/Caddyfile` contains `resolvers 1.1.1.1`.

- [ ] **Step 2: Run it to verify it fails**

Run: `bash scripts/validate-deploy.sh`
Expected: FAIL at assertion 1 because `docker-compose.prod.yml` does not exist.

- [ ] **Step 3: Create `docker-compose.prod.yml`**

`name: project-tracker`. Services:
  - `db`: `postgres:16-alpine`; env `POSTGRES_USER`/`POSTGRES_DB` with the defaults above, `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}`; volume `dbdata:/var/lib/postgresql/data`; the same `pg_isready` healthcheck as the dev `docker-compose.yml`; no `ports`; `restart: unless-stopped`. Do not mount `docker/initdb` (it creates the test database).
  - `app`: `build: .`; env `DATABASE_URL` built like the dev compose file's `app` service, plus `NODE_ENV: production` and `TRUST_PROXY: "true"`; `depends_on: db: condition: service_healthy`; `expose: ["3000"]` (not `ports`); `restart: unless-stopped`. The image's own `HEALTHCHECK` provides health.
  - `caddy`: `build: ./deploy/caddy`; `ports: ["80:80", "443:443"]`; env `TRACKER_HOSTNAME: ${TRACKER_HOSTNAME:?...}` and `CLOUDFLARE_API_TOKEN: ${CLOUDFLARE_API_TOKEN:?...}`; volumes `caddy_data:/data`, `caddy_config:/config`; `depends_on: app: condition: service_healthy`; `restart: unless-stopped`.
  - Named volumes: `dbdata`, `caddy_data`, `caddy_config`.

- [ ] **Step 4: Create `deploy/caddy/Dockerfile` and `deploy/caddy/Caddyfile`**

Dockerfile: two stages. Build on `caddy:2-builder` running `xcaddy build --with github.com/caddy-dns/cloudflare@<pinned version>` (look up the current released tag and pin it, never `latest`); final stage `caddy:2` copying `/usr/bin/caddy` over `/usr/bin/caddy`. Both base images are multi-arch (ARM64 on the Pi).
Caddyfile: one site block `{$TRACKER_HOSTNAME}` with `tls { dns cloudflare {env.CLOUDFLARE_API_TOKEN}  resolvers 1.1.1.1 }` and `reverse_proxy app:3000`. Nothing else.

- [ ] **Step 5: Create `.env.prod.example`**

Placeholders only: `POSTGRES_PASSWORD=change-me`, `POSTGRES_USER=tracker`, `POSTGRES_DB=tracker`, `TRACKER_HOSTNAME=tracker.daagonzalez.com`, `CLOUDFLARE_API_TOKEN=paste-token-on-the-pi-only`. Header comment: copy to `.env` on the Pi; never commit real values.

- [ ] **Step 6: Run the script to verify it passes**

Run: `bash scripts/validate-deploy.sh`
Expected: PASS, exit code 0, with one OK line per assertion.

- [ ] **Step 7: Add the CI job**

In `.github/workflows/ci.yml` add job `deploy-config` (`runs-on: ubuntu-latest`, steps: `actions/checkout@v7` then `run: bash scripts/validate-deploy.sh`), matching the style of the existing jobs.

- [ ] **Step 8: Commit**

```bash
git add scripts/validate-deploy.sh docker-compose.prod.yml deploy/caddy .env.prod.example .github/workflows/ci.yml
git commit -m "feat(deploy): production compose stack with Caddy DNS-01 TLS"
```

---

### Task 2: Deploy workflow for the Pi runner

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `scripts/validate-deploy.sh` (append checks)

**Interfaces:**
- Consumes: `docker-compose.prod.yml` service names and `.env` variable `TRACKER_HOSTNAME` from Task 1.
- Produces: workflow `Deploy`, manual-dispatchable, targeting runner labels `[self-hosted, linux, ARM64, tracker-deploy]`.

- [ ] **Step 1: Extend the validation script (red)**

Append to `scripts/validate-deploy.sh`:
  1. Run actionlint on `.github/workflows/deploy.yml` via `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:<pinned release tag> -color .github/workflows/deploy.yml` (verify the tag exists and pin it).
  2. Assert with `grep` that `deploy.yml` contains no `pull_request` trigger, contains `workflow_run`, `workflow_dispatch`, `tracker-deploy`, `github.event.workflow_run.event == 'push'`, and `cancel-in-progress: false`.

- [ ] **Step 2: Run it to verify it fails**

Run: `bash scripts/validate-deploy.sh`
Expected: FAIL at the new actionlint check because `deploy.yml` does not exist.

- [ ] **Step 3: Create `.github/workflows/deploy.yml`**

Mirror planner-app-ui's `deploy.yml` (workflow_run on workflow `CI`, type `completed`, branch `main`, plus `workflow_dispatch`; `concurrency: group: deploy-project-tracker, cancel-in-progress: false`; `permissions: contents: read`; job `if` allowing manual runs or `conclusion == 'success' && event == 'push'`; `timeout-minutes: 30` because Vite and esbuild builds are slow on a Pi). Env `REPO_DIR: /home/dgonz/project-tracker`. Steps, no `actions/checkout` (the Pi already has a checkout and the workflow must not run fetched PR code):
  1. Update source: `cd "$REPO_DIR"`, `git fetch origin main`, `git checkout main`, `git merge --ff-only origin/main`, `git log -1 --oneline`.
  2. Build and restart: `cd "$REPO_DIR"`, `docker compose -f docker-compose.prod.yml up -d --build --wait --wait-timeout 180`.
  3. Health check through Caddy: read `TRACKER_HOSTNAME` from `.env` in `$REPO_DIR`, then retry up to 45 times at 2s intervals `curl -fsS "https://$TRACKER_HOSTNAME/api/health"` (first run needs time for certificate issuance); fail with a message if it never answers.
  4. On failure: `docker compose -f docker-compose.prod.yml ps` and `logs --tail=80 app caddy`.
  5. `docker image prune -f`.

- [ ] **Step 4: Run the script to verify it passes**

Run: `bash scripts/validate-deploy.sh`
Expected: PASS, exit code 0, all earlier assertions still OK.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml scripts/validate-deploy.sh
git commit -m "feat(deploy): deploy workflow for the Raspberry Pi runner"
```

---

### Task 3: Runbook for the one-time Pi setup

**Files:**
- Create: `docs/deploy-pi.md`
- Modify: `README.md` (one link under a "Deployment" heading, adding the heading if absent)

**Interfaces:**
- Consumes: variable names and paths from Tasks 1 and 2.

- [ ] **Step 1: Write `docs/deploy-pi.md`**

Sections, each with the exact commands:
  1. **Prerequisites already done**: Cloudflare DNS, `tracker` A record to the Pi's LAN IP with a router DHCP reservation, Cloudflare token (scope: Zone/DNS/Edit and Zone/Zone/Read on `daagonzalez.com` only).
  2. **Check ports 80 and 443 are free on the Pi**: `sudo ss -tlnp | grep -E ':(80|443)\s'` should print nothing; if something owns them, stop and decide before continuing.
  3. **Clone and configure**: `git clone https://github.com/daagonzalez/project-tracker.git /home/dgonz/project-tracker`, `cp .env.prod.example .env`, edit values, `chmod 600 .env`.
  4. **Register the runner**: GitHub repo → Settings → Actions → Runners → New self-hosted runner (Linux, ARM64), label `tracker-deploy`, install as a service (`sudo ./svc.sh install && sudo ./svc.sh start`); the runner user must be in the `docker` group.
  5. **Lock down the public repo**: Settings → Actions → General → "Fork pull request workflows": require approval for all outside contributors; do not run any `pull_request` workflow on the self-hosted runner.
  6. **First deploy**: `docker compose -f docker-compose.prod.yml up -d --build --wait --wait-timeout 600`.
  7. **Create the first user**: `docker compose -f docker-compose.prod.yml exec app node dist/cli/create-user.js you@example.com` (prompts for the password; there is no public sign-up).
  8. **Troubleshooting**: `docker compose -f docker-compose.prod.yml logs caddy` for certificate errors (check the token scope and that `1.1.1.1` is reachable from the Pi); `logs app` for migration errors.
  9. **Backups note**: Postgres data lives in the `project-tracker_dbdata` volume; give the one-line `pg_dump` command via `docker compose exec db` for manual backups. Scheduling is out of scope.

- [ ] **Step 2: Link from `README.md`**

Add a single line linking to `docs/deploy-pi.md`.

- [ ] **Step 3: Verify**

Run: `grep -n "tracker-deploy\|create-user.js\|ss -tlnp" docs/deploy-pi.md` and confirm all three appear, and `npm run lint` still passes.
Expected: three matches; lint exits 0.

- [ ] **Step 4: Commit**

```bash
git add docs/deploy-pi.md README.md
git commit -m "docs(deploy): Raspberry Pi setup runbook"
```

---

### Task 4: First deploy and verification on the Pi (user-run, guided)

**Files:** none (verification only). Requires the three previous tasks merged to `main`, DNS moved, and the Cloudflare token in the Pi's `.env`.

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Follow `docs/deploy-pi.md` sections 2 to 6 on the Pi**

Expected: `docker compose ... up -d --build --wait` finishes with `db`, `app`, `caddy` all `healthy`/`running`. If the build fails in `npm ci` on `argon2`, stop: the ARM64 musl prebuild is missing and the plan must add a build toolchain stage.

- [ ] **Step 2: Verify HTTPS from a LAN device**

Run (from your laptop): `curl -sS -o /dev/null -w "%{http_code} %{ssl_verify_result}\n" https://tracker.daagonzalez.com/api/health`
Expected: `200 0` (trusted certificate, no warning). Open the site in a browser and confirm no certificate warning.

- [ ] **Step 3: Verify ports are not over-exposed**

Run (on the Pi): `docker compose -f docker-compose.prod.yml ps --format "{{.Service}} {{.Ports}}"`
Expected: only `caddy` lists host ports (`0.0.0.0:80`, `0.0.0.0:443`); `db` and `app` list none.

- [ ] **Step 4: Create a user and log in**

Run section 7 of the runbook, then log in through the browser. Expected: login succeeds, the session cookie is `Secure` and `HttpOnly`, and a Project can be created (proves `argon2` works on ARM64).

- [ ] **Step 5: Verify the automatic deploy**

Merge any trivial change to `main`. Expected: CI passes, the `Deploy` workflow runs on the Pi runner, and its health-check step prints success.

- [ ] **Step 6: Confirm planner is unaffected**

Run (from your laptop): `curl -fsS -o /dev/null -w "%{http_code}\n" http://<pi-ip>:4200/planner/`
Expected: `200`.
