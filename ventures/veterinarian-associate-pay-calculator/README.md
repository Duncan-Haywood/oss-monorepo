# Veterinarian Associate Pay Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/veterinarian-associate-pay-calculator/>

A free browser tool for veterinarians comparing associate offers: **enter two offers (salary, a percentage of
production with a guaranteed minimum, or a base plus a percentage above a threshold) and the production you
expect to generate, and see each offer's yearly value, the real percentage after excluded production, the
value per hour worked, the production where the offers pay the same, and how each moves if production runs
30% low or high.** Nothing is uploaded.

After using this, you can now **see that a "22% of production" offer pays 19.8% of what you bill once lab and
outside services are excluded, and whether a guaranteed base or a percentage wins at the production you will
really hit**, which used to take a spreadsheet and a guess.

## Model

- Adjusted production = production x (1 - excluded share).
- Salary = base. Greater-of = max(base, pct x adjusted). Base-plus = base + pct x max(0, adjusted - threshold).
- Yearly value = cash pay + other yearly value + sign-on / years staying. Hourly = value / (hours x weeks).
- Crossovers are found on a fine grid and interpolated. No benchmark or market-rate data is embedded.

Not modelled: benefits beyond the amount entered, malpractice tail, ownership tracks, taxes, clawbacks,
restrictive covenants.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of veterinary practices, hospital groups, recruiters and compensation survey publishers; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`comparison_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
