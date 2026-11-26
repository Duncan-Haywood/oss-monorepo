---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: inbound RFQ email routing as code (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`). Private-monorepo PR #207 (merged; claim
`claim/jobshop-quote/inbound-routing-as-code`, ROADMAP item 8).

## The finding that changed the plan
Cloudflare's catch-all Email Routing rule is **apex-only** ("Catch-all rules are only available for
the apex domain": cloudflare-docs `src/content/docs/email-service/configuration/subdomains.mdx`,
fetched from raw.githubusercontent.com on 2026-11-26; developers.cloudflare.com answers 403 through
the session proxy). The ROADMAP's plan, a catch-all on an RFQ-only subdomain, could not work. The
apex `marisstella.app` is shared with the oss inbox
(`platform/pages/cloudflare/email-routing.json`, literal rules to `monorepo-projects-edge`).

The same limit applies to **any app that wants per-customer random inbound addresses** (payapps,
grants). Use the same pattern: one literal rule `<local>@<subdomain>` plus subaddressing, with the
token in the `+` part.

## What landed
- Addresses are `rfq+{token}@{INBOUND_EMAIL_DOMAIN}`. The parser accepts `rfq[+-]{token}` followed by
  an optional `+tag`.
- `apps/jobshop-quote/email-routing.json` (zone `marisstella.app`, domain `rfq.marisstella.app`) and
  `scripts/email-routing.mjs`: `POST /zones/{id}/email/routing/dns {name}` (subdomain),
  `PATCH /zones/{id}/email/routing {support_subaddress:true}` (a zone-wide setting), and a literal
  rule named `as-code jobshop-quote: rfq@...`. Dry run unless `APPLY=1`. The subdomain's state is
  read from the zone's MX records (needs DNS Read). If DNS can't be read, it tries to enable and
  accepts "already".
- API shapes come from `github.com/cloudflare/api-schemas` `openapi.json` (raw fetch works; 29 MB).
- Deploy: the step runs behind `vars.JOBSHOP_INBOUND_EMAIL == 'on'`, uses secret
  `CLOUDFLARE_EMAIL_ROUTING_TOKEN`, and is continue-on-error. `INBOUND_EMAIL_DOMAIN` =
  the step's output, else `vars.JOBSHOP_INBOUND_EMAIL_DOMAIN`.

## Not verified
- Not yet run against the live zone. The token and the variable are owner steps.
- Wrangler 4.113+ also supports top-level `addresses` in the wrangler config for literal rules. It
  wasn't used: it doesn't enable the subdomain or subaddressing, and non-interactive destructive
  changes make the deploy fail.

## Verification (CI starved: `ci_starvation.py`, no runner)
biome ci clean; typecheck clean; test:unit 369/369; test:worker 202/202; email-routing 14/14; build ok.
