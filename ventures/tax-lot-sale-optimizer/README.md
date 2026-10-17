# Tax Lot Sale Optimizer

A free browser tool for investors who need cash from a taxable account: **paste your purchase lots, say how
much cash (or how many shares) you need, and see exactly which shares to sell from each lot to pay the least
tax**, next to what FIFO, LIFO and highest-cost-first would cost. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tax-lot-sale-optimizer/

After using this, you can **tell your broker which lots to sell (specific identification)** and know what
it saves, which used to mean working Schedule D netting by hand for every combination.

## Model

- Per lot: gain per share = price - cost; long-term when the sale is strictly after the first anniversary.
- Year tax: short-term and long-term totals (year-to-date amounts included) net by character, then against
  each other; a net gain is taxed at the surviving character's rate (ordinary + state + NIIT for short,
  long-term + state + NIIT for long); a net loss offsets ordinary income up to $3,000 and the rest is
  reported as carryforward (not valued).
- Tax of the sale = year tax with the sale minus year tax without it.
- Optimum: inside one holding-period pool, highest-cost-first gives the lowest gain, and tax never falls as
  a gain rises, so the only free choice is the short-term/long-term split of shares - searched exactly, and
  checked against brute force over every whole-share split in `calc.test.mjs`.
- Wait table: re-runs the optimum on each date a short-term lot turns long-term (same price assumed).
- Wash-sale warning when a loss lot is sold while shares bought in the prior 30 days stay held.

Not modelled: AMT, income-dependent brackets, state rules, collectibles/real-estate rates, mutual-fund
average cost, cross-account or spouse wash sales, price movement while waiting.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum
extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

Independent of brokers and tax authorities.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
