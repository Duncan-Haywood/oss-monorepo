# Dental Associate Pay Calculator

A free browser tool for associate dentists comparing job offers: **enter two offers (percentage of production or
collections, daily guarantee, share of lab fees, sign-on, other pay) and the net production you expect, and see each
offer's yearly value, your effective percentage after lab fees and collections, the production where the guarantee
stops mattering, the production where the offers pay the same, and how each moves if production runs low or high.**
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/dental-associate-pay-calculator/

After using this, you can now **see that a "30%" offer pays a lot less than 30% of what you produce**, because the
percentage is applied to collections after lab fees; the tool shows the effective percentage and its dollar cost.

## Model

- Commission = pct x (net production, or x collection rate, minus lab share x lab rate x production).
- Cash pay = max(commission, daily guarantee x days). Yearly value = cash pay + other pay + sign-on / years staying.
- Crossover volumes are found on a fine grid and interpolated. No benchmark or market percentage is embedded.

Not modelled: benefits, CE, malpractice, restrictive covenants, ownership buy-in, hygiene splits, taxes,
clawback of guarantee or sign-on, and collection lag.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of dental practices, DSOs, recruiters and software vendors; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`comparison_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
