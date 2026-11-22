# syntax=docker/dockerfile:1

# Caddy with the Cloudflare DNS plugin, needed for the DNS-01 challenge (the Pi is not reachable from the internet).
# Both base images are multi-arch, so this builds natively on the Pi (ARM64).
FROM caddy:2.11.9-builder AS build
RUN xcaddy build --with github.com/caddy-dns/cloudflare@v0.2.4

FROM caddy:2.11.9
COPY --from=build /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
