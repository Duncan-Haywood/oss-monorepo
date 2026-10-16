# NIIT Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/niit-calculator/>

A free browser tool: **type your income and investment income and see whether the 3.8% net investment income
tax applies, how far over the threshold you are, what an extra gain costs, and whether splitting it across two
years saves tax.** Nothing is uploaded.

After using this, you can **decide whether to harvest a loss, make a pre-tax contribution or split a sale
across two tax years** before the year closes, instead of finding the Form 8960 line at filing time.

## Model

- NIIT = 3.8% x the lesser of net investment income and MAGI over the threshold (Form 8960 lines 12-17).
- Thresholds are statutory and not indexed: $200,000 single / head of household, $250,000 joint / qualifying
  surviving spouse, $125,000 married filing separately. The threshold is an editable input.
- Extra-gain what-if and two-year split are exact re-runs of the same formula; levers are $10,000 differences.

Not modelled: passive-activity classification, estates and trusts, the home-sale exclusion, the 0.9% additional
Medicare tax, state taxes. Estimated-tax penalties are covered by the sibling estimated-tax tool.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
