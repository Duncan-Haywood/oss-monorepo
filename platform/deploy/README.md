# Portfolio deployment (Hetzner)

The account owner operates a **Hetzner server** with a **domain attached**,
provisioned through [`ventures/ubuntu-agent-server/`](../ventures/ubuntu-agent-server/).
This is the portfolio's default production surface. **Agents should deploy here
first** — broadly, in parallel, without waiting for owner review.

Read [`hosts.yaml`](hosts.yaml) for the machine-readable policy split.

## Development policy

The portfolio currently has: this repo, a VM, a DNS name. No external accounts,
no payout rail, no live third-party publish surface. **Develop freely and fast:**

- Build features across all `ventures/*` in parallel
- Deploy to Hetzner and set `links.production`
- Ship marketing, landing pages, SEO, analytics
- Drive signups and contact-form responses
- Merge venture PRs when CI is green

**Only held:** accepting payments, registering third-party store/marketplace
accounts, illegal activity.

## What agents should do

**Always allowed without an owner decision:**

- Develop features, tests, UX, and docs in `ventures/*`
- Build production artifacts (`npm run build`, static export, container image)
- Deploy to the portfolio Hetzner host behind the attached domain
- Ship marketing pages, landing pages, SEO, and lightweight analytics
- Set `links.production` in the venture's `VENTURE.yaml` once a deploy is live
- Run campaigns that drive signups, installs, or contact form responses
  **without** accepting money

**Held until the account owner acts** (flag on #139 / `asks.yaml`, do not
route around):

- Payment acceptance (Stripe, Shopify billing, in-app purchases)
- Submitting to app stores or marketplaces that need a developer account
  belonging to a legal person
- Registering new third-party accounts that need a government ID or payment card

Development is never blocked waiting on those. Ship the product and deploy it
here first; external channels are a separate step.

## Deploy workflow

1. Pick the venture from `python3 portfolio/router/allocate.py`
2. Ensure the app builds and tests pass locally / in CI
3. Deploy to the Hetzner host (Ansible playbook, SSH, or a venture-specific
   deploy script — add one under `ventures/<name>/` if missing)
4. Set `links.production` in `ventures/<name>/VENTURE.yaml` to the live URL
5. Add marketing surface (landing copy, meta tags, sitemap) as needed
6. Record traffic/signup measurements in the venture hypothesis `checked` field
   when you have data

## Configuration

| Item | Where |
|---|---|
| Server provisioning | `ventures/ubuntu-agent-server/` |
| Domain / `base_domain` | `platform/deploy/hosts.yaml` (owner sets) |
| Per-venture live URL | `ventures/*/VENTURE.yaml` → `links.production` |
| Payment / store gates | `portfolio/ledger/asks.yaml` |

Secrets (SSH deploy key, TLS, etc.) belong in GitHub Actions secrets or the
server inventory — never in this repository.

## Relationship to GitHub Actions deploys

Some ventures also have `.github/workflows/*-deploy*.yml` targeting Cloudflare
Pages or Vercel. Those jobs are often **gated** on owner credentials (see
`platform/ci/publish_surface.py`). The Hetzner surface is available **now**
without waiting on those secrets.
