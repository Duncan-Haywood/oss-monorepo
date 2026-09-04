# Freight accessorial invoice auditor

## Customer and problem

Small shippers and ecommerce brands review carrier invoices in spreadsheets and
can miss duplicate accessorial lines, charges above their expected contract
amount, or uncoded fees. After using this, a shipper can identify invoice lines
worth disputing and hand a dated review queue to finance, which used to take a
manual spreadsheet review.

## Alternatives and differentiation

Carrier portals and generic spreadsheet formulas require operators to build the
audit logic. A 3PL quote normalizer compares prospective fulfillment quotes;
this product audits billed invoice lines after service. The release is a
deterministic browser-local checker with CSV output, so findings are traceable
to the user's own row and no carrier credential is required.

## Distribution and business model

Search terms include "freight accessorial audit", "duplicate freight invoice
charges", and "carrier invoice audit spreadsheet". A static page has zero
marginal cost. A later paid tier could add customer-owned contract imports,
review history, or optional API connectors, but payment and hosted integrations
are absent from the launch slice.

## Risks and experiment

This is financial workflow support, not financial advice or a determination that
a carrier is wrong. Users must verify contract terms and invoice records before
disputing a charge. Invoice data stays in the browser. The first experiment is
14 days at a $0 budget; success requires three shippers to run two audits within
90 days and identify a real review finding.

## Portfolio fit

This is new relative to `3pl-quote-normalizer` and `ltl-freight-class-estimator`:
those price or classify freight before shipment, while this recovers leakage
from post-service invoices. It is distinct from generic quote-margin tools.
