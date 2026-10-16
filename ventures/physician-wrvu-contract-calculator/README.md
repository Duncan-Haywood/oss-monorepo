# Physician wRVU Contract Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/physician-wrvu-contract-calculator/>

A free browser tool for physicians comparing job offers: **enter two offers (base salary, wRVU incentive
threshold, dollars per wRVU, sign-on, other pay) and the wRVUs you expect to produce, and see each offer's
yearly value, your effective cash pay per wRVU, the volume where the offers pay the same, and how each moves
if volume runs 30% low or high.** Nothing is uploaded.

After using this, you can now **see that a contract paying "$52 per wRVU" pays far less than $52 on the work
you actually do**, because the incentive starts above a threshold; the tool shows the effective rate.

## Model

- Cash pay = base + rate x max(0, wRVUs - threshold). Yearly value = cash pay + other pay + sign-on / years staying.
- Base earn-out = base / rate wRVUs; a threshold above it is a stretch of unpaid extra work.
- Crossover volumes are found on a fine grid and interpolated. No benchmark or market-rate data is embedded.

Not modelled: benefits, malpractice tail, partnership, quality bonuses, FTE-adjusted thresholds, taxes,
clawbacks, restrictive covenants.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of hospitals, health systems, recruiters and compensation survey publishers; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`comparison_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
