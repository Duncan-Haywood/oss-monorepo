# Draft: which hull carries a small survey boat furthest per kWh, and how much of the answer is the drag model?

Status: **milestone 7b/7f: introduction, model, results-table and wind-against-sun section drafted, not submittable.** Every number below is copied from
[`../LOG.md`](../LOG.md) and the `experiments/results_*.txt` file named beside it. Nothing is new
in this file. Target: OCEANS (IEEE/MTS), 6 to 10 pages. The hull constants are unvalidated against
tank data (milestone 3 is open), and that gap decides what the paper can claim, as section 5 says.

## 1. Claim the paper can currently support

For a 200 kg, 4 to 5 m survey craft on stored energy plus deck solar, the **ranking of body types
is robust to the unsourced inputs, and the absolute range is not**:

- Ranking (2,916 to 6,561 swept cases per rung): catamaran out-ranges the monohull in 3.3% of
  6,561 cases and none at equal length (`results_michell.txt`); SWATH in 0 of 4,374
  (`results_swath.txt`); planing hull 0 of 48 (`results_planing.txt`); hydrofoil 0 of 2,916
  (`results_foil.txt`).
- Form-factor check: with k_form and k_cat from the Delft yacht tank bound (0.03 to 0.15) the catamaran wins 0 of 6,561 cases (median range ratio 0.85, max 0.97; `results_lowk.txt`); the earlier 27 wins came from a k = 0.4 monohull against a k = 0.1 catamaran.
- Wave-model cross-check: with the Michell thin-ship wave term in place of the placeholder and the same tank-bound k box (729 cases), the catamaran out-ranges the monohull in 7 (1.0%) and in 0 of 243 at equal length (range ratio min 0.73, median 0.86, max 1.02; `results_michell_lowk.txt`). All 7 wins pair the 3 m monohull with a 4 or 5 m catamaran at zero interference, so they are a length effect, not a hull-type effect. The prediction (0 equal-length wins) was logged before the run (LOG 3k).
- Glider against propeller AUV: the glider wins on energy per metre only through hotel load. At
  equal hotel load it wins 0 of 2,430 cases with Slocum coefficients (`results_slocum.txt`); against
  a REMUS-100-class AUV whose non-propulsion load is read from vendor endurance (104 to 175 W) it
  wins all cases, at about a tenth of the speed (`results_remus.txt`).
- Absolute range: with every power-side input drawn jointly from its range, 5 m km/day at five
  NASA POWER sites is about 133 / 125 / 97 / 77 / 69 (Equator to Gulf of Alaska), each within
  roughly +-10% (`results_solar_mc.txt`); the unsourced hull box adds another +-10%
  (`results_solar_hull_uncertainty.txt`). Site ordering held in 500 of 500 draws.

## 2. Drafted sections (milestone 7b)

Prose below is a draft of paper sections 1 to 3. Every figure is quoted from `../LOG.md`; no
experiment was run for this text. Citations are the PROPOSAL.md list and still need the open-and-read
pass its "Citation status" describes.

### 2.1 Introduction (draft)

Small autonomous survey craft of 100 to 500 kg are usually chosen for deck area and stability, not
endurance. If the payload's fixed power draw dominates at survey speed, the hull matters little;
if not, it matters a great deal. Published comparisons fix one resistance method and one vehicle
(Manley 2008; Liu et al. 2016), and the regression methods in common use (Holtrop and Mennen 1982)
were fitted to ships of tens of metres. We put the hull types on one energy basis, a 200 kg craft
with a 25% battery mass fraction, and sweep every input we cannot source, so that the result is
the region where the ranking holds rather than one number. Contributions, stated narrowly:
(i) a common energy-per-kilometre comparison of seven body types with every unsourced input swept
and every sourced one named; (ii) the finding that the ranking is stable where absolute range is
not; (iii) a first contact with tank data, one Wigley point, showing the swept form-factor box is
conservative for slender hulls; (iv) a seeded, one-command-per-table artefact.

### 2.2 Model (draft)

