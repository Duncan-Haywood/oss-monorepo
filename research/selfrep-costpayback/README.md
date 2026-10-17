# selfrep-costpayback: does pricing the imports, instead of weighing them, change when a shop's recycling machines repay themselves?

Follow-up to `selfrep-recyclers` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking the first item of that project's next steps (weight payback by cost). Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-costpayback/

**Builds on.** `research/selfrep-recyclers` (machine part lists, per-copy savings; imported by relative path), `research/selfrep-materials` and `research/selfrep-closure` (RepRap Prusa Mendel part list; Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). The question follows von Neumann (1966) and Freitas and Merkle (2004). This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- Same machines, part lists, shops and per-copy kilogram savings as `selfrep-recyclers`. Nothing about the mass model is changed.
- Every import is priced. **All prices are assumed round-number placeholders**, in the arbitrary currency units of `selfrep_closure.bom` (roughly dollars); none is a quote or a sourced figure. Filament 20/kg, MDF sheet 3/kg, aluminium 6/kg; each vitamin line of the recyclers has an assumed unit price (`src/selfrep_costpayback/cost.py`). Where the shop lacks the process to make a part, it buys the finished part at an assumed unit price.
- **Cost payback** = cost to build the machines (vitamins plus feedstock for the parts the shop makes) / currency avoided per printer copy (avoided virgin filament and aluminium at their prices).
- Break-even: the filament price at which the plastic pair repays in N copies, found by bisection.
- Sensitivity: filament, sheet and aluminium prices and a common vitamin-price scale, each an independent log-uniform factor in [0.5, 2] (2000 draws, seed 0).

## Reproduce
```bash
cd research/selfrep-costpayback
python3 -m unittest discover -s tests -v     # 8 tests, standard library only (needs ../selfrep-closure, ../selfrep-materials, ../selfrep-recyclers)
python3 experiments/run.py                   # writes experiments/results.txt
```

## Results (from `experiments/results.txt`; all prices and part lists assumed)
- **Pricing barely moves the plastic pair**: 111 copies by cost against 99 by mass for the printer alone, and 98 against 116 for the shop with router and laser. Median over price draws is 99 copies (5–95%: 45 to 235). The plastic recyclers do not pay back on the shop's own scrap in any sensible time, as in `selfrep-recyclers`.
- **The furnace gets worse**: 203 copies by cost against 94 by mass (median 202, 5–95%: 80 to 510), because aluminium is cheap per kilogram and the furnace is all vitamins (84 units of cost for 0.41 units saved per copy).
- **Retired plastic still decides it**: with one machine's worth of printed plastic retired per copy, payback is 26 copies at `phi`=0.3 and 10 at `phi`=0.8 (median 27 over price draws, 12 to 62).
- **Break-even**: with `eol`=0 the plastic pair repays in 50 copies only if filament costs about 42 per kg (twice the assumed 20), and in 20 copies at about 138 per kg.
- Combined message: the mass-based conclusion survives pricing. The recyclers are a second-order saving for a small shop; the result depends on prices only through the saving per copy, which is small whatever the price.

## Limitations
- **Stylised, assumed.** Every price, part list and mass is a placeholder; the sensitivity draws scale prices, not the list of parts.
- Machine count is one set per shop; labour, energy cost, machine time and the cost of money are ignored. Payback in hours was not computed, as recycling saves no shop hours in this model.
- Prices of finished parts bought by the printer-only shop (plates, printed gears) are guesses.
- Retired-machine plastic (`eol`) remains a scenario knob; failure and wear of recycler parts are not modelled.

## Next steps
Make `eol` endogenous by retiring machines in the `selfrep-growth` fleet model; fold the recyclers into the closure computation; replace assumed prices with dated quotes (owner step).

## Owner steps
- Replace the assumed prices with dated quotes for the motors, steel parts, heaters and controllers, and for filament, sheet and aluminium, each with a source and date.
- Replace the assumed machine part lists with a real open design (see `selfrep-recyclers`).

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-closure`, `selfrep-materials` and `selfrep-recyclers` source trees (relative paths). Physically the model assumes imported motors, electronics, bearings, hardened steel, ceramics and steel shells, as in `selfrep-recyclers`.
