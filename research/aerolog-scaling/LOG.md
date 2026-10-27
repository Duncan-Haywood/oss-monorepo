# Research log: aerolog-scaling

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-10-27 · Milestone 6a: does measured electrical power on a real multirotor scale as mass^1.5, the exponent behind Froude power n^3.5? (planned before running)
- Why: milestone 6 and the "Next" of milestone 2. Froude scaling gives power proportional to n^3.5, which for a rotor in hover is momentum theory's P_i = (m g)^1.5 / sqrt(2 rho A) (m ~ n^3, A ~ n^2). Rodrigues et al. (Patterns 2022) *assume* the 1.5 in their energy model (their Eq. 3); the exponent was not fitted. Their data (Figshare 10.1184/R1/12683453, CC BY 4.0: 209 flights of a DJI Matrice 100, 3.68 / 3.93 / 4.18 kg takeoff mass at 0 / 250 / 500 g payload, speeds 4 to 12 m/s, 5 Hz battery V and I) lets us fit it. The mass range is only 13.6%, so this tests the exponent inside one airframe, not across scales.
- Plan (`experiments/rodrigues_energy/run.py`): mean battery power V*|I| over the cruise samples of each R1 to R7 flight (horizontal ground speed within 20% of the commanded speed, |vz| < 0.5 m/s); OLS of ln P on ln m (takeoff mass from payload) with commanded speed, speed squared and wind-speed mean as covariates; 95% bootstrap interval over flights (10,000 resamples). Also hover: the 4 route-H ground-hover flights are only used for the absolute level, with P_i from ISA density at 300 m and disc area from the DJI 1345 propeller (13 in), 4 rotors.
- **Predictions (before running):** (1) the fitted mass exponent has a 95% interval containing 1.5 (prior 55%; a non-zero constant avionics and profile power pulls it below 1.5, wind and air-density noise widen it). (2) The interval is wider than +/-0.4 (prior 50%): 13.6% mass span against flight-to-flight scatter. (3) Cruise power rises with speed between 4 and 12 m/s by less than 25% (Rodrigues et al. report little speed effect). (4) Electrical cruise power exceeds the ideal induced power P_i by a factor of 1.5 to 3 (figure of merit, motor and ESC losses, profile and parasite power).
- Refuted: (1) 1.5 outside the interval; (2) width under 0.8; (3) a rise of 25% or more; (4) factor outside 1.5 to 3.
- Limits known in advance: one airframe, one battery, 13.6% mass span; density and temperature are not logged per flight (ISA at the site is used), and payload was not randomised against day or hour, so the exponent can be confounded by weather; battery sag at low state of charge is not modelled; the 5 Hz power is the sensor's.

### Outcome (`experiments/rodrigues_energy/`: `run.py` 21 s, `results.txt`; 134 of 209 flights kept: R-routes with at least 5 s of cruise samples; 46 / 42 / 45 flights at 0 / 250 / 500 g and one at 750 g)
- **(1) held:** the fitted mass exponent is 1.539, 95% bootstrap interval [1.413, 1.667] over flights (10,000 resamples), with speed, speed squared and mean wind as covariates; 1.5 is inside. Without covariates 1.524 [1.303, 1.747]; R1 flights only 1.509 [1.376, 1.643]; altitude-25 flights only (n = 37) 1.410 [1.211, 1.630]. So inside one airframe over a 13.6% mass range the measured electrical power follows the m^1.5 of momentum theory, and the exponent that Froude scaling turns into n^3.5 is not contradicted. It does not test the exponent across a factor of 10 in size.
- **(2) refuted:** the interval is 0.25 wide (prediction: wider than 0.8 in total). The mass signal is cleaner than expected (cruise power rises from 440 W to 534 W between 0 and 500 g).
- **(3) held, but the sign is the other way:** cruise power falls with speed instead of rising, by 10.1% from 4 to 12 m/s in the fitted model (507 W at 4 m/s, 414 W at 12 m/s as raw means; 4 to 8 m/s: -0.4%), the translational-lift effect that Rodrigues et al. mention as small up to 8 m/s. Mean wind is a covariate, so this is not the wind.
- **(4) held:** electrical cruise power over the ideal induced power (P_i = (m g)^1.5 / sqrt(2 rho A), rho 1.20, A from four 13 in propellers) is 1.84, 1.86, 1.85 at 0, 250, 500 g. The ratio does not move with mass, which is the same statement as (1). Ground hover (route H, 4 flights at 3 m, 0 g) draws 431 W against 440 W cruise.
- Not shown: any scaling across size. The M100 is one airframe; the energy side of H4 (efficiency of motor and propeller at model size) is still the 5a propeller result alone. Dates: 16 flight days, 3 with a single payload, so day and payload are partly confounded (density not logged); the bootstrap resamples flights, not days, so the interval is optimistic if days differ.
- Next: a day-clustered bootstrap or a fixed-effect for date to test that confound; hover power from route H against the same model for a second airframe (the dataset is one vehicle); sourced full-size propeller for 5a.

