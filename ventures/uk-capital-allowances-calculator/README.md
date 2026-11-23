# UK Capital Allowances Calculator

Free, private browser tool: enter this year's equipment spend (new, second-hand, special-rate items, cars) and your pool balances to see the Annual Investment Allowance, full expensing and writing-down allowance, the best order to spend the AIA, the tax saved and a five-year run-off.

**Live tool:** https://marisstella.app/uk-capital-allowances-calculator/

After using this, you know how much of your equipment spend to deduct and where to put the AIA, which used to need an accountant's computation.

Open `index.html`. Tests: `node --test 'ventures/uk-capital-allowances-calculator/**/*.test.mjs'`.

**No warranty.** Free and as-is; not tax advice. Rates are 2026/27 and must be verified on GOV.UK. See `VENTURE.yaml`.

## Rates and known gaps

Rates were first written from memory with an 18% main pool. The 2026-11-23 quality audit
(`portfolio/quality/audits/2026-11-23-uk-capital-allowances-calculator.json`) found GOV.UK's
Autumn Budget 2025 measure had cut it to **14%** from 1 April 2026 (companies) and 6 April 2026
(income tax), and added a **40% first-year allowance** on new, unused main-rate equipment (not
cars) from 1 January 2026, open to sole traders and partnerships. Both are now modelled, and
the balance left after any first-year allowance joins the pool only from the next period
(CAA 2001 s58(5)).

Not modelled yet:

- a company period that straddles 1 April 2026 (a time-apportioned hybrid 18%/14% rate);
- periods over 12 months (the tool caps at 12; a company's long period is split into two
  Corporation Tax periods, a sole trader's allowances scale up);
- the small pools limit scaled for a short period;
- the 40% allowance on assets bought to lease out, and the proposed 12% / 50% change for April 2027.
