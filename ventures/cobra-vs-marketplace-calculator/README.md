# COBRA vs Marketplace Calculator

After using this, you can see whether keeping your old employer plan on COBRA or buying a marketplace plan
costs less over the months you need coverage, at five levels of medical care, and the dates you must act by —
which used to mean comparing two plan PDFs and an election notice by hand.

**Live tool:** https://marisstella.app/cobra-vs-marketplace-calculator/

```
node cli.mjs compare --cobra-premium 780 --market-premium 210 --cobra-deductible 3000 --cobra-deductible-met 2400 \
  --cobra-oop-max 8000 --cobra-oop-met 2600 --market-deductible 5500 --market-oop-max 9200 --months 6 --coverage-ended 2026-10-31
node cli.mjs compare --cobra-premium 780 --market-premium 210 --cobra-oop-max 8000 --market-oop-max 9200 --json
```

`--market-premium` is the monthly amount after your premium tax credit, from your own healthcare.gov quote.
Exit 2 on bad input.

## What it is not

A deterministic calculation over typed numbers and federal deadline rules dated in the source
(`RULES_AS_OF`). It ignores provider networks, formularies, copays, cost-sharing reductions and state
continuation laws. Not insurance or legal advice.

## Known gaps

From the quality audits of 2026-11-12 ([`portfolio/quality/audits/2026-11-12-cobra-vs-marketplace-calculator.json`](../../portfolio/quality/audits/2026-11-12-cobra-vs-marketplace-calculator.json)) and the re-audit of 2026-11-24 ([`portfolio/quality/audits/2026-11-24-cobra-vs-marketplace-calculator.json`](../../portfolio/quality/audits/2026-11-24-cobra-vs-marketplace-calculator.json)):

- The scenario totals treat the whole period as one plan year, because the tool does not know in which months the care falls. With a coverage end date, the worst case now counts a full out-of-pocket maximum in each plan year (README example: marketplace $19,660, COBRA $18,080), coverage ending in December drops this year's COBRA carry-over, and a note says when the months cross January 1. The plan year is assumed to start January 1, which is the rule for marketplace plans (45 CFR 147.104(f)) and common, not universal, for employer plans; there is no plan-year input.
- Months are capped at 18 (job loss or cut in hours). The 29-month disability extension (premium up to 150%) and 36-month events for dependents are not modelled, and the tool cannot check the 102% premium cap without the plan's full cost.
- There is no premium tax credit table: you type the premium after the credit. A note now says the credit is reconciled on full-year income (Form 8962) and that the 2026 rules (Rev. Proc. 2025-25) give no credit above 400% of the poverty line.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

FSL-1.1-MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not insurance or legal advice; verify its output before relying on it.
> **Best-effort hosting, no SLA.**
