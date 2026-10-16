# Good Faith Estimate Generator

A free browser tool for small practices and clinics that see self-pay and uninsured
patients. List the expected services with codes, diagnoses and charges; it builds a
printable Good Faith Estimate, totals it per billing provider, works out when it has
to reach the patient, and lists anything missing before it goes out. Two extras: a
check of a bill against an estimate (the $400 dispute line and the 120-day window),
and a review of your past estimates that shows which codes you under-quote.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/good-faith-estimate-generator/

After using this, you can **send a complete estimate on time without rebuilding the
form each visit**, and see where your estimates drift from what you bill.

## Try it

Open [`index.html`](index.html) and click **Load an example**.

## The model

[`calc.mjs`](calc.mjs), pure functions, no dependencies.

- **Deadline.** Scheduled 10 or more business days ahead: 3 business days from
  scheduling. 3 to 9: 1 business day. Under 3: not triggered. Patient request with
  no scheduling: 3 business days from the request. Lead time counts the business
  days strictly between scheduling and service (the conservative reading), and
  federal holidays can be treated as non-business days (toggle).
- **Totals** per billing provider, because the dispute test compares each biller
  with its own estimate.
- **Completeness check** of required fields and code *shapes* (CPT/HCPCS, ICD-10,
  NPI). A well-formed code can still be the wrong code.
- **Dispute check.** Billed minus estimated, per provider, at least $400; 120
  calendar days from the bill.
- **History review.** Rows of `case, code, estimate, actual` give the share of
  cases over the line and per-code drift.

## What this does not cover

Who the rule applies to, correct coding and charges, the exact notice wording
(compare with the CMS template), co-provider estimate rules, state law. Planning
and drafting aid, not advice.

## License and privacy

MIT. No warranty; not legal, tax, accounting or financial advice. Nothing leaves
your browser; nothing is saved; usage counts are local, opt-out-able and honour
Do Not Track.

## Run the tests

```
node --test
```
