# What does a 1:N model of a cargo UAV tell you about the 1:1 aircraft?

**Status: open research programme, milestones 1 to 11e done in part (see below).** A stdlib Froude-scaling calculator
(`src/aerolog_scaling/`, 9 tests) and a first-order result: for a 1,000 kg, aspect-ratio-10 cargo
fixed-wing, the 1:10 model needs **1.27x** the power that Froude scaling predicts (1.17 to 1.35
over drag and aspect-ratio sweeps) because Reynolds number falls as n^1.5 and skin friction rises.
Flat-plate drag only: preliminary, and the proposal's hypotheses H1 to H5 are still open. See
[`PROPOSAL.md`](PROPOSAL.md) and [`LOG.md`](LOG.md).

**Live page:** https://marisstella.app/research/aerolog-scaling/

**Programme.** Track 22 (`aerolog`, autonomous flying machines for commercial logistics) in
[`../PROJECTS.md`](../PROJECTS.md), at both sizes: scale models and the full-size aircraft. This
directory asks which quantities a dynamically scaled model reproduces and which it misses.

## Method and reproduce

```bash
cd research/aerolog-scaling
PYTHONPATH=src python3 -m pytest tests -q          # 9 tests, under 1 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt
```

`scaling.py` holds the ISA atmosphere, Sutherland viscosity, the Froude exponent table, Schlichting
flat-plate skin friction (laminar, turbulent, mixed), a drag-polar cruise point and a Breguet-type
battery fraction. Results: [`experiments/results.txt`](experiments/results.txt).

## Results (preliminary)

| n | Re (mac) | L/D | power / (n^3.5 x full), tripped |
|---|---|---|---|
| 1 | 3.1e6 | 22.8 | 1.00 |
| 0.2 | 2.7e5 | 19.7 | 1.16 |
| 0.1 | 9.7e4 | 18.0 | 1.27 |
| 0.05 | 3.4e4 | 16.1 | 1.42 |

An untripped model with attached laminar flow looks *better* than full scale near Re 3e5, which real
wings do not do (separation); that is a limit of the flat-plate model, not a finding.
Range scaled with length also means a model at fixed cell specific energy has much more battery
margin per body length (0.13x at n = 0.1), so scaled endurance does not test the full-size energy budget.

**Airfoil polars (milestone 4a, `experiments/airfoil_polars/`).** With NeuralFoil polars for a NACA 4412
in place of the flat plate, the 1:10 model needs 1.29 to 1.45 times the Froude-predicted power
(three boundary-layer states) and loses 0.37 to 0.52 of CLmax; both support H2 and H3 for a clean 2D
section. At 1:5 the power ratio is 1.11 to 1.19. The surrogate is unvalidated here and not usable at 1:20.

**Longitudinal modes (milestone 3a, `experiments/longitudinal_modes/`).** A 4-state longitudinal model with
NeuralFoil polars at each surface's own Reynolds number. For a tripped boundary layer at 1:10, the model flown
at the full-size trim angle trims 6.5% faster in Froude units (H1 refuted: bar 5%) and its short-period
frequency rises 5.1%; flown at the full-size CL, speed is matched and the frequencies stay within 1.3%, but
short-period damping falls 6.3%. With free transition at 1:10 (Re 1e5) the short period turns overdamped, a
laminar-bubble regime the surrogate is not trusted in. Phugoid damping is not reported: it is unstable even
at full size in this model and depends on the thrust law (milestones 5c, 5d: real part of the full-size phugoid +0.0127 at constant thrust, +0.0087 at constant power, +0.0037 at the measured fixed-RPM slope; more damped by 0.0065 to 0.0083 at n = 0.2). `experiments/thrust_phugoid_power/`. Gust response (milestones 9a, 9b): the similar model keeps the peak load-factor increment within 2% but is 27 to 33% high in peak pitch rate; with the tail redesigned, 24 of the 78 mode-matched designs match all three gust peaks within 5% at all three gust lengths (best 1.2%). Milestone 9c: that match does not survive a tail slope 0.75 to 1.0 of the surrogate's; none of the 78 keeps the gust peaks within 10% at every scale (median worst error 21.5% at 0.75), and the gust metrics are more sensitive than the modes.

