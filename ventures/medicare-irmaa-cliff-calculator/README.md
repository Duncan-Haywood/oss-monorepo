# Medicare IRMAA Cliff Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/medicare-irmaa-cliff-calculator/>

A free browser calculator for the 2026 Medicare **IRMAA** (income-related monthly adjustment amount)
tiers on Part B and Part D. Nothing is uploaded.

After using this, you can now **see which IRMAA tier your income from two years ago puts you in, what
it costs, how many dollars you are from the next cliff (up and down), what one dollar over costs, and
how much of a Roth conversion, capital gain or IRA distribution fits under your current tier**, which
used to mean reading CMS tables and guessing the two-year lookback.

## Inputs
Filing status (single, married filing jointly, married filing separately lived with spouse), MAGI from
two years ago, people on Medicare, optionally a planned extra-income amount, other MAGI for that year
and a Part D plan premium. Also an SSA-44 life-changing-event checklist with editable draft text.

## Figures (2026, checked 2026-09-29)
Standard Part B premium $202.90; single thresholds $109k/$137k/$171k/$205k/$500k; joint $218k/$274k/
$342k/$410k/$750k; MFS-with-spouse $109k/$391k. Part B surcharges $81.20/$202.90/$324.60/$446.30/
$487.00; Part D $14.50/$37.50/$60.40/$83.30/$91.00. Confirmed against several published summaries of
the CMS figures; verify at medicare.gov and ssa.gov. At a threshold you stay in the lower tier; the
top tier starts at or above its threshold. Future-year thresholds are indexed and will move.

## Not covered
Medicare Advantage, Medigap, the Part D plan itself, the MAGI computation, what SSA has on file.
Information, not tax, medical, legal or financial advice.

## Run
Static ES modules, no build. `node --test` here; open `index.html` in a browser.
