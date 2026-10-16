# Email API Pricing Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/email-api-pricing-calculator/>

Price Resend, Postmark, SendGrid, Mailgun, Amazon SES and Brevo side by side at your monthly
send volume, see the 12-month spend under your growth rate, and find the volumes where the
cheapest provider changes — before you build on one.

```
node cli.mjs compare --emails 120000 --growth 6
node cli.mjs compare --emails 300000 --provider postmark --budget 200   # CI gate: exit 1 over budget
node cli.mjs crossover
node cli.mjs compare --emails 120000 --prices prices.json --json
node cli.mjs providers
```

`--prices` is a JSON object of provider overrides merged over the defaults (free emails, plans of
`{emails, price}`, overage per 1,000). Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on a send volume at approximate public list prices dated in the source
(`PRICES_AS_OF`) and editable. It ignores dedicated IPs, inbound email, log retention, seats,
contracts, deliverability and each vendor's own definition of a billable email, so it compares the per-email line
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
