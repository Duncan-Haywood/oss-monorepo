# Physician wRVU Compensation Calculator

A free browser tool for employed physicians and advanced practice providers weighing an offer: **type the terms
from the contract and see annual pay under base-then-productivity, pure productivity and fixed salary, the
break-even wRVUs, effective dollars per wRVU, pay per hour worked, shortfall and clawback exposure, an 80% to 120%
sensitivity table, and a side-by-side comparison of two offers.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/physician-wrvu-compensation-calculator/

After using this, you can now **tell whether a wRVU offer beats a fixed salary at your expected volume, how many
wRVUs you need for productivity to win, and how much you could owe back if you fall short**, which used to take a
spreadsheet and a lawyer's hour.

## Model (illustrative)

- Base then productivity = base + conversion factor x max(0, wRVUs - threshold) - repay share x max(0, base - factor x wRVUs).
- Pure productivity = its own factor (defaults to the same) x wRVUs. Fixed salary = the figure you type (defaults to the base).
- Quality bonus = a percentage of clinical pay times the share you expect to earn.
- Call pay and CME are added as typed. Signing bonus, retention bonus and any tail coverage you pay are spread over
  the years you expect to stay; year-one cash is shown separately.
- Break-even wRVUs are solved exactly (the pay curves are piecewise linear). Comp per hour uses the hours you enter
  (default 40 x FTE) times weeks worked.
- Signing-bonus clawback is pro-rata or cliff over the period you enter.

**No benchmark is shipped.** Every rate is one you type from your contract or a survey you are licensed to use; the
tool contains no MGMA, AMGA or other market figure.

Not modelled: taxes, benefits and retirement match, contract-specific wRVU definitions, reconciliation timing,
non-compete enforceability, state law.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a lawyer who reviews physician
employment contracts. **You are responsible for reviewing and verifying its output before relying on it.** To the
maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`comp_estimated`, `offers_compared`, `example_loaded`)
are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken
offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
