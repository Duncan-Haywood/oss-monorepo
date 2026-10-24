# selfrep-spares: how much does making its own spare parts cut the cost of repairing a printer? (stylised)

Follow-up to `selfrep-repair` in the self-replicating manufacturing track (`PROJECTS.md`, track 1), taking that project's first listed next step: set the spare-part cost share `c` from the closure of the machine's wear parts in `selfrep-closure`. Produced with AI assistance (Claude). **Stylised, assumed inputs**: nothing here measures a real printer.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-spares/

**Builds on.** `research/selfrep-repair` (the repair discrete-event model and the break-even rule c < s, imported by relative path), `research/selfrep-closure` (the Prusa Mendel parts list and which seed shop can make which part) and `research/selfrep-growth` (W = 50.0 h and V = 170.34 vitamin units per copy). Behind them: the RepRap project (Jones et al., "RepRap – the replicating rapid prototyper", *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>) and the question of von Neumann (1966) and Freitas and Merkle (2004), as in `PROJECTS.md`. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Wear parts.** Eight lines of the `selfrep-closure` parts list are treated as wear parts: two GT2 belts, LM8UU and 608 bearings, hot end, thermistor + heater, end-stop switches and the GT2 pulleys. Each unit has an **assumed** mean life (`src/selfrep_spares/spares.py`, `LIFE_H`: 3000 h for the hot end up to 20000 h for 608 bearings, pulleys and end-stops). Units fail independently and exponentially, so the machine breakdown rate is the sum of qty/life over lines: 0.00273 per hour, mean life L = 365.9 h. This is much shorter than the L = 2000 h assumed in `selfrep-repair`, because the printer has ten LM8UU bearings.
- **Spare cost.** A breakdown hits line i with probability proportional to qty/life; the spare is one unit of that part. It costs its (assumed) unit cost in vitamins unless the seed shop can make it (`selfrep_closure.closure.makeable`). `c` is the expected vitamin cost of a spare divided by V.
- **Fleet.** `c` is passed to the unchanged `selfrep-repair` model with repair success s = 0.9, 5 h downtime, a reserve of 1.0 V, import budget 4 units/h, 100 runs per row, 20000 h, seed 0. The import-limited formula N = B L / (V (c + 1 − s)) is shown beside each row.

## Reproduce
```bash
cd research/selfrep-spares
python3 -m unittest discover -s tests -v    # 7 tests, standard library only
python3 experiments/run.py                  # about 10 s; writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
- **Spares are cheap here, and the printer cannot make any of them.** With the printer alone, no wear part is makeable, and c = 0.0213 (the hot end is 12% of breakdowns at 20 units, bearings dominate by count at 1 unit). Adding the CNC router and laser cutter makes only the GT2 pulleys (a judgement made in `selfrep-closure`), so c = 0.0209. Casting changes nothing. In-house spares made no visible difference to the fleet: 62.5 vs 63.0 working machines (median of surviving runs), well inside the run-to-run spread.
- **Repair beats replacement by a wide margin at these inputs.** Replace-only reached 7.3 machines with 33% of runs dying out; repair with the derived c reached 62.5 with 23% dying out. This is the c ≪ s regime of `selfrep-repair`, so it is the breakeven rule, not a new effect.
- **A printable substitute for the LM8UU bearing lowers c, but it only pays if it lasts.** Replacing LM8UU with a printed bushing (made in-house, no vitamin cost) cut c from 0.0213 to 0.0186 at equal life (fleet 64.2). At half, a quarter and a tenth of the LM8UU life, the machine breaks down more often, and the fleet fell to 43.3, 24.0 and 7.8 (dead runs 34%, 51%, 79%). The saving in `c` is small next to the loss from more frequent breakdowns. The bushing's life factors are assumptions, not data.
- **The breakdown rate matters far more than where the spare comes from.** Scaling all wear-part lives by 0.25 / 0.5 / 1 / 2 / 4 moved the repair fleet from 11.0 to 28.7 / 62.5 / 124.9 / 210.9 machines at the same c. At lives x0.25 and x0.5 replace-only died out in every run.
- The formula overstates the simulated fleet: by about 13% at the base lives (70.8 vs 62.5), and by more when lives are short or the fleet is small (17.7 vs 11.0 at lives x0.25; 16.2 vs 7.8 for the weakest bushing) and at lives x4 (283 vs 211). As in `selfrep-repair`, I did not separate the causes.

## Limitations
- **Every number is assumed**: part lives, unit costs (from `selfrep-closure`, themselves placeholders), repair success, downtime and import budget. No real failure or price data is used, and nothing here supports a claim about a real printer.
- Exponential lives (no wear-out) and independent failures; a repair makes the whole machine as good as new, though only one part is replaced.
- Printing the spares is free of machine time and filament cost here; a printed spare would take printer hours the model does not charge. Frame, printed and fastener parts never fail in this model.
- The hot end, bearings and electronics are the same bought spares for every shop, so the closure result is limited by which parts `selfrep-closure` lets the shops make; changing that judgement changes `c`.
- The printed-bushing swap is a design what-if with an assumed life, not a tested part.
- One seed set, 100 runs per row; "dead" shares between neighbouring rows are noisy.

## Next steps
Charge printed spares their print hours and make the breakdown rate depend on age. Add repair labour as a constraint on machine-limited growth. Replace the assumed lives with measured ones.

## Owner steps
- Measure time to failure of a printer's wear parts (belts, bearings, hot end, thermistor) and replace `LIFE_H`.
- Replace assumed part costs with dated quotes (source and date for every price), as for `selfrep-closure`.
- Test whether a printed bushing can replace a linear bearing, and for how long.

## Outside dependencies (vitamins)
Python standard library only, plus the sibling `selfrep-repair`, `selfrep-growth` and `selfrep-closure` source trees (relative paths). The vitamins of the printer are those of `selfrep-closure`: bearings, belts, hot end, thermistor, switches, motors and electronics.
