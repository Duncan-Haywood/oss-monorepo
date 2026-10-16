# Auth MAU Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/auth-mau-pricing-calculator/>

Price Clerk, Auth0, AWS Cognito, Firebase / Identity Platform, Supabase Auth and WorkOS AuthKit
side by side at your monthly active user count, see the 12-month spend under your growth rate, and
find the user counts where the cheapest provider changes — before you build on one.

```
node cli.mjs compare --mau 40000 --growth 8
node cli.mjs compare --mau 150000 --provider clerk --budget 500   # CI gate: exit 1 over budget
node cli.mjs crossover
node cli.mjs compare --mau 40000 --prices prices.json --json
node cli.mjs providers
```

`--prices` is a JSON object of provider overrides merged over the defaults (free MAU, paid base,
users covered by the base, marginal tiers; `null` for an unbounded last tier). Exit 1 when
`--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on a user count at approximate public list prices dated in the source
(`PRICES_AS_OF`) and editable. It ignores SSO/SAML connections, SMS MFA, B2B organizations,
custom domains, contracts and each vendor's own MAU definition, so it compares the per-user line
and does not forecast an invoice. Not a quote, a guarantee or advice. Not affiliated with any
vendor named.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
