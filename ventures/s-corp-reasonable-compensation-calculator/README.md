# S-Corp Reasonable Compensation Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/s-corp-reasonable-compensation-calculator/>

A free browser calculator for single-shareholder S-corp owners: enter your
planned or current W-2 salary, your business's compensation pool, and a
comparable full-time wage for your role, and see whether your salary is
defensible against the actual test the IRS and courts apply — plus the
FICA-tax cost of closing any gap.

Open `index.html` in a browser. The calculation is local and works without
an account, network request, or API key.

After using this, you can now see whether your planned S-corp salary is
defensible against the IRS's own comparable-wage test, and how much closing
the gap would cost in FICA tax, which used to mean paying $200-900 for a
third-party reasonable-compensation report or guessing at a mythical "60/40
rule" that was never an IRS rule.

## Why this exists

A shareholder of an S-corp who also performs services for the business has
to be paid reasonable compensation as W-2 wages before any profit is
distributed to them (IRC 1366, Rev. Rul. 74-44). Get the split wrong and the
IRS can recharacterize distributions as wages — the leading case,
*Watson v. Commissioner*, 668 F.3d 1008 (8th Cir. 2012), recharacterized
$67,044 of each year's distributions to wages against a $24,000 salary paid
next to roughly $200,000–274,000 of annual profit. There is no IRS-published
safe-harbor percentage; the "60/40 rule" seen on forums is not an IRS rule.
The test actually applied is comparable-wage: what an unrelated employer
would pay someone else to do the same job, for the same hours.

This tool takes that comparable-wage figure as an input you supply — from
BLS OEWS wage data, a trade salary survey, or your own judgment — and:

- Compares your planned salary against that figure, scaled to your hours.
- Reports the combined FICA-tax cost at your planned salary, and the extra
  cost of raising it to your comparable-wage figure, using the 2026 Social
  Security wage base ($184,500).
- Renders the nine factors courts actually weigh (Rev. Rul. 74-44's
  progeny, applied in Watson and later cases) as a printable documentation
  checklist — not scored or summed into a number, because summing a legal
  multi-factor test into one digit overstates what arithmetic can settle.

See the [explainer on why the IRS tests your salary](why-the-irs-tests-your-s-corp-salary.html)
for the Watson case and the safe-harbor myth, or the
[comparison with a paid RCReports-style report](vs-rcreports-and-a-paid-valuation-report.html)
for when a formal, licensed-data report is worth paying for instead.

## What this does not cover

- It is not a determination that your salary is or is not reasonable, and
  it does not access any wage-survey database — the comparable-wage figure
  is one you type in yourself, and the tool does not verify it.
- It does not know your other income, deductions, or state tax picture, and
  assumes the S-corp salary is your only wage income for the year when
  computing the Additional Medicare Tax threshold.
- It does not model the QBI deduction's interaction with wages vs.
  distributions — see the portfolio's separate
  [QBI deduction calculator](../qbi-deduction-calculator/) for that question.
- It does not file anything, register you anywhere, or calculate what you
  owe. A defensible salary figure is a starting point for your own
  preparer's work, not the end of it.

## No warranty

This tool is free and as-is. It is not legal, tax, or financial advice and
does not replace a qualified CPA or tax attorney. You are responsible for
reviewing and verifying its output before relying on it. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.
