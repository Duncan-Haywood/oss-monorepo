# infra-pumpsched: when should a water utility run its lake pump, and how much of the saving is the tariff?

Track 21 (`infra`), a new milestone beyond the twelve listed in [`PROJECTS.md`](../PROJECTS.md): pump scheduling on a time-of-use tariff, on EPANET's Net3 through WNTR (the same network as [`infra-waterloss`](../infra-waterloss/)). Pumping is one of the largest energy costs of a water utility, and moving pump hours out of peak-price hours is the textbook lever. This project runs the hydraulics rather than assuming the saving, and finds that on Net3 most of a large apparent saving is not the tariff at all. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/infra-pumpsched/

**Headline (simulated Net3, assumed tariff shapes with a swept price ratio; not a field result).** Net3 ships with pump 10 (the lake source) running 01:00 to 15:00. Searching every daily window (409 start and duration pairs) that keeps the tanks in range and periodic, **running pump 10 for 21 hours from 01:00 cuts pumping energy by 52 % (2,728 to 1,307 kWh a day) at a flat tariff.** The reason is Net3's own source mix: the river supplies about 50,000 of the 59,700 m<sup>3</sup> daily demand mostly by gravity through pipe 330, and booster pump 335 runs only when tank 1 is low (6 hours a day as shipped, 1 hour in the best window). More lake pumping keeps tank 1 full and idles the booster. **That saving needs no tariff.** What the tariff adds on top, over the flat-optimal window, depends on the price ratio and shape: for a 16:00 to 21:00 peak, 0.1 % at ratio 1.5, **15.8 % of the shipped cost at ratio 3**, and 95 % at ratio 10 (where the flat-optimal window would cost 1.5 times the shipped one, because it puts 24 % of its energy in the peak). For an 08:00 to 20:00 peak, 0.1 %, 8.6 % and 33.9 % at ratios 1.5, 3 and 10. For a midday-cheap shape, 0, 1.1 and 13.8 %. Minimum service pressure never binds (26 m and above in every window against a 14 m floor); the tank range and the daily balance do.

![Cost saved by the best pump-10 window against the shipped window, by price ratio and tariff shape](experiments/saving.svg)

**Builds on.** EPANET (Rossman 2000) and Net3 as bundled with WNTR 1.5 (Klise et al. 2017, "Water Network Tool for Resilience", US EPA; BSD-3), pump energy from WNTR's `pump_energy`. Pump scheduling on time-of-use tariffs is a long-studied problem (for example Lansey and Awumah 1994, *J. Water Resources Planning and Management*, and Mala-Jetmarova, Sultanova and Savic 2017, "Lost in optimisation of water distribution systems?", *Environmental Modelling and Software*; neither was re-read for this project, they are named as the field, not reproduced). Method transfer (track 21): none; this is a grid search over a one-window schedule, the simplest possible baseline. No CU Boulder group's work is reproduced and no connection is claimed.

## Method (`src/infra_pumpsched/sched.py`)
- **Network.** Net3 unchanged except pump 10's time controls, which are removed and replaced by one daily window (start hour 0 to 23, 6 to 22 hours, or on all day). Pump 335 and pipe 330 keep their tank-1 level controls. Three days are simulated with EPANET's solver at a 1-hour step; the **last day is scored**, and the first two let the tanks settle.
- **Feasible** means, over days 2 and 3: every tank stays at least 0.5 m above its minimum level, the three tanks' net volume change over the scored day is within 1 % of that day's demand (so energy is not saved by draining storage), and the lowest pressure at any demand junction is at least 14.06 m (20 psi; swept to 20 and 25 m, which changes nothing, see above). 346 of 409 windows are feasible.
- **Energy** is `wntr.metrics.economic.pump_energy` at Net3's global 75 % efficiency, summed over pumps 10 and 335, in kWh per hour.
- **Tariffs are assumptions** (no tariff was reachable and sourced here): `evening` peak 16:00 to 21:00, `daytime` peak 08:00 to 20:00, `midday-cheap` (cheap 10:00 to 16:00, dear 17:00 to 21:00, a shoulder of the square root of the ratio otherwise), off-peak price 1 and the peak to off-peak ratio swept over 1.5, 2, 3, 5, 10. Cost is energy times relative price; no demand charge, no fixed charge.

### Checks (`tests/`, 7)
The shipped window reproduces Net3's controls (14 hours on from 01:00); the lake pump delivers less than demand and the tanks do not drift by more than 1 %; the energy of an hour of pump 10 matches P = &rho;gQH/&eta; with the head read off the pump's published three-point curve, within 5 %; a 24-hour window runs all day; a longer lake window reduces booster energy; the tariff shapes; a flat tariff's cost is its energy. Mass balance over the scored day leaves a gap of about 1 % (river plus lake outflow 60,273 m<sup>3</sup> against 59,676 m<sup>3</sup> junction demand and 16 m<sup>3</sup> of tank change) that I did not trace.

## Reproduce
```bash
pip install pytest numpy wntr matplotlib
cd research/infra-pumpsched
python -m pytest -q tests                        # 7 tests
PYTHONPATH=src python experiments/run.py > experiments/results.txt   # about 25 s
python experiments/figure.py                     # experiments/saving.svg
```

## Results (`experiments/results.txt`; deterministic)
- **A.** As shipped: 2,728 kWh a day (pump 10 869, pump 335 1,859); pump 10 delivers 10,468 m<sup>3</sup>; minimum service pressure 27.3 m.
- **C.** Flat tariff: the least-energy feasible window is 01:00 for 21 h, 1,307 kWh (52.1 % less); the worst feasible window uses 3,904 kWh.
- **D.** Best feasible window per tariff and ratio, cost saved against the shipped window: evening 46.5 % at ratio 1.5 and 45.2 % at 2 to 10 (best window starts 21:00, 19 h); daytime 43.0 % at 1.5, 30.8 % at 3, 13.1 % at 10; midday-cheap 49.6 to 51.6 %. The "of which kWh saved" column splits out the part that is pure energy.
- **E, H.** The shipped schedule already puts 0 % of its energy in 16:00 to 21:00 and 16 % in 08:00 to 20:00; the flat-optimal one puts 24 % and 57 %.
- **G.** Extra saving from knowing the tariff, beyond the flat-optimal window, as a share of shipped cost: see the headline.

## Limitations
- **One network, one window per day.** Net3 is a teaching network with an unusual gravity river source; the 52 % is a property of its source mix and controls, not of water utilities. A real scheduler would use several windows, variable-speed pumps and tank trajectories (the optimisation literature above).
- **Tariffs are assumed shapes**, and there is no demand charge; a demand charge would penalise the long, high-flow windows.
- **Demand is Net3's own pattern**, one repeated day; no forecast error.
- **The scored day is periodic only to 1 %**, and the unexplained 1 % mass-balance gap above applies.
- **Safety-critical designs are research.** Pump operation affects drinking-water pressure and supply; nothing here is operating advice, and no real utility system was touched.

## Next steps
1. Several windows a day, or an hourly on/off schedule solved with a MILP or a genetic algorithm against this grid as baseline.
2. A sourced tariff and a demand charge.
3. Trace the 1 % mass-balance gap.

## Outside dependencies
EPANET and WNTR (installed from PyPI); no tariff or utility data.
