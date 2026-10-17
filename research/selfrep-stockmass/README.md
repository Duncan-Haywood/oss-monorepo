# selfrep-stockmass: does the best printer redesign change when imported bar stock counts as an import?

Follow-up to `selfrep-alusearch` (track 1, `PROJECTS.md`), taking its "change the closure metric to count imported stock so that heavier is not better" next step. Produced with AI assistance (Claude). Computed only; nothing was built or tested.

**Headline (stylised, preliminary).** Scored by the mass the shop must still import for one printer copy (vitamins plus raw stock), the best design within a redesign budget of 4.0 imports 5.85 kg, against 6.72 kg for the steel-rod baseline. `selfrep-alusearch`'s mass-closure pick (12 mm aluminium rod) imports 6.79 kg, slightly more than the baseline, so its closure gain did not reduce imports. Scored by import cost the 12 mm aluminium rod stays the choice.

**Builds on.** `selfrep-alusearch` (the 448-design space and rod penalties), `selfrep-alurod`, `selfrep-rodbeam`, `selfrep-redesign`, `selfrep-closure` (RepRap-class bill of materials from the RepRap wiki; Jones et al., *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). It builds on none of the labs in `prompt.md`.

## Method
- Same design space, penalties and budgets as `selfrep-alusearch`. Only the score changes.
- `import_mass = vitamin mass + (mass of makeable lines) / yield`; `import_cost = vitamin cost + f * (cost of makeable lines) / yield`. A makeable line still needs its bar, dowel, sheet or filament from outside, so its mass is an import. **Yield** (0.8 by default; 0.3 to 1.0 swept) and **f**, the stock price as a share of the BOM price of the part (0.3; 0.1 to 1.0 swept), are my assumptions. The shop's own scrap is not recycled (see `selfrep-recyclers`).
- Exhaustive search, minimising the score within the penalty budget. Penalties are `selfrep-alusearch`'s assumed ones.

## Reproduce
```bash
cd research/selfrep-stockmass
python3 -m unittest discover -s tests -v     # 6 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
python3 experiments/figure.py                # writes experiments/import_mass.svg
```

## Results (from `experiments/results.txt`)
- Baseline (steel rods): 4,935 g of vitamins plus 1,781 g of stock, 6,716 g imported.
- Import-mass minimiser, by budget 0.5 / 1 / 2 / 4: 6,185 g (8 mm aluminium) / 5,890 g / 5,865 g / 5,853 g (hardwood 8 mm from budget 1 up). The light dowel wins because the steel rods it replaces are heavy vitamins; the rod's large sag penalty is paid out of the budget.
- The mass-closure pick of `selfrep-alusearch` imports 6,671 / 6,666 / 6,802 / 6,790 g at those budgets: between 0.7% less and 1.3% more than the baseline, and 8% to 16% more than the minimiser. Maximising closure and minimising imports disagree.
- Import cost: the minimiser stays on the 12 mm aluminium rod at every budget and stock-cost fraction tried, and reaches 147.5 against 173.3 at budget 3 to 4 (the mass-closure pick costs 171.6 to 182.6 across budgets 0.5 to 4, about the baseline). I did not trace which BOM lines drive this.
- Sensitivity: the minimiser picks the 8 mm hardwood rod at every yield from 0.3 to 1.0 (budget 2 and 4). At yield 0.3 or 0.5 it makes no substitutions at all, because printing a part from stock that mostly ends up as waste costs more mass than buying the vitamin.

## Limitations
- Stylised. Yield, the stock price fraction and every penalty are assumed. Part masses and costs come from `selfrep-closure`'s assumed BOM, not from measured parts or price lists.
- The two scores disagree on the rod (hardwood on mass, aluminium on cost), so the result depends on which import the shop cares about; neither is validated.
- Hardwood 8 mm has the largest sag penalty (1.0). The conclusion depends on that assumed penalty and would change with a measured print-quality curve.
- Only the printer + router + laser shop and one rod diameter set are tried; no proposer other than exhaustive search.

## Next steps
Price stock from a dated supplier list per kilogram instead of a fraction of the part price; recycle scrap and prints into filament (`selfrep-recyclers`); replace the sag penalty with a vibration-based one (`selfrep-rodmodes`, `selfrep-alufreq`).

## Owner steps
- Weigh the stock cut and the waste for one real printed and one router-cut part, to replace the assumed yield.
- Get dated per-kilogram prices for aluminium bar, hardwood dowel and filament.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-alusearch`, `selfrep-alurod`, `selfrep-rodbeam`, `selfrep-redesign` and `selfrep-closure` source trees (relative paths). All raw stock, motors, electronics, threaded rods and the hot end are imported.
