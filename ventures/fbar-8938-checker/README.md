# FBAR and Form 8938 Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/fbar-8938-checker/>

A free browser tool: **list your foreign accounts with their highest and year-end balances and see whether the
FBAR (FinCEN 114) and the Form 8938 are required, and why.** Nothing is uploaded.

After using this, you can **know which of the two filings you owe before the April 15 / October 15 deadline**,
instead of reading two sets of instructions that use different thresholds and different tests.

## Model

- FBAR: required when the sum of each foreign financial account's highest value in the year, converted to USD,
  exceeds $10,000. Signature-authority-only accounts count; assets held outside an account (direct foreign stock,
  entity interests) do not.
- Form 8938: required when specified foreign financial assets exceed the year-end or any-time threshold for
  your filing status and residence ($50k/$75k single in the US, doubled for joint, $200k/$300k single abroad,
  $400k/$600k joint abroad). The any-time test sums individual peaks, a ceiling that can overstate the true
  combined peak, and the page says when only that test is crossed.
- Exchange rates are typed by you: the FBAR requires the Treasury year-end rate.

Not modelled: whether you are a US person, foreign entities and trusts, other international forms (8621, 3520,
5471, 8865), penalty amounts and relief procedures.

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
