# Pawn Loan Profit Calculator

A free browser tool for pawnbrokers: **type your monthly rate, how often loans are redeemed, how much you lend against resale value and what forfeited items actually sell for, and see what the average loan earns.** It shows profit per loan and per month, the annual return on the money you have out, the redemption rate you need to break even, the largest loan the item on your counter can carry for your target margin, and the smallest loan worth writing. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pawn-loan-profit-calculator/

After using this, you can **set a loan-to-value ceiling and a minimum ticket from your own numbers**, instead of a rule of thumb like "a third of retail".

## Model

Per loan of L against an item you expect to resell for R:

- Redeemed (chance r): interest and fees for the months the loan stays open, less ticket cost, storage and the cost of money.
- Forfeited (1 - r): interest and fees for the months paid, plus net sale proceeds minus L, less the same costs over the longer time the money is out.
- Net sale proceeds = R x sale price share x (1 - selling cost) x (1 - shrink).
- Profit is linear in the loan for a fixed item, so the largest loan for a target margin and the smallest loan that pays are solved exactly, not searched.

Not modelled: legality of the rate, licensing and holding periods, item authenticity, taxes, seasonality in redemption, compounding.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`analysis_run`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
