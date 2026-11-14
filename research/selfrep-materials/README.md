# selfrep-materials: how much does recycling cut the imported material of a self-replicating printer shop?

Fifth milestone of the self-replicating manufacturing track (`PROJECTS.md`, track 1). A steady-state mass and energy balance for building one more RepRap Prusa Mendel, with and without recycling of plastic (shred and re-extrude) and aluminium (remelt offcuts). Produced with AI assistance (Claude).

**Live page:** https://marisstella.app/research/selfrep-materials/

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
python3 -m unittest discover -s tests -v     # 16 tests, standard library only (needs ../selfrep-closure)
python3 experiments/run.py                   # writes experiments/results.txt
python3 experiments/stl_volumes.py --check   # re-downloads the 18 STLs and checks data/stl_volumes.json
```

## Results (from `experiments/results.txt`)
**Part list.** Since 2026-11-14 the headline uses a *sourced* part list (`src/selfrep_materials/sourced.py`), fixing the high-severity defect of the [2026-11-08 quality audit](../../portfolio/quality/audits/2026-11-08-selfrep-materials.json):
- **Printed plastic is measured from the design files, not assumed.** `experiments/stl_volumes.py` downloads the 18 STLs the RepRap wiki links (`prusajr/PrusaMendel`, `metric-prusa/`), checks each mesh is watertight and sums signed tetrahedra; [`data/stl_volumes.json`](data/stl_volumes.json) records each volume and the file's SHA-256 (numpy-stl gives the same volumes to 3 decimals). The 44 printed parts of one copy total **480 cm³ of solid plastic, 0.595 kg as solid PLA** (1.24 g/cm³, NatureWorks Ingeo 4043D data sheet). The placeholder list assumed 25 g a part, 1.10 kg: 85% too heavy even before infill.
- **Fasteners are counted per printer, not per box.** The wiki's bill of materials lists boxes ("100 M8 nuts ... spares are handy"); summing the "Parts Required" lists of the wiki's *Prusa Mendel Assembly (iteration 2)* page (oldid=191295) plus the Wade's-extruder table gives 82 M8 nuts, 88 M8 washers, 23 M3x20/25 bolts, 38 M3 nuts, 62 M3 washers and 18 M3x10 bolts per printer, plus 4 M3x40 bed bolts and 2 each of M4 bolts, nuts and washers the bill omits (derivation table: `FASTENER_DERIVATION`). One line goes the other way: the build uses 62 M3 washers, more than the box of 50 the bill of materials lists.

Imported mass per printer copy, kg, sourced part list, base case (`s`=0.10, `r`=0.8, `phi`=0.3, `y`=0.7, `m`=0.08, solid prints), recycling off → on:

| shop | total | of which vitamins | virgin filament | other feedstock |
|---|---|---|---|---|
| printer alone | 5.83 → 5.77 | 5.16 | 0.66 → 0.61 | none |
| + CNC router + laser | 5.96 → 5.90 | 4.86 | 0.66 → 0.61 | 0.44 (MDF 0.21, aluminium 0.23) |
| + casting (LM8UU) | 5.96 → 5.84 | 4.86 | 0.66 → 0.61 | 0.38 on (aluminium offcuts remelted) |

- **Vitamins dominate the imported mass even more than the placeholder list said**: 83% for the largest shop (Monte Carlo over process parameters, infill fill 0.5 to 1.0 and density 1.04 to 1.24 g/cm³: median 85%, 5–95% 82–88%), 89% for the printer alone. Virgin filament is still the largest imported feedstock in 1944 of 2000 draws; in the other 56 (thin infill) the MDF bed plate is.
- **Recycling the shop's own scrap barely helps**: it cuts total imported mass by a median 2% (5–95%: 0.7–4.1%). Production scrap is about 0.07 kg of plastic per copy.
- **Plastic from retired machines is where recycling would matter**: if each copy retires one machine's worth of printed plastic, virgin filament falls from 0.61 kg to 0.46 kg at `phi`=0.3 and to 0.13 kg at `phi`=0.8. The recycled-share cap `phi` decides the result, and it is the least certain input.
- **Energy** is about 5.5 kWh per copy in the base case, 4.8 of it printing; remelting is 0.07 kWh (Monte Carlo median 4.6 kWh, 5–95%: 2.4–8.0).

**What changed from the placeholder list** (still computed, second half of `results.txt`): total imports 6.46 → 5.84 kg for the largest shop with recycling, vitamin share 75% → 83%, own-scrap recycling cut 3% → 2%, energy 9.7 → 5.5 kWh. The structural conclusions hold; the magnitudes moved because printed plastic was overstated by 0.5 kg.

## Limitations
- **Process parameters and vitamin masses are still assumptions.** Printed masses and fastener counts are sourced (above); every yield, loss and specific energy, the infill fill fraction, and the per-unit masses of motors, rods, bearings and fasteners (from `selfrep-closure`) are round-number assumptions, not measured or sourced figures. Conclusions are about structure (vitamins dominate, own-scrap recycling is small), not exact magnitudes.
- The printed masses use the iteration-2 repository's own Wade's extruder STLs, which the wiki says have wrong nut-trap dimensions (the corrected files are on Thingiverse, unreachable from this session); a nut trap changes a part's volume by well under 1 cm³. The repository README lists 2 belt-clamp nut holders where the wiki lists 4; the wiki count is used (0.8 cm³ apart).
- **Remelt is credited against sheet, which a crucible furnace cannot make** (found by the [2026-11-08 quality audit](../../portfolio/quality/audits/2026-11-08-selfrep-recyclers.json) of `selfrep-recyclers`). The 0.06 kg of aluminium saved per copy assumes remelted offcuts replace imported sheet and bar alike; a furnace pours castings, so only the bar stock of cast-and-machined parts (0.029 kg) can really be replaced. The effect on the 2% headline is under 1 point (0.04 kg of 5.9 kg). `selfrep-recyclers` (`furnace_saving_kg`) uses the capped figure.
- Only the aluminium bar/sheet and brass of that part list are modelled as metal; brass is never remelted and the MDF is never recycled. Filament additives, moisture, colour mixing and mechanical quality loss of recycled plastic are not modelled; `phi` stands in for all of it.
- Shredder, extruder, furnace and their own bills of materials and masses are absent: the machines that recycle are not counted in the copy.
- Electricity and the vitamin supply chain are not counted in the energy figure; only shop processes are.
- The aluminium melt energy uses approximate handbook-order values for specific heat and latent heat, typed from memory and not checked against a handbook (owner step).
- Steady state only: no time, growth or failure dynamics (see `selfrep-growth`).

## Next steps
Give the recycling machines (shredder, filament extruder, crucible furnace) their own part lists and fold them into the closure; replace `phi` with measured strength of recycled filament; track retired machines over time in the `selfrep-growth` fleet model.

## Owner steps
- Weigh printed parts (to replace the assumed fill fraction) and measure scrap on real print jobs; measure shredder and extruder throughput and power.
- Check the aluminium thermophysical constants against a handbook and the recycled-filament cap against tests of printed strength.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-closure` source tree (referenced by relative path). Physically the model assumes imported filament, MDF, aluminium and brass stock and every vitamin listed in `selfrep-closure`.