## 2026-10-27 · Milestone 2: open TP-1435 and check every reference (a check, not an experiment)
- Why: the proposal and the code quoted TP-1435 and 13 other references from memory because the registries returned 403 on the first session. They answer now.
- Method: `cite_check.py` on `PROPOSAL.md`; NTRS search API for the four NASA records; Crossref for the two DOIs it skipped or could not match; TP-1435's PDF downloaded and Table 4 read.
- **Result:** the memory version was wrong in four places: TP-1435's middle author is Brown, not Bowman; its NTRS id was 19790022005 not 19790015227; Chambers (SP-2009-575) is 20110012492 not 20100005350; Johnson, Silva and Solis is 20180003381 not 20180002029 (the old id is an unrelated record). "Jordan et al., AirSTAR papers (2005 to 2006)" is now a specific record (NTRS 20040085988, 2004). Four DOIs confirmed by `cite_check.py`, Rodrigues et al. and Brandt and Selig by Crossref.
- **TP-1435 Table 4:** velocity, time, angular rate, linear acceleration, oscillatory frequency, mass and mass moment of inertia match `EXPONENTS`; a new test pins them. No change to any milestone 1, 3a, 4a or 5a number. Force, moment, power, energy and Reynolds rows are not in the table as separate Froude rows and stay derived.
- Limits: the PDF is an OCR scan, so the rows were read by eye from garbled text; the Jordan et al. venue, Drela, Raymer and the BlueSky paper are not re-opened.
- Next: milestone 6 (energy against Rodrigues et al. flights; the dataset is public on Carnegie Mellon's Kilthub, probe it) and a sourced full-size propeller for 5a.

## 2026-10-27 · Milestone 5a: how much peak propeller efficiency does a Froude model lose to Reynolds number? (predictions fixed before the final numbers)
- Why: H4 says motor-plus-propeller efficiency at n = 0.1 is at least 10 points below full size (refuted under 5). Only the propeller part can be measured here; the UIUC Propeller Database (wind-tunnel data, 91 MB zip, reachable through the proxy) gives eta(J) at many RPMs for APC propellers.
- Plan (`experiments/propeller_efficiency/run.py`): peak eta and Re at 0.75 R (from RPM, diameter, c/R at 0.75) for every APC curve with a bracketed peak; within-propeller slope against log10 Re, bootstrap over propellers; saturating fits eta_inf - a Re^-b (b = 0.5, 0.2). **Predictions:** (1) peak efficiency rises with Re in nearly every propeller; (2) the fall from Re 1e5 to 3.2e4, inside the data, is 5 to 10 points; (3) the data cannot reach a full-size Re of about 1e6, so the n = 0.1 gap is an extrapolation.

### Outcome (`experiments/propeller_efficiency/results.txt`)
- 151 curves, 34 propellers, Re75 1.5e4 to 1.2e5. **(1) held:** 97% of per-propeller slopes are positive, mean 0.21 per decade [0.18, 0.23].
- **(2) partly:** the saturating fits give 9.9 and 10.3 points for 1e5 to 3.2e4, at the top of the predicted range; the cross-propeller bin means differ by 6.6 points (0.669 vs 0.603) over a smaller Re span. So H4's 10-point bar is about met by the propeller alone for a model near Re 1e5.
- **(3) held:** extrapolation to Re 1e6 gives 19 to 25 points from the saturating fits, 31 from a straight line; not used as a result. The full-size Re 1e6 is itself an assumed figure (1.5 m, 200 m/s tip, 0.1 m chord).
- Limits: RPM and Re move together inside a propeller (J at peak, tip Mach), so the slope mixes effects; APC thin-electric and slow-flyer props only; motor efficiency not modelled; the 1.2 kg/m3 and 1.8e-5 Pa s are lab air.
- Next: a sourced full-size propeller (diameter, RPM, chord) for the Re; motor efficiency vs size.

## 2026-10-27 · Milestone 3a: do trim speed and the longitudinal modes survive Reynolds-dependent aerodynamics? (predictions written after a first exploratory run, so not blind)
- Why: H1 says trim speed and mode frequencies agree within 3% (refuted over 5%) at n = 0.1. Froude scaling makes them agree exactly for fixed coefficients, so any gap comes from Re-dependent CL(alpha), CD and tail effectiveness.
- Plan (`experiments/longitudinal_modes/run.py`): wing NACA 4412 plus tail NACA 0012, NeuralFoil polars at each surface's Re, 4-state Etkin model; model flown at full-size trim angle, or at full-size CL. Predictions (stated after seeing a first run that crashed on the mode extraction, before the final numbers): trim speed moves under 3% at n = 0.1 (tripped); frequencies within 3%; short-period damping moves more than frequency.

### Outcome (`experiments/longitudinal_modes/results.txt`)
- Tripped, n = 0.1 vs 1: same-alpha rule gives dV +6.5%, phugoid frequency -5.2%, short-period frequency +5.1%, damping -6.7%: **H1 refuted on this rule** (prediction 1 and 2 wrong). Same-CL rule: frequencies +0.8% and -1.3% (held), short-period damping -6.3% (prediction 3 held).
- Free transition at n = 0.1 and 0.05: the short period becomes overdamped (two real roots) and trim CL drops; this is the NeuralFoil bubble regime from 4a, not used as a result.
- Phugoid damping is positive in the textbook estimate but negative here even at n = 1 (induced-drag slope CD_alpha with no speed-dependent thrust); the sign is a modelling artefact, so it is not reported.
- Limits: no gust response (H1 names it); the surrogate is unvalidated against UIUC data; geometry and CG are design choices; the tail is trimmed by the elevator at zero lift; no thrust-line or propeller terms.
- Next: gust response; thrust law; UIUC polar check.

## 2026-10-27 · Milestone 4a: do airfoil polars keep H2 (power) and H3 (CLmax)? (predictions fixed before the run)
- Why: milestone 1's flat-plate drag could not say whether H2 survives a real section. XFOIL itself is not installable here; NeuralFoil 0.3.3 (a neural surrogate trained on XFOIL, MIT) is, via AeroSandbox 4.2.10.
- Plan (`experiments/airfoil_polars/run.py`): NACA 4412 section, Re_mac from the milestone-1 calculator at n = 1 to 0.05, three boundary-layer states (n_crit 9, n_crit 5, trip at 5% chord). Section cd at cl = 0.8 plus induced drag (AR 10, e 0.8) gives the power ratio against n = 1; CLmax from the alpha sweep.
- **Predictions:** (1) the n = 0.1 power ratio is at least 1.20 in all three states (H2 refuted if under 1.10). (2) CLmax falls by at least 0.2 at n = 0.1 in all three states (H3 refuted if under 0.1). (3) the surrogate is not trustworthy at n = 0.05 (Re 3.4e4).

### Outcome (`experiments/airfoil_polars/results.txt`)
- Power ratio vs Froude at n = 0.1 (Re_mac 9.7e4): 1.445 (n_crit 9), 1.291 (n_crit 5), 1.361 (tripped). **(1) held**; milestone 1's flat-plate 1.27 sits at the bottom of this range. At n = 0.2 the ratio is 1.11 to 1.19, so the 20% bar is not met there.
- CLmax change at n = 0.1: -0.37, -0.52, -0.48. **(2) held** (H3 supported for a 2D clean section).
- **(3) held:** free-transition n_crit 9 at n = 0.05 gives cd 0.137 (ratio 5.3), a separated-bubble regime the other two states do not show (1.8 to 2.0); not used as a result.
- Not done: no check against UIUC measured polars (hosts 403 or not tried), so the surrogate error is unquantified; NeuralFoil CLmax at Re 3e6 is 1.84, which looks high against the 4412's textbook value (from memory, unchecked). 2D section only: no finite-wing, flap or Reynolds-dependent induced effects; cl = CL strip approximation.
- Next: UIUC polar check of the surrogate; vortex-lattice model for H1.

## 2026-10-27 · Milestone 1: how much power does a Froude model need beyond the Froude prediction? (planned before running)
- Hypothesis: with a flat-plate skin-friction drag model, a Froude-scaled model at n = 0.1 needs more than 20% extra power over `n^3.5 x P_full` (H2), because Re falls as `n^1.5` and Cf rises as Re falls, while all other Froude-scaled quantities match by construction.
- Plan: `experiments/run.py` scales one 1,000 kg, AR 10 airframe to n = 1 to 0.05 and reports Re, CD0, L/D, the power ratio and the battery fraction for a range scaled with length; sweeps form factor, wetted area and aspect ratio; compares a tripped (turbulent) with an untripped (laminar below Re 5e5) boundary layer. Unit tests check the ISA, Sutherland viscosity, the exponent table's dimensional consistency and the skin-friction formulas.

### Outcome
- Tripped base case: power ratio 1.06 (n = 0.5), 1.16 (0.2), 1.27 (0.1), 1.42 (0.05); L/D falls from 22.8 to 18.0 at n = 0.1. Across the CD0 and aspect-ratio sweeps the n = 0.1 ratio is 1.17 to 1.35, so the >20% bar holds in every case except aspect ratio 6 (1.17); the low-drag case is 1.21.
- The untripped case is not monotone: attached laminar flow gives lower Cf at Re near 3e5, so the model *beats* full scale (ratio 0.96 at n = 0.2) until Re falls to 1e5. This is an artefact of the model, since real wings at that Re separate. It is why H2 must be tested with XFOIL polars, not a flat plate.
- Battery fraction for a range scaled with length falls with n (0.13x at n = 0.1) so a model at fixed cell specific energy has far more battery margin than the full-size aircraft per body length: endurance in scaled time does not test the full-size energy budget. This follows from range, not from drag.
- So H2 is supported at the base case by a flat-plate estimate, not yet by an airfoil-based one. Preliminary; first-order model only.
- Limits: flat-plate Cf with a form factor, not an airfoil; no induced-drag Re effect; no CLmax; powertrain efficiency held fixed (it falls with scale, so the ratio here is optimistic); constants for the airframe are design choices, swept but not sourced to a specific aircraft; citations not machine-checked.
- Next: milestone 2 and 3 (open the NASA table; vortex-lattice and flight-dynamics model).
