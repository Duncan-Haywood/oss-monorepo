# Severance Package Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/severance-package-calculator/>

A free browser tool: **type a severance offer and your situation and see whether the weeks are in the usual
range, what you take home as a lump sum now, a lump sum in January or salary continuation, the COBRA gap, the
unemployment benefits at risk, your runway, and a list of what to ask for.** Nothing is uploaded.

After using this, you can **counter a severance offer with numbers and a short list of specific asks** before the
signing deadline, instead of deciding in one meeting from a number on a page.

## Model

- Benchmark: about 1 to 3 weeks of base pay per year of service, middle at an editable rate (default 2). A rule of
  thumb, not an entitlement.
- Tax: employee Social Security up to the wage base and Medicare on every dollar; federal income tax at the
  marginal rate you type; the flat 22% supplemental withholding (37% above $1M) is shown beside it so the filing-time
  gap is visible. State tax is a flat rate you type.
- Payout shapes: lump sum this year (stacked on year-to-date wages), lump sum in January (next year's rate, fresh
  Social Security base), salary continuation split at the year end.
- Health: COBRA premium minus what the employer paid, times the months you ask to have covered.
- Unemployment: the weeks covered by severance, times the weekly benefit, as the amount some states would delay.

Not modelled: whether the release is enforceable, WARN Act pay, the additional 0.9% Medicare tax, 401(k) and equity
plan terms, local taxes.

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