**Propeller efficiency (milestone 5a, `experiments/propeller_efficiency/`).** From 151 measured efficiency
curves of 34 APC propellers in the UIUC Propeller Database (Re at 0.75 R from 1.5e4 to 1.2e5), peak efficiency
rises with blade Reynolds number in 97% of propellers (mean 0.21 per decade of Re, bootstrap CI 0.18 to 0.23).
Across all curves, mean peak efficiency is 0.603 at Re 2e4 to 4e4 and 0.669 at 8e4 to 1.6e5. Saturating fits
(Re^-0.5 and Re^-0.2) put the fall from Re 1e5 to 3.2e4 (inside the data) at 9.9 and 10.3 points, so the
direction of H4 is supported and 10 points is about the size of the effect at n = 0.1 for a model whose
propeller sits near Re 1e5. The full-size side (Re about 1e6, an assumed figure) is outside the database, so
the n = 0.1 gap there (19 to 25 points from the fits, 31 from a straight line) is an extrapolation and is not reported as a result.
Re is confounded with RPM within a propeller (advance ratio at peak and tip Mach move too).
Data: Brandt and Selig, "Propeller Performance Data at Low Reynolds Numbers", AIAA 2011-1255; UIUC Propeller Data Site, https://m-selig.ae.illinois.edu/props/propDB.html.

**Propeller thrust law (milestone 5b, `experiments/propeller_thrust_slope/`).** At fixed RPM the thrust-speed slope is dlnCT/dlnJ; from 137 measured APC curves it is -2.25 at peak efficiency (5th/95th percentile -2.86 / -1.54) and shows no detectable Reynolds dependence within propellers (+0.23 per decade, 95% interval [-0.24, 0.73]). Preliminary: not yet in the mode model.

**Measured electrical power against mass (milestone 6a, `experiments/rodrigues_energy/`).** On 134 cruise
flights of a DJI Matrice 100 (Rodrigues et al., *Patterns* 2022; data CC BY 4.0, Figshare
10.1184/R1/12683453.v1), electrical power scales with takeoff mass to the power **1.54** (95% bootstrap interval
over flights 1.41 to 1.67, speed and wind as covariates), consistent with the m^1.5 of rotor momentum theory
that Froude scaling turns into n^3.5. Electrical cruise power is 1.85 times the ideal induced power at every
payload (0, 250, 500 g), and falls 10% from 4 to 12 m/s (translational lift). This is a check inside one
airframe over a 13.6% mass range, not across scale; payload is partly confounded with flight day (density not
logged) and the interval resamples flights, not days. Data: Rodrigues et al., doi:10.1184/R1/12683453.v1.

**Correction search (milestone 7a, `experiments/correction_search/`).** At n = 0.2 the uncorrected model (same NACA 4412)
needs 1.157x the Froude power (free transition; 1.383 tripped). A search of 178 section and boundary-layer cases
(158 NACA 4-digit, 10 low-Reynolds sections, free or tripped, CL within +/-6%, lift-curve slope within 5%) finds none
within 5%: the best is **1.086**, a thin cambered section left untripped. H5 is refuted in this design space, which
holds geometric similarity; the polars are NeuralFoil, not yet checked against measured data.

**Non-similar corrections (milestone 7b, `experiments/nonsimilar_search/`).** Allowing wing area and aspect ratio to
depart from similarity reverses 7a: 17 of 144 (section, area factor, aspect ratio) cases match Froude power within 5%
at n = 0.2 (NACA 4412 with 1.3x the similar area: 0.996). Most do so by running 17 to 33% lower CL; only two also keep CL
within 6% and the finite-wing lift slope within 5% (e.g. NACA 5406, AR 12: 0.967). These are power matches at the trim
point, not corrections of the physics, and the polars are still NeuralFoil, unchecked against measured data.

**Do the matches keep the flight dynamics? (milestone 7c, `experiments/nonsimilar_modes/`).** No. Putting the 17 power
matches through the longitudinal-mode model, none keeps phugoid frequency, short-period frequency and damping within 5%
of the full-size aircraft (best worst-case deviation 15.5%); the two that passed the 7b proxies sit at +18% short-period
frequency and about -10% damping. The shift is the same in every case, including the uncorrected similar model
(+15%): it comes from the tail, whose Reynolds number is 1.7e5 at n = 0.2, not from the wing. So wing-only corrections
fix power but not the short period; the next step searches the tail (7d). NeuralFoil slope at that Re is unchecked.

