# FIFO pick evidence

Composite 7.0 · floor 3 (ai_leverage)

## Target and pain

Independent 3PL warehouses with fewer than 20 staff often need to explain pick
order to a customer, but their evidence is a spreadsheet assembled after the
fact. The first product reads a warehouse-exported CSV and identifies older
inventory that was still waiting when a newer lot was picked.

## Value and return use

An operator gets a portable exception list in seconds before a customer review.
They can run it for each weekly export or audit request. It reports observations
and missing data, never a compliance conclusion.

## Alternatives and differentiation

WMS products, spreadsheets, and generic CSV viewers exist. The narrow wedge is
the source-row-linked FIFO exception check that needs no WMS integration,
account, or upload. It is distinct from this portfolio's pricing calculators,
invoice checker, DNS evidence, and accessibility evidence products.

## Acquisition and business model

Search intent includes "FIFO pick order audit evidence", "warehouse FIFO CSV
checker", and "prove FIFO inventory picks". A later model could sell team
templates, scheduled customer evidence packs, or a customer-hosted CI/action
integration. The free CLI remains useful without payment or an API key.

## Delivery, cost, and risks

The vertical slice is a Python standard-library CLI with zero hosting and
inference cost. Logs stay on the operator's machine. Timestamp and WMS semantic
differences can produce misleading observations, so every report says to
investigate and verify; it does not certify FIFO or replace an audit.

## Initial score

AI leverage 3, autonomous ops 9, time to revenue 7, gross margin 10,
defensibility 5, distribution 6, liability containment 8, ethical robustness 9.
The low AI score is intentional: deterministic source-linked checks are more
valuable and safer than generated audit claims.
