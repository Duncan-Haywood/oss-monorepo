# garment-teardown: where does a designer coat's price go, and what does a $20 to $50 replica keep?

First milestone of the engineered-clothing track (`PROJECTS.md`, track 6). A bottom-up cost model for a lined woven coat (fabric from pattern area and marker efficiency, lining, trims, sewing minutes times wage, overhead, then brand and retail multipliers), applied to two designer coats with reported retail prices, plus a replica built from cheap cloth and a simpler construction. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-teardown/

**Builds on.** Standard garment-costing practice: labour cost = standard allowed minutes x wage per minute / line efficiency (as described in industry teaching material such as <https://onlineclothingstudy.com/?p=10723>, which I have not verified as an authority). A factory case study reports a blazer standard minute value near 76 minutes (<https://doi.org/10.2478/aut-2019-0045>; I saw only a search-result summary, not the paper, so I use it only as a plausibility check on my assumed 85 to 110 minutes). The Clean Clothes Campaign's living-wage material (<https://cleanclothes.org/faq/pay-living-wages>) is the track's pointer for where a garment's price goes; **this project does not use its figures**. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- `src/garment_teardown/model.py`: `Garment` (piece area, marker efficiency, cloth and lining prices, trims, sewing and cutting minutes, overhead rate, brand and retail multipliers) and `cost_breakdown`. Factory cost ("FOB") = materials + trims + labour + overhead and profit. Wholesale = FOB x brand multiplier; retail = wholesale x retail multiplier.
- Three wage scenarios ($18, $6, $1.5 per hour, round numbers chosen to span a range, not statistics of any country) and line efficiencies 0.60 / 0.55 / 0.50.
- `monte_carlo`: every continuous input varied uniformly by +-25%, 5000 draws, seeded.
- `replica`: cheaper cloth ($7/m^2 shell, $3/m^2 lining), $8 trims, 60% of the sewing minutes, no overhead or markups.
- Two garments, with **reported** prices: Burberry Long Kensington Heritage Trench Coat, $2,850 at us.burberry.com; Max Mara Madame 101801 Icon coat, US$3,850 on Net-a-Porter's Singapore site (duties included; other regional sites showed roughly $3,200 to $4,400, so this price is the least certain). Both were read from search-engine result snippets on 2026-10-13. **I could not fetch the retailer pages from the run environment**, so the prices, lengths and fabric descriptions are unverified by page. Prices change and vary by region.

## Reproduce
```bash
pip install numpy pytest
cd research/garment-teardown
python -m pytest -q tests                      # 7 tests
PYTHONPATH=src python experiments/run.py       # writes experiments/results.txt (under a second)
```

## Results (from `experiments/results.txt`; all model inputs are assumptions)
| | reported price | model FOB, mid-wage (MC 5-95%) | price / FOB | FOB share of price |
|---|---|---|---|---|
| trench coat | $2,850 | $204 ($162 to $254) | 13.9x | 7% |
| wool-blend coat | $3,850 | $493 ($369 to $641) | 7.8x | 13% |

- Across the three wage scenarios the modelled factory cost is $186 to $248 (trench) and $469 to $551 (coat), so the factory cost is **under 15% of the reported price in every scenario**. Fabric dominates: about half of the trench's FOB and nearly two thirds of the coat's. Labour is $6 to $55 (trench).
- **The assumed multiplier chain does not reproduce the prices.** With brand x retail multipliers of 2.2 x 2.2 (trench) and 2.4 x 2.3 (coat), the model prices the trench at about $900 to $1,200 and the coat at about $2,600 to $3,000, below the reported prices. The remaining gap (design, marketing, stores, duties, the brand's own margin, a possibly higher-grade cloth than I assumed) is not resolved by this model; it is a residual, not a finding about where the money goes. The multipliers are my assumptions, not published figures.
- One-at-a-time +25% sensitivity of trench FOB: cloth price and piece area +16% each, marker efficiency -15%, overhead +5%, trims +3%, wage +3%. In this model, cloth and marker efficiency matter far more than wage.
- **Replica.** Cost to make: trench $46 to $81 and coat $55 to $100 across the three wage scenarios; only the leanest case ($4/m^2 cloth, 40% of sewing minutes, low wage) reaches $29 and $34. So at these assumptions a $20 to $50 build is reachable only with very cheap cloth and low-wage or home labour; at the mid-wage scenario the replica costs $56 and $68.
- What the replica loses is not scored here: cloth hand, weight and drape, hidden construction (interlining, bound seams, hand finishing), fit grading, and durability. Fit is the subject of `garment-pattern-fit`.

## Limitations
- **Every cost input is assumed.** Piece areas are rough guesses from the garment type, not measured from a pattern; cloth prices, trims, standard minutes, overhead and multipliers are round numbers. The Monte Carlo spreads are consequences of my own +-25% choice, not confidence intervals for the real cost.
- Two garments, one price each, unverified by page fetch; one is from a regional site with duties included.
- Brand and retail multipliers are not separable from design, marketing and scale effects. Labour minutes ignore learning curves and volume.
- No claim is made about any brand's actual costs or practices; this is a generic model compared with a public price.
- Simulated (modelled) numbers only; nothing was built, bought or measured.

## Next steps
Take piece areas from real pattern geometry (FreeSewing, then `garment-pattern-fit`), source fabric prices with dates, calibrate the multiplier chain on garments with published cost disclosures, and add a nesting model (`garment-nesting`) to replace the fixed marker efficiency.

## Owner steps
Build costs at about $300, $1,000 and $3,000 are owner decisions and not modelled here. For a replica, a bill of materials at today's prices (cloth, lining, buttons, thread, buckle) has to be sourced with dates first; the $7/m^2 and $3/m^2 above are assumptions, not quotes. Do not copy logos, brand names, signature prints or trade dress; a replica is a similar cut, not a copy of a brand.

## Outside dependencies (vitamins)
Python, numpy. Real cloth, trims, labour and the retail prices themselves come from outside the model.
