# COBRA vs Marketplace Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cobra-vs-marketplace-calculator/>

After using this, you can see whether keeping your old employer plan on COBRA or buying a marketplace plan
costs less over the months you need coverage, at five levels of medical care, and the dates you must act by —
which used to mean comparing two plan PDFs and an election notice by hand.

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

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not insurance or legal advice; verify its output before relying on it.
> **Best-effort hosting, no SLA.**