Displacement hulls: ITTC 1957 friction line times a form factor (1 + k), plus Michell thin-ship
wave resistance for Wigley hulls, with Havelock two-hull interference for the catamaran. Planing:
Savitsky (1964) prismatic surface, no mean-bottom-speed correction. Hydrofoil: Prandtl lifting
line plus flat-plate struts, no ventilation. Glider: steady glide at best-glide incidence with
pump work B tan(gamma) / (2 eta) per metre, independent of dive depth; the AUV is a same-mass,
same-battery propeller body. Range is battery energy over (propulsive power / efficiency + hotel
load) times speed, maximised over speed. Deck solar adds a daily-mean harvest with NASA POWER
insolation at five sites. All coefficients that are not sourced are swept on a grid or drawn jointly
(milestone 5m).

### 2.3 Headline results (draft table, 200 kg, 25% battery, 30 W hotel unless stated)

| Rung compared with the 4 m Wigley monohull | Cases | Wins over monohull | Source |
|---|---|---|---|
| Catamaran (Michell + Havelock) | 6,561 | 216 (3.3%); 0 of 729 equal-length | `results_michell.txt` |
| SWATH | 4,374 | 0 | `results_swath.txt` |
| Planing (Savitsky) | 48 | 0 | `results_planing.txt` |
| Hydrofoil | 2,916 | 0 (foil/mono range ratio 0.064 to 0.248 where foilborne) | `results_foil.txt` |
| Glider vs AUV, equal hotel, Slocum coefficients | 2,430 | glider 0 | `results_slocum.txt` |
| Glider vs REMUS-100-class AUV, vendor hotel 104 to 175 W | 810 glider cases per AUV power row | glider longer in 100% of rows (total AUV power 125 to 188 W) | `results_remus.txt` |

Monohull best range 560 to 1,188 km (median 836 km) at a median 1.05 m/s in the milestone-1 box.
Hypotheses: H1 refuted as stated (milestone 7c: range spreads 20.6% over 27 hull-form combinations, each constant alone under 10%; propulsion is 0.33 to 0.37 of power at the best speed); H2 held; H3 neither supported nor refuted (milestone 3c: Holtrop-Mennen on the one published Wigley tank point is +17% to +22% with its own wetted-area regression, +31% to +37% with the true area (with the m2 low-speed wave form; milestone 3e found that the alternative m4 form used by two public implementations moves CW by at most about 12% and CT by 2.4% over Fn 0.10 to 0.40, and 3f found a third implementation, the US EPA ship power model, using m2, so m2 is the default but the form is not settled against the paper), at the 20% line; one hull, a second-hand tank value, coefficients not checked against the 1982 paper; `results_holtrop.txt`); milestone 3g added 308 Delft yacht-series tank points (`results_holtrop_yacht.txt`, exploratory): at Fn 0.2 to 0.3 HM is within 20% for 44% to 79% of points, but at Fn 0.125 to 0.2, the survey regime, it over-predicts residuary resistance by a median 1.3 to 2.2 times in every swept case (absolute gap about 0.4 per mille of weight at Fn 0.15), so H3 is partly supported at low Fn and not at Fn 0.2 to 0.3; the points are keeled sailing yachts, Cm and Cwp are swept not known, and the data file is a public mirror, structurally checked (22 hulls x 14 Fn, Rr monotone in Fn, milestone 3h) but not compared with the 1981 paper; H4 "crossover
in 0.4 to 0.9 m/s" refuted, with the glider's edge being a hotel-load edge (break-even AUV hotel
multiple median 4.87); H5 refuted (0 mono/catamaran rank swaps in 2,187 cases over 150 to 250 Wh/kg, because range is proportional to pack energy; a flip needs a term that is not).
Milestones 7d and 7e (exploratory, no predictions logged first) test the term that could break that proportionality, a fixed energy per mission. Mono against catamaran: at equal overhead the catamaran is ahead in 9 of 2,187 cases (0.4%), and an extra catamaran overhead of 100 Wh swaps the order in 3 (0.1%), none at 250 Wh and above (`results_h5_overhead.txt`). Glider against propeller AUV (19,683 cases, 10 kg pack at 150 to 250 Wh/kg): the glider has the lower energy per metre in 65.0% of cases; with equal overhead there are 0 swaps, but a glider-only fixed energy of 100 / 250 / 500 / 1,000 Wh swaps 0.7% / 2.3% / 6.0% / 20% of cases (`results_h5_glider.txt`). So H5 stays refuted for hulls, and for glider against AUV it is conditional on a mission overhead (ballasting, surfacing, GPS fixes) that is not sourced: a search for a per-surfacing energy figure (2026-11-01) found only the Sentinel datasheet's 25.2 kWh capacity and no Wh-per-surfacing number, so the Teledyne operator manual or a Slocum G2 battery study is the next source to open. A later arithmetic check (7g, `results_iridium_overhead.txt`) with the Spray glider's Iridium cost (40 J first kB, 30 J per further kB, taken from a search excerpt of the vendor page, not opened) gives 4.4 Wh for 100 surfacings of 5 kB and about 2,250 surfacings to reach 100 Wh, so link energy alone is far below the overhead that flips the order; surface GPS and surface hotel load remain unsourced.

