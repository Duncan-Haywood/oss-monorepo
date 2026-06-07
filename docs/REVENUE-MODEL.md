# Revenue Model & Profitability Analysis

## The Software-First Advantage

By replacing manual field photography with an AI-powered capture app, Print Atelier fundamentally changes the unit economics of art digitization.

| Cost Driver | Traditional Model | Software-First Model |
|-------------|-------------------|----------------------|
| **Artist Acquisition** | Manual outreach, high friction | Automated digital outreach, low friction |
| **Digitization Cost** | $100–$300 per session (photographer) | ~$0.50 per piece (cloud compute/AI inference) |
| **Time to Market** | Weeks (scheduling, editing, listing) | Minutes (instant AI processing and API listing) |
| **Geographic Constraint**| Limited to cities with hired photographers | Global from Day 1 |

Because the marginal cost of acquiring and digitizing supply is near zero, we can afford to onboard thousands of artists and build a massive long-tail catalog, monetizing pieces that would be unprofitable to digitize manually.

## Core Split

| Party | Share | Notes |
|-------|-------|-------|
| **Artist** | 30% of net profit | On every print sale of their work. High enough to be a "no-brainer," low enough to fund our software/marketing. |
| **Print Atelier** | 70% of net profit | Covers cloud compute, platform maintenance, API costs, and performance marketing. |

## Defining "Net Profit" (Per Sale)

```
Gross sale price
  − payment processing fees (~3%)
  − print + shipping cost (POD API invoice)
= Net profit
```

Artist share = `Net profit × 0.30`
Print Atelier share = `Net profit × 0.70`

> **Note:** Because we use AI for mockups and SEO, there are no per-piece human marketing costs to deduct.

## Example Unit Economics (Illustrative)

Assume a 16×20 archival print sold at **$85**:

| Line item | Amount |
|-----------|--------|
| Sale price | $85.00 |
| Payment processing (3%) | −$2.55 |
| POD print + ship (Gelato/Prodigi) | −$28.00 |
| **Net profit** | **$54.45** |
| Artist share (30%) | $16.34 |
| Print Atelier Gross Margin (70%) | **$38.11** |

### Software Profitability Analysis

From Print Atelier's **$38.11** gross margin per print, we deduct our digital operating costs:

- **AI Inference / Cloud Cost:** ~$0.50 (amortized over the life of the piece, effectively $0 per sale after the first).
- **Customer Acquisition Cost (CAC):** Targeted at $15.00 via programmatic SEO and optimized paid social.
- **Contribution Margin:** **~$23.11 per print sold.**

With a fully automated pipeline, this contribution margin drops straight to the bottom line, unencumbered by physical operational overhead.

## Advertising Economics & LTV

Our demand-side growth relies on digital marketing arbitrage. 

- **Target CAC:** $15 - $20
- **AOV (Average Order Value):** $100 (assuming multiple prints or larger sizes)
- **LTV (Lifetime Value):** $150 (assuming 1.5 purchases per customer over 2 years)

**Decision gate for paid acquisition:**
```
LTV (buyer) > CAC × 3
```

Because our catalog is vast and automatically tagged by AI, we can run highly specific, low-cost long-tail ads (e.g., "Large impasto coastal abstract print") rather than expensive generic art keywords.

## Payout Cadence

- **Fully Automated:** Stripe Connect integration automatically splits funds at the point of sale. 
- Print Atelier receives its 70% immediately; the Artist's 30% is routed to their connected Stripe account, subject to standard holding periods to cover potential refunds.
