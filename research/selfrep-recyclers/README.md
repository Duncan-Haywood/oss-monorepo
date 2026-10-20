# selfrep-recyclers: how many printer copies does it take for a self-replicating shop's recycling machines to repay their own imports?

Follow-up to `selfrep-materials` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking that project's first listed next step: give the recycling machines their own part lists. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-recyclers/

**Builds on.** `research/selfrep-materials` (per-copy savings from recycling, imported by relative path) and `research/selfrep-closure` (the RepRap Prusa Mendel part list and the shop definitions; Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>). The question follows von Neumann (1966) and Freitas and Merkle (2004). The machine part lists are written for this project; no published shredder, extruder or furnace design is reproduced. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- Three recycling machines (plastic shredder, filament extruder, aluminium crucible furnace), each a short list of parts with an **assumed** mass and an **assumed** judgement of which shop process can make it (`src/selfrep_recyclers/machines.py`). Motors, electronics, bearings, hardened steel, ceramics and the furnace shell are vitamins; flat plates and printed gears are made in the shop if it has a router/laser or printer.
- Imported mass to build a machine = its vitamins + feedstock for the parts the shop makes (plastic at 1/(1−s), sheet at 1/y, with the `selfrep-materials` defaults).
- Saving per printer copy = imports with recycling off minus on, from `selfrep_materials.balance`, split into plastic (needs shredder and extruder together) and aluminium (needs the furnace, so only in the casting shop).
- **Payback** = machine imports / saving per copy: the number of printer copies after which the recyclers have avoided as much imported mass as they cost. Mass is the only currency; machine count is one set per shop.
- Sensitivity: every machine part mass scaled by an independent log-uniform factor in [0.5, 2] (2000 draws, seed 0).

## Reproduce
```bash
cd research/selfrep-recyclers
python3 -m unittest discover -s tests -v     # 8 tests, standard library only (needs ../selfrep-closure and ../selfrep-materials)
python3 experiments/run.py                   # writes experiments/results.txt
```

## Results (from `experiments/results.txt`; all inputs assumed)
- **With the shop's own scrap only, the plastic recyclers do not pay back in any sensible time**: 99 copies for the printer alone, 116 with router and laser (the assumed machines need 9.6 and 11.4 kg of imports and save 0.098 kg per copy). Across the mass draws the router-and-laser shop needs 91 to 164 copies (5–95%, median 123). The furnace needs about 94 copies in the base case (67 to 144, median 100).
- **Retired plastic is what could justify them**: if each copy retires one machine's worth of printed plastic, payback falls to 31 copies at the recycled-share cap `phi`=0.3 and 12 at `phi`=0.8 (router-and-laser shop; 24 to 44 over mass draws at `phi`=0.3). As in `selfrep-materials`, `phi` (recycled-plastic quality) decides the result and is the least certain input.
- **The recyclers add vitamins faster than they save them**: building the plastic pair adds 5.0 kg of vitamins (router-and-laser shop) and 9.0 kg for the printer alone, against a printer copy's own 4.9 to 5.3 kg. The furnace is all vitamins (6.5 kg: crucible, element, insulation, steel shell).
- Since recycling also saves little in `selfrep-materials`, the combined message is: for a small shop, recycling is a second-order import saving and an early-stage distraction from closing the main vitamin gap.

## Limitations
- **Stylised, assumed.** Part lists and masses are placeholders for plausible small machines, not designs or measurements; the sensitivity draws only scale masses, not the list of parts.
- **Mass is the only currency.** Cost, time, energy, labour and the value of cheap made parts (MDF) against costly vitamins (motors) are ignored, so a kilogram of MDF counts as much as a kilogram of motor. A cost-weighted payback could differ a lot.
- Retired-machine plastic (`eol`) is a scenario knob, not a model of fleet retirement. Machine failure, maintenance and replacement of the recyclers' wearing parts (cutters, screw) are not modelled.
- The recyclers are not folded into the closure fractions of `selfrep-closure`; the payback is computed beside it.
- Saving per copy is the `selfrep-materials` model, with all its assumptions (scrap share, yield, melt loss).

## Next steps
Weight payback by cost and by hours instead of mass; add retired machines to the `selfrep-growth` fleet model so `eol` is endogenous; fold the recyclers into the closure computation; replace `phi` with measured strength of recycled filament.

## Owner steps
- Replace the assumed machine part lists with a real open design (a bill of materials for an open-source shredder and filament extruder) and weigh the parts.
- Measure the scrap actually produced per print job and the quality of recycled filament.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-closure` and `selfrep-materials` source trees (relative paths). Physically the model assumes imported motors, electronics, bearings, hardened steel, ceramics and steel shells for the recyclers, on top of the vitamins listed in `selfrep-closure`.
