# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately using GitHub's
["Report a vulnerability"](../../security/advisories/new) form on this repository (Security tab →
Advisories). Include what you found, how to reproduce it, and the impact you expect.

This is a personal project maintained on a best-effort basis: expect an acknowledgement within a few
days, not a formal SLA.

## Supported versions

Only the latest commit on `main` is supported. There are no maintained release branches.

## Scope notes

- **No public sign-up.** Users are created by an operator with the CLI
  (`node dist/cli/create-user.js <email>`), so account registration is not an attack surface.
- Authentication uses server-side sessions in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, with
  argon2id password hashing, CSRF protection and login rate limiting.
- Secrets are supplied only through environment variables; none are committed.
