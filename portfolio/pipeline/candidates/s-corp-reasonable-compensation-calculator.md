# S-corp reasonable compensation calculator

Scored 2026-09-24. Composite 6.375 · floor 1 (ai_leverage). Deterministic
arithmetic against a curated reference-wage table and the IRS's own
three-approach framework — no model in the loop, and no salary figure ever
asserted as "the" number.

An S-corp owner-employee must pay themselves a "reasonable" W-2 salary
before taking the rest of the company's profit as a distribution, because
only the W-2 portion is subject to FICA/self-employment payroll tax. Set the
salary too low relative to the work actually performed and the IRS can
recharacterize distributions as wages, assessing back payroll tax, interest,
and a 20% accuracy-related penalty (or, in the rare fraud case, a 75%
penalty) — the exact fact pattern in the IRS's own long-standing
S-corporation compensation guidance and in every "reasonable compensation"
Tax Court case (*Watson v. Commissioner*, *Glass Blocks Unlimited v.
Commissioner*, and others). Set it too high and the owner overpays payroll
tax for no reason. There is real money on both sides of this number every
year the business exists, and — unlike most one-time tax situations this
portfolio has built calculators for — it recurs annually for as long as the
S-corp election stays in effect.

## Distribution evidence (the channel requirement)

This is not a hypothetical niche. WebSearch on 2026-09-24 found a live,
commercially validated market for exactly this calculator shape:

- **RCReports** (`rcreports.com`) sells "reasonable compensation" analysis
  reports to CPAs and tax preparers for **$100-400 per report**, who in turn
  charge their own clients **$400-1,200 per report** — a real, priced,
  recurring-demand service built entirely around answering this one number.
- **ReasonableCompCalc** (`reasonablecompcalc.com`) sells the same category
  of report starting at **$199**.
