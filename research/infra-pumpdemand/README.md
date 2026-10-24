# infra-pumpdemand: does a real demand charge change when a water utility should run its pumps?

Track 21 (`infra`), the first next step of [`infra-pumpsched`](../infra-pumpsched/): that project priced pump schedules on invented tariff shapes with no demand charge. This one bills the same Net3 schedules on a published tariff, PG&E Schedule B-19, which charges for the highest 15-minute kW as well as for energy, and re-runs the hydraulics at a 15-minute step with a stricter periodic constraint. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/infra-pumpdemand/

**Headline (simulated Net3, B-19 list prices; not a field result).** Net3's shipped schedule peaks at **373 kW**, because booster pump 335 (about 310 kW) runs whenever tank 1 is low, and **60 to 64 % of its B-19 bill is demand charges**. Running the lake pump (pump 10) for most of the day keeps tank 1 full, idles the booster and cuts the peak to **63 kW**, so the monthly bill falls **56 % in summer, 66 % in winter and 67 % in spring (62.5 % over a year)** with the tanks back to within 0.1 % of daily demand (65.1 % with a 1 % tolerance). **The demand charge does not change which schedule is best**: the energy-only and full-bill optima are the same schedule in all three seasons, and still are with the demand rates scaled from 0 to 20 times (section E; at 0 times the saving is 39 %, at 20 times 65 %, so demand charges add to the *size* of the saving, not to the choice). Time-of-use energy prices add under 1.5 points beyond the flat-energy optimum.

![Summer bill saved by the best pump-10 schedule against the shipped one, by demand-charge multiplier](experiments/saving.svg)

## Method
- **Network and schedules.** As in `infra-pumpsched`: Net3 (EPANET example, WNTR 1.5), pump 10's time controls replaced by an hourly mask repeated daily; every mask with at most two cyclic on-runs (21,806) is simulated for three days and the last is scored. **Hydraulic step 900 s** (that project showed one sample an hour mis-integrates the booster); pump power per quarter-hour is the report-row energy over 900 s. The shipped schedule reproduces `infra-pumpsched`'s 900 s figure (2,573 kWh a day; tested).
- **Feasible** means tanks at least 0.5 m above minimum, pressure at least 14.06 m (20 psi), and net tank volume change over the scored day at most 1 % (as before) or **0.1 %** (near periodic) of that day's demand. 21,023 and 17,536 of 21,806 schedules pass; the shipped one passes both.
- **Tariff** (`src/infra_pumpdemand/tariff.py`): PG&E ELEC_SCHEDS_B-19, *Medium General Demand-Metered TOU Service*, secondary voltage, total bundled rates (Sheet 4, effective March 1, 2026 on the sheet read) and time periods (Section 6), read from the tariff book PDF on 2026-10-23. Energy $/kWh: summer (Jun to Sep) peak 16:00 to 21:00 0.18648, part-peak 14:00 to 16:00 and 21:00 to 23:00 0.14775, off-peak 0.12037; winter (Oct to May) peak 0.16188, off-peak 0.12026, and super off-peak 09:00 to 14:00 in Mar to May 0.06442. Demand $/kW-month: summer peak 46.16, part-peak 10.52, any time 37.37; winter peak 2.31, any time 37.37. Demand is the highest 15-minute average (Sheet 2). Monthly bill = 365/12 days of energy plus demand charges on the scored day's maxima (every day taken as the scored day). Customer charge, riders, taxes and power-factor adjustments are left out. 4 summer, 5 winter (Oct to Feb) and 3 spring months make a year.

## Results (`experiments/results.txt`; deterministic)
- **A.** Shipped 2,573 kWh/day, 373 kW. Least-energy feasible schedule: 1,306 kWh/day (49.2 % less) at 1 % tolerance, 1,428 (44.5 % less, running all but one hour) at 0.1 %; both peak at 63 kW.
- **B.** Monthly bill, shipped / best: summer $26,978 / $11,791, winter $23,343 / $8,028, spring $22,816 / $7,500 (0.1 % tolerance, best = pump 10 on 21:00 to 20:00, off one hour). The annual figure for the pump station is $293,076 shipped and $109,802 best. Borrowing 1 % from the tanks instead of 0.1 % lowers the best annual bill by a further 2.6 points.
- **C.** Billing the energy-only optimum in full costs $0 more than the full-bill optimum in every season. Demand is 60 to 64 % of the shipped bill but is fixed by whether the booster runs: every schedule that idles it peaks at 62 to 63 kW, so demand charges cannot rank them.
- **D.** The lowest feasible peak over all 17,536 schedules is 63 kW (at 1,429 kWh/day).
- **E.** Summer demand rates times 0, 0.5, 1, 2, 5, 20: the optimum is the same schedule every time; the saving rises 39.4, 51.8, 56.3, 60.0, 63.2, 65.2 %.

## Reproduce
```bash
pip install pytest numpy wntr matplotlib
cd research/infra-pumpdemand
python -m pytest -q tests                                          # 7 tests
PYTHONPATH=src python experiments/simulate_all.py                  # about 10 min on 4 cores; writes experiments/cache.npz (not committed)
PYTHONPATH=src python experiments/run.py > experiments/results.txt
python experiments/figure.py                                       # experiments/saving.svg
```

## Limitations
- **The scale is wrong for B-19.** Net3's pumps are small; B-19 is mandatory above 499 kW and voluntary below. This is what the published tariff would charge, not a tariff such a utility is on. The dollar figures follow the tariff, the finding (the booster sets the peak) does not depend on it, as section E shows.
- **One network.** Net3 is a teaching network with a gravity river source; the booster-versus-lake-pump trade is a property of its design, not of utilities generally. No pump's start-up, ramping or reliability limits are modelled.
- **Search is the two-run grid only**, not free-form hourly masks; `infra-pumpsched` found little beyond it, and that was not re-run at 900 s or 0.1 %.
- **Demand is one repeated day** with no seasonal pattern, no forecast error and every day the same as the scored one (a monthly maximum over varying days would be higher).
- **Tariff list prices only**: no riders, taxes, surcharges, customer charge or power-factor adjustment; the rates are as of the sheet read and change.
- **Nothing here is operating advice**; pumping affects drinking-water pressure and supply, and no real utility system was touched.

## Builds on
EPANET (Rossman 2000) and Net3 through WNTR 1.5 (Klise et al. 2017, US EPA; BSD-3); [`infra-pumpsched`](../infra-pumpsched/) for the schedule family, feasibility test and the 900 s step finding. PG&E, Electric Schedule B-19 (tariff book, cited above). No CU Boulder group's work is reproduced and no connection is claimed.

## Next steps
1. A second network with a real booster and a smaller sourced tariff (a municipal-scale rate) that Net3's load would actually be on.
2. A monthly maximum over days of varying demand, so the peak is not one repeated day.
3. Free-form hourly masks at 900 s and 0.1 % (the GA of `infra-pumpsched`).

## Outside dependencies
EPANET and WNTR from PyPI; the B-19 rates are read from PG&E's public tariff book (PDF), not vendored here.
