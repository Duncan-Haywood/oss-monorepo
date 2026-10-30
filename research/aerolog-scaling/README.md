# What does a 1:N model of a cargo UAV tell you about the 1:1 aircraft?

**Status: open research programme, milestones 1 to 7c done in part (see below).** A stdlib Froude-scaling calculator
(`src/aerolog_scaling/`, 9 tests) and a first-order result: for a 1,000 kg, aspect-ratio-10 cargo
fixed-wing, the 1:10 model needs **1.27x** the power that Froude scaling predicts (1.17 to 1.35
over drag and aspect-ratio sweeps) because Reynolds number falls as n^1.5 and skin friction rises.
Flat-plate drag only: preliminary, and the proposal's hypotheses H1 to H5 are still open. See
[`PROPOSAL.md`](PROPOSAL.md) and [`LOG.md`](LOG.md).

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/aerolog-scaling/

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
at full size in this model and depends on the unmodelled thrust law. Gust response (milestones 9a, 9b): the similar model keeps the peak load-factor increment within 2% but is 27 to 33% high in peak pitch rate; with the tail redesigned, 24 of the 78 mode-matched designs match all three gust peaks within 5% at all three gust lengths (best 1.2%). Milestone 9c: that match does not survive a tail slope 0.75 to 1.0 of the surrogate's; none of the 78 keeps the gust peaks within 10% at every scale (median worst error 21.5% at 0.75), and the gust metrics are more sensitive than the modes.

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

**Milestone 9d** (`experiments/adjustable_tail`): a tail whose area is adjustable by about 0.85 to 1.3 times nominal recovers the three longitudinal modes within 5% for 76 of the 78 mode-matched designs at every tail-slope scale 0.75 to 1.0 (fixed tails recover none, 8e). Gust metrics with the adjustable tail are open.

**Milestone 9e** (`experiments/adjustable_gust`): with the tail area set from the modes alone, 67 of the 78 designs keep every gust peak (H = 5, 12.5, 25 chords) within 10% at every slope scale 0.75 to 1.0, and 43 within 5% (median worst gust error 4.7% at scale 0.75, against 21.5% for a fixed tail and none within 10% in 9c). Assumes the short-period is identified exactly; identification noise is open.

**Milestone 9g** (`experiments/identification_noise`, frequency-only variant of 9f): with the tail area set from a noisy short-period frequency, a gust match within 10% needs the frequency known to about 2% (51 to 53 of 78 designs at sd 2%, none at 5%); modes within 10% tolerate about 5%. The 9e result assumed exact identification.

**Milestone 9h** (`experiments/doublet_fit`): a least-squares fit of a noisy simulated free response (4 states, 78 designs) gives mode errors small enough for the adjustable tail at 1% sensor noise and about one phugoid period (87% of draws within 10% on gust, 0.3% short-period frequency error), but not with longer records (short-period error 4.5% at 4 periods) or 10% noise (61 to 63%). A naive fit is a floor, not the best estimator.

**Milestone 9i** (`experiments/output_error_fit`): an output-error fit of the same noisy free response (3% noise, 20 paired draws) cuts the short-period frequency error from 1.9, 6.1, 33% (least squares, 1, 2, 4 phugoid periods) to 0.21, 0.21, 0.33%, and puts 66 to 67 of 78 designs at 90% of draws within 10% on gust (least squares: 52, 51, 13). 9h's worsening with record length was an estimator artefact. Known initial state; 10% noise not rerun.

Open the NASA table and each reference; gust response and a thrust model for H1; XFOIL polars against Selig data (H2, H3; milestone 8c did NACA 0009 against UIUC Vol. 1, see `experiments/uiuc_tail_slope`, and found NeuralFoil's section slope 15 to 28% off at Re 4e4 to 1e5, and milestone 8d did the cambered NACA 2414/2415 at Re 1e5 to 2e5, `experiments/uiuc_naca241x`, finding NeuralFoil's slope 1.22 to 1.67 times measured; symmetric 0012 and 0015 remain, and a tail re-search with the slope cut by 20 to 25%); full-size propeller Reynolds number from a sourced propeller (to close H4); a motor-efficiency model.
