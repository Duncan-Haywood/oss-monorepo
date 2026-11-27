# E-invoice Fix & Explain: the paid edition of the e-invoice checker

Bet #3 in [`portfolio/monetization/bets.md`](../../portfolio/monetization/bets.md): a workspace for
accountants and small invoicing vendors that checks XRechnung, ZUGFeRD/Factur-X, Peppol BIS and other
EN 16931 invoices, explains each failed rule in plain German, French, Dutch or English, and offers a
safely corrected file where the fix is mechanical. Hosted SaaS on Cloudflare Workers, sold by
subscription through the owner's merchant of record (Paddle), dark until the owner sets the Paddle
keys. **Not tax or legal advice; a passed check means the listed rules passed, nothing more.**

**Source visible, all rights reserved** ([LICENSE](LICENSE)). Publishing this directory grants no
licence to use, host or resell it. The MIT-licensed baseline it grew from stays MIT, as published,
in [`ventures/einvoice-preflight`](../einvoice-preflight/) (the free edition, live at
<https://marisstella.app/einvoice-preflight/>); `apps/einvoice-preflight/LICENSE` says which part is
which.

## Why someone would use it

Germany requires issuing e-invoices from 1 January 2027 for businesses with prior-year turnover above
€800k and from 2028 for everyone; France from September 2027 for SMEs (sources and dates in
`bets.md`). Validation alone is already free or cheap: KoSIT's validator, ecosio's free validator,
Verax-Check at €15–49 a month (prices as `bets.md` records them; re-check before quoting). What those
leave an accountant with is a list of Schematron rule ids such as `BR-CO-15` and no fixed file. This
edition explains each failure in the client's language, re-validates every fix before offering it,
and keeps a per-client history and an "at a glance" dashboard across the firm's clients. Plans:
Trial (free), Firm S €19, Firm M €29, Firm L €49 a month, and a metered API for invoicing vendors
from a €19 monthly minimum (`apps/einvoice-preflight/pro/plans.mjs`; proposals until the owner turns
billing on).

## Layout

Moved here from `private-monorepo` on 2026-11-27 (task `move-einvoice-pro-public` in
[`portfolio/work/tasks.yaml`](../../portfolio/work/tasks.yaml)); the relative paths inside are the
same as there, so no import changed.

| Path | What |
| --- | --- |
| `apps/einvoice-preflight` | the checker (the free edition's code plus everything built since), the paid layer in `pro/` (accounts, clients, batches, explanations, fixes, dashboard, billing), the Worker build in `worker/` ([roadmap](apps/einvoice-preflight/ROADMAP.md), [hosting](apps/einvoice-preflight/docs/HOSTING.md), [billing](apps/einvoice-preflight/docs/BILLING.md), [third-party files](apps/einvoice-preflight/PROVENANCE.md)) |
| `apps/einvoice-site` | the marketing site in German, French and English (static pages + early-access Worker) |
| `packages/billing` | Paddle billing port, plans, entitlements, the margin-floor check (zero runtime dependencies) |
| `packages/admin-metrics` | the owner-console metrics contract |

## Run it

No npm dependencies; Node 22 or later.

```sh
cd ventures/einvoice-pro/apps/einvoice-preflight
node --test pro/*.test.mjs              # paid layer
node --test worker/*.test.mjs           # Worker provisioning
node --test --test-concurrency=4 *.test.mjs   # checker suite (a few minutes)
cd ../einvoice-site && node build.mjs && node --test test/*.test.mjs
```

CI runs the same from [`.github/workflows/einvoice-pro-ci.yml`](../../.github/workflows/einvoice-pro-ci.yml).

The Python CLI the checker started as is not in this copy: the paid edition never runs it, and it
stays in the free edition, [`ventures/einvoice-preflight`](../einvoice-preflight/) (MIT), with its
tests. `tests/endpoint_peppol_cases.json` stays here because the JavaScript tests share it. The
private copy's later Python changes are still in `private-monorepo` for porting to the free edition.

## Where the work happens

Until the deploy has run from here, scheduled runs may still build in `private-monorepo`. Refresh this
copy with `ventures/einvoice-pro/sync-from-private.sh <clone>`, which audits first and stops on a block
finding, then re-applies the fixes the public checks forced (listed in
[docs/reports/2026-11-27-move-einvoice-pro-public.md](../../docs/reports/2026-11-27-move-einvoice-pro-public.md)).
Once it deploys from here, build here and remove the private copy (DEPLOY.md, "Then").

## Disclaimer

Checks and explanations are produced by software against published rule sets and can be wrong or
incomplete. They are not tax, legal or accounting advice. A passed check says which rules passed;
it does not say the invoice is accepted by a tax authority, a network or the buyer.