- At least five CPA/tax-advisory firms — `madsencpa.com`, `taxstra.com`,
  `sdocpa.com`, `slpwealth.com`, `evergreensmallbusiness.com` — each publish
  their own free "S-Corp Reasonable Salary Calculator" as a lead-generation
  tool on their marketing site, all competing for the identical search
  phrase ("s corp reasonable salary calculator" / "s corp reasonable
  compensation calculator"). Five-plus independent firms building the same
  free tool to capture the same search traffic is itself the evidence: an
  SEO/AI-discovery channel with demonstrated, multi-competitor demand for
  this exact query, the same "a competitor's own comparison-search traffic"
  evidence type `DIRECTION.md`'s North star point 2 names explicitly.
- This is the identical wedge this portfolio has already used successfully
  for `qbi-deduction-calculator` (also found via CPA-firm lead-gen
  calculators competing for "QBI deduction calculator" / "199A deduction
  calculator") — a **free, no-signup, entirely client-side** version of a
  category every existing competitor gates behind a contact form or a paid
  report. That gap, not a new mechanism, is the wedge here too.

`duplicate_check.py` (below) confirms no existing venture, screened-out row,
or pipeline candidate covers S-corp compensation, reasonable-compensation
methodology, or the wage/distribution split.

```
$ python3 portfolio/pipeline/duplicate_check.py "S-corp reasonable compensation calculator: estimate an IRS-defensible reasonable salary range for an S-corp owner-employee using the three IRS-cited approaches (cost/market/income) against BLS occupational wage data, so they can split salary vs. distribution without under-compensating into an IRS audit trigger"
 score  source                    label
  0.11  venture                   newsletter-sponsorship-rate-calculator
  0.11  venture                   podcast-sponsorship-rate-calculator
  0.09  venture                   brand-deal-rate-calculator
  ...
Nothing scored >= 0.45.
```

`screened-out.md` has no row for S-corp compensation, payroll-tax split, or
reasonable-salary methodology. `no-tax-on-tips-overtime-calculator` and
`qbi-deduction-calculator` are the nearest siblings by mechanism (a
deductions/withholding computation on already-earned income); this
candidate computes a *pre-payroll* salary/distribution split, a different
decision entirely and one the duplicate check scored at 0.05 against
`qbi-deduction-calculator`.

## Why this venture, not another calculator or checker

`pipeline/README.md`'s "archetype itself" section warns against a 142nd
`<trade>-bid-calculator` or a 39th `-check` scanner with no channel stronger
than "searchable, like the others." This is neither shape: it is a
deterministic tax-and-payroll calculator (same family as
`qbi-deduction-calculator`, `no-tax-on-tips-overtime-calculator`,
`depreciation-recapture-calculator`, `1099-vendor-tracker`), aimed at a
buyer profile this portfolio has not yet targeted — the S-corp owner making
an annual payroll decision, not a single-trade bid or a one-time filing
threshold — and backed by direct, named, priced competitor evidence rather
than general searchability.

## What the tool computes

Entirely client-side; nothing the user types leaves the browser.

1. **Cost approach.** The owner enters each distinct role/duty they perform
   (e.g. "60% general manager, 40% bookkeeper") from a reference table of
   ~25 common occupations with a disclosed, dated median-wage figure
   (sourced from BLS Occupational Employment and Wage Statistics, the same
   public dataset every competitor cites) and a source link. The tool sums
   each duty's wage weighted by the time fraction, scaled by hours worked
   relative to a 2,080-hour full-time year.
2. **Market approach.** What a similar business would pay an unrelated
   employee to fill the owner's primary role, from the same reference table,
   scaled the same way.
3. **Income approach (independent-investor test).** Net profit before owner
   compensation, minus a fair return on the shareholder's invested capital
   (a user-editable rate, defaulting to 10%) — the residual is what
   *Elliotts, Inc. v. Commissioner*-style reasoning treats as available for
   compensation without leaving an outside investor shortchanged.
4. **A range, never a single number.** The tool reports the low-to-high
   span across the three approaches (never averages them into one figure)
   and a **payroll-tax delta** — the FICA/SECA difference between the low
   and high ends of that range, using the current Social Security wage base
   and Medicare/Additional-Medicare-Tax rates — so the user can see exactly
   what each point of the range costs or saves in tax, the concrete
   "earn/keep more money" value `PRODUCT_PLAYBOOK.md` §1 asks for.

The reference wage table's date and BLS citation are stated on the page
itself, next to every figure that uses it, not only in a footer — the same
"state the limit where the number is" discipline
`no-tax-on-tips-overtime-calculator` and `1099-vendor-tracker` already use
for their own disclosed gaps.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic arithmetic against a static reference table and published IRS methodology; no model in the loop |
| Autonomous ops | 10 | Zero-dependency browser calculator, no server, no queue, no ops |
| Time to revenue | 6 | Donations only; no paid tier. The niche has *demonstrated* willingness to pay a third party ($100-1,200/report), which is evidence the problem is real, not evidence this free tool converts faster than any sibling calculator — scored in line with the other tax-calculator siblings, not above them |
| Gross margin | 10 | Entirely client-side; serving one more visitor costs a static file |
| Defensibility | 2 | The arithmetic and reference table are straightforward to reimplement; no data moat, same as every sibling calculator |
| Distribution | 8 | Five-plus independent competitors (CPA firms) and two paid commercial products ($199-1,200/report) already compete for this exact search phrase — the strongest, most directly priced distribution evidence this portfolio has gathered for a new candidate, ahead of the general "searchable, like the other 141" bar this section exists to raise |
| Liability containment | 6 | The tool produces a disclosed range from a stated methodology and a dated, sourced wage table — evidence and drafting, never "your salary should be exactly $X" — and never touches payroll, filing, or any account of the user's. Scored in line with `no-tax-on-tips-overtime-calculator` (6): the worst case is a suboptimal or under-documented salary choice the user's own CPA still has to sign off on, not a filing made on the user's behalf |
| Ethical robustness | 8 | Free, no signup, same output whether a user's true reasonable salary is high or low — no revenue model creates an incentive to bias the range in either direction, unlike the paid-report competitors whose engagement fee could reward a lower headline number. Gets strictly better for the user as it is used more (a documented, three-methodology range instead of an undocumented guess) |

Composite: (1+10+6+10+2+8+6+8)/8 = **6.375**. Floor: **1** (`ai_leverage`).

## Mitigation for the floor and near-floor dimensions

`ai_leverage` sits at the same deliberate floor every deterministic
calculator in this portfolio carries — the value is in getting the
arithmetic and the cited methodology right, not in a model doing judgment
work, so there is no accuracy claim that needs one. `defensibility` (2) is a
real, named weakness mitigated the way every sibling calculator mitigates
it: shipping the free, correct, no-lead-gen-wall version first is the moat
available at zero marginal cost.

The reference wage table is the one piece of this venture with an
expiration date: BLS OEWS wage data is republished annually. The table
carries an explicit "as of" date and source citation on the page, and a
kill-criterion below fires if it is not refreshed within a year — a stale
wage table silently degrading the market-approach figure would be exactly
the kind of undisclosed drift `PRODUCT_PLAYBOOK.md` §5c forbids for a
privacy claim and this candidate must not repeat for a data-freshness claim.

## Verdict

**Graduate as a venture** (`ventures/s-corp-reasonable-compensation-calculator`).
Both gates clear above the floor of 5 (`liability_containment` 6,
`ethical_robustness` 8). Kill criteria: no organic traffic or repeat use
after a fair run per `portfolio/usage/README.md`; the BLS reference table
goes more than one filing season without being refreshed and the page is
not updated to disclose the staleness; or real user/CPA feedback shows the
three-approach framing is being read as a determination rather than a range,
in which case the copy needs to be strengthened before anything else ships
on this venture.
