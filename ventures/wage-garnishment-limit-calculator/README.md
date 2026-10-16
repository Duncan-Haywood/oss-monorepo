# Wage Garnishment Limit Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/wage-garnishment-limit-calculator/>

A free browser tool for workers with a garnished paycheck: **enter your pay stub and the kind of
garnishment, and see the most that federal law lets an order take**, how much of your pay is
protected, what you would keep from extra hours, and a draft request for payroll's calculation.
Nothing is uploaded.

After using this, you can now **tell whether the amount taken from your paycheck is within the federal
limit and ask payroll a specific question if it is not**, which used to mean working out disposable
earnings and the 25%-or-floor rule by hand from a statute.

## Model

Consumer Credit Protection Act, Title III (15 U.S.C. 1671-1677). Disposable earnings = gross pay minus
deductions required by law. Ordinary debt: the lesser of 25% of disposable earnings or the excess over
30 x the federal minimum wage per week. Defaulted federal student loan: 15% (with ordinary debt, 25%
together). Child support or alimony: 50% or 60%, plus 5 points for arrears over 12 weeks, and all
garnishments together stay within that. Support is processed first. The pay-period floor is 30, 60, 65
or 130 x the wage for weekly, two-week, twice-monthly and monthly pay.

Checks against the stub: amount withheld above the maximum, an order that asks for more than the limit,
pay at or below the floor. An "is extra pay worth it" panel shows what overtime leaves after the
garnishment. The "most in question" figure is not a refund estimate.

Not checked: state law (often stricter, sometimes no wage garnishment for ordinary debt; a confirmed
state percent can be typed in), federal tax levies, bankruptcy plans, court exemptions, the validity of
the order. Unverified against a real payroll worksheet.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace an attorney or a legal aid
office. **You are responsible for reviewing and verifying its output before relying on it**, and before
disputing a garnishment or stopping any payment ordered by a court. A flagged item is a question, not a
finding that an employer or creditor is wrong. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

Independent of any employer, creditor, court or government agency.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`garnishment_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
