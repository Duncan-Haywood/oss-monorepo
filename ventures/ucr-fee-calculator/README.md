# UCR Fee Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/ucr-fee-calculator/>

A free browser tool for owner-operators, brokers and small fleets: **list each registrant with its vehicle count and see the Unified
Carrier Registration fee bracket, the fee, how many more trucks fit before the fee jumps, and the cost per vehicle and per mile.**
Nothing is uploaded.

After using this, you can now **budget the UCR fee and see exactly where adding a truck costs more**, which used to be reading a
six-row table on ucr.gov and doing the arithmetic yourself.

## Use

1. Open `index.html`, one registrant per line (`name, vehicles, type`), click Calculate the fee.
2. Pure logic is in `calc.mjs` (`plan()`, `parseFees()`); tests: `node --test`.

Modelled: six vehicle-count brackets, lowest bracket for brokers, freight forwarders and leasing companies, an editable fee table
(defaults to the 2025 schedule; verify at ucr.gov). Not modelled: state processing fees, whether registration is required, penalties,
the filing. Not tax or legal advice. No warranty; see the page footer. MIT licensed (`LICENSE`).
