# selfrep-closure: how much of a RepRap Prusa Mendel can a growing seed shop make itself?

First milestone of the self-replicating manufacturing track (`PROJECTS.md`, track 1). It models one real open printer, the RepRap Prusa Mendel (iteration 2), as a list of parts and computes part, mass and cost closure for three seed shops. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-closure/

**Builds on.** The RepRap project (Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>) and its Prusa Mendel (iteration 2) design by Josef Prusa and contributors; the bill of materials is the one on the RepRap wiki page <https://reprap.org/wiki/Prusa_Mendel_(iteration_2)> (oldid 181926, last edited 9 April 2018, retrieved 2026-10-13; content under the GNU FDL, the lists were re-keyed by hand, no text copied). The *closure* and *vitamin* vocabulary follows `PROJECTS.md` and the RepRap literature; the wider framing is von Neumann (1966), Freitas and Merkle (2004). None of these is reproduced. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- `src/selfrep_closure/bom.py`: 51 part lines (468 units as listed) from the wiki page: 18 printed lines (44 units), fasteners, bearings, rods, belts, pulleys, five NEMA17 motors, electronics. Two bearing variants, as the wiki lists both: LM8UU linear bearings (a vitamin) or 8x25 mm brass bushings.
- A part is *makeable* by a shop if a process in the shop can make it from raw **feedstock** (filament, MDF, aluminium, brass: imported, not counted as vitamins). Everything else is a *vitamin*. Seed shops: printer (FDM); plus CNC router and laser cutter; plus metal casting.
- Closure = makeable share, by distinct part lines, by units, by mass and by cost.

## Reproduce
```bash
cd research/selfrep-closure
python3 -m unittest discover -s tests -v     # 6 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
Mass and cost columns are **assumed** inputs (see Limitations); the bracket is the 5th–95th percentile when every assumed unit mass and cost is scaled by an independent log-uniform factor in [0.5, 2] (2000 draws, seed 0).

| shop | lines | units | mass | cost |
|---|---|---|---|---|
| printer alone (either bearing variant) | 35.3% | 9.4% | 17% [14–22] | 11% [9–15] |
| + CNC router + laser cutter, LM8UU | 43.1% | 42.1% | 22% [18–28] | 16% [12–20] |
| + metal casting, LM8UU | 43.1% | 42.1% | unchanged | unchanged |
| + CNC router + laser cutter, brass | 43.1% | 42.1% | 22% [18–28] | 16% [12–20] |
| + metal casting, brass bushings | 45.1% | 44.2% | 24% [19–30] | 21% [16–27] |

- The printer alone makes the 18 printed lines: 18 of 51 lines, 35.3%.
- Adding the router and laser cutter makes the MDF bed plate, the two pulleys and the M8/M3 washers (assumptions below). The jump in units (9% to 42%) is mostly the 150 washers, which are box sizes, so treat the unit figure with caution.
- Casting adds nothing with LM8UU bearings: nothing else in this list is castable under the model. It matters only if the shop swaps to brass bushings, then adding about 2 points of lines and 5 of cost.
- Mass and cost closure stay below 25% and 21% even for the largest shop, across the sensitivity range at most 30%. The vitamins that dominate are the motors, electronics, rods, bearings and fasteners (full list in `results.txt`).
- Under these assumptions no seed shop approaches full closure; the RepRap's well-known dependence on bought rods, motors and electronics shows up as expected.

## Limitations
- **Masses and costs are assumed placeholders** written for this project, not sourced figures. The wiki page has no masses or prices. No price claim is made; the cost column only tests how closure responds to plausible scaling. Owner step below.
- **Which process can make which part is my judgement**, not an established fact. The optimistic ones are machined GT2 pulleys and router-cut washers; brass bushings by casting plus router boring is also an assumption. Each is marked in `bom.py` with its reason. Changing them changes the results directly.
- Fastener lines are box sizes (100 nuts), not units used per printer, so unit closure is secondary.
- The list is the wiki's, which is incomplete (no power supply, wiring, endstop switches are inferred from the three endstop holders, heated bed omitted as optional).
- Only the printer is decomposed. The router, laser cutter and casting setup have no bills of materials here, so this is closure of **one product** by shops of several machines, not closure of the shop itself.
- Static counts: no time, growth or cost of building the extra machines (later milestones).

## Next steps
`selfrep-nextmachine`: pick which machine to add next for the most closure per dollar, checked against exhaustive search on this model; then give the added machines their own bills of materials.

## Owner steps
- Replace the assumed masses and costs with weighed parts and dated quotes (source and date for every price); re-run `experiments/run.py`.
- Check the make-from-feedstock assumptions against what a real router, laser and caster can do.

## Outside dependencies (vitamins)
The model itself uses only the Python standard library. The vitamins of the printer it describes are listed in `experiments/results.txt`: nuts, bolts, rods, bearings, belts, motors, controller, hot end, glass and tubing. Source for every part and quantity: the RepRap wiki page above.

`python3 experiments/figure.py` plots cost closure with its 5-95% assumed-price range for the three seed shops (lm8uu variant) from the committed `experiments/results.txt` and writes `experiments/closure_by_shop.svg` (standard library only; no new results; stylised model).
