#!/usr/bin/env bash
# Validates the production deployment config without a Pi: compose shape, fail-fast secrets,
# Caddy image build and Caddyfile syntax. Run from anywhere; used locally and by CI (job deploy-config).
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash on Windows: stop it rewriting /etc/caddy/... inside docker args
cd "$(dirname "$0")/.."

# An empty env file stops compose reading a developer's local .env, so "missing variable" cases really are missing.
WORK=$(mktemp -d ./.validate-deploy.XXXXXX) # repo-local: native Windows tools cannot see Git Bash /tmp
EMPTY_ENV="$WORK/empty.env"
: >"$EMPTY_ENV"
trap 'rm -rf "$WORK"' EXIT
COMPOSE=(docker compose --env-file "$EMPTY_ENV" -f docker-compose.prod.yml)
DB_URL=postgres://tracker:x@db.example.test:5432/tracker
DUMMY_ENV=(DATABASE_URL=$DB_URL TRACKER_HOSTNAME=tracker.example.test CLOUDFLARE_API_TOKEN=x)

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

# 1. The compose file renders with the required variables set.
env "${DUMMY_ENV[@]}" "${COMPOSE[@]}" config --format json >"$WORK/compose.json" 2>"$WORK/compose.err" ||
  { cat "$WORK/compose.err" >&2; fail "docker-compose.prod.yml does not render with required variables set"; }
ok "compose file renders"

# 2. Each required secret fails fast, naming the variable.
for var in DATABASE_URL TRACKER_HOSTNAME CLOUDFLARE_API_TOKEN; do
  others=()
  for kv in "${DUMMY_ENV[@]}"; do [[ "$kv" == "$var="* ]] || others+=("$kv"); done
  if env "${others[@]}" "${COMPOSE[@]}" config -q 2>"$WORK/missing.err"; then
    fail "compose rendered without $var; it must fail fast"
  fi
  grep -q "$var" "$WORK/missing.err" || fail "missing $var error does not name the variable"
  ok "missing $var fails fast"
done

# 3. Security-relevant shape of the services.
node -e '
const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const s = c.services;
const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
for (const name of ["app", "caddy"]) expect(s[name], `service ${name} missing`);
// The database is an existing server on the network; this stack must not start its own.
expect(!s.db, "stack must not define a db service: DATABASE_URL points at the existing Postgres");
expect(Object.keys(c.volumes ?? {}).every((v) => !/db|postgres/i.test(v)), "stack must not define a database volume");
if (errors.length === 0) {
  expect(!s.app.ports?.length, "app must not publish host ports");
  expect(s.app.environment?.DATABASE_URL === process.argv[2], "app DATABASE_URL must come straight from the DATABASE_URL variable");
  const published = (s.caddy.ports ?? []).map((p) => String(p.published)).sort();
  // 80 and 443 are taken by Pi-hole on the Pi, so Caddy serves HTTPS on 8443 only.
  expect(JSON.stringify(published) === JSON.stringify(["8443"]), `caddy must publish exactly 8443, got ${published}`);
  expect(s.app.environment?.TRUST_PROXY === "true", "app must set TRUST_PROXY=true");
  expect(s.app.environment?.NODE_ENV === "production", "app must set NODE_ENV=production");
  expect(!s.app.depends_on?.db, "app must not depend on a db service");
  // Host networking would put the app straight on the LAN without any `ports` entry.
  for (const name of ["app", "caddy"]) expect(!s[name].network_mode, `${name} must not set network_mode (host networking bypasses the port checks)`);
  expect(s.caddy.depends_on?.app?.condition === "service_healthy", "caddy must wait for a healthy app");
  for (const name of ["app", "caddy"]) expect(s[name].restart === "unless-stopped", `${name} must restart unless-stopped`);
}
if (errors.length) { console.error(errors.map((e) => "FAIL: " + e).join("\n")); process.exit(1); }
' "$WORK/compose.json" "$DB_URL" || exit 1
ok "service shape (external DATABASE_URL, no bundled db, no app host ports, caddy 8443 only, TRUST_PROXY, health ordering, restart)"

