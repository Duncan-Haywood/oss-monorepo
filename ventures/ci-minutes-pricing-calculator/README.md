# CI Minutes Pricing Calculator

Price GitHub Actions, CircleCI, GitLab, Bitbucket Pipelines and Buildkite side by side at your monthly
build-minute volume, see the 12-month spend under your growth rate, and find the volumes where the
cheapest provider changes — before you build on one.

**Live tool:** https://marisstella.app/ci-minutes-pricing-calculator/

```
node cli.mjs compare --minutes 12000 --growth 6
node cli.mjs compare --minutes 30000 --provider github --budget 200   # CI gate: exit 1 over budget
node cli.mjs crossover
node cli.mjs compare --minutes 12000 --prices prices.json --json
node cli.mjs providers
```

`--prices` is a JSON object of provider overrides merged over the defaults (free minutes, plans of
`{minutes, price}`, overage per 1,000). Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on a build-minute volume at approximate public list prices dated in the source
(`PRICES_AS_OF`) and editable. It ignores extra seats, macOS/Windows and larger-runner multipliers, concurrency,
caching and artifact storage, contracts and each vendor's own minute accounting, so it compares the per-minute line
and does not forecast an invoice. Not a quote, a guarantee or advice. Not affiliated with any
vendor named.

## Known gaps

From the quality audit of 2026-11-19 ([`portfolio/quality/audits/2026-11-19-ci-minutes-pricing-calculator.json`](../../portfolio/quality/audits/2026-11-19-ci-minutes-pricing-calculator.json)):

- Rate cards were rechecked against each vendor's own pricing page: GitHub on 2026-11-19, the other four on 2026-11-25 (Bitbucket Standard $3.65 a user; Buildkite small Linux agents $0.008 a minute, with the Pro plan's $30-a-user fee and 4,000 included vCPU minutes now counted and the Free plan capped at 1,000 small-agent minutes). Each is a Linux list price for one seat.
- Seats are fixed at 1, and GitLab Free's pay-per-pack minutes are not offered as an option.
- A malformed `--prices` file exits 1, the over-budget code, instead of 2.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

FSL-1.1-MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
