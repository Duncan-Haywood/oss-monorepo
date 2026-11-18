---
kind: analysis
date: 2026-11-14
subjects: [inherited-ira-10-year-withdrawal-planner, locum-tenens-vs-employed-calculator, roth-conversion-bracket-fill-calculator, rsu-withholding-gap-calculator]
---
# IRS table figures check (2026-11-14)

`python3 platform/ci/check_irs_table_figures.py [--json] [--strict]` compares every shipped venture
file's copies of the IRS tables against figures pinned from the IRS text:

- Rev. Proc. 2025-32 section 4 (2026): .01 Tables 1 to 5 (bracket upper bounds), .03 capital gains
  0%/15% breakpoints, .14 standard deduction.
- Rev. Proc. 2024-40 section 3 (2025): Tables 1 to 5 and the capital gains breakpoints. The 2025
  standard deduction is left out on purpose, because the 2025 law replaced the Rev. Proc. figures
  ($15,750 / $31,500 / $23,625 are correct for 2025).

Both PDFs were fetched from irs.gov through the proxy (it answered 200) and read with `pdftotext -layout`.

First run: four near misses, all the same bug. `hoh` 24% upper bound was 201775 (the single figure),
not 201750, in inherited-ira-10-year-withdrawal-planner, locum-tenens-vs-employed-calculator,
roth-conversion-bracket-fill-calculator and rsu-withholding-gap-calculator. Fixed, with an
`irs-table.test.mjs` in each that checks the tax at every bracket edge against the IRS Tax column.
Now 0 findings.

Next steps for a later run:

- Wire `--strict` into a workflow. That is a `.github/` edit, so it needs the owner's approval
  (CODEOWNERS); keep it in its own PR.
- Add tables only from the IRS text, with the date it was read: 2026 contribution limits
  (Notice 2025-67), HSA limits (Rev. Proc. 2025-19), the SS wage base (SSA). A table needs enough
  figures for the "more than half present" rule to tell it apart from its neighbours.
- When the 2027 Rev. Proc. comes out (about October 2026, so it may be out already), add its tables.
  The ventures that hold 2026 tables are the list of what to update: run the script with a
  complete-table count (see the post) to get it.
