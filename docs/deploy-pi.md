# Deploying to the Raspberry Pi

Merging to `main` with green CI redeploys the app on the Pi automatically (`.github/workflows/deploy.yml`). This page covers the one-time setup. The app is served at `https://tracker.daagonzalez.com`, reachable from the home network only.

How it fits together: a Caddy container terminates HTTPS using a Let's Encrypt certificate obtained through a DNS challenge on Cloudflare, and proxies to the app container, which talks to Postgres. Only Caddy publishes ports (80 and 443). Config lives in `docker-compose.prod.yml`.

## 1. Prerequisites (already done once)

- DNS for `daagonzalez.com` is on Cloudflare, with an `A` record `tracker` pointing at the Pi's LAN IP, set to **DNS only**. Give the Pi a DHCP reservation on the router so that IP never changes.
- A Cloudflare API token limited to `Zone / DNS / Edit` and `Zone / Zone / Read` on the `daagonzalez.com` zone only. Do not use the Global API Key.
- Docker with the compose plugin on the Pi, and the runner user in the `docker` group.

## 2. Check ports 80 and 443 are free

```bash
sudo ss -tlnp | grep -E ':(80|443)\s'
```

This should print nothing. If something owns those ports, stop and decide what to do before continuing; Caddy needs both.

## 3. Clone and configure

```bash
git clone https://github.com/daagonzalez/project-tracker.git /home/dgonz/project-tracker
cd /home/dgonz/project-tracker
cp .env.prod.example .env
chmod 600 .env
nano .env   # set POSTGRES_PASSWORD and CLOUDFLARE_API_TOKEN; check TRACKER_HOSTNAME
```

`.env` stays on the Pi. It is git-ignored; never commit it.

## 4. Register the self-hosted runner

GitHub repo, then Settings, Actions, Runners, New self-hosted runner. Choose Linux and ARM64, follow the commands GitHub shows, and give the runner the extra label `tracker-deploy` when `./config.sh` asks. Install it as a service:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

## 5. Lock down the public repo

The repo is public and the runner is a machine on your home network, so:

- Settings, Actions, General, "Fork pull request workflows from outside collaborators": require approval for all outside collaborators.
- Never add a `pull_request` trigger to a workflow that runs on the `tracker-deploy` runner. `scripts/validate-deploy.sh` (CI job `deploy-config`) fails if `deploy.yml` gets one.

## 6. First deploy

```bash
cd /home/dgonz/project-tracker
docker compose -f docker-compose.prod.yml up -d --build --wait --wait-timeout 600
```

The first build is slow on a Pi. Caddy requests its certificate on first start, which takes up to a minute or two. After this, deploys happen on their own after each merge to `main`, or manually from the Actions tab (Deploy, Run workflow).

## 7. Create the first user

There is no public sign-up; users are created with a command:

```bash
docker compose -f docker-compose.prod.yml exec app node dist/cli/create-user.js you@example.com
```

It prompts for the password (at least 12 characters).

## 8. Troubleshooting

- **Certificate or HTTPS errors:** `docker compose -f docker-compose.prod.yml logs caddy`. Check that the token has the two permissions above on this zone, and that the Pi can reach `1.1.1.1` (Caddy checks the challenge record there).
- **App will not start or migrations fail:** `docker compose -f docker-compose.prod.yml logs app`.
- **Browser cannot find the host:** confirm the `tracker` record in Cloudflare matches the Pi's current LAN IP. Some routers block answers that point a public name at a private address ("DNS rebinding protection"); allow `daagonzalez.com` in the router or use a resolver that permits it.

## 9. Backups

Data lives in the `project-tracker_dbdata` Docker volume. A manual backup:

```bash
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U tracker tracker > tracker-$(date +%F).sql
```

Scheduling backups is not set up yet.