Milestones 4c to 4g (measured inputs replace the swept glider and current terms; numbers from `../LOG.md` and the files named): with the dive energy of a Slocum G2 bench test (13.9 to 17.4 kJ per inflection, MARTECH 2025) the glider needs an AUV hotel load of a median 7.19 times its own to win on range (4b, swept dive energy: 4.87; `results_slocum_socib.txt`). A measured Seaglider dive budget (hotel 0.095 W, 0 to 1.35 kJ dive electronics; Ocean Science preprint os-2019-36, one slow dive the authors chose) puts the break-even AUV hotel at a median 0.36 to 0.54 W (`results_seaglider_budget.txt`), and against sourced AUV loads (8 W Tethys design estimate, 104 to 175 W REMUS implied from vendor endurance) the glider has the longer range in 270 of 270 cases per row (`results_auv_hotel_sourced.txt`). That is energy per metre only: on one 1.5 kWh pack the glider's median range is 2,919 km in 164 days against 363 to 445 km in about 5 days for the 8 W AUV, i.e. 7 to 70 times the range for roughly 33 to 550 times the days (`results_endurance_days.txt`; absolute glider days are not a fielded figure because the pack is a REMUS pack). Currents: weighted by OSCAR surface currents (6,377 ocean points, 13 dates of 2013), the median speed is 0.126 m/s and 30.1% of the ocean exceeds 0.2 m/s; with the whole current cross-track the glider cannot hold its track in 29.6% of the ocean and keeps lower energy per ground metre than the AUV in 69.0% of triples, at a random heading 16.5% and 82.5% (`results_current_oscar.txt`). OSCAR is smoothed and understates shelf and tidal currents, where survey work is done, so these are open-ocean figures. Observed coastal currents (NOAA CO-OPS PORTS, 64 US stations, January 2024, 6-minute readings; `results_current_coops.txt`) are much stronger: median 0.303 m/s, 63.5% of readings above 0.2 m/s, and the glider cannot hold its track in 61.1% of readings in the worst case (41.6% at a random heading), keeping lower energy per ground metre than the AUV in 38.0% (57.4%) of triples. Split by each station's own median speed (`results_current_coops_regimes.txt`): in 18 calm stations (median at or below 0.2 m/s) the worst-case stall share is 31.6% and the glider wins 67.1%; in 30 moderate stations (0.2 to 0.5) 66.6% and 32.5%; in 16 strong stations (above 0.5) 84.0% and 15.6%. Only the calm group keeps a majority glider win in the worst case. The stations are ports, channels and bay entrances chosen for navigation, so they overstate a typical shelf survey; one winter month; the groups are formed and evaluated on the same data, thresholds not sensitivity-checked; stall persistence (how long a glider is held) is not measured because only percentile summaries are kept. Net for H4: the glider's range advantage is robust to every AUV hotel load found, but it is a persistence advantage that costs days and fails in strong currents, so for a survey with a deadline or a boundary-current site the AUV is the answer.

### 2.5 Wing-sail drone: what tack control and forecasts are worth (milestones 5a to 5g; numbers copied from `../LOG.md` and the files named)

