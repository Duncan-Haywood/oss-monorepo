# Pricing proposal: e-invoice fix-and-explain

**Status: proposal for early access, 2026-11-24.** Not yet charged anywhere. The numbers live in
`content/pricing.mjs`; the site's pricing, accountants and API pages render from it, and
`test/pricing.test.mjs` fails if any plan or meter leaves the cost-plus band. If you change a number,
change it there and update this page.

Same principle as `apps/grants/docs/PRICING.md`: **cost-plus**. Each price is 1.3× to 2.0× what it
costs us to serve a customer who uses the whole allowance (model calls + hosting + merchant-of-record
fees + refund reserve). The real margin is usually higher, because most customers use less.

## Accountant plans (per firm, monthly, excl. VAT)

| Plan | Price | Client companies | Invoices checked / mo | Invoices explained / mo | Est. full cost | Markup |
|---|---|---|---|---|---|---|
| Firm S (Kanzlei S / Cabinet S) | €19 | 10 | 500 | 300 | €9.90 | 1.92× |
| Firm M | €29 | 30 | 1,500 | 500 | €15.62 | 1.86× |
| Firm L | €49 | 100 | 4,000 | 850 | €26.21 | 1.87× |

- **Checked** = deterministic validation (schema, EN 16931, national rules). Cheap.
- **Explained** = an invoice with errors whose errors we explained in plain language with a proposed
  fix. This is the model call, and the cost driver, so it is what each tier mostly buys.
- An invoice counts once per month, however often it is re-checked.
- The client limit is not a cost driver; it separates a sole practitioner from a larger firm and
  keeps the per-client plan feature (the accountants page) meaningful per tier.

## Metered API for invoicing software vendors (excl. VAT; the minimum in advance, usage above it in arrears)

| Unit | Price | Est. cost per unit at the minimum | Markup |
|---|---|---|---|
| Validation only (rule codes + locations) | €1.40 per 1,000 invoices | €0.00072 | 1.94× |
| Validation + explanation + proposed fix | €0.04 per invoice | €0.029 | 1.38× |
| Monthly minimum | €19, credited against usage | | |

The per-unit cost spreads the fixed monthly costs (payment fee, hosting) over the units the
minimum buys, so the markup only improves with volume. Validation is priced per thousand because a
per-invoice cent would be 10× cost, which is not cost-plus. A failing invoice checked with
`explain=0` (verdict and the checker's own text, no explanation or fix) is a validation unit, not an
explained one; the app's `api` plan bills exactly these units (`apps/einvoice-preflight/pro/README.md`,
"The metered API plan").

## Cost model (assumptions in `ASSUMPTIONS`, check before launch)

| Item | Assumption |
|---|---|
| One explanation | 3,000 input + 600 output tokens on `claude-opus-5-5` ($4/M in, $20/M out, as in grants' PRICING.md) = $0.024 ≈ €0.022 |
| Exchange rate | 1 USD = €0.92 |
| Validation | €0.0005 per invoice (Workers CPU and requests, generous) |
| Hosting | €1 per active account per month (Worker, D1, file kept ≤ 24 h, email) |
| Merchant of record | 5% + €0.50 per monthly charge |
| Refund reserve | 3% of price |

Not in the model, and therefore a reason prices may need to rise rather than fall: the work of
keeping the rule sets current (KoSIT XRechnung releases, FeRD/Factur-X releases, French
specification updates). That is labour, not per-customer cost.

## Open questions for the owner

1. Annual billing (grants gives 10% off; here it would also save eleven €0.50 fees).
2. Whether early-access customers keep their price after launch.
3. A per-client-company add-on above Firm L, or a custom plan.
4. Currency: EUR only (target market), VAT handled by the merchant of record.
