# Container Demurrage & Detention Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/container-demurrage-detention-calculator/>

A free browser tool for importers, freight forwarders and customs brokers. Enter
the number of containers, the discharge, pickup and empty-return dates, the free
days and the carrier's tiered per-day rates. It prices demurrage (container
sitting at the port or terminal) and detention (container outside it, until the
empty goes back), gives each clock's last free day, what one more day costs, and
what pulling the whole chain earlier is worth. Entirely client-side; no shipment
numbers or company names are asked for.

After using this, you can **see the bill before the container is late, and know
the most a rush fee for an earlier pickup is worth paying** — which used to mean
finding the tier table in the tariff and doing it by hand, or finding out from
the invoice.

## Try it

Open [`index.html`](index.html) and click **Price the dwell time**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies.

- Demurrage clock: discharge to pickup. Detention clock: pickup to empty return.
- The discharge or gate-out day is day 0 and is not counted; each later day up to
  and including the pickup or return day is. Weekends can be set to count or not,
  per clock. Exemption days (terminal closed, a hold on the box that was not yours)
  are added to free time.
- Chargeable days are billed in three tiers: first N days at one rate, next M days
  at a higher one, every day after at a third rate, per container per day.
- The rush table moves pickup and return together, so detention keeps its length
  and only the port-side clock changes. That saving per box is the ceiling on an
  expedited-drayage or appointment fee worth paying.

The worked example in `calc.test.mjs` is hand-computed: two boxes, 11 counted days
on each clock, 4 free, 7 chargeable: $1,425 a box demurrage and $1,250 a box
detention, $5,350 in total; pulling everything one day earlier saves $550.

## Not decided

Your carrier's actual tariff, free days and rates (every default is a placeholder),
how your carrier counts the first and last day, holidays, whether a charge was
validly billed or can be disputed, regulatory billing and dispute windows, per-diem
on chassis or pre-pull, storage at a CFS, and currency. Not legal, customs or
financial advice.

## Tests

`node --test` (hand-worked examples, edge cases, page and privacy checks, usage counters).

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, customs, tax, or financial advice, and
it does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it.** To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice.

Everything runs in your browser. Your data is never uploaded. Free and MIT
licensed; optional support: <https://github.com/sponsors/Duncan-Haywood>.
