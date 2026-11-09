# Which body carries a survey payload furthest per kWh? Hull choice for small autonomous boats

**Status: open research programme (proposal stage), milestones 1 and 2 done.** A stdlib resistance and
range calculator for small displacement survey boats (`src/marine_hull/`, 9 tests) and a first
sweep: at equal displacement, a catamaran out-ranges a monohull in only **0.4% of 6,561 swept
cases and in none at equal length**, because friction (wetted area) sets drag at survey speed
below 1 m/s and hotel load fixes the best speed near 1 m/s. Milestone 2 replaces the placeholder wave term with Michell thin-ship theory: the catamaran
wins **3.3%** of 6,561 cases, still none at equal length, and wave resistance moves best range by
only 4%. Milestone 5 adds a hydrofoil rung: in 2,916 swept cases a foilborne 200 kg craft never out-ranges the monohull (best case about a quarter of its range; foil coefficients swept, not sourced). Preliminary: Michell is checked against one published Wigley tank point only (milestone 3a: with no form factor the model is within a few per cent; at the central k = 0.25 it is about 20% high). Milestone 3b checks the placeholder wave term against five tank speeds of a published 2.8 m catamaran (Zenodo 18459868, CC BY 4.0): it is 35 to 43% low at Fn 0.33 to 0.58 and no single wave scale keeps all five within 20%, so it is not safe above Fn 0.3 (the programme's survey speeds are below that). See [`PROPOSAL.md`](PROPOSAL.md) and
[`LOG.md`](LOG.md).

**Live page:** https://marisstella.app/research/marine-hull/

**Programme.** Track 23 (`marine`, autonomous water vehicles) in [`../PROJECTS.md`](../PROJECTS.md).
Related labs: the repository's robotics and autonomy groups (ARPG, RECUV) for field vehicles; no
lab has reviewed this.

## Method and reproduce

```bash
cd research/marine-hull
PYTHONPATH=src python3 -m pytest tests -q          # 45 tests
PYTHONPATH=src python3 experiments/run_solar.py > experiments/results_solar.txt   # milestone 5c, 5 s
PYTHONPATH=src python3 experiments/run_solar_mass.py > experiments/results_solar_mass.txt   # milestone 5d, 10 s
PYTHONPATH=src python3 experiments/run_solar_sites.py > experiments/results_solar_sites.txt   # milestone 5e, 1 s
PYTHONPATH=src python3 experiments/run_solar_policy_bound.py > experiments/results_solar_policy_bound.txt   # milestone 5h, 3 s
PYTHONPATH=src python3 experiments/run_solar_surge_holdout.py > experiments/results_solar_surge_holdout.txt   # milestone 5i
PYTHONPATH=src:experiments python3 experiments/run_sail_hrrr_bc.py > experiments/results_sail_hrrr_bc.txt   # wing-sail milestone 5i (HRRR bias correction), 4 min
PYTHONPATH=src:experiments python3 experiments/run_sail_hrrr_learned.py > experiments/results_sail_hrrr_learned.txt   # wing-sail milestone 5j (learned station bias), 3 min
PYTHONPATH=src:experiments python3 experiments/run_sail_hrrr_buoy.py > experiments/results_sail_hrrr_buoy.txt   # wing-sail milestone 5k (open-water NDBC buoys; data fetched by fetch_ndbc_buoys.py), 3 min
PYTHONPATH=src:experiments python3 experiments/run_foil.py > experiments/results_foil.txt   # milestone 5
PYTHONPATH=src:experiments python3 experiments/run_swath.py > experiments/results_swath.txt   # milestone 5b, 25 s
PYTHONPATH=src python3 experiments/run_michell.py > experiments/results_michell.txt   # milestone 2, 2 s
PYTHONPATH=src python3 experiments/run_wigley_tank.py > experiments/results_wigley_tank.txt   # milestone 3a, 1 s
PYTHONPATH=src python3 experiments/run_catamaran_tank.py > experiments/results_catamaran_tank.txt   # milestone 3b, 1 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt
PYTHONPATH=src python3 experiments/run_glider.py > experiments/results_glider.txt   # milestone 4, 1 s
PYTHONPATH=src python3 experiments/run_slocum.py > experiments/results_slocum.txt   # milestone 4b, 1 s
PYTHONPATH=src:experiments python3 experiments/run_remus.py > experiments/results_remus.txt   # milestone 4c, 1 s
PYTHONPATH=src:experiments python3 experiments/run_value.py > experiments/results_value.txt   # milestone 4e, 1 s
PYTHONPATH=src:experiments python3 experiments/run_current.py > experiments/results_current.txt   # milestone 4f, 1 s
```

`hull.py`: ITTC 1957 friction line (checked analytically: Cf = 0.003 at Re = 1e7), form factor,
wetted area S = c_s sqrt(V L), a placeholder wave term, propulsive and motor efficiency, hotel
load. Craft: 200 kg, 25% battery. Results: [`experiments/results.txt`](experiments/results.txt).

`michell.py` (milestone 2): Michell (1898) thin-ship wave resistance of Wigley hulls (closed-form
x and z integrals, checked against Simpson sums) with Havelock's two-hull interference factor.
`experiments/run_michell.py` swaps it in for the placeholder and uses the exact Wigley wetted area.
Results: [`experiments/results_michell.txt`](experiments/results_michell.txt).

`glider.py` (milestone 4): quasi-steady buoyancy glider (force balance, best-glide incidence, pump work
B tan(gamma)/(2 eta), independent of depth) against a same-mass propeller AUV. No glider coefficient is
sourced (the cited papers were unreachable); all are swept. Results: [`experiments/results_glider.txt`](experiments/results_glider.txt).

`solar.py` (milestone 5c): daily-mean deck solar (area x efficiency x derate x insolation, all swept) against the monohull's load. Energy-neutral at 1 m/s in 25% of 4,374 cases (0% at 3 m, 20% at 4 m, 56% at 5 m hull length); no case sustains 2 m/s; otherwise solar doubles range (median). Results: [`experiments/results_solar.txt`](experiments/results_solar.txt).

Milestone 5e replaces the swept insolation with NASA POWER monthly climatology (25-year all-sky horizontal means) at five sites, 0 to 60 degrees latitude. The 5 m central boat holds 1 m/s on deck solar in all 12 months at the equator and at 25 N, in 7 at 42 N and in 5 at 60 N; the 4 m boat in 7, 6, 4 and 0. An annual-mean verdict overstates year-round neutrality wherever winter insolation collapses (Gulf of Maine: 161 W/m2 annual, 53 in December). Results: [`experiments/results_solar_sites.txt`](experiments/results_solar_sites.txt); data as fetched: `experiments/data/`.

`experiments/run_slocum.py` (milestone 4b): the same glider model with Slocum aerodynamics read from the
MIT-licensed `gliderflight` package (PyPI 1.2.1; Merckelbach's implementation of the Slocum flight model):
S = 0.1 m^2, lift slope 7.5 /rad, K = 10.5 /rad^2, Cd0 0.15 to 0.31. Hotel load, pump efficiency and dive
energy stay swept. Results: [`experiments/results_slocum.txt`](experiments/results_slocum.txt).

`experiments/run_remus.py` (milestone 4c): a REMUS-100-class AUV (38.6 kg, 1.85 m, 0.19 m; vendor figures: 1.5 kWh,
12 h at 1.5 m/s or 8 h at 3 kn) whose non-propulsion load is the vendor's total power minus the model's propulsion
power. Results: [`experiments/results_remus.txt`](experiments/results_remus.txt).

`experiments/run_time.py` (milestone 4d): energy-delay product of the 4b glider cases against 4c's REMUS-class AUV
cases. Results: [`experiments/results_time.txt`](experiments/results_time.txt).

## Results (preliminary)

- Milestone 5b (SWATH: two submerged parabolic torpedoes on Wigley-form struts, Michell wave drag for both, 4,374 pairs against the 4 m monohull): the SWATH out-ranges the monohull in none, at its best speed (range ratio median 0.69, best 0.83) and at a fixed 3 m/s (median 0.46), because strut wave drag and wetted area outweigh the torpedoes' small wave drag at 200 kg. Wave drag of the torpedo falls with depth at about 2 k0 as theory says; no SWATH tank curve was reachable, so the absolute wave level is unvalidated. Stability and seakeeping, the reasons to build a SWATH, are not modelled.
- Milestone 4e (break-even value of time, same 14,580 pairs): the glider and the AUV tie when a day of delay is worth a median 0.37 kWh (10th to 90th 0.17 to 0.72), about 8% of the AUV's own daily energy use. No ship day rate could be sourced (hosts unreachable), so the exchange rate is the output, not an input.
- Milestone 4f (steady cross-current, swept 0 to 0.5 m/s, same 810 x 18 cases): the glider's energy win is lost by stalling, not gradually. It beats the AUV in 97% of pairs at 0.10 m/s, 50% at 0.20 m/s (about its median glide speed, 0.21 m/s) and none from 0.45 m/s; among gliders that can hold the track it stays above 90% at every current. Currents are swept, not sourced.
- Milestone 4d (time penalty, 14,580 pairs): the glider takes a median 5.5 days per 100 km against the AUV's
  12 h. The AUV has the lower energy-delay product in 78% of pairs; the glider's energy win holds only while delay
  is weighted below about 0.7 of energy. Two predictions refuted (see `LOG.md`). The AUV's best speed sits at the
  datasheet maximum, so this is a bound; the time-energy exchange rate is not sourced.

- Milestone 7c (H1 and H5 run as stated, `experiments/run_h1_h5.py`): H1 is refuted, with range spreading 20.6% (and best speed 20.0%) across 27 hull-form combinations, though each constant alone moves range under 10%; propulsion is 0.33 to 0.37 of power at the best speed (theory for v^3 drag: 1/3). H5 is refuted: 0 rank swaps in 2,187 monohull-catamaran cases over 150 to 250 Wh/kg, because range is proportional to pack energy; a flip needs a term that is not.
- Milestone 4e (`experiments/run_auv_hotel_sourced.py`): against the sourced AUV hotel loads (8 W Tethys design estimate; 104 to 175 W implied for REMUS-class), the glider with a measured Seaglider load has the longer best range in 270 of 270 cases; the AUV wins only below about 0.4 to 1.7 W. Energy per metre, not time; no measured AUV budget found.
- Milestone 4c (REMUS-class AUV, hotel implied by vendor endurance): total power 125 to 188 W at 1.5 m/s, model
  propulsion 13 to 21 W, so the implied non-propulsion load is 104 to 175 W, 21 to 250 times the glider's swept
  0.7 to 5 W. The glider has the longer best range in 100% of 810 glider cases against all 18 AUV cases (median
  AUV/glider energy ratio 5.4). 4b's "decided by the power budgets" becomes "the glider wins on energy per metre
  unless the AUV's non-propulsion load is under about 5 to 24 W". Energy per metre is not time: the glider moves at
  0.2 m/s. Vendor figures are marketing and disagree with each other; the glider side is still swept.


- Milestone 3k (`experiments/run_michell_lowk.py`, 729 cases): Michell wave term with tank-bound form factors (k 0.03 to 0.15): the catamaran out-ranges the monohull in 7 cases (1.0%, milestone 2: 3.3%) and in 0 of 243 at equal length; all wins pair a 3 m monohull with a longer catamaran.
- Milestone 3i (`experiments/run_yacht_formfactor.py`): the 22 Delft yacht hulls imply a form factor of at most 0.06 (median, 10th to 90th percentile 0.03 to 0.13) at Fn 0.125, against 0.29 to 0.36 from Holtrop-Mennen's k1 and the programme's central 0.25: the 3g low-speed over-prediction is the form factor. Keeled yachts, wetted area from the HM regression, mirror unverified.
- Milestone 3g (Holtrop-Mennen vs 308 Delft yacht-series tank points, `experiments/run_holtrop_yacht.py`): HM is within 20% for 42% to 82% of points at Fn 0.2 to 0.3, but over-predicts residuary resistance 1.3 to 2.2 times (median) at Fn 0.125 to 0.2, the survey regime; swept Cm, Cwp, model length; yacht hulls with keels; exploratory.

- Milestone 4b (Slocum coefficients from `gliderflight`, 2,430 cases): at equal hotel load the glider has the
  longer best range in 0 cases (median AUV/glider energy ratio 0.36); the break-even AUV hotel load is a median
  4.9 times the glider's (10th to 90th 2.4 to 10.7), and the glider wins in 52% of cases at 5 times and 99.9% at
  20 times. The hotel-load reading of milestone 4 survives sourced aerodynamics; the measured hotel loads of a
  fielded glider and AUV are still the missing inputs.

- Milestone 4 (glider vs AUV, 52 kg, 19,683 swept cases, battery cancels): with the same hotel load the
  glider has the longer best range in only 5.9% of cases; it wins when the AUV's hotel load is 5 times the
  glider's (89%) or 20 times (100%). So the glider advantage is a hotel-load advantage, not a hydrodynamic
  one. The glider's horizontal speed tops out at 0.13 to 0.70 m/s (median 0.30) with a 10 N pump, so "glider
  loses above 1 m/s" is a capability limit, and H4's 0.4 to 0.9 m/s crossover is not supported (45 of 19,683
  cases). Not checked against a published glider range figure.

- Milestone 2 (Michell wave term, Wigley hulls): catamaran wins 216 of 6,561 cases (3.3%), none of
  729 equal-length cases at wave scale 0.5, 1, 1.5; median range ratio 0.87. Wave resistance is
  under 10% of viscous at the best-range speed (about 1 m/s, Fr 0.16) in 81.5% of cases; scaling
  it from 0 to 1.5 changes a 4 m monohull's range by 4%. Spacing barely matters at these speeds.
  Wave resistance is not validated against a tank curve.

- Catamaran wins 27 of 6,561 cases; median range ratio cat/mono 0.85 (0.72 to 1.02).
- Monohull range 560 to 1,188 km (upper bound: no waves, current, turns, reserve); best speed about 1 m/s.

- Deck-solar boat (milestone 5j, `experiments/run_solar_hull_uncertainty.py`): over 27 hulls in the milestone-1 box the best constant speed moves by 0.2 to 0.3 m/s, and running the central hull's best speed on another hull costs up to 9.1% of km/day (3 of 10 site-boat cases at 5% or more). Absolute km/day at the best speed spans about +-10% across the box (5 m Equator 109 to 133). Hull constants matter more than the surge rule of 5i (under 3%).
- Deck-solar sensitivity (milestone 5k, `experiments/run_solar_sensitivity.py`): one-at-a-time swings of six inputs over ranges I chose, not measured. Hotel load (19 to 50% of km/day), panel efficiency (16 to 30%) and derate (12 to 23%) move km/day 2 to 5 times more than the hull constants c_s and k_form (8 to 9%); the wave scale moves it 0.3 to 1.2%. Every input shifts the best speed by only 0.0 to 0.2 m/s. Source the hotel load and panel yield before the hull.
- Deck-solar joint interval (milestone 5m, `experiments/run_solar_mc.py`): drawing hotel load (5 to 20 W), panel efficiency (0.17 to 0.22) and three derate factors jointly (500 seeded draws, ranges partly my choices) gives 5 m km/day of about 133 / 125 / 97 / 77 / 69 (Equator, Florida, Gulf of Maine, North Sea, Gulf of Alaska), each within about -10/+9% (5% to 95%); the site ordering holds in 500 of 500 draws. It excludes the hull-constant uncertainty (5j, about +-10% more).

## Wing-sail drone (milestone 5a, `marine-sail`)

Does tack control matter for an autonomous sailing drone beating to windward? A first-order force-balance polar
(`src/marine_hull/sail.py`) plus three tack controllers on 24 h NOAA CO-OPS wind series (`src/marine_hull/tack.py`,
`experiments/run_sail_tack.py`). Headline (July holdout, 30 s tack loss, share of the ideal upwind progress): tacking at the
corridor edge reaches 83.7%, tacking when headed 87.6% (+3.2 points, positive at all 12 stations), a clairvoyant 99.7%. The
gap to the clairvoyant is about information, not the tack cost. Spatial wind fields and isochrone routing are not done. Full
numbers, limits and the predictions that failed: `LOG.md` (2026-11-04, milestone 5a).

Milestone 5b (negative): giving a receding-horizon controller a persistence, smoothed or even perfect forecast of the wind (up to the whole day, 5 to 15 minute planning blocks) recovers none of the roughly 12-point gap between the header-follower and the clairvoyant; the gap is minute-scale gust information. Caveat: the planner is not optimal. **Superseded by 5c below: the planner was the limit.** `LOG.md` (2026-11-04, milestone 5b), `experiments/results_sail_forecast*.txt`.

Milestone 5c (corrects 5a and 5b): the clairvoyant of 5a let the boat ride the corridor edge without tacking while every simulated controller had to tack there; with the same rule (`tack.dp_values`) the clairvoyant is 92.7% (July) rather than 99.7%, so about 7 of the 12 headroom points were an artefact. A full-day tack policy computed on wind smoothed to 15 minutes and executed on the true wind closes 93 to 95% of the rest (+5 points over the header-follower, 4.7 to 6.1 bootstrap), 60-minute smoothing keeps about 38%, 120-minute smoothing about 0 to 11%. It assumes a perfect day-long forecast of the slow wind; forecast error and lead are not modelled. `LOG.md` (2026-11-04, milestone 5c), `experiments/results_sail_policy.txt`, `experiments/run_sail_policy.py`.

Milestone 5d: 5c's gain needs forecast skill. Replanning hourly with a forecast that blends the 15-minute-smoothed truth with persistence (error e-folding time T), the policy keeps 16 to 20% of the +5 points at T = 30 min, 38 to 45% at 60, 51 to 58% at 120 and 62 to 68% at 240; pure persistence is below the header-follower (-0.2 Jan, -2.6 Jul points) and tacks 150 to 250 times a day. Synthetic error model, not an archived NWP forecast. `LOG.md` (milestone 5d), `experiments/results_sail_lead.txt`, `experiments/run_sail_lead.py`.

Milestones 5e to 5g (negative): hysteresis does not rescue the low-skill replanner. A proportional switch margin (0.02 to 2) is best at zero or within noise everywhere; a minimum dwell between voluntary tacks cuts tacks per day by 39 to 55% at T = 0 but loses 1.8 to 3.9 points to the header-follower, and at T = 120 even a 10-minute dwell costs 1.6 to 1.8 points. Below about 30 minutes of forecast skill, follow the headers. `LOG.md` (milestones 5e, 5f, 5g), `experiments/results_sail_margin.txt`, `results_sail_margin_fine.txt`, `results_sail_dwell.txt`. The paper draft (`paper/DRAFT.md`, section 2.5) now carries 5a to 5g.

- Wing-sail on archived HRRR (milestones 5h to 5j, `experiments/run_sail_hrrr*.py`): raw 3 km HRRR winds lose to following the headers (-2.9 Jan, -6.5 Jul points) and to persistence; a trailing-hour bias correction recovers about 2 points, and neither a longer window, a fade nor a station bias learned from other days lifts it above the header-follower (best -0.5 Jan / -3.0 Jul). Pier anemometers against 3 km cells. Milestone 5k repeats it at 9 to 10 open-water NDBC buoys: raw HRRR -0.8 (Jan) / -2.3 (Jul) points, corrected +0.0 / -0.9, so siting explained part of the loss but HRRR still only matches following the headers. Milestones 5l and 5m close two escape routes: a nowcast of buoy level plus HRRR trend only equals persistence (no variant beats the header-follower by more than 0.1 points), and correcting buoy anemometer height to 10 m shrinks the speed bias but leaves the gap (-0.8 to -1.0 Jan, -1.7 to -1.9 Jul). Milestone 5n tests latency on hourly cycles: 1 h against 3 h delivery changes raw HRRR by only +0.2 points in both months (bias-corrected 1 h: +0.1 Jan, -0.6 Jul against the header-follower), so delivery lag is not the cause and the archived-NWP branch is closed. Milestone 6h (exploratory) compares wind and sun on a free course: the default drone reaches 1 m/s at 1.5 m/s of wind and covers a median 272 (Jan) / 219 (Jul) km/day on 19 buoy-months of real wind, against the solar boat's 86 km/day ceiling (`experiments/run_wind_vs_sun.py`); unsourced drone parameters, upper bound.

## Limitations

Seawater properties, efficiencies, form factors and wave term are unsourced or swept; no published
resistance curve has been reproduced yet (Michell's absolute level is unchecked); stability, deck area and payload are not
modelled. Simulation only: nothing here has been built or tested in water. Any real operation needs
the flag state's and local authority's rules (COLREGs, harbour master, permits).

## Next steps

Milestone 3 (Holtrop-Mennen is implemented, `src/marine_hull/holtrop.py`, and run on one Wigley tank point: +19% to +24% on its own area with the m2 low-speed wave form (the m4 alternative moves total resistance by at most 2.4%, LOG 3e and 3f); coefficients checked against the 1982 worked example (LOG 3k, which fixed an inverted lambda branch; figures here are the post-fix ones), see LOG 3c to 3k; a small-hull tank curve is still needed; LOG 3m checked `michell.py` against an independent fine integral, within 0.01%, and read a six-point Kajitani CT curve second-hand; LOG 3n then opened the primary Table 5 (Ahmed et al. 2015): model length 1.00 m, implied form factor -0.04 (-0.13 to +0.05), but the paper's reference area is ambiguous (0.135 listed, 0.0771 implied by its CFX columns), so the curve is not yet reproduced to a stated error) and milestones 5 to 7 in the proposal; the measured hotel load of a fielded glider and AUV is the number milestone 4 needs most. AI-assisted (Claude Code).

Milestone 6k (check against a fielded drone): Saildrone SD 1020 averaged 112 km/day over its 196-day, 22,000 km Antarctic circumnavigation (2019, vendor release). The wind-driven drone model of 6h to 6j gives 179 to 272 km/day on buoy winds and 303 km/day at Southern Ocean wind, so it is an upper bound by a factor of 2 to 3, and the 6h wind-over-sun margin is overstated by about that much. The fielded mean is still 1.3 times the solar ceiling. One vehicle, one press-release figure; `experiments/run_fielded_check.py`, `LOG.md`.

Milestone 6l (864 fielded drone-days): NOAA's west-coast Saildrone surveys (13 drones, 2018 and 2019, each drone's own wind) give a median 75 km/day. The 6h drone model sailing the same wind and course gives 2.5 times that (observed/model median 0.40; 0.33 against a free beam reach, rising from 0.28 below 4 m/s of wind to 0.60 above 10), and even the 99th percentile 10-minute block stays under 0.82 of the model at 4 to 12 m/s. Scaled by 0.33, the buoy corridor medians fall to 79 km/day (January) and 60 (July) against the 86 km/day solar ceiling, so 6h's wind-over-sun margin is gone and the ranking is open. Survey missions, not capability trials; Explorer 7 m against a 5 m model with unsourced parameters; `experiments/run_saildrone_daily.py`, `LOG.md`.

Milestone 6m (fit on 2018, test on 2019): fitting the drone's sail area (0.45 m2 against the default 5; hull drag unchanged, and the two are not separately identified) to cell-mean SOG of the 2018 Saildrone blocks cuts the unseen-2019 daily-distance error from 2.4 times observed (default) to 0.89 (10th to 90th 0.68 to 1.18; median absolute error 0.15 against 0.24 for the 0.33 scalar). Re-running the buoy winds with it: corridor median 100 km/day in January (1.16 times the 86 km/day solar ceiling) and 62 in July (0.72 times), no buoy-month at 2x solar. The wind drone has a thin edge in winter and none in summer at these sites; the drone is a survey-mission drone, not a capability bound. `experiments/run_saildrone_fit.py`, `LOG.md`.

Milestone 6o (capability drone): re-running the buoy winds with 6n's capability drone (0.90 m2, hull drag x1.2) gives a corridor median of 126 km/day in January (1.47 times the 86 km/day solar ceiling) and 80 in July (0.93 times), 1.26 to 1.29 times 6m's mission drone, and still no buoy-month at 2x solar (0 of 19). The wind drone's winter edge is 1.2 to 1.5 times the solar ceiling; in July it is level. `experiments/run_wind_vs_sun_capability.py`, `LOG.md`.
