# Online Business Valuation Calculator

A free browser tool for owners selling (and buyers pricing) a small SaaS, e-commerce, content or agency
business: **enter trailing-12-month revenue and SDE and get a price range, the net after selling fees, the
buyer's payback, and a ranked list of what is costing you multiple.** Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/online-business-valuation-calculator/

After using this, you can now **set a defensible asking range and know which fix (owner hours, customer
concentration, churn) adds the most sale price**, which used to mean a broker call or a guess.

## Model

- Base multiples (rules of thumb): SaaS 3.3x SDE / 2.4x ARR, e-commerce 2.6x, content 3.0x, agency 2.0x.
- Adjustments to the multiple: growth, monthly churn (SaaS), largest-source concentration, owner hours, age.
  Floor 0.8x. SaaS with SDE and MRR averages the two methods.
- Range: midpoint +/-22% (SaaS, e-commerce) or +/-25% (content, agency). Net = midpoint less the fee entered.
- Levers: penalised factors only, ranked by dollar value of removing the penalty.

Not modelled: inventory, debt, asset-only sales, earn-outs, tax on sale, marketplace demand. The multiples are
unaudited heuristics, not calibrated against sales data.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it is not a professional appraisal.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum
extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

Independent of business marketplaces, brokers and valuation firms; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`valuation_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
