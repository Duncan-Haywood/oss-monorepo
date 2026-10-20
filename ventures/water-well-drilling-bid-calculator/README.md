# Water Well Drilling Bid Calculator

A free browser tool for small water-well drillers: **type the depth and formation, drilling and rig costs, casing, seal, pump system, trench, the move and the chance of a dry hole, and get the bid that earns your margin.** It shows break-even, the effective price per foot, what one dry hole costs and how many good wells pay for it, and how the bid moves with depth and dry-hole chance. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/water-well-drilling-bid-calculator/

After using this, you can **bid from your own costs** instead of a flat per-foot rate that loses money on shallow wells and ignores the hole that comes up dry.

## Model

- Drilling = consumables per foot by formation (overburden, rock) + rig hours (feet / feet per hour by formation, plus setup) x rig rate.
- Direct cost = drilling + casing + grout + pitless adapter, pump and tank with install hours + trench and electric run + permit and water test + mobilization.
- Dry hole cost = drilling + casing + mobilization + permit + sealing, less the share your contract bills the customer.
- Total cost = direct x (1 + overhead) + chance of a dry hole x dry hole loss.
- Bid = total cost / (1 - target margin).

Not modelled: whether a site produces water, yield guarantees, local well rules and licensing, hydrofracturing, water treatment, sales tax.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
