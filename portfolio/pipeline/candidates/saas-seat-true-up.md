# Candidate: SaaS seat true-up calculator

**One line.** A browser-local planning tool that shows operations and finance teams how many recurring software seats are unused before a renewal, and turns the scenario into a factual vendor conversation.

**Verdict: graduated 2026-08-24 as `ventures/saas-seat-true-up`.** The first vertical slice is totals-only: no employee names, vendor login, procurement action, or hosted data.

## Customer and pain

Small companies often renew SaaS from an invoice or contract total while active usage lives in an admin console. The avoidable cost is concrete: unused seats multiplied by the monthly price and renewal term. A second failure mode is overage, where active users exceed the purchased plan and the next invoice may carry an uplift.

## Value and repeat use

The user can now quantify waste, test a seat-count scenario, and copy a renewal brief in under a minute, which used to take a spreadsheet and a manual contract review. It should return before each recurring SaaS renewal and whenever a team changes plans.

## Alternatives and differentiation

Vendor admin consoles, spreadsheets, and SaaS-management suites already exist. This is not an inventory replacement: it is a fast, vendor-neutral, no-account sanity check that does not require importing a roster. The useful wedge is searchable renewal language plus a transparent calculation that can be shared without exposing personnel data.

## Acquisition and business model

Search phrases include “SaaS renewal seat calculator”, “unused software license calculator”, and “software license true-up”. IT operations communities and fractional CFOs are plausible referral channels. A later business model could be a hosted renewal history or team workflow, but launch remains free and payment-free.

## Delivery, cost, and operations

The static app is usable from a file or GitHub Pages, with zero server, API, inference, storage, or support cost per user. A future optional AI summary could use the user's own key, but deterministic arithmetic is the complete product.

## Risk and boundaries

Inputs are customer-supplied totals and remain in the browser. The result is a planning estimate, not a procurement, financial, accounting, or contract interpretation. Vendor minimums, annual escalators, shared accounts, and billing terms remain for the customer to verify. No license is changed automatically.

## Fit and novelty

This is distinct from quote-margin-check, marketplace fee calculators, invoice payment terms, and evidence monitors. It is a new recurring B2B cost-control workflow in the portfolio and uses the existing static-site, local-storage, anonymous-event conventions.

## Initial scores

AI leverage 2, autonomous operations 10, time to first user 7, gross margin 10, defensibility 4, distribution 5, liability containment 8, ethical robustness 9. The low AI score is intentional. The defensibility mitigation is portable scenario/brief output; distribution will be tested through organic search and repeat-use measurement.
