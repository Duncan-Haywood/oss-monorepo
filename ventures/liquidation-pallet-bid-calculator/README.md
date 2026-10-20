# Liquidation Pallet Bid Calculator

A free browser tool for resellers who buy liquidation pallets and truckloads at auction and resell the contents:
**paste or upload the manifest and get the most you can bid.** It runs a seeded Monte Carlo simulation over recovery
rate, sell-through and damage, and reports the probability of a profit, expected net profit, the 10th, 50th and 90th
percentile outcomes, the maximum bid for a chance of loss you accept, the maximum bid for a target ROI and a target
profit, the recovery rate you need to break even, a sensitivity table on recovery, each line's contribution, and how
much of the manifest's value sits in the top five lines. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/liquidation-pallet-bid-calculator/

After using this, you can now **bid a number you can defend, know what recovery you are betting on, and see when one or
two lines are carrying the whole pallet**.

## Model

- Manifest: item, quantity, retail (unit or extended), optional condition and category, found by header name. Condition
  text is mapped to new, open box, used or salvage; unreadable conditions use the class you choose.
- Per line: retail value x recovery rate for its class x sellable share x sell-through x (1 - channel fee), less postage
  per unit sold. Unsold units are valued at zero.
- Simulation (default 4,000 trials, fixed seed so results repeat): a pallet-wide lognormal recovery factor, beta-distributed
  sell-through and damage, and an independent lognormal factor per line (the 400 largest lines one by one, a normal
  approximation for the rest).
- Cost: (bid x (1 + premium) + freight + handling x units) x (1 + capital rate x months / 12) + storage x months.
  Profit is net revenue minus cost, linear in the bid, so one simulation prices every bid.
- Max bid for P(loss) <= X uses the X-th percentile of simulated net revenue; ROI and profit limits use its mean.
  The recommended bid is the lowest of the three. Break-even recovery scales all four class rates until mean profit is zero.
- CSV exports prefix any text cell starting with `=`, `+`, `-`, `@`, tab or carriage return with a quote so a
  spreadsheet does not run it.

Not modelled: relisting price cuts, returns and chargebacks, residual value of unsold units, sales tax, wrong manifests,
competing bidders. Recovery defaults are placeholders, not market data. Unverified against outcomes of real pallets.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use. Results are estimates from assumptions you supply, not a guarantee.

Independent of liquidation platforms and marketplaces; none is named or ranked.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`, `file_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
