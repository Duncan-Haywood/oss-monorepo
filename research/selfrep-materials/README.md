# selfrep-materials: how much does recycling cut the imported material of a self-replicating printer shop?

Fifth milestone of the self-replicating manufacturing track (`PROJECTS.md`, track 1). A stylised steady-state mass and energy balance for building one more RepRap Prusa Mendel, with and without recycling of plastic (shred and re-extrude) and aluminium (remelt offcuts). Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-materials/

**Builds on.** `research/selfrep-closure` in this repository: its part list, assumed part masses and its judgement of which process can make which part. That list is the RepRap wiki's Prusa Mendel (iteration 2) page (see that README for the exact revision and the licence note); the RepRap project is Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>. The mass-balance structure (feedstock, yield, scrap, recycle fraction) is generic and written for this project; no external model is reproduced. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- Shops and parts as in `selfrep-closure`: printer; plus CNC router and laser cutter; plus casting (and the brass-bushing variant). Vitamins are everything the shop cannot make; they are imported whole.
- **Plastic.** Printing a product mass `P` needs filament `F = P/(1−s)`; `s` is the scrap share (supports, purge, failed prints). A fraction `r` of the shreddable plastic is re-extruded, capped at a share `phi` of `F` (degradation limit). The shreddable pool is the shop's own scrap plus, optionally, printed plastic from retired machines (`eol`, a multiple of this copy's printed mass).
- **Metal.** Machining product mass `P` from stock needs `P/y` (cutting yield `y`). Offcuts are remelted only if the shop has casting, and only aluminium is remelted, with melt loss `m`.
- **Energy** (electric): printing, shredding, extrusion, machining per kg, and aluminium melting, computed from specific heat and latent heat divided by a furnace efficiency.
- Every process parameter is an **assumption** of this project (values in `Params`, `src/selfrep_materials/balance.py`). Nothing here is measured. The experiment sweeps them and also draws them at random (2000 draws, seed 0).

## Reproduce
```bash
cd research/selfrep-materials
python3 -m unittest discover -s tests -v     # 10 tests, standard library only (needs ../selfrep-closure)
python3 experiments/run.py                   # writes experiments/results.txt
```

## Results (from `experiments/results.txt`; base parameters are assumed)
Imported mass per printer copy, kg, base case (`s`=0.10, `r`=0.8, `phi`=0.3, `y`=0.7, `m`=0.08), recycling off → on:

| shop | total | of which vitamins | virgin filament | other feedstock |
|---|---|---|---|---|
| printer alone | 6.48 → 6.38 | 5.26 | 1.22 → 1.12 | none |
| + CNC router + laser | 6.62 → 6.52 | 4.94 | 1.22 → 1.12 | 0.46 (MDF 0.21, aluminium 0.25) |
| + casting (LM8UU) | 6.62 → 6.46 | 4.94 | 1.22 → 1.12 | 0.40 on (aluminium offcuts remelted) |

- **Vitamins dominate the imported mass**: about 75% (5–95% over the parameter draws: 73–77%) for the largest shop, 82% for the printer alone. Among imported *feedstock* the largest is virgin filament in all 2000 draws.
- **Recycling the shop's own scrap barely helps**: it cuts total imported mass by a median 3% (1–6%). Production scrap is small (about 0.1 kg of plastic per copy), and the 30% recycled-share cap does not bind. Aluminium remelting saves 0.06 kg of sheet per copy in the base case.
- **Plastic from retired machines is where recycling would matter**: if each copy retires about one machine's worth of printed plastic, virgin filament falls from 1.12 kg to 0.86 kg at `phi`=0.3, and to 0.24 kg at `phi`=0.8. The cap `phi` then sets the result, and it is the least certain input (recycled-plastic quality is not modelled).
- **Energy** is about 9–10 kWh per copy in the base case, dominated by printing (8.8 kWh); remelting is 0.08 kWh (Monte Carlo total median 12 kWh, 5–95%: 6–18). Aluminium melting is small because so little aluminium is made.

## Limitations
- **Stylised and parameter-driven.** Masses are the assumed placeholders of `selfrep-closure`; every yield, loss and specific energy is a round-number assumption, not a measured or sourced figure. Conclusions are about structure (vitamins dominate, own-scrap recycling is small), not magnitudes.
- Only the aluminium bar/sheet and brass of that part list are modelled as metal; brass is never remelted and the MDF is never recycled. Filament additives, moisture, colour mixing and mechanical quality loss of recycled plastic are not modelled; `phi` stands in for all of it.
- Shredder, extruder, furnace and their own bills of materials and masses are absent: the machines that recycle are not counted in the copy.
- Electricity and the vitamin supply chain are not counted in the energy figure; only shop processes are.
- The aluminium melt energy uses approximate handbook-order values for specific heat and latent heat, typed from memory and not checked against a handbook (owner step).
- Steady state only: no time, growth or failure dynamics (see `selfrep-growth`).

## Next steps
Give the recycling machines (shredder, filament extruder, crucible furnace) their own part lists and fold them into the closure; replace `phi` with measured strength of recycled filament; track retired machines over time in the `selfrep-growth` fleet model.

## Owner steps
- Weigh the parts and measure scrap on real print jobs; measure shredder and extruder throughput and power.
- Check the aluminium thermophysical constants against a handbook and the recycled-filament cap against tests of printed strength.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-closure` source tree (referenced by relative path). Physically the model assumes imported filament, MDF, aluminium and brass stock and every vitamin listed in `selfrep-closure`.
