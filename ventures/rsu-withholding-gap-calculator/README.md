# RSU Withholding Gap Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/rsu-withholding-gap-calculator/>

A free browser calculator for 2026 **RSU vests**. Employers withhold federal
income tax on a vest at a flat 22% (37% above $1,000,000); your real tax is set
by your bracket. Enter your salary and the vest and it returns the tax the vest
actually adds, the gap versus what was withheld, the Additional Medicare Tax,
an optional flat state rate, the underpayment-penalty safe harbor, and the
extra W-4 withholding per remaining paycheck that closes the gap. Entirely
client-side; nothing is uploaded.

## Rules applied (verified 2026-09-29)

2026 brackets and standard deductions (Rev. Proc. 2025-32, as used by
`roth-conversion-bracket-fill-calculator`); supplemental wage withholding
(Treas. Reg. 31.3402(g)-1); Additional Medicare Tax thresholds (Form 8959);
safe harbor of 90% of current or 100%/110% of prior-year tax (IRC 6654(d)).

## What this does not cover

Tax on selling the shares, AMT, credits, graduated state tax, the Social
Security wage base. Not tax advice.

## Run

Static ES modules, no build step: open `index.html`, or `node --test`.
MIT licensed; support is optional via GitHub Sponsors.