A first-order wing-sail polar (`src/marine_hull/sail.py`, every drone parameter swept, no vendor polar) and tack controllers run on 24 h windows of NOAA CO-OPS observed 6-minute wind (Jan and Jul 2024, 15 coastal stations), with a +-1.5 km corridor to a mark dead to windward and a 30 s tack loss. Results are shares of the no-corridor, no-tack-cost bound; wind is uniform in space.

- **5a.** Corridor-edge tacking 83.7% (July), header-following 87.6% (+3.2 points, bootstrap 2.7 to 3.7, positive at all 12 stations). The 5a clairvoyant (99.7%) and 5b's finding that no forecast helps were both corrected by 5c.
- **5c.** The clairvoyant rode the corridor edge without tacking; with the same edge rule it is 92.7%. A full-day policy on 15-minute-smoothed wind, executed on the true wind, gives about +5 points over the header-follower (4.7 to 6.1); 60-minute smoothing keeps about 38%, 120-minute about 0 to 11%. `results_sail_policy.txt`.
- **5d.** With hourly replanning on a synthetic forecast whose error has e-folding time T, the policy keeps 16 to 20% of the +5 points at T = 30 min, 38 to 45% at 60, 51 to 58% at 120 and 62 to 68% at 240. Pure persistence loses to the header-follower (-0.2 Jan, -2.6 Jul) and tacks 150 to 250 times a day. `results_sail_lead.txt`.
- **5e to 5g (negative).** Neither a proportional switch margin (0.02 to 2 step-equivalents; margin 0 is best or within noise everywhere, T = 120: +3.4 Jan / +3.3 Jul, margin 1: -1.9 / -2.0) nor a minimum dwell between voluntary tacks (D = 10 to 80 min) rescues the low-skill rows. At T = 0 the best dwell cuts tacks per day by 55% (Jan, 166 to 74) and 39% (Jul, 248 to 152) but progress falls 1.8 to 3.9 points below the header-follower, and at T = 120 D = 10 already costs 1.6 to 1.8 points. Tack count is not the cost driver; below about 30 minutes of forecast skill the header-follower is the better rule. `results_sail_margin.txt`, `results_sail_margin_fine.txt`, `results_sail_dwell.txt`.

- **5h to 5j (real archived forecast, negative).** Replacing the synthetic error model with archived HRRR 10 m winds (3 km cell, newest cycle issued 3 h before the replan, 12 stations, every 4th day of Jan and Jul 2024): raw HRRR is 2.9 (Jan) and 6.5 (Jul) points below the header-follower and below persistence. A trailing-hour speed-ratio and direction correction recovers about 2 points (-0.5 / -3.0 against the header-follower); a 3 h window is worse (lag), fading the correction adds at most 0.6 over the 1 h version, and a station bias learned from the other windows is worse again (-1.0 / -4.5, with more tacks). The HRRR error against the stations is a site mismatch (mean absolute speed error 1.7 to 2.0 m/s, direction 32 to 41 degrees, no growth with lead), not forecast decay. Reading: the 5d requirement of 1 to 2 hours of skill at 15-minute scale is not met by a gridded 3 km model compared against pier anemometers; whether it is met over open water is untested (`LOG.md` 5h, 5i, 5j; `experiments/results_sail_hrrr*.txt`). **5k (open water).** The same test at 9 to 10 NDBC buoys (Jan, Jul 2024, 72 and 80 windows): raw HRRR is 0.8 (Jan) and 2.3 (Jul) points below the header-follower, the trailing-hour correction brings it to +0.0 and -0.9, and persistence is +0.0 and -0.2, against +2.1 and +2.4 for the 5d synthetic forecast; direction error falls to 24 to 30 degrees. Siting explained part of the pier loss, but over open water HRRR still only matches following the headers (`LOG.md` 5k; `experiments/results_sail_hrrr_buoy.txt`). **5l and 5m (nowcast and height, negative).** Letting the buoy supply the level and HRRR only the change since the replan (a trend nowcast) lifts it to level with persistence but not above it (trend minus persistence +0.2 Jan, -0.2 Jul; no variant beats the header-follower by more than 0.1 points). Scaling the buoy winds from 4 to 5 m up to 10 m with a neutral log law cuts the speed bias from +0.6 to +0.9 m/s to +0.1 to +0.4 but moves raw HRRR only from -0.8 / -2.3 to -0.8 to -1.0 / -1.7 to -1.9 points against the header-follower (heights swept, not sourced per buoy). Direction error and day-to-day shifts carry the gap, so archived 3 km HRRR adds nothing over following the headers at these buoys (`LOG.md` 5l, 5m; `experiments/results_sail_hrrr_trend.txt`, `results_sail_hrrr_buoy_z4.txt`, `_z5.txt`).