**Energy per package against a diesel truck (milestone 2a, `experiments/energy_per_package/`).** On the same 134 Matrice 100
cruise flights, electrical energy per metre falls steeply with speed: 127 J/m at 4 m/s, 63 at 8, 48 at 10 (bootstrap CIs over
flights in `results.txt`). Costing a round trip (loaded out, empty back) at 8 and 10 m/s and comparing it with Stolaroff et al.'s
(2018) diesel truck (7.8 MJ per package, 151 packages per 100 miles), the drone uses less energy than the truck out to a
**one-way distance of 63 km at 8 m/s and 83 km at 10 m/s at Stolaroff's stop density** (31 and 41 km at twice the density, 16 and 21 km at four times). This counts
cruise only (no takeoff, landing or hover), so it flatters the drone, and the M100's endurance is far shorter than these distances:
range, not energy per package, is what limits a battery multicopter, as Stolaroff et al. found (about 4 km). The
pooled mean (86 J/m, 2.7 times Stolaroff's modelled 32 J/m for a different quadcopter) is not a result: 41 of 134 flights are at
4 m/s. Prediction 1 (50 to 80 J/m pooled) failed for that reason.

**Whole-flight energy and battery range (milestone 2b, `experiments/mission_energy/`).** Integrating battery power over
the full 134 route flights, **77% of the energy is not cruise** (climb, hover, acceleration; 95% at 8 m/s) because the legs
are short, and whole-flight energy is 154 J/m against 60 J/m cruise-only at 8 m/s. One TB48D pack (129.96 Wh, retailer
figure) at 80% usable then gives only about **1 km one way (regression) to 2 to 3 km (cruise-only slope)**, so 2a's
63 to 83 km break-even is not reachable by this airframe: battery energy is the binding limit. Extrapolates from
cruise windows under 150 m; pack count in the study not checked.

**Altitude and payload in the fixed energy (milestone 2c, `experiments/altitude_energy/`).** The flights span four altitudes (25 to 100 m) and four payload codes, not two as planned (the plan was wrong; see `LOG.md`). A pooled fit over 132 flights (R2 0.93) gives **9.6 kJ [8.9, 10.3] per extra 25 m of altitude** and 8.0 kJ [7.0, 8.9] per payload step, so 2b's E0 was an average over altitudes. The cruise slope stays unidentified (-13 to 103 J/m; cruise windows under 150 m), so no range is claimed beyond 2b's bracket. Preliminary; one airframe; altitude may be confounded with route and time of day.

**Hybrid with engine and tank mass (milestone 10e, `experiments/vtol_sizing/hybrid_mass_law.py`).** Adding engine+generator mass (swept 0.5 to 8 kW/kg, hover-sized) and tank mass to 10a's hybrid: at 1 kW/kg, chain efficiency 0.20 and non-energy fraction 0.479 it reaches 1,273 km (battery at 250 Wh/kg: 166 km) and beats the battery aircraft from 67 km (10a: 20 km). Engine specific power dominates: break-even is 145 to 167 km at 0.5 kW/kg and 4 to 7 km at 4 kW/kg. Inputs swept, not datasheet-fitted. Preliminary.

**Which resource binds first at a delivery-drone hub? (milestone 6, `experiments/hub_throughput/`).** A discrete-event model of landing pads, chargers and spare packs, checked against Erlang C (mean wait within 0.6% at utilisation 0.5 to 0.85). With a sourced 60 s battery swap (Matternet, vendor claim) and a 32-minute 20-to-90% charge (DJI Dock 2, vendor figure), swap raises the pad limit 8x (80 against 9.8 flights/h at 4 pads) but the chargers then bind at 10.7/h, so 4 chargers deliver only 1.09x the throughput of charging on the pad; chargers bound in every case run (4 to 8 pads, 4 to 16 chargers, 1 to 5 min load). Swapping moves the bottleneck from pad to charger and spare packs (about 3 times the charger count to stop queueing at 90% load). Poisson arrivals, linear charge time, small-multicopter figures, not a cargo VTOL. Preliminary.

**Measured charge taper, fresh and aged (milestone 6h, `experiments/hub_throughput/cargo_hub_aged_cells.py`).** On 543 measured CC-CV charges of four NASA Ames 18650 cells cycled to about 30% capacity fade (Saha and Goebel 2007; 0.75C to 4.2 V, then CV to C/100), charging 20 to 90% takes 1.19x the linear time when fresh and 1.60x when aged, and 30 to 100% takes 2.68x and 3.74x (6d's datasheet-fitted curve: 1.03x and 1.71x). Ageing moves the CV share of the charge from 26% to 41%. For 6d's hub at 6 flights/h with a 90% charge ceiling, spares rise from 9 (linear) to 12 (fresh) and 16 (aged); charging to 100% caps 8 chargers at 4.3 (fresh) and 3.1 (aged) flights/h, so the hub needs more chargers, not more packs. One old cell type at 0.75C, scaled to 1C as a ratio. Preliminary.

**Where does a battery cargo VTOL stop closing? (milestone 10a, `experiments/vtol_sizing/`).** A linear mass-budget model of a lift-plus-cruise VTOL (momentum-theory hover, L/D cruise, 20% energy reserve, payload at least 15% of MTOW). At 250 Wh/kg cells (L/D 12, disk loading 150 N/m2, structure 0.35 of MTOW) the one-way range is **about 200 km for a 100 kg payload**, rising 88 km per 100 Wh/kg of cell energy; 100 / 200 / 300 km need roughly 130 / 240 / 355 Wh/kg in that case and 100 to 210 / 165 to 390 / 240 to 575 Wh/kg across the L/D (10 to 16), disk-loading and structure-fraction sweep. Structure fraction and L/D move the answer most (range 154 to 227 km over structure 0.45 to 0.30). Prediction 1 narrowly missed (203 km against a 200 km bar); prediction 3 was wrong: with jet fuel at 11.9 kWh/kg a hybrid carries less mass than the pack at every range tried (20 km break-even at 250 Wh/kg), so in this model it closes to the 1,500 km search cap, which says the model lacks what limits real hybrids (tank and engine mass scaling, climb, certification), not that hybrids fly 1,500 km. Payload size barely matters above 25 kg because every mass is a fraction of MTOW: the size effect on structure is exactly what this model leaves out, and every airframe input is assumed and swept, not fitted to a published cargo VTOL. Preliminary.

**Does that sizing model match published VTOL weights? (milestone 10b, `experiments/nasa_concept_check/`).** Run against the two electric concept vehicles of Johnson, Silva and Solis (NASA, 2018): with one usable fraction (0.896, calibrated on the quadrotor) the energy model predicts the side-by-side helicopter's battery fraction to 0.3% (0.305 against 0.306), so the hover-plus-cruise-plus-reserve physics holds. The part that was wrong is the airframe: the published empty-weight-less-battery fractions are 0.58 and 0.48 of gross weight, not the 0.40 assumed in 10a, and they do not transfer (swapping them moves gross weight by +92% and -34%). With them, a 250 Wh/kg pack reaches 58 km (quadrotor) to 138 km (side-by-side) instead of 203 km. Two NDARC concept studies, not flown aircraft. Preliminary.

**Does it carry over to the fuel-burning designs? (milestone 10c, `experiments/nasa_fuel_check/`).** The same energy model applied to NASA's turboshaft side-by-side (3,831 lb) and tiltwing (11,654 lb) implies a specific fuel consumption of 1.07 and 1.20 times each engine's published MCP figure (0.616 and 0.591 lb/hp/h), a plausible part-power penalty, though reserve assumptions move the ratio between 1.01 and 1.31. Across all seven NASA designs (250 to 3,000 lb payload) the empty-weight-less-battery fraction stays between 0.48 and 0.62, so 10a's 0.40 was low for every one; the five fuel or generator designs span only 0.056, but the electric quadrotor (0.583) falls inside that band, so propulsion architecture alone does not explain it. Seven NDARC concept studies from one paper. Preliminary.

## Limitations

Flat-plate drag with a form factor, no airfoil polars, no CLmax, fixed powertrain efficiency (which
falls with scale, so the power ratio is optimistic). Airframe constants are design choices, swept
not sourced. The Froude exponents were checked against Table 4 of NASA TP-1435 (opened on NTRS, 2026-10-27;
the rows for velocity, time, angular rate, acceleration, mass and inertia, in `tests/`). Force, moment,
power, energy and Reynolds exponents are derived from those rows, not read from the table. Citations:
see "Citation status" in `PROPOSAL.md` (several ids and one author were wrong and are fixed).

**Paper (milestone 8a).** A first draft with the claims, a hypotheses table and limitations is in [`paper/draft.md`](paper/draft.md); `python3 paper/check_numbers.py` checks its numbers against the result files.

## Related labs

Related to the autonomy and field-robotics groups the track names (RECUV, Autonomous Systems IRT)
only as a topic; no affiliation is implied. Written with AI assistance (Claude Code).

## Next

**Milestone 6i** (`experiments/hub_throughput/analytic_spares.py`): a closed-form spare-pack rule (the M^X/D/c recursion for packs at the chargers, plus a Poisson count for packs in transit) gives the same smallest pack count as the hub simulator for at most 5% of orders waiting: 12, 16, 25 at 70% load and 17, 26, 45 at 85%, for single orders and batches of 2 and 4. It is optimistic within about 2 packs of the mean count, because waiting feeds back on itself. Batches of 8 at 8 pads add a pad-wait floor of about 5% that no spares remove.

**Milestone 6j** (`experiments/hub_throughput/analytic_wait_tail.py`): the same rule gives the whole waiting-time distribution. The charger wait is a Lindley recursion with Erlang gaps, and the pack pool is used in a fixed cycle. With that, the count for 6c's criterion (p95 wait <= 300 s) can be computed without a simulator. On a 1-pack grid the rule matches the simulator for single orders and batches of 2 and 4 at 70% load (11, 15, 24) and for single orders at 85% (16). In the other four cases it asks for 1 to 2 packs more (k = 8 at 70%: 41 against 39; at 85%: 25/24, 44/42, 81/79), so in the design region it errs toward over-provisioning. The fine grid also corrects 6c's k = 8 count at 70% load from 48 to 39.

**Milestone 6k** (`experiments/hub_throughput/analytic_trace_tail.py`): an exact time-varying version of the rule sizes the pack pool under a real daily demand profile (Chicago ride-hail shape, peak 1.76x the mean, above the charger limit), where stationary formulas have no answer. An order waits more than w iff at least S earlier packs are not ready at t + w. That count is the orders of the last D + T<sub>pad</sub> - w seconds plus the charger survivors max(N<sub>q</sub>(t + w - D) - c, 0), and N<sub>q</sub> follows a time-indexed recursion. Smallest pack count for p95 wait <= 300 s, rule against simulator: 23/23, 24/24 (70% load) and 43/43, 45/45 (85%) for single orders; 40/41, 42/43, 67/68, 68/68 for batches of 4. The stationary count at the mean rate (11, 16) is 12 to 29 packs short. Waits peak 4 hours after the evening demand peak. 6f's rounded-count arrival generator understated the need by 9 to 12 packs against Poisson-in-bin orders.

**Milestone 6l** (`experiments/hub_throughput/demand_variability.py`): with measured day-to-day and within-day demand variability (131 weekdays of Uber pickups in New York, Apr to Sep 2014, busiest 2.2 km cell; day-level CV 0.17 after trend and weekday, hourly CV 0.17), the hub needs **64 packs at 70% load and 111 at 85%** for p95 wait <= 300 s, against 47 and 71 for the mean day (6k's rule, which the simulator confirms for that model). A rule that averages 6k's exact calculation over single observed days is 2 and 21 packs short; run over three consecutive observed days (a post hoc diagnostic) it gives 63 and 108, because at 85% load a busy evening leaves on average 16 packs at the chargers the next morning. Even at the pooled count, about one weekday in eight misses the target on its own. Ride-hail, not delivery orders; preliminary. Figure: [`demand_variability_tail.svg`](experiments/hub_throughput/demand_variability_tail.svg). Data: FiveThirtyEight, uber-tlc-foil-response (NYC TLC FOIL), CC BY 4.0.

**Milestone 11e** (`experiments/hub_airspace/operator_layers.py`): when a UTM service has more altitude layers than the semicircular rule needs, what should the extra layer bit separate: **outbound and inbound legs, fast and slow drones, or operators**? With four delivery operators sharing New York, putting the operators whose service areas overlap most in different layers (semicircular x operator pairing) leaves **2.3x to 3.7x fewer en-route conflicts** than semicircular x leg direction, and the obvious fix for mixed fleets, **a speed band, does worse than leg direction** (0.0164 against 0.0115 per flight). The closed form ranks the five four-layer rules in the simulator's order in two of three scenarios and picks a rule tied with the best in all three, so the assignment can be chosen without simulating. Caveat: pairing does nothing for conflicts inside 250 m of a hub, which leg direction halves, so on all conflicts leg direction still wins. Speeds, shares and sites illustrative; preliminary. Results: [`operator_layers_results.txt`](experiments/hub_airspace/operator_layers_results.txt).

**Milestone 11d** (`experiments/hub_airspace/mixed_fleet.py`): does the semicircular rule still beat the outbound/inbound split when **drone delivery operators fly at different speeds** and hold unequal market shares? A closed form for unequal speeds derived here (crossing window 2R |va - vb| / |va x vb|) matches the simulator within 3.6% in one layer. With four operators at 12, 16, 24 and 28 m/s, **the semicircular rule still leaves 57% fewer en-route conflicts than the split** (68% at equal speeds), but mixed speeds raise its conflicts by 76% (overtaking on near-parallel tracks), against 31% for the split and 11% for one layer. When the largest operator (55% of flights) is also the slowest, one layer's en-route conflicts per flight rise 1.52x. Speeds and shares swept, not sourced; preliminary. Results: [`mixed_fleet_results.txt`](experiments/hub_airspace/mixed_fleet_results.txt).

**Milestone 11c** (`experiments/hub_airspace/multi_hub.py`): what happens with several hubs and several drone delivery operators in one city? With one operator, nearest-hub service keeps every hub's flights inside its own convex Voronoi cell, so **hubs never interfere** (zero cross-hub conflicts in the simulator) and en-route conflicts per flight fall from 0.40 to 0.023 going from 1 to 8 hubs at 240 flights/h. With four operators whose 5 km service areas overlap, **31.5% of en-route conflicts are crossings between operators**, and a closed form with a crossing term derived here matches the simulator within 7.4%. The gas model is 3.4x low even for the crossing part. Of two-layer rules, **the semicircular rule (eastbound and westbound tracks in different layers) leaves 68% fewer en-route conflicts than an outbound/inbound split** (7.6% against 23.7% of one layer); four layers leave 3.2%. Straight legs, equal speeds, k-means operator sites; preliminary. Results: [`multi_hub_results.txt`](experiments/hub_airspace/multi_hub_results.txt).

**Milestone 11b** (`experiments/hub_airspace/wind.py`): does wind change how often a delivery hub's own drones lose separation? A closed form derived here generalises 11a's to any ground speeds (every encounter scales with the time offset between the two hub events) and matches the simulator within 1.7% in 8 base cases and 6.1% across a 30-cell wind sweep. **Wind raises one layer's en-route conflicts by about as much as it lengthens time in the layer** (within 1.7% at every grid point; v/H = sqrt(1 - w^2 sin^2 beta)/(1 - w^2)): 18% with a wind of 0.4 times airspeed along Manhattan's main bearing, 11% across it. Over 4,392 measured ERA5 100 m wind hours (NYC, Apr to Sep 2014) the average hour adds **6.1% at 20 m/s** (p90 13%, max 47%) , 10.0% at 15 m/s and 2.7% at 30 m/s. The outbound/inbound layer split survives wind: equal-airspeed aircraft overtake each other at under 1% of the single layer's rate, less than a +-15% airspeed spread does. Steady wind per hour, one hub, straight legs; preliminary. Figure: [`wind_factor.svg`](experiments/hub_airspace/wind_factor.svg). Data: ERA5 via Open-Meteo, CC BY 4.0.

**Milestone 11a** (`experiments/hub_airspace/`): how often do a delivery hub's own drones lose separation in one cruise layer? With 17,250 measured NYC destinations (Uber pickups, April 2014) within 5 km of a Manhattan hub, 20 m/s cruise and a 50 m separation radius, **en-route conflicts per flight grow linearly with traffic and reach 0.1 per flight at 62 flights/h**. A closed form derived here, C = (lambda^2 / v) E[min(2 min(d1, d2), R / sin(dphi/2))], needs only the destination distribution and matches an exact closest-approach simulator within 1% in the base case (44 of 45 sweep cells within 10%). Manhattan's narrow bearings double the conflicts against uniform bearings; the gas model, the usual capacity estimate, is 7x low (17x at 10 km). Separate outbound and inbound layers remove 95% of en-route conflicts. No wind, no other operators, straight legs; preliminary. Figure: [`conflicts_per_flight.svg`](experiments/hub_airspace/conflicts_per_flight.svg). Data: FiveThirtyEight, uber-tlc-foil-response (NYC TLC FOIL), CC BY 4.0.

**Milestone 8e** (`experiments/uiuc_naca64a010`): against the measured NACA 64A010 (UIUC Vol. 1) NeuralFoil's section lift slope is 1.27 and 1.23 times measured at Re 101,000 and 204,000 (3 deg window), the same 20 to 30% excess as for NACA 0009, 2414 and 2415, and 0.24 to 0.58 of measured below Re 6e4 (unusable there). One section, two runs in the band; not the tail's NACA 0015 (not in the hosted volumes).

**Milestone 9d** (`experiments/adjustable_tail`): a tail whose area is adjustable by about 0.85 to 1.3 times nominal recovers the three longitudinal modes within 5% for 76 of the 78 mode-matched designs at every tail-slope scale 0.75 to 1.0 (fixed tails recover none, 8e). Gust metrics with the adjustable tail are open.

**Milestone 9e** (`experiments/adjustable_gust`): with the tail area set from the modes alone, 67 of the 78 designs keep every gust peak (H = 5, 12.5, 25 chords) within 10% at every slope scale 0.75 to 1.0, and 43 within 5% (median worst gust error 4.7% at scale 0.75, against 21.5% for a fixed tail and none within 10% in 9c). Assumes the short-period is identified exactly; identification noise is open.

**Milestone 9g** (`experiments/identification_noise`, frequency-only variant of 9f): with the tail area set from a noisy short-period frequency, a gust match within 10% needs the frequency known to about 2% (51 to 53 of 78 designs at sd 2%, none at 5%); modes within 10% tolerate about 5%. The 9e result assumed exact identification.

**Milestone 9h** (`experiments/doublet_fit`): a least-squares fit of a noisy simulated free response (4 states, 78 designs) gives mode errors small enough for the adjustable tail at 1% sensor noise and about one phugoid period (87% of draws within 10% on gust, 0.3% short-period frequency error), but not with longer records (short-period error 4.5% at 4 periods) or 10% noise (61 to 63%). A naive fit is a floor, not the best estimator.

**Milestone 9i** (`experiments/output_error_fit`): an output-error fit of the same noisy free response (3% noise, 20 paired draws) cuts the short-period frequency error from 1.9, 6.1, 33% (least squares, 1, 2, 4 phugoid periods) to 0.21, 0.21, 0.33%, and puts 66 to 67 of 78 designs at 90% of draws within 10% on gust (least squares: 52, 51, 13). 9h's worsening with record length was an estimator artefact. Known initial state. At 10% noise and one phugoid period (`results_noise10_1period.txt`; the 2 and 4 period runs did not finish in the session's time limit) the output-error fit has short-period error 0.70% against 19.1% for least squares, and 59 of 78 designs at 90% of draws within 10% on gust (least squares: 2). Preliminary; one record length, one scale (0.75), 20 draws.

**Milestone 9p** (`experiments/misspecified_noise`): with AR(2) noise (phi 1.2, -0.4) and the AR(1) iterated-GLS estimator of 9o, the share of draws within 10% on gust is 86% (white), 74% (unweighted) and 80% (whitened): half the loss recovered, against 83% when the noise really is AR(1). Mode errors do not improve (short-period frequency 1.41% to 1.57%). Keep the 1.5x gust margin. One AR(2) shape, 10 draws, one seed.

**Milestone 9q** (`experiments/pink_noise`): with 1/f (pink) noise and the same AR(1) iterated-GLS estimator, the share of draws within 10% on gust is 86% (white), 76% (unweighted) and 81% (whitened): again half of the 10-point gap, with 0 fit failures. Damping-ratio error improves a little (2.56% to 1.94%). Keep the 1.5x gust margin when the noise family is unknown. One spectral exponent, not measured IMU noise, 10 draws, one seed.

Open the NASA table and each reference; gust response and a thrust model for H1; XFOIL polars against Selig data (H2, H3; milestone 8c did NACA 0009 against UIUC Vol. 1, see `experiments/uiuc_tail_slope`, and found NeuralFoil's section slope 15 to 28% off at Re 4e4 to 1e5, and milestone 8d did the cambered NACA 2414/2415 at Re 1e5 to 2e5, `experiments/uiuc_naca241x`, finding NeuralFoil's slope 1.22 to 1.67 times measured; symmetric 0012 and 0015 remain, and a tail re-search with the slope cut by 20 to 25%); full-size propeller Reynolds number from a sourced propeller (to close H4); a motor-efficiency model.
