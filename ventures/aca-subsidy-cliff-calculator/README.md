# ACA Subsidy Cliff Calculator

A free browser calculator for the 2026 ACA premium tax credit and its **400%-of-poverty cliff**.
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/aca-subsidy-cliff-calculator/

After using this, you can now **see whether your expected income is under the line where the whole
premium tax credit disappears, how much credit one dollar over it costs, and how much deduction
(HSA, solo 401(k), SEP) would bring you back under**, which used to mean reading IRS Form 8962
instructions and a poverty-guideline table.

## Inputs
Household size, region (48 states + DC, Alaska, Hawaii), expected MAGI, the benchmark
(second-lowest silver) premium per month, and optionally your chosen plan's premium and deductions
you could still make. The tool cannot look up your county's benchmark premium.

## Figures (2026 coverage, checked 2026-09-29)
IRS Rev. Proc. 2025-25 applicable percentages (2.10% below 133% of FPL up to 9.96% at 300-400%),
linearly interpolated inside each band; 2025 HHS poverty guidelines; no credit above 400% of FPL;
no cap on repaying excess advance credit from tax year 2026. These change every year.

## Not covered
Medicaid/CHIP, employer coverage affordability, immigration-status rules, who counts in the tax
household, MAGI computation, state subsidies, Form 8962 mechanics.

## Run
Static ES modules, no build. `node --test` here; open `index.html` in a browser.

## What you use today, and what this does differently

- **HealthCare.gov and your state exchange's estimator:** the way to get a real quote for your county, but you must go through the application flow, and it does not show how one extra dollar of income or a deduction moves you across the 400% line.
- **IRS Form 8962 and its instructions:** authoritative, and hard to turn into a what-if by hand.
- **A spreadsheet:** you must keep the applicable-percentage table and poverty guideline current yourself.
- **What this adds:** the cliff in dollars, the credit lost per dollar over it, and how much deduction (HSA, solo 401(k), SEP) would bring you back under. No account, no upload. It cannot look up your county's benchmark premium, so you enter it.
