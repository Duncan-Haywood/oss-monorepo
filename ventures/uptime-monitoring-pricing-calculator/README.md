# Uptime Monitoring Pricing Calculator

Price UptimeRobot, Better Stack, Hyperping, Pingdom and self-hosted Uptime Kuma side by side for the
number of monitors you need, the check interval and an optional public status page, see the 12-month
spend as your monitor count grows, and find the monitor count where the cheapest option changes.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/uptime-monitoring-pricing-calculator/

```
node cli.mjs compare --monitors 60 --interval-sec 60 --status-page --growth 5
node cli.mjs compare --monitors 60 --interval-sec 60 --provider pingdom --budget 50   # CI gate: exit 1 over budget
node cli.mjs crossover --interval-sec 60 --status-page
node cli.mjs compare --monitors 60 --interval-sec 60 --prices prices.json --json
node cli.mjs providers
```

`--prices` is a JSON object of provider overrides; a provider's `plans` array (name, usd, monitors,
minIntervalSec, statusPage, optional extraMonitorUsd) replaces its defaults. Exit 1 when `--budget`
(monthly USD) is exceeded; 2 on bad input or when the chosen provider has no covering plan.

## What it is not

Matching typed needs against approximate public list prices dated in the source (`PRICES_AS_OF`)
and editable. It ignores SMS/phone alert credits, seats, multi-location and transaction checks,
annual discounts and fair-use terms, so it compares the monitor lines and does not forecast an
invoice. Not a quote, a guarantee or advice. Not affiliated with any vendor named.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
