# Wholesale Real Estate Offer Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/wholesale-real-estate-offer-calculator/>

A free browser tool for real estate wholesalers: **enter the after-repair value (or paste sold comps), repairs and your end buyer's terms, and get the most you can offer the seller, whether their asking price works, and what your fee nets by assignment versus double close.**

After using this, you can **put a number on a seller's offer in a minute and know your fee survives the closing route you pick**, which used to be a 70%-rule scribble and a spreadsheet.

## Model

- Buyer ceiling = the lower of (a) ARV x rule % - repairs and (b) ARV x (1 - selling costs %) - repairs - holding - ARV x required profit %.
- Max offer to the seller = buyer ceiling - target fee. Walk-away price uses the minimum fee.
- Asking price: fee left = buyer ceiling - asking, with a verdict against target and minimum.
- Assignment nets fee - marketing - your closing costs. Double close also pays transactional funding (% of purchase price), extra closing fees and transfer tax on both deeds; the break-even fee is where it nets zero.
- ARV from comps = median price per sq ft x subject sq ft (median price if no sizes). Used only when the ARV box is blank.
- Sensitivity: ARV -10% to +10%.

Not modelled: licensing and disclosure rules, assignability of the contract, title and lien problems, buyer financing terms beyond the percentages above, taxes on the fee.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, accounting, compliance, investment or financial advice and does not replace a qualified professional.
**You are responsible for reviewing and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`offer_calculated`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do Not
Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or
taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
