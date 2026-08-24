# Candidate: Etsy profit calculator

Composite 7.125 · floor 2 (ai_leverage)

**One line.** A local calculator that shows an Etsy seller's order contribution
after marketplace fees, shipping, materials, ads, and other variable costs.

**Verdict: graduate narrow version.** Independent Etsy makers have recurring
search intent around fee and profit calculation, but the amount left after the
full fee stack is hard to see. This tool keeps every seller-entered assumption
visible instead of hiding them in one estimate. It is arithmetic only: it does
not know Etsy's current rates, give tax advice, access accounts, or collect
order data. Its browser-local shape has zero hosting and inference cost.

The strongest alternatives are Etsy's fee pages, spreadsheets, and generic fee
calculators. A later hosted tier could add saved templates or bulk CSV review,
but the free core is useful without payment, accounts, or an API key.

| Dimension | Score | Reason |
|---|---:|---|
| AI leverage | 2 | Deterministic arithmetic is the right core |
| Autonomous ops | 10 | Static page with no account or server |
| Time to revenue | 7 | Strong recurring pain and searchable intent |
| Gross margin | 10 | Client-side computation and no paid dependencies |
| Defensibility | 4 | User-specific templates could create a modest niche asset |
| Distribution | 7 | Etsy communities and high-intent searches are reachable |
| Liability containment | 8 | User-entered arithmetic with explicit fee and tax limitations |
| Ethical robustness | 9 | Helps small sellers understand costs without controlling accounts |

Demand, repeat use, and willingness to pay are untested. Rates vary by country,
payment configuration, and seller status, so the product requires verification
against the seller's own statements.
