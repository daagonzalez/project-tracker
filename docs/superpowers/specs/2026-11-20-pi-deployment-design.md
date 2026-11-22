# Raspberry Pi deployment (short design)

## Intent
Deploy project-tracker on the user's Raspberry Pi, the same way planner-app-ui is deployed: merge to `main`, CI passes, a self-hosted runner on the Pi rebuilds and restarts the service. Reached over the LAN only, over HTTPS (the session cookie is `Secure`, so plain HTTP cannot log in).

## Goals
- Push to `main` + green CI = automatic deploy to the Pi, with a health check that fails the deploy if the app is not up.
- HTTPS with a browser-trusted certificate on a LAN-only hostname, no per-device cert installs.
- Does not disturb the existing planner services or their nginx proxy on port 4200.

## Non-goals / anti-goals
- No exposure to the public internet (the DNS record points at a private LAN IP).
- No secrets in the repo; `.env` files and the Cloudflare token exist only on the Pi.
- No relaxing of cookie or security-header rules to make HTTP work.
- Not a general platform: no multi-app routing work beyond what this app needs.

## Approaches considered
- **HTTPS**: (A) Caddy local CA, needs a root cert on every device; (B) Tailscale, needs Tailscale everywhere; **(C) real domain + Let's Encrypt DNS-01, chosen** because the user owns `daagonzalez.com` and wants no installs.
- **DNS-01 provider**: **(1) move DNS to Cloudflare, chosen**; (2) delegate `_acme-challenge` via CNAME to another zone, rejected as more moving parts. Squarespace (the registrar) has no DNS API.

## Design (decided with the user)
- Domain `daagonzalez.com` stays registered at Squarespace; nameservers move to Cloudflare (free plan). Existing records are imported and checked before the switch.
- A Caddy container terminates TLS on 443, built with the Cloudflare DNS plugin (small multi-stage Dockerfile, ARM64). A scoped Cloudflare API token (Zone:DNS:Edit, this zone only) lives in the Pi's `.env`.
- Caddy reverse-proxies to the `app` container. `app` and Postgres are not published to the host. `TRUST_PROXY=true` is set on `app` (already supported in `apps/api/src/config.ts`) so client IPs and rate limiting work behind Caddy.
- A `deploy.yml` mirroring planner's: triggered by CI success on `main` (or manual), runs on a self-hosted ARM64 runner with its own label, fast-forwards the checkout, `docker compose up -d --build --wait`, health-checks through Caddy over HTTPS, shows logs on failure, prunes images.
- A production compose file for `db`, `app`, `caddy` (named volumes for Postgres data and Caddy certs, `restart: unless-stopped`).

## My calls (not yet confirmed by the user, please check)
- Hostname: `tracker.daagonzalez.com`, A record to the Pi's LAN IP.
- Separate compose project for this app (not merged into the existing `ui-services` compose), so a mistake here cannot break planner. Planner's proxy keeps 4200; Caddy takes 443/80.
- Runner: a second runner registered on this repo with label `tracker-deploy` (runners are per-repo for personal accounts).
- Production compose file name: `docker-compose.prod.yml`, kept separate from the dev `docker-compose.yml`.
- Users are created on the Pi with the existing CLI command via `docker compose exec`.

## Left to the builder
Exact Caddyfile, Caddy plugin version pinning, Pi-side directory layout, README deploy section, and a short runbook for the one-time manual steps (Cloudflare nameserver move, token, runner registration, first `.env`).

## Manual steps only the user can do
1. Add the domain to Cloudflare, verify imported records, switch nameservers at Squarespace.
2. Create the scoped Cloudflare API token.
3. Register the self-hosted runner on the Pi for this repo.
4. Create the `.env` on the Pi.
