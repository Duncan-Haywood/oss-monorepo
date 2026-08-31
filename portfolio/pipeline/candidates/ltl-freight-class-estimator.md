# Candidate: LTL freight class estimator

**One line.** A private browser calculator for small shippers and freight
brokers that estimates an LTL freight-class band from packed dimensions,
weight, and piece count before they request a carrier quote.

**Verdict: build now; graduated 2026-08-24 as a venture.** The first vertical
slice is `ventures/ltl-freight-class-estimator/`. This is distinct from seller
fee calculators and quote-margin tools: it estimates a shipment input needed by
a carrier, not marketplace fees or a selling price.

## Evaluation

| Dimension | Assessment |
|---|---|
| Target user and pain | Small shippers, makers, and freight brokers who need a class estimate but do not have a transportation-management system. A wrong class can make a quote unusable or trigger a reclass charge. |
| Value and return use | Shows cube, density, and the effect of multiple pieces; users can repeat it for each pallet or packaging revision before booking. |
| Alternatives and differentiation | Carrier calculators, broker forms, spreadsheets, and generic density tables exist. The wedge is a fast local workflow that makes packed dimensions, per-piece weight, total shipment density, and uncertainty visible together. |
| Acquisition | Search phrases include `LTL freight class calculator`, `freight class by density`, and `what freight class is my pallet`; a static page and directly answerable README support search and AI discovery. |
| Future revenue | Free calculator first; later a paid export, saved shipment templates, or user-supplied carrier-rate integration could be tested. No payments or paid APIs are included now. |
| Build and costs | One deterministic browser page, zero dependencies, zero hosting/API/inference cost per user. A future API key would be the user's own carrier or AI key, never ours. |
| Automation | Static hosting and local calculations are fully agent-operable; no account, server state, or human workflow is required. |
| Risks and safeguards | Freight class is not only density. The page calls its output a planning estimate and tells users to verify NMFC, handling, stowability, liability, packaging, and carrier rules. No shipment data leaves the browser. |
| Portfolio fit | New freight-input problem; it does not duplicate eBay/Etsy/Shopify economics, janitorial pricing, freelancer margins, cut planning, or evidence products. |

## Evidence status

This is a hypothesis, not demand validation. The initial evidence is the clear
search intent and a usable deterministic workflow. The kill criteria are fewer
than three qualified shippers using it twice in 90 days, or reports that density
does not change the class they request. Usage is recorded only as anonymous
local event counts in `portfolio/usage/usage.yaml`; public traffic is not yet
available because publishing under the portfolio's name remains owner-gated.
