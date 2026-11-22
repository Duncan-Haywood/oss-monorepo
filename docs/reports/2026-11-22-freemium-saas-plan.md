---
kind: analysis
date: 2026-11-22
subjects: [deploy, llm]
topics: [money, hosting, guardrails, owner-only, privacy, public-repo, usage-tracking, distribution]
---
# Plan: moving the portfolio to freemium SaaS run by Maris Stella Labs LLC

Written 2026-11-22 with the owner, who set the direction: "i think moving
mosty things into freemium saas is the move", run by "maris stella labs
llc", with the source "public but restrictive license". The goals change is in
`prompts/goals.md` (Mission, "The business model"; Guardrails, "Operating
hosted services"). This report is the plan for getting there. Steps marked
**owner** are ones only the account holder can take.

## The model in one paragraph

Free stays free: every tool that works today keeps working with no account,
as a static page, so search traffic and the site's "free" claims hold. A
paid tier adds depth around the tools (saved work synced across devices,
branded PDF and quote output, embeds, teams, CSV and API access, scheduled
checks and alerts, AI features). One account and one Pro subscription unlock
the extras across every tool; larger products (Grant Autopilot first) can
carry their own plans on the same accounts. Maris Stella Labs LLC hosts the
services on Cloudflare and is the operator. New product and platform code is
under FSL-1.1-MIT; `research/` and everything already released stay MIT.

## Two findings that set the order

**1. Traffic, not the paywall, is the limit.** `portfolio/usage/site-visits.json`
counts 902 page loads by browsers (not bots) between 2026-10-24 and
2026-11-19, about 33 a day, across 159 pages. `secret-santa-draw` alone is
209. The counter skips visitors who send DNT/GPC or opt out, so this is an
undercount, but at usual freemium conversion rates the catalogue would earn
close to nothing today. So the first paid product should be one with a buyer
already, which is Grant Autopilot and its pilot customer, and distribution
work runs alongside every phase.

**2. Hosting user data from this repo needs a protected lane.** The
2026-10-30 billing plan (`docs/reports/2026-10-30-billing-plan.md`) explains
why: agents merge to `main` without review, same-repo agent branches get
Actions secrets, and a Cloudflare API token can deploy any Worker in its
account. That is acceptable for static calculators; it is not for a service
that holds customers' documents, sessions and subscriptions. The plan's
Option B is the answer and now covers user data as well as money:

- production services that hold user data or keys run in a **separate
  Cloudflare account**, deployed from a **private operations repo** behind a
  GitHub environment with the owner as required reviewer;
- product code, Grant Autopilot included, lives here under FSL, where agents
  keep building at full speed;
- a CODEOWNERS rule plus a ruleset requiring the owner's review covers the
  shared SaaS package, billing code and deploy workflows. This is the one
  narrow exception to "no review ceremony", and it guards only money and user
  data.

## What Grant Autopilot already brings

Grant Autopilot (a Cloudflare Worker with a React app, currently in the
owner's private repository) already has nearly everything a hosted
freemium product needs, each piece behind a small, swappable interface
("port") with a fake for tests and the offline demo.

| Service | What exists | What the portfolio needs on top |
|---|---|---|
| **Paddle** (merchant of record) | A three-call `BillingProvider` port (checkout, customer portal, webhook) and a plain-`fetch` Paddle adapter: sandbox by key prefix, signed webhooks with a replay window, price ids from config. Checkout binds to an account through a signed, single-use token, never a raw account id. Plans, cost model, billing periods and grace in `src/shared/billing/`, with a test that keeps every plan's markup within 1.3x to 2.0x. No keys means billing answers 503 and comp plans keep working. | A portfolio product catalogue (Pro across tools, plus per-product plans), and one "what has this person paid for" endpoint that static pages can call. This also settles the `payout-rail` row: Paddle. |
| **Anthropic** | An LLM port: dotted `purpose` per call, prompt-cache-friendly ordering, structured output checked with zod, refusal handling, cost metered per call and per account. A budget wrapper enforces a monthly cap per account ($25 default) and a global daily cap ($200 default; `0` is an instant kill switch). | The same guard per user for Pro AI features, and a hard daily cap for any free-tier AI. `platform/llm/byok.mjs` stays for self-hosters and bring-your-own-key use. |
| **Resend** (email) | An email port and Resend adapter: strict address checks, header-injection protection, idempotency keys, a recipient limit, log-only with no key. Sign-in emails and templates on top. | One verified sending domain for the portfolio and a transactional stream. |
| **Cloudflare** | D1 (Drizzle), R2, Vectorize, Workers AI (embeddings, document conversion, Whisper), Queues with a dead-letter queue, Workflows, crons, four rate limiters, Turnstile, Cloudflare Access for admin pages, observability. `wrangler.jsonc` plus a provisioning script, a separate demo Worker on fakes. | The separate production account with **one scoped API token** (not the account-wide global API key), and its secrets only in the private repo's protected environment. |
| **Sign-in and accounts** | Better Auth (email and password, Google), sessions, members and roles, Turnstile, tenant middleware with cross-tenant tests. | A personal-account option beside organisations (a single person buying Pro for a calculator), and a session shared across `*.marisstella.app`. |
| **Privacy and legal** | Data export, deletion, retention, consent records, an audit log; versioned legal documents with acceptance records; terms, privacy, data-use, refunds and acceptable-use pages naming the LLC. | One shared set of legal pages for the portfolio, a published list of the services that process user data, and a data-processing agreement for business customers. Fix the LLC's name in the existing pages ("Mary Stella" is a typo) and confirm its state. |
| **Operations** | Monitoring, runbook, backups and an operations guide, with workflows for each. | A support inbox (`platform/edge` already runs one for site feedback) and cost dashboards. |

## Workstreams

1. **Security and separation.** Separate production Cloudflare account;
   private operations repo with a protected deploy environment; CODEOWNERS and
   a ruleset on `platform/saas/**`, billing code and `*deploy*` workflows;
   secret scanning with push protection confirmed on. Keep
   `platform/ci/check_payment_keys.py`.
2. **Shared SaaS package (`platform/saas`).** Extract from Grant Autopilot:
   auth, tenancy, billing (Paddle), LLM with budgets, email (Resend), privacy,
   legal and the security middleware. Generalise plans into one catalogue, add
   personal accounts, and add the entitlement endpoint. Run it as one accounts
   service (for example `api.marisstella.app`).
3. **Pro features on tools.** Static pages stay static; signed-in users get
   small client-side calls for sync, branded output, CSV and API, alerts. A
   tool declares its paid features instead of building a backend. Start with
   tools businesses would pay for (quote and takeoff tools such as
   `wall-framing-takeoff` and `shed-designer`, `ai-bookkeeper`,
   `einvoice-preflight`) rather than the most-visited ones.
4. **Legal and compliance.** Shared legal pages naming Maris Stella Labs LLC;
   Pro pages say exactly what is stored, and free pages keep "nothing is
   uploaded" true; Paddle handles sales tax and VAT as merchant of record.
5. **Operations.** Support inbox, monitoring, backups, incident runbook, cost
   caps in code (per account, per day, global kill switch), abuse limits.
6. **Measurement.** Add sign-ups, paid conversion and monthly recurring
   revenue to `portfolio/usage`; fill `income.json` from Paddle's exports
   (aggregates only, no customer details: this repository is public).
7. **Docs and rules.** Update `PRODUCT_PLAYBOOK.md` §2 and
   `platform/deploy/README.md` (self-deploy becomes optional), `AGENTS.md`,
   `CONTRIBUTING.md` (contributions follow the folder's licence), `LICENSE`
   plus an FSL file and the third-party licence checker, the README and site
   wording ("free, MIT"), and `VENTURE.yaml` fields for tier and plans.
8. **Distribution.** Search, marketplace and directory listings, trade
   communities, inside the honest-marketing hard limit. This decides revenue
   more than any feature.

## Phases

| Phase | Who | What |
|---|---|---|
| 0 | **owner** | Confirm FSL-1.1-MIT; accept the review gate on SaaS, billing and deploy paths; create the separate production Cloudflare account and a scoped token; open Paddle (sandbox first), Resend and an Anthropic organisation with workspace spend limits, all in the LLC's name; confirm the LLC's state for the legal pages. |
| 1 | agents, owner reviews | Move Grant Autopilot into `ventures/grant-autopilot/` under FSL, with the pilot customer's name and private data removed and only test or made-up fixtures kept. Its production deploy moves to the private operations repo. Launch it as the first paid service. |
| 2 | agents, owner reviews | Extract `platform/saas` from Grant Autopilot and stand up the shared accounts service. |
| 3 | agents | Pro on three to five business tools; measure sign-ups and conversion. |
| 4 | agents | Widen Pro in batches as the numbers justify; distribution work throughout. |

## Open decisions (owner)

- Licence: FSL-1.1-MIT (in the goals change) or another restrictive licence.
- The review gate and the private operations repo, as above.
- Free-tier spend: the monthly amount the LLC will absorb, which sets how
  generous free AI features can be.
- Support: how much owner time goes to answering customers; agents can draft
  replies, but a person sends them.