grep -q '^DATABASE_URL=' .env.prod.example || fail ".env.prod.example must contain a DATABASE_URL placeholder"
! grep -q 'POSTGRES_' .env.prod.example || fail ".env.prod.example must not mention POSTGRES_* (no bundled database)"
ok "env template asks for DATABASE_URL only"

# 4. The Caddy image builds and the Caddyfile is valid.
docker build -q -t tracker-caddy:validate deploy/caddy >/dev/null || fail "deploy/caddy image does not build"
# The Cloudflare plugin rejects tokens that do not look like real ones (40 URL-safe characters), so use a shaped dummy.
FAKE_TOKEN=$(printf 'x%.0s' {1..40})
docker run --rm -e TRACKER_HOSTNAME=tracker.example.test -e CLOUDFLARE_API_TOKEN="$FAKE_TOKEN" \
  -v "$PWD/deploy/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" tracker-caddy:validate \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >"$WORK/caddy.out" 2>&1 ||
  { tail -5 "$WORK/caddy.out" >&2; fail "Caddyfile does not validate"; }
ok "caddy image builds and Caddyfile validates"

# 5. Certificate challenge must use a public resolver (the Pi's own resolver may not see the TXT record).
grep -q "resolvers 1.1.1.1" deploy/caddy/Caddyfile || fail "Caddyfile must set 'resolvers 1.1.1.1'"
grep -qF '{$TRACKER_HOSTNAME}:8443' deploy/caddy/Caddyfile || fail "Caddyfile site address must be {\$TRACKER_HOSTNAME}:8443"
ok "caddy uses 1.1.1.1 for DNS-01 propagation checks"

# 6. The deploy workflow is valid and has no pull_request trigger of its own (the repo is public, the runner is the Pi).
# This is hygiene, not the security boundary: see check 8 for why.
WF=.github/workflows/deploy.yml
[ -f "$WF" ] || fail "$WF does not exist"
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -color "$WF" >"$WORK/actionlint.out" 2>&1 ||
  { cat "$WORK/actionlint.out" >&2; fail "actionlint reports problems in $WF"; }
ok "actionlint clean"
! grep -v '^[[:space:]]*#' "$WF" | grep -q "pull_request" || fail "$WF must not have a pull_request trigger"
for needle in "workflow_run" "workflow_dispatch" "tracker-deploy" "github.event.workflow_run.event == 'push'" "cancel-in-progress: false" ':8443/api/health'; do
  grep -qF "$needle" "$WF" || fail "$WF must contain: $needle"
done
ok "deploy workflow triggers only from push-to-main CI success or manual dispatch, on the tracker-deploy runner"

# 7. A deploy must ship the exact commit whose CI passed, never whatever origin/main has moved on to since.
for needle in 'github.event.workflow_run.head_sha' 'git merge --ff-only "$SHA"'; do
  grep -qF -- "$needle" "$WF" || fail "$WF must deploy the CI-verified commit; missing: $needle"
done
ok "deploy workflow merges the commit CI verified (workflow_run.head_sha)"

# 7b. The post-deploy health check must not depend on the Pi's DNS: a router that blocks private answers for public
# names ("DNS rebinding protection") would otherwise fail every deploy of a perfectly healthy app.
grep -qF -- '--resolve "$host:8443:127.0.0.1"' "$WF" || fail "$WF health check must use curl --resolve so it does not depend on DNS"
ok "deploy health check resolves the hostname locally (still verifies the certificate)"

# 8. The runbook must name the real control against fork pull requests: GitHub runs the workflow files from the PR's
# own branch, so nothing in deploy.yml can stop a malicious PR from targeting the self-hosted runner.
grep -qF "Require approval for all outside collaborators" docs/deploy-pi.md ||
  fail "docs/deploy-pi.md must tell the reader to require approval for all outside collaborators' workflow runs"
ok "runbook names the approval setting as the control for fork pull requests"

# 9. Pitfalls the runbook must warn about.
grep -qF "dubious ownership" docs/deploy-pi.md || fail "docs/deploy-pi.md must say the runner user must own the clone (git 'dubious ownership')"
grep -qF "ufw" docs/deploy-pi.md || fail "docs/deploy-pi.md must warn that Docker-published ports bypass ufw"
ok "runbook covers clone ownership and the ufw/IPv6 caveat"

echo "All deploy checks passed."
