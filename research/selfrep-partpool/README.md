# selfrep-partpool: does sharing part jobs across printers make a replicating printer shop double faster than one-copy-per-printer?

Follow-up to `selfrep-growth` (track 1, `PROJECTS.md`). That project found a gap it called "a modelling difference": a fluid model doubles in 34.7 h, its discrete-event model in about 53 h, because a printer finishes a whole copy before the fleet grows. This project tests that explanation by letting printers share the copy's real part list. It is a new question rather than another sweep of the rod results the track's last milestones chained. Produced with AI assistance (Claude). Computed only; no printer was built or timed.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-partpool/

**Builds on.** `selfrep-growth` (fleet model, inputs, 1 to 64 horizon) and `selfrep-closure` (the 44 printed parts of the RepRap Prusa Mendel and the vitamin cost per copy), both imported, not copied. RepRap: Jones et al., *Robotica* 29(1), 2011, <https://doi.org/10.1017/S026357471000069X>. It builds on none of the labs in `prompt.md`.

## Method
- A copy is 44 printed-part jobs (1.0 h each: 25 g at the assumed 25 g/h) plus a 6 h assembly job that needs one copy's vitamins (170.3 assumed units) from a stock fed at a budget per hour. Assembly takes a printer and adds one printer when it ends. Every job time is lognormal (CV 0.2 unless stated). Fleet 1 to 64, effective doubling = time / 6.
- Three policies, one simulator (`src/selfrep_partpool/model.py`, standard library):
  - `whole`: each printer opens its own copy and does all of it (the `selfrep-growth` assumption, re-simulated here with per-job noise).
  - `focus`: printers share one pool and always take a part of the oldest copy that has unstarted parts, so copies finish one after another.
  - `spread`: printers take a part of the copy with the fewest started parts, so all copies in flight finish together.
  - Pooled policies keep at most N copies in flight (N = current fleet).

## Reproduce
```bash
cd research/selfrep-partpool
python3 -m unittest discover -s tests -v     # 11 tests, standard library only
python3 experiments/run.py                   # about 45 s; writes experiments/results.txt
python3 experiments/figure.py                # plots section B to experiments/time_to_fleet.svg
```

## Results (from `experiments/results.txt`; hours)
- **When machine time binds, assignment matters.** With no import limit, effective doubling is 51.1 h for `whole`, 43.2 h for `focus` (15% faster) and 50.4 h for `spread`. Without noise the 64-printer fleet is reached at 300 h, 259 h and 300 h. `spread` equals `whole` because both finish copies in generations.
- **It closes about half of the gap, not all of it.** The fluid floor is 34.7 h; `focus` gets from 51.1 to 43.2 h. With a 0.5 h assembly `focus` reaches 35.7 h (against 45.3 h `whole`) and with 24 h assembly the policies are 65.5 h and 71.2 h, so assembly time as a serial step is part of what is left. We did not test other causes (the cap on copies in flight, 1 h job granularity), so they are hypotheses.
- **When imports bind it makes no difference.** At 0.25 to 16 units/h all three policies agree to within 0.3% (for example 448.1 h at 4/h), as the fluid picture predicts. At 64/h machine time already binds and `focus` is 15% faster.
- **Noise.** Higher job CV (to 1.0) leaves `focus` near 43.5 h and `whole` rises to 53.1 h; `spread` degrades most (55.9 h at CV 1.0).

## Limitations
- Stylised throughout. Every input is assumed, inherited from `selfrep-growth` (print rate, assembly time, vitamin cost); the BOM gives all 44 printed parts the same placeholder 25 g mass, so part jobs are uniform. Plate packing, multi-part plates, changeover and failed prints are not modelled (`selfrep-growth` had a crude failure model; none here).
- Assembly is done by a printer, as in `selfrep-growth`, which no real RepRap can do.
- Parts of a copy are assumed freely movable between printers and copies in flight are not limited by space or labour.
- 100 runs per cell, one seed series; ranges are 5th to 95th percentile of the simulation, not confidence intervals on a real shop.

## Next steps
Give the 44 parts real masses and plate packing (several parts per print); test whether a dedicated assembler (not a printer) removes the remaining gap to the fluid floor; add failed prints.

## Owner steps
- Time a real printer's per-part print and swap times, and replace the assumed rate and assembly time.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-closure` source tree (relative path). The printers it describes need the vitamins listed there.