- **5n (latency, negative).** On every hourly HRRR cycle, replanning with a 1 h instead of 3 h delivery latency changes raw HRRR by +0.2 points in January and July (bootstrap intervals include 0.5 only in neither month); bias-corrected 1 h HRRR is +0.1 (Jan) and -0.6 (Jul) points against the header-follower. Forecast hours beyond 18 are held flat (hourly cycles stop there).

- **6h (wind against sun, exploratory).** On 19 buoy-months of NDBC wind the default drone (unsourced parameters) reaches 1 m/s at 1.5 m/s of wind and sails a median 272 (Jan) / 219 (Jul) km/day on a free course, against 86 km/day for the solar boat held at 1 m/s; only calm summer water (buoy 42036, July: 0.83 of days) lets the sun compete. A bound without heel, waves or survey lines; `experiments/results_wind_vs_sun.txt`.

Limits: the error model is synthetic (no archived NWP winds yet), the tack penalty is the only tack cost, wind is spatially uniform, and heel, waves and currents are absent. A reader should take the +5 points as an upper bound that needs roughly 1 to 2 hours of forecast skill.

### 2.6 Wind against sun, checked on fielded drones (milestones 6l to 6o; numbers copied from `../LOG.md` and the files named)

Milestone 6h's "wind beats sun 2 to 3 times" used an unsourced drone. 6l to 6o replace it with a drone fitted to NOAA PMEL ERDDAP Saildrone tracks (CC0; 2018: five drones, 2019: eight; 131,535 ten-minute blocks) and re-run the comparison on 19 NDBC buoy-months. Fit on 2018, test on 2019, throughout.

- **6l (the default drone is too fast).** 864 drone-days: observed median 75 km/day (10th 35, 90th 156) at a median daily wind of 4.7 m/s. Observed over model-default is 0.33 (0.23 to 0.53), rising from 0.28 below 4 m/s to 0.60 above 10 m/s. `results_saildrone_daily.txt`.
- **6m (mission drone).** Two parameters (sail area, hull-drag multiplier) fitted to cell-mean SOG: sail area 0.45 m2, hull scale 1.0. On 2019 the model over observed daily distance is 0.89 (10th to 90th 0.68 to 1.18), flat across winds; the default was 2.39. Area and hull drag lie in a valley and are not separately identified. On buoy winds: corridor median 100 km/day (Jan) and 62 (Jul), against the 86 km/day solar ceiling (1.16 and 0.72 times). `results_saildrone_fit.txt`, `results_wind_vs_sun_corridor_fitted.txt`.
- **6n (capability drone).** Fitted to the 90th-percentile SOG per cell: sail area 0.90 m2, hull scale 1.20. It is not a true bound: it covers 68% of 2019 blocks (54% below 4 m/s, 75 to 76% above) where 90% was predicted, so the light-air coverage prediction held and the overall one was refuted. An independent second implementation (6n-b) lands in the same valley and finds 31% of blocks above the curve where 10% should be. `results_saildrone_capability.txt`, `results_saildrone_cap.txt`.
- **6o (ranking).** Capability drone on the buoy winds: corridor median 126 km/day (Jan, min 104) and 80 (Jul, min 45), 1.47 and 0.93 times solar; 0 of 19 buoy-months reach 2 times solar (the unfitted drone reached it in 15). `results_wind_vs_sun_capability.txt`.

