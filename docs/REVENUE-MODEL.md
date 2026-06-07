# Revenue Model (Software Scale)

## Core Split

| Party | Share | Notes |
|-------|-------|-------|
| **Artist** | 30% of net profit | On every print sale of their work |
| **Artist (materials)** | Up to +30% | Optional reimbursement for supplies; terms per contract |
| **Print Atelier** | Remainder | Covers AI compute, platform hosting, marketing, and POD coordination |

## Defining "Net Profit" (Per Sale)

```
Gross sale price
  − payment processing fees
  − print + shipping cost (POD invoice)
  − allocated refund/chargeback reserve (optional %)
= Net profit
```

Artist share = `Net profit × 0.30`

> **Transparency:** Artists receive access to a real-time dashboard showing gross sales, deductions, and net payouts per piece.

## Example Unit Economics (Illustrative)

Assume a 16×20 archival print sold at **$85**:

| Line item | Amount |
|-----------|--------|
| Sale price | $85.00 |
| Payment processing (~3%) | −$2.55 |
| POD print + ship | −$28.00 |
| **Net profit** | **$54.45** |
| Artist share (30%) | $16.34 |
| Print Atelier (70%) | $38.11 |

*Numbers are placeholders until a POD provider is selected and retail pricing is tested.*

## Software Margins vs. Manual Margins

By eliminating field photographers and manual editing, our marginal cost to onboard a new piece of art drops to near zero (cents for AI compute).

| Cost Center | Manual Model | AI/Software Model |
|-------------|--------------|-------------------|
| **Capture** | $50-$150 per session (photographer) | $0.00 (Artist uploads photo) |
| **Processing** | 1-2 hours of manual editing | ~$0.10 in API/GPU compute |
| **Merchandising** | Manual staging or Photoshop | ~$0.05 per AI mockup generated |
| **Time to Market** | Days to weeks | Minutes |

This structural advantage allows us to invest heavily in **Demand Generation (Ads & Outreach)** while maintaining high profitability.

## Fulfillment Tiers

| Tier | When | Impact |
|------|------|--------|
| **POD API** | Default | Zero capex, infinite scale, global routing |
| **B2B / Wholesale** | High volume orders | Trade discounts, bulk shipping rates |

## Advertising Economics

Advertising spend comes from Print Atelier's share. Because our onboarding cost is effectively zero, we can aggressively acquire artists and let the catalog size drive long-tail organic traffic, while using paid acquisition for proven best-sellers.

Decision gate for paid acquisition:

```
LTV (buyer) > CAC × target ratio (e.g. 3×)
```

## Payout Cadence

| Phase | Cadence |
|-------|---------|
| Pilot | Monthly manual payout |
| Scale | Automated payouts via Stripe Connect |

Minimum payout threshold (e.g. $25) to reduce transaction overhead.

## Scenarios to Model

- [ ] Average prints sold per piece per year (long tail)
- [ ] Break-even catalog size for software platform costs
- [ ] AI compute costs per 10,000 images processed
- [ ] Sensitivity: POD cost +10%, price −10%, conversion −20%

Build spreadsheet in Phase 1 once provider pricing is confirmed.
