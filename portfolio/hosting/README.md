# Hosting

**Decided 2026-08-25.** This is the portfolio's default host. When other
docs still mention Cloudflare or Vercel as a menu, this file wins.

The portfolio already pays for two Hetzner boxes and already has SSH keys
in GitHub Actions secrets. Do not add a third cloud to host a calculator.

## Split

| Surface | Host | Why |
|---|---|---|
| Browser calculators, SEO landings, most docs | **GitHub Pages** | $0, no box to patch, no user data on our disk. Custom domain is registrar A/CNAME to GitHub — no Cloudflare. |
| Anything with a process, disk, or webhook | **Hetzner product box** | Incremental cost is ~0. Deploy with the existing GHA SSH keys (Caddy + compose/systemd, or the OpenTofu/Argo path in flight on #1486). |
| Headless agent fleet | **Hetzner agent box** | `ventures/ubuntu-agent-server`. Keep this off the public product path. |

Do not put public sites on the agent box. Do not put a static calculator on
Hetzner just because the box is there.

## What we are not adding

- **Cloudflare** (Pages, Workers, Access) is not a portfolio default. Gated
  workflows that already mention it stay unused.
- **Vercel / Railway** are not a portfolio default. Same: existing optional
  jobs stay gated.
- A new vendor account for product hosting. The Hetzner account exists.

`local-site-studio` stays on Convex for its backend. Hosting its frontend
on Pages or the product box is fine; replacing Convex is a rewrite.

## Terms users see

Hosted surfaces use the no-warranty **and** no-SLA copy in
[`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md) §5b. That covers
uptime and “the URL went away.” It does not cover storing personal data
on the box — keep user data off Hetzner unless the product cannot work
without it, and say so in the privacy line.

## What a session does

1. Prefer a static/browser shape so the product can live on GitHub Pages.
2. If it needs a process, target the Hetzner product box and keep it
   stateless. Include the no-SLA clause.
3. Prepare the Pages artifact (or the box deploy). The remaining owner
   flip for static products is `deploy-settings` — enable GitHub Pages
   (`GITHUB_PAGES_ENABLED=true`, Pages source: GitHub Actions). Do not
   open a second platform ask.
4. Do not register Cloudflare, Vercel, or another host as the way a
   product goes live.
