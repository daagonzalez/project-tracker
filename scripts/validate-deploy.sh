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
DUMMY_ENV=(POSTGRES_PASSWORD=x TRACKER_HOSTNAME=tracker.example.test CLOUDFLARE_API_TOKEN=x)

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

# 1. The compose file renders with the required variables set.
env "${DUMMY_ENV[@]}" "${COMPOSE[@]}" config --format json >"$WORK/compose.json" 2>"$WORK/compose.err" ||
  { cat "$WORK/compose.err" >&2; fail "docker-compose.prod.yml does not render with required variables set"; }
ok "compose file renders"

# 2. Each required secret fails fast, naming the variable.
for var in POSTGRES_PASSWORD TRACKER_HOSTNAME CLOUDFLARE_API_TOKEN; do
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
for (const name of ["db", "app", "caddy"]) expect(s[name], `service ${name} missing`);
if (errors.length === 0) {
  expect(!s.db.ports?.length, "db must not publish host ports");
  expect(!s.app.ports?.length, "app must not publish host ports");
  const published = (s.caddy.ports ?? []).map((p) => String(p.published)).sort();
  expect(JSON.stringify(published) === JSON.stringify(["443", "80"]), `caddy must publish exactly 80 and 443, got ${published}`);
  expect(s.app.environment?.TRUST_PROXY === "true", "app must set TRUST_PROXY=true");
  expect(s.app.environment?.NODE_ENV === "production", "app must set NODE_ENV=production");
  expect(s.app.depends_on?.db?.condition === "service_healthy", "app must wait for a healthy db");
  expect(s.caddy.depends_on?.app?.condition === "service_healthy", "caddy must wait for a healthy app");
  for (const name of ["db", "app", "caddy"]) expect(s[name].restart === "unless-stopped", `${name} must restart unless-stopped`);
}
if (errors.length) { console.error(errors.map((e) => "FAIL: " + e).join("\n")); process.exit(1); }
' "$WORK/compose.json" || exit 1
ok "service shape (no db/app host ports, caddy 80+443, TRUST_PROXY, health ordering, restart)"

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
ok "caddy uses 1.1.1.1 for DNS-01 propagation checks"

# 6. The deploy workflow is valid and cannot be triggered by pull requests (the repo is public, the runner is the Pi).
WF=.github/workflows/deploy.yml
[ -f "$WF" ] || fail "$WF does not exist"
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12 -color "$WF" >"$WORK/actionlint.out" 2>&1 ||
  { cat "$WORK/actionlint.out" >&2; fail "actionlint reports problems in $WF"; }
ok "actionlint clean"
! grep -v '^[[:space:]]*#' "$WF" | grep -q "pull_request" || fail "$WF must not have a pull_request trigger"
for needle in "workflow_run" "workflow_dispatch" "tracker-deploy" "github.event.workflow_run.event == 'push'" "cancel-in-progress: false"; do
  grep -qF "$needle" "$WF" || fail "$WF must contain: $needle"
done
ok "deploy workflow triggers only from push-to-main CI success or manual dispatch, on the tracker-deploy runner"

echo "All deploy checks passed."