Reading: the wind drone beats the solar ceiling by 1.2 to 1.5 times in winter and is level with it or behind in July. Limits: SOG includes current (the model ignores it, and it dominates below 4 m/s); buoy anemometer heights are uncorrected; tack cost is zero; the 86 km/day ceiling is itself an upper bound; the fit is Explorer-class drones on the US West Coast in two summers applied to Atlantic, Gulf and Pacific buoys in January and July. The result ranks the two sources as close; it does not settle which is better.

## 2.4 Still to write

4. Sensitivity: input ranking hotel > eta_pv > derate > c_s > k_form > wave scale
   (`results_solar_sensitivity.txt`); best speed moves 0.0 to 0.2 m/s per input while km/day moves
   up to 50%.
5. **Threats to validity**, to be written in full: wave term compared with one published Wigley tank point only (milestone 3a: no-form-factor model within +1 to +5%, central k = 0.25 about 20% high, so the hull box is conservative for slender hulls; one speed cannot separate wave term from form factor); Holtrop-Mennen run on one slender hull plus 22 keeled yacht hulls (milestone 3g; a mirror copy of the table, unverified against the paper, no fuller keel-less survey hull yet); the implied form factor at Fn 0.125 on those yachts is a median 0.06 (HM k1 median 0.29 to 0.36, milestone 3i), and rerunning the milestone-1 box with k in {0.03, 0.08, 0.15} leaves H2 held, 0 of 6,561 catamaran wins (milestone 3j, `results_lowk.txt`), but the k bound comes from keeled yachts only, with coefficients typed from memory and compared with three public implementations (read, not run; they disagree on the low-speed wave form, 3e and 3f), never checked against the 1982 or 1984 papers, which no reachable host served (milestone 3c; at survey Froude numbers it sits within 3 to 6% of the Michell + ITTC k = 0.25 model, so rankings are not moved, but the excess over the tank point is form factor 1+k1 and correlation allowance CA, not waves); hotel-load and module sources opened only as search snippets;
   derate, soiling and temperature factors are the author's ranges; glider and foil coefficients
   partly swept; no seakeeping or stability; sea-state loss only as a free resistance multiplier (milestone 6a: f = 2 costs 21% of km/day, shifts the best speed down 0.2 to 0.3 m/s, keeps the site ordering; running the calm-water speed in f = 2 water loses 12 to 27%; milestones 6b/6c: a day-by-day back-off beats the best constant speed by 3 to 8% with a 10 kWh pack and up to 15% with a 1 kWh pack when rough spells last a week, as an in-sample perfect-foresight upper bound with swept, not sourced, spell lengths); milestone 6d: a forecast of finite skill recovers only part of that bound, about a third of the gain at 75% of days called correctly and more than half only near 87%, with independent errors and skill swept, not sourced; milestone 6e: a no-parameter persistence call, yesterday's sea state, recovers 0.68 to 0.80 of the gap at 7-day spells, hit rate 0.85, because its errors fall on spell boundaries; its spell-1 cells are a deterministic alternation of the Markov chain and must not be quoted; milestone 6f: on a genuinely iid sea the same call has hit rate 0.50 and recovers a median 0.06 of the gap, rising to 0.28 at 3-day and 0.75 at 7-day spells; milestone 6g: with three sea states the shares are 0.10, 0.48 and 0.89 at hit rates 0.34, 0.67 and 0.90, so the shape carries over, though the chain's spell lengths differ from 6f's).

## 3. What would make it submittable

1. Milestone 3: one published small-hull resistance *curve* (Wigley or a tank series) reproduced to
   a stated error (one point, Ju 1983 via Wang et al. 2017, is done: milestone 3a; zenodo.org was reachable). Data hosts tried and refused or unreachable from the session: eprints.soton.ac.uk
   (401), jtse.utm.my (connection reset), mdpi.com and jmr.unican.es (earlier sessions).
   A run with a reachable host, or the owner supplying a table, unblocks it.
2. Open and cite the Wave Glider sheet, the module datasheets and the Renewable Energy 2022 paper
   instead of the snippets.
3. Sea-state resistance added to the solar-range model (milestone 6).
