import { MarkdownViewer } from "@/components/MarkdownViewer";

const content = `# Revenue Model

## Core Split

| Party | Share | Notes |
|-------|-------|-------|
| **Artist** | 30% of net profit | On every print sale of their work |
| **Artist (materials)** | Up to +30% | Optional reimbursement for supplies; terms per contract |
| **Print Atelier** | Remainder | Covers capture, editing, platform, marketing, fulfillment coordination |

## Defining "Net Profit" (Per Sale)

\`\`\`
Gross sale price
  − payment processing fees
  − print + shipping cost (POD invoice)
  − packaging / insert costs (if any)
  − allocated refund/chargeback reserve (optional %)
= Net profit
\`\`\`

Artist share = \`Net profit × 0.30\`

> **Transparency:** Artists receive periodic statements showing gross, deductions, and net per piece. Exact statement format TBD in Phase 1.

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

## Fulfillment Tiers

| Tier | When | Impact |
|------|------|--------|
| **POD partner** | Phase 0–2, low volume | Low capex, lower margin, fast to start |
| **Hybrid** | Growing volume | Best sellers in-house or via preferred printer |
| **In-house** | High volume, proven SKUs | Highest margin, requires warehousing + ops investment |

Margin improvement from tier upgrades flows primarily to Print Atelier unless renegotiated with artists at scale.

## Materials Reimbursement

Separate from profit share. Intended for early partnership or artists with high material cost.

Example structure:

- Artist submits material receipt or estimated cost per piece
- Cap: 30% of estimated retail print revenue for that piece, or fixed dollar cap
- Paid on first N sales or as one-time stipend — **TBD in contract**

## Advertising Economics

Advertising spend comes from Print Atelier's share until/unless a co-marketing fund is established with artists.

Decision gate for paid acquisition:

\`\`\`
LTV (buyer) > CAC × target ratio (e.g. 3×)
\`\`\`

Catalog needs enough SKUs and conversion data before scaling ads.

## Payout Cadence

| Phase | Cadence |
|-------|---------|
| Pilot | Monthly manual payout |
| Scale | Monthly automated via Stripe Connect or similar |

Minimum payout threshold (e.g. $25) to reduce transaction overhead.

## Scenarios to Model

- [ ] Average prints sold per piece per year (long tail)
- [ ] Break-even catalog size for part-time operator
- [ ] Break-even for first field photographer in a new city
- [ ] Sensitivity: POD cost +10%, price −10%, conversion −20%

Build spreadsheet in Phase 1 once provider pricing is confirmed.
`;

export default function RevenueModelPage() {
  return <MarkdownViewer content={content} />;
}
