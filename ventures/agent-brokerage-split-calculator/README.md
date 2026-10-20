# Real Estate Brokerage Split Calculator

A free browser tool for real estate agents choosing a brokerage: **enter your average sale, your commission and
how many deals you close, then up to three brokerages, and see what you net after each split, cap and fee, the
deal count where one plan overtakes another, and the split you would need to ask for to match the best one.**
Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/agent-brokerage-split-calculator/

After using this, you can now **tell whether a capped or flat-fee brokerage beats a traditional split at your
volume**, which used to mean rebuilding each brokerage's terms in a spreadsheet.

## Model

- Deal commission = price x commission percent. A referral fee comes off first.
- The brokerage keeps (100 - your split) percent of what is left until it has been paid the yearly cap; after that
  you keep your post-cap percent. The deal that crosses the cap is split in two.
- Transaction fees apply to every deal (the post-cap fee once the cap is full). A franchise royalty is a percent of
  total commission under its own yearly cap. Monthly and yearly fees are subtracted once.
- Crossover = the deal count from which one plan nets at least as much as another at every higher count.
- Split to match = bisection for the split that lifts a plan's net to the best plan's.

Not modelled: tax, anniversary-date cap resets, tiered or team splits, revenue share, sign-up incentives.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

Independent of brokerages, franchises, MLSs and real estate associations.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`plans_compared`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
