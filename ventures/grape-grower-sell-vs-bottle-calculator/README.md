# Grape Grower Sell vs Bottle Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/grape-grower-sell-vs-bottle-calculator/>

A free browser tool for vineyard owners: **type what a buyer pays per ton and what it costs you to make and sell wine, and see what the same acres net each way.** It shows the yearly net of selling the fruit and of bottling it, the sell-through, direct bottle price, grape price and acreage at which the two tie, and how the answer moves with sell-through, direct sales, grape price and yield. Nothing is uploaded.

After using this, you can **decide whether to sign the fruit contract or keep the crop**, from your own numbers instead of from the price of a bottle on a shelf.

## Model

Both paths pay the same to grow and pick the fruit. The wine path then:

- bottles acres x tons per acre x (1 - process loss) x cases per ton;
- sells that times sell-through, at a blended net price (direct sales net of their cost, wholesale as received); unsold stock counts as zero;
- costs winemaking, dry goods and labour on everything bottled, the cost of money on production over the ageing months, excise and marketing on what sells, and fixed winery overhead.

Every break-even is solved from the model, not searched, and the tests check each one reproduces a tie.

Not modelled: licensing, label approval, equipment capital, vintage and price swings, taxes, stock that sells in a later year.

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

