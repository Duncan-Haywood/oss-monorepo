# Junk Car Buyer Offer Calculator

A free browser tool for junk car and salvage buyers: **type the car's weight, what your crusher pays, what the converter and parts bring and what the tow, paperwork, storage and labour cost, and see the most you can offer.** It shows the profit at the seller's ask, the farthest one-way tow, the scrap price and the parts sell-through at which the ask stops working, and how the offer moves with scrap price, converter value, parts sell-through, tow miles and car weight. Nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/junk-car-buyer-offer-calculator/

After using this, you can **counter a seller with a number you can defend**, from your own costs instead of a rule of thumb.

## Model

- hulk = (curb weight - parts pulled) / 2000 x crusher price per ton;
- converter = what a recycler pays; parts = pulled parts x share that sells x (1 - fees);
- costs = tow (base + miles x rate) + paperwork + disposal + storage days x rate + parts labour + haul to the crusher;
- net = in - costs; max offer = net - target profit; profit at the ask = net - ask.

Each limit (scrap price, tow miles, parts sell-through) is solved from the model and the tests check that it reproduces the target profit.

Not modelled: licensing, title problems, price swings before the crusher weighs the car, taxes.

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

