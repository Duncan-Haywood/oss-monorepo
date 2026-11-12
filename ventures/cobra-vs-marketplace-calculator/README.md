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

From the quality audit of 2026-11-12 ([`portfolio/quality/audits/2026-11-12-cobra-vs-marketplace-calculator.json`](../../portfolio/quality/audits/2026-11-12-cobra-vs-marketplace-calculator.json)):

- Totals treat the whole period as one plan year. Marketplace plans reset deductibles and out-of-pocket maximums every January 1 (45 CFR 147.104(f)), and most employer plans do too. When a coverage end date is given and the months cross January, the tool now says so; it does not yet split the costs at the reset. On the README example, the worst case for the marketplace can reach $19,660 across two plan years, not the $10,460 shown.
- There is no premium tax credit table: you type the premium after the credit. From 2026 the enhanced credits have lapsed: Rev. Proc. 2025-25 caps the credit at 400% of the poverty line again, with 2.10% to 9.96% of income expected. The credit is also reconciled on full-year income at tax time, including wages earned before the job ended. The tool warns about neither.
- Fixed this round: the "COBRA is always cheaper" verdict looked only at $0 of care. It is now exact over both plans' cost curves and has a "COBRA cheaper below $X" verdict. The first premium date is the latest possible one, not the date counted from your own election.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not insurance or legal advice; verify its output before relying on it.
> **Best-effort hosting, no SLA.**
