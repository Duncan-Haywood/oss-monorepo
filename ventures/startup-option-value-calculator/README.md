# Startup Stock Option Value Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/startup-option-value-calculator/>

A free browser tool for anyone weighing a startup offer with stock options: **enter the grant, the
company's fully diluted share count, its liquidation preferences and how likely you think each kind of
exit is, and see what the options are worth after dilution, preferences, vesting, exercise cost and
tax, plus the exit price the company needs before they pay anything.** Nothing is uploaded.

After using this, you can now **see that 40,000 options can be worth $0 in most outcomes, what the
company must sell for before they pay anything, and whether the probability-weighted value covers the
salary you give up**.

## Model

- Stake = options / fully diluted shares x (1 - dilution per round) ^ rounds.
- Proceeds to common = exit value - liquidation preferences (never below zero).
- Per vested option: max(0, stake x proceeds - strike). One flat tax rate on the gain.
- Vesting: nothing before the cliff, then months / vesting period, capped at 100%.
- Expected value = sum of scenario value x the visitor's probability; the remainder is a wipe-out.
- Break-even exit solves the same formula backwards for a target after-tax value.

Not modelled: participating or multiple preferences, conversion, pool top-ups, tax at exercise, AMT,
state tax, early exercise / 83(b), acceleration, any estimate of a company's odds.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of any startup, investor, equity platform, recruiter or job board; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`value_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
