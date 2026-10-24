# garment-costperwear: how much longer must a $2,850 coat last to beat a $56 replica on cost per wear?

**Question.** Designer coats are often defended as "cheaper per wear". With the cost model of `garment-teardown` (reported retail price against a modelled replica cost), how many times longer must the designer coat last than the replica before it wins on cost per wear, and how likely is that when lifetimes are uncertain? **Headline (modelled, all lifetimes, care costs and resale values assumed).** With no resale and equal care, the $2,850 trench must last about 46 times as many wears as the $56 replica (about 52 times for the $3,850 coat against its $68 replica). At a replica life of 60 wears that is roughly 2,700 wears; with lognormal lifetimes (log-sd 0.5) the designer coat needs a *median* life near 3,100 wears to win half the time, and wins only about 6% of the time at 1,000 median wears. Dry-cleaning-level care of $1 per wear against $0.10 for the replica pushes the needed median to about 73,000 wears. Stylised: this measures how demanding the claim is, not how long real coats last.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-costperwear/

**Why this question.** The track-6 chain had become many variants of the comfort and wardrobe models. This project asks a different question of the cost side: it uses only `garment-teardown`'s outputs and a durability layer, and its answer is a break-even, not another optimisation. It builds on none of the CU Boulder groups in `prompt.md`; it relates to the digital-twin theme only in that the cost model is a model of a physical system used for a decision.

**Builds on.** `garment-teardown` (reported prices of the Burberry Long Kensington Heritage Trench Coat, $2,850, and the Max Mara Madame 101801 Icon coat, US$3,850, read from search snippets on 2026-10-13 and not verified by page fetch there; the modelled mid-wage replica costs of $56 and $68). Its caveats apply in full. The cost-per-wear idea itself is common consumer-finance folklore; I cite no study of real garment lifetimes and make no claim about them.

## Method
- `src/garment_costperwear/model.py`: `cpw` = price x (1 - resale fraction) / wears + care cost per wear. `breakeven_ratio` solves for the designer-to-replica lifetime multiple at which the two are equal. `prob_designer_cheaper` draws independent lognormal lifetimes and counts how often the designer coat's cost per wear is lower. Replacement at the same price is implicit (long-horizon cost per wear equals one garment's).
- `experiments/run.py` takes the two prices and replica costs from `garment-teardown` and writes `experiments/results.txt` (deterministic, seeded; section C bisects on a 4,000-draw Monte Carlo, so its numbers carry a few percent of noise).
- Assumed inputs: replica life 60 wears (median), lognormal log-sd 0.5 for both, designer resale 0, 30% or 60% of price, care per wear $0.10 (replica, home wash) and $0.10 to $1 (designer, "specialist cleaning"). None is measured.

## Reproduce
```bash
pip install numpy pytest
cd research/garment-costperwear
python -m pytest -q tests                      # 7 tests
PYTHONPATH=src python experiments/run.py       # writes experiments/results.txt (seconds)
python experiments/figure.py                   # writes experiments/prob_vs_lifetime.svg
```

## Results (from `experiments/results.txt`)
| | break-even multiple, no resale, equal care | with 30% resale | designer care $0.50/wear |
|---|---|---|---|
| trench ($2,850 vs $56) | 45.6x | 31.9x | 87.8x |
| coat ($3,850 vs $68) | 52.0x | 36.4x | 87.3x |

(Replica life 60 wears, replica care $0.10; at designer care $2 per wear no lifetime wins, since care alone exceeds the replica's cost per wear.)

- P(trench cheaper per wear) at designer median lifetimes of 300 / 1,000 / 3,000 / 10,000 wears: 0.000 / 0.058 / 0.493 / 0.955. The coat: 0.000 / 0.044 / 0.431 / 0.940.
- Median designer lifetime needed for a coin flip (trench): about 3,100 wears with no resale; 2,200 at 30% resale; 1,250 at 60% resale. With designer care at $1 per wear these become about 73,000 / 51,000 / 29,000.
- If the replica lasts only 15 wears the trench wins 65% of draws at 1,000 median wears; at 30 wears, 28%; at 120 wears, 0.5%.
- Reading: the claim is not impossible but needs a long life (a daily-worn coat for roughly eight years at 365 wears a year is about 3,000 wears for scale only) or a cheap replica that wears out fast. Care cost is the lever that most strengthens the replica's case.

## Limitations
- Every lifetime, resale fraction and care cost is an assumption; no data on real garment lifetimes was used. The lognormal shape and equal log-sd are convenient choices.
- Price is a retail figure from two snippets, one with duties included; the replica costs are `garment-teardown` model outputs, not quotes or a build.
- Ignores fit, appearance, utility value, repairs, alterations, discounting, and any reason to own a designer piece other than cost per wear. No claim about any brand's quality or about real durability.
- Replacement at the same price forever; a person who stops needing a coat is not modelled.

## Next steps
Source real lifetime data (for example wear-count surveys or wash-cycle test standards) with dates and replace the assumed lifetimes; add repair and alteration as a cost that extends life; add a resale curve from public resale listings; add a utility term so that cost per wear is not the only objective.

## Owner steps
None required. A physical comparison would need an actual replica build (see `garment-teardown`) and a tracked wear log.

## Outside dependencies (vitamins)
Python, numpy; the sibling project `garment-teardown`. Lifetimes, care and resale values come from outside the model.

## References
- `research/garment-teardown/README.md`: reported prices, retailers and dates, and the cost model.
