# Job Shop Quote: RFQ-to-quote for CNC and fabrication job shops

Bet #2 in [`portfolio/monetization/bets.md`](../../portfolio/monetization/bets.md). A shop pastes or
forwards an RFQ email, attaches the drawings and CAD files (STEP, IGES, STL, DXF), checks what the AI
read from them (every value tied to a verbatim quote from the RFQ), and sends a quote priced **only**
from its own rate card by a deterministic costing engine: missing inputs are blocking issues, never
guessed numbers. Around the quote: revisions, a customer acceptance link, follow-ups, win/loss
analytics, routings, material price lists, job travelers and QuickBooks Online invoices. Hosted SaaS on
Cloudflare Workers, sold by subscription through the owner's merchant of record (Paddle), dark until
the owner sets the Paddle keys. **Quotes are the shop's own; nothing here is engineering or pricing
advice.**

**Source visible, all rights reserved** ([LICENSE](LICENSE)). Publishing this directory grants no
licence to use, host or resell it. Third-party test files keep their own licence
(`packages/cad-features/test/fixtures/public/SOURCES.md`, Apache-2.0).

## Why someone would use it

Quoting a machined or fabricated part takes an owner or estimator hours: read the drawing, size the
stock, guess the cycle time, price the material and finishing. The paid alternatives are QuotedPart
($199/mo per shop), Paperless Parts and the ERPs' estimating modules (JobBOSS² about $3,000/yr,
ProShop $650–715/mo), and funded AI entrants (Forgepoint, CloudNC's Quote Agent, Uptool); sources
and dates in `bets.md`. Job Shop Quote is priced per shop (early access free with 40 RFQs a month,
Shop $199, Shop Plus $399; `apps/jobshop-quote/src/shared/plans.ts`), measures part geometry from the
CAD file itself, and never lets the model set a price. Free front doors:
[`machine-shop-guides`](../machine-shop-guides/), [`dxf-nesting`](../dxf-nesting/),
[`cnc-machining-quote-calculator`](../cnc-machining-quote-calculator/).

## Layout

A self-contained pnpm workspace, moved here from `private-monorepo` on 2026-11-27 (task
`move-jobshop-quote-public` in [`portfolio/work/tasks.yaml`](../../portfolio/work/tasks.yaml)); the
relative paths inside are the same as there.

| Path | What |
| --- | --- |
| `apps/jobshop-quote` | the app: Hono API + React SPA in one Worker, D1, R2, Workers AI ([architecture](apps/jobshop-quote/docs/ARCHITECTURE.md), [roadmap](apps/jobshop-quote/ROADMAP.md)) |
| `apps/jobshop-site` | the marketing site and early-access sign-up |
| `packages/cad-features` | part geometry from DXF, STEP, IGES and STL, zero dependencies, Worker-safe |
| `packages/billing` | Paddle billing port, plans, entitlements, the margin-floor check |
| `packages/qbo-sync` | QuickBooks Online sync port |
| `packages/admin-metrics` | the owner-console metrics contract |
| `scripts/` | the no-source-maps check |
| `docs/legal/OPERATOR.md` | operator and launch authority |

`packages/billing`, `qbo-sync` and `admin-metrics` are also in `ventures/payapps/packages/` while
both products are synced from `private-monorepo`; each workspace builds on its own copy, so neither
reaches outside its directory. Folding them into one shared package is a later step.

## Run it

```sh
cd ventures/jobshop-quote
pnpm install --frozen-lockfile
cd apps/jobshop-quote
pnpm demo                             # offline demo at http://localhost:5199: fake LLM, no keys
pnpm typecheck && pnpm test:unit && pnpm test:worker && pnpm build
pnpm test:e2e                         # Playwright, offline
```

CI: [`.github/workflows/jobshop-quote-ci.yml`](../../.github/workflows/jobshop-quote-ci.yml)
(read-only, no secrets). Deploying: [DEPLOY.md](DEPLOY.md).

## Where the work happens

Until the deploy is ported (DEPLOY.md, "Not yet"), `private-monorepo/apps/jobshop-quote` is still
where scheduled runs build, and this copy is a snapshot of private-monorepo commit `28895f0c`
(2026-11-27). Refresh it with [`sync-from-private.sh`](sync-from-private.sh), which runs the
pre-publication audit first. Once the public deploy works, the private copy is removed and this
directory becomes the one source.
