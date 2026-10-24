# Travel Nurse Contract Comparison Calculator

A free browser tool for travel nurses and locum clinicians: **enter up to three contract offers and
see what each one actually keeps** after tax, health premium, housing and travel, averaged over the
unpaid weeks between assignments, plus what happens if the hospital cancels shifts and the taxable
hourly rate a weaker offer would need to match the best one. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/travel-nurse-contract-comparison-calculator/

After using this, you can now **tell whether the offer with the biggest weekly number is really the one
that pays the most**, and what to ask the recruiter to put in writing (hours guarantee, stipend
proration), which a recruiter's text message does not show.

## Model

- Taxable pay = (rate x guaranteed hours + rate x overtime multiplier x overtime hours) x share of
  shifts actually paid. A written hours guarantee makes cancelled shifts cost nothing; stipends are
  cut in proportion only if the visitor says the agency prorates them and hours are not guaranteed.
- Tax = a single combined federal-plus-state rate the visitor types, plus 7.65% Social Security and
  Medicare, on taxable pay and the bonus. Housing, meals and travel reimbursement are untaxed if the
  visitor says they keep a tax home; otherwise they are taxed like wages.
- Take-home = gross - tax - weekly health premium and housing cost - one-time travel cost, divided by
  contract weeks plus unpaid gap weeks, then multiplied by 52 for a yearly pace.
- The taxable rate needed to match the best offer is exact, because take-home is linear in the rate.
- Optional per-diem rates flag a stipend above 7 x the daily rate; the tool ships no rate table.

Not modelled: tax brackets, state residency, the real per-diem table by city and date, retirement
matches, licence and compact fees, agency deductions, benefits beyond the premium, duplicate-expense
rules and stipend audit risk. Unverified against a real payroll stub.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a tax professional, your
agency or your employer. Results are illustrative estimates that depend on the values you enter.
**You are responsible for reviewing and verifying its output before relying on it**, and before
signing a contract. To the maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

Independent of any staffing agency, hospital or government agency.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`contracts_compared`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do
Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken,
moved, or taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
