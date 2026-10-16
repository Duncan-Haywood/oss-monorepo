# Scrap Gold Buy Price Calculator

A free browser tool: **type the karat and weight of each piece of scrap gold, today's gold price and your refiner's terms, and see the highest offer that still pays** — after assay loss, the refiner's payout share and fee, shipping, your overhead, the cost of money while you wait, and a fall in the gold price. It also shows an offer ladder and the profit at several gold price moves, with an estimate of the chance of a loss. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/scrap-gold-buy-price-calculator/

After using this, you can **quote sellers a number you know leaves your margin**, which used to mean a rule of thumb like "80% of melt".

## Model

- Fine gold = weight x karat/24. Melt value = fine gold at the gold price per troy ounce (31.1034768 g).
- The refiner recovers fine gold less the assay loss, pays a percentage of it, and charges a fee; shipping and insurance are added.
- Cost of waiting = (paid + overhead) x cost of money x days/365.
- Maximum offer for a target margin = (refiner net - overhead x (1 + carry)) / (1 + carry + target).
- Unhedged, the refiner payout moves one-for-one with the gold price between buying and settlement; the loss chance uses a normal spread from the typical yearly swing and the days to settle.

Not modelled: authenticity, licensing and ID rules, taxes, refiner rate sheets that vary by lot size, jumps and trends in the gold price.

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
