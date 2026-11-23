# When does rotor cant pay on a small quadrotor co-designed with its motors and controller?

Research programme `codesign-cant` (track 14, `codesign`; proposal: [`PROPOSAL.md`](PROPOSAL.md), log: [`LOG.md`](LOG.md)). It gathers seven earlier single-step projects on canted-rotor quadrotors (`codesign-aero-cant`, `-bound`, `-kappa`, `-propdata`, `-twr`, `-twrceil`, `-poshold`) into one question aimed at *IEEE RA-L*. Produced with AI assistance (Claude). **Simulated. The propeller torque ratio c comes from measured UIUC data; the motor lag comes from two published system identifications (milestone 7t; tuned at the slower one since milestone 7u, which beats randomising across both, milestone 7v); the cost fit, the plant ranges and the gust model are inherited assumptions.**

**Live page:** https://marisstella.app/research/codesign-cant/

![Left: held-out flights that diverged at a 20 degree tilt limit, out of 384, at centre-of-pressure levers 2 and 3. Centre of pressure above: 4, 9, 7 and 8 at lever 2 and 68, 73, 66 and 75 at lever 3 for milestone 7e's designs, milestone 7h's thrust-to-weight-free designs, and the lever-aware designs at thrust-to-weight 2 and free. Below: 45, 38, 20 and 14 at lever 2 and 159, 146, 87 and 86 at lever 3. Right: each design's mass against its diverged flights at lever 3: one falling curve from about 35 of 64 at 1.15 kg to 5 at 2 kg, whatever the arm.](experiments/m7i_aware/m7i_aware.png)

## Ten seeds for the linear stability certificate (2026-11-23): does an 11-state linear check still catch every drone crash, and is the tilt limit what hides the rest? Yes and yes

**Question.** Section VI's certificate (an 11-state linear model of one horizontal axis, its spectral radius checked at each flight's own plant) was tested at six seeds per set (milestones 7c and 7d). At six seeds it was necessary but not sufficient. No flight it called stable diverged, but 300 it called unstable flew on, held by the 20° tilt-command limit. Seeds 6-9 were added to every set (32 new CMA-ES runs with each milestone's own code; the retrained designs from milestones 12b and 12f), and both milestones were re-run through their own functions.

![Held-out flights that diverged against the tilt-command limit, ten seeds per set, 6 and 18 second flights, lever 0. Bolted-on designs: 138 at 20 degrees, 592 at 30, all 640 from 45. Designs at 1.25 times their integral-gain ceiling: 0 at 20 degrees, 6 at 30, 317 (6 s) and 535 (18 s) at 45, against 595 the linear model calls unstable. Retrained designs on the ceiling: 2 at 20 degrees, 31 at 45. Designs at 0.8 times the ceiling: 0 at every limit.](experiments/m12g_ten_seeds_7c7d/m12g_tilt.png)

**Headline ([`experiments/m12g_ten_seeds_7c7d/stats.txt`](experiments/m12g_ten_seeds_7c7d/stats.txt); 32 new CMA-ES runs plus 4 reproduction runs, 52 min on 4 cores; 11 predictions committed to `LOG.md` before the run, 10 held; five reproduction checks exact ([`checks.txt`](experiments/m12g_ten_seeds_7c7d/checks.txt)); simulated).**

- **Still necessary.** Over 80 design-conditions × 64 held-out flights, no flight the certificate calls stable diverges: **0 of 4,478** (seeds 6-9 alone: 0 of 1,790). It catches all 140 that do.
- **Still not sufficient, and the false alarms all come from one place.** All 502 false alarms are bolted-on designs sitting 2.3-3.4× past their ceiling. Accuracy is 0.902, the same as at six seeds.
- **The tuner lives on the boundary.** Left alone, CMA-ES puts the integral gain at 0.85-1.11× its ceiling. The two new seeds below 0.9× are unstable at one held-out plant each. At lever 0 and the trained 20° limit, each diverges on exactly that flight and no other.
- **The tilt limit hides the instability.** At 1.25× the ceiling the model calls 595 of 640 flights unstable and none diverges at 20°. At PX4's default 45°, 317 diverge in 6 s and 535 in 18 s (88% of the flagged ones). The attitude integrator never reaches its clip, and removing that clip changes at most one flight.
- **For a builder:** run the linear check in the tuning loop and keep the integral gain at 0.8× its ceiling. Those designs crash on 0 of 640 flights at every tilt limit from 20° to 59°. A tune that only passes the check at a 20° limit loses about 5% of flights at 45° (31 of 640).
- **One prediction failed, and the error was mine.** I predicted 6-26 crashes at 45° for the on-ceiling tunes. The result was 31, the count milestone 12b had already stored for the same ten designs. I had not read it before predicting.

## Ten seeds for the authority floor (2026-11-22): why does a margin-tuned drone still crash when the gust lever doubles? Not enough differential thrust; 25-50% more fixes it, airmode does not

**Question.** Section VI's builder rule (keep the attitude integral gain at 0.8× its linear ceiling) leaves a floor of crashes at twice the trained centre-of-pressure lever that no gain margin moves. Milestone 7g traced it to torque authority at six seeds per set. With seeds 6-9 added to all six sets (the above sets from milestone 12b, the below sets trained here with the same code) and every probe re-flown, does the diagnosis hold?

![Held-out flights that diverged at twice the trained centre-of-pressure lever, ten seeds per set, under one probe at a time, at 20 and 45 degree tilt-command limits, with bootstrap 95% intervals. Margin-constrained above designs pooled (of 1,920): base 25 and 69, ideal mixer 7 and 13, ideal mixer with 1.25 times torque 0 and 0, airmode 33 and 75. Unconstrained above (of 640): base 30 and 83, ideal mixer with 1.25 times torque 0 and 3. Constrained below (of 640): base 65 and 82, ideal mixer with 1.25 times torque 8 and 8, with 1.5 times 0.](experiments/m12f_ten_seeds_7g/m12f_authority.png)

**Headline ([`experiments/m12f_ten_seeds_7g/stats.txt`](experiments/m12f_ten_seeds_7g/stats.txt); 16 new CMA-ES runs plus 3 reproduction runs, 36 min on 4 cores; 9 predictions committed to `LOG.md` before the run, 8 held; four reproduction checks exact ([`checks.txt`](experiments/m12f_ten_seeds_7g/checks.txt)); simulated).**

- **The diagnosis holds.** Every one of the 505 base divergences is a tilt-over, none a drift. In the three margin-trained above sets an ideal mixer cuts the 45° count from **69 to 13 of 1,920** (29 of 30 designs better, none worse, exact Wilcoxon p < 10⁻⁵). With 1.25× the torque room on top it falls to 0 at both tilt limits.
- **Size the headroom at 50%, not 25%.** 1.25× leaves 8-9 of 640 in both centre-of-pressure-below sets and 3 of 640 for the unconstrained above tune. 1.5× takes every set to 0 at both limits.
- **Airmode is not a fix.** Letting the mixer shift the collective makes the margin-trained sets slightly worse (69 to 75 at 45°; 6 designs worse, none better, p = 0.03): at thrust-to-weight 2 the collective already sits mid-range. Airmode with 1.5× torque still cuts no set by half at 45°.
- **The unconstrained tune crashes for a different reason (post hoc).** Its 45° deaths see the gust torque at a median 0.59 of the limit (margin sets: 0.87), and halving its position gains cuts them from 83 to 18. It asks for more torque than the thrust polytope gives, consistent with milestone 12b's finding that unconstrained tunes diverge even at the trained lever.
- **For a builder:** if the frame's centre of pressure may sit twice as far from the centre of mass as designed, buy about 50% more roll/pitch authority than the hover thrust polytope gives. A different tune or airmode will not do it.
## Ten seeds below the lag-range knee (2026-11-22): is a 100 ms motor-lag training ceiling enough for a drone tuner? No: it crashes 1.66 times as often as 125 ms, for 3-4% less mass

**Question.** Ten seeds put the knee of section VII's ceiling sweep at about 150 ms (3.8× the slowest published identification, 39.1 ms): 125→150 ms separates, 150→200 ms does not. The row below, 100 ms (2.6×), was still at six seeds (191 against 101 crashes against 125 ms, p = 0.025). Does that step hold at ten seeds, and what does the cheaper ceiling save? Seeds 6-9 of the 100 ms arm were added in both centre-of-pressure geometries, nothing else changed, and the result was compared with the 125 ms arm's ten stored seeds.

**Headline ([`experiments/m12e_ten_seeds_c100/stats.txt`](experiments/m12e_ten_seeds_c100/stats.txt); 16 new CMA-ES runs, 70 min on 4 cores; 9 predictions committed to `LOG.md` before the run, all held; reproduction checks exact ([`checks.txt`](experiments/m12e_ten_seeds_c100/checks.txt)); simulated).**

- **The step holds.** Flights that diverge at twice the trained centre-of-pressure lever and the 45° tilt limit, summed over the 33, 36 and 39.1 ms laws: **326 against 196 of 3,840** (pooled Mann-Whitney p = 0.04). Paired by geometry and seed, 100 ms crashes more in 17 of 20 pairs (exact Wilcoxon p = 0.001). The four new seeds alone do not show it (135 against 95, p = 0.72): one 100 ms seed is among the best designs in either arm.
- **At a 75 ms motor:** 893 against 695 of 1,280, worse in 18 of 20 pairs.
- **What 100 ms saves:** 3-4% mass (median 1.42 against 1.48 kg above, 1.37 against 1.41 kg below) and 0.1-0.15 s of rise on a 1 m step (1.60 against 1.68 s, 1.58 against 1.73 s). All 20 designs pass the linear certificate at the identified lags.
- **The knee at ten seeds:** 326 / 196 / 112 / 86 identified-lag crashes of 3,840 at 100 / 125 / 150 / 200 ms. The first two steps are separated, the last is not. **For a builder:** keep the training ceiling at about 4× the slowest identified lag; 2.6× is not enough.

## Ten seeds past the lag-range knee (2026-11-22): train a drone's motor lag to 200 ms instead of 150? Not for the measured lag, only for slower motors

**Question.** At ten seeds, a 150 ms training-lag ceiling (3.8× the slowest published identification, 39.1 ms) beats 125 ms. Does going to 200 ms (5.1×) still buy robustness at the identified lags? At six seeds the pair gave 65 against 53 crashes, p = 0.16. Seeds 6-9 of the 200 ms arm were added in both centre-of-pressure geometries, nothing else changed, and the result was compared with the 150 ms arm's ten stored seeds.

**Headline ([`experiments/m12d_ten_seeds_c200/stats.txt`](experiments/m12d_ten_seeds_c200/stats.txt); 16 new CMA-ES runs, 46 min on 4 cores; 9 predictions committed to `LOG.md` before the run: 6 held, 3 refuted; reproduction checks exact ([`checks.txt`](experiments/m12d_ten_seeds_c200/checks.txt)); simulated).**

- **Not separated at the measured lag.** Flights that diverge at twice the trained centre-of-pressure lever and the 45° tilt limit, summed over the 33, 36 and 39.1 ms laws: **112 against 86 of 3,840** (pooled Mann-Whitney p = 0.08). Paired by geometry and seed, 150 ms crashes more in 13 of 20 pairs and ties in 4 (exact Wilcoxon p = 0.07). The knee is at about 150 ms. Past it any gain is under a quarter and not detected.
- **At a 75 ms motor, 200 ms more than halves the crashes:** 462 against 217 of 1,280, fewer in 20 of 20 pairs.
- **The price:** 4-7% more mass (median 1.57 against 1.47 kg above, 1.49 against 1.43 kg below) and a slower 1 m step (2.21 against 2.08 s, 2.27 against 1.83 s). All 20 designs pass the linear certificate at the identified lags.
- **For a builder:** keep the training ceiling at about 4× the slowest identified lag. Go to 5× only if your motors may really be slower than identified.

## Ten seeds for the lag-range knee (2026-11-22): train a drone's motor lag up to 125 or 150 ms? 150 ms: it crashes 43% less at the measured lag

**Question.** Section VII's ceiling sweep found the identified-lag crash count falling from a 78.2 ms to a 200 ms training-lag ceiling, but at six seeds per geometry it could not tell 125 ms (3.2× the slowest published identification, 39.1 ms) from 150 ms (3.8×): 101 against 65 crashes, p = 0.10. The builder rule had picked 125 ms for its faster rise. With seeds 6-9 added to both arms in both centre-of-pressure geometries (nothing else changed), are they different?

**Headline ([`experiments/m12c_ten_seeds_vii/stats.txt`](experiments/m12c_ten_seeds_vii/stats.txt); 32 new CMA-ES runs, about 2 h 20 min on 4 cores; 8 predictions committed to `LOG.md` before the run, all held; reproduction checks exact ([`checks.txt`](experiments/m12c_ten_seeds_vii/checks.txt)); simulated).**

- **They differ.** Flights that diverge at twice the trained centre-of-pressure lever and the 45° tilt limit, summed over the 33, 36 and 39.1 ms laws: **196 against 112 of 3,840** (pooled Mann-Whitney p = 0.004). Paired by geometry and seed, 125 ms crashes more in 17 of 20 pairs (exact Wilcoxon p = 0.00003). The four new seeds alone give 95 against 47.
- **At a 75 ms motor the gap is wider:** 695 against 462 of 1,280, worse in 19 of 20 pairs.
- **The price is rise time:** median rise to 90% of a 1 m step 2.08 against 1.68 s (centre of pressure above) and 1.83 against 1.73 s (below). All 40 designs pass the linear certificate at the identified lags.
- **For a builder:** set the training ceiling at about 4× the slowest identified lag, not 3-4×. Pick 125 ms only if rise time matters more than the extra crashes. Whether 200 ms still beats 150 ms: not at the identified lags (ten seeds, section above).

## Ten seeds for the stability margin (2026-11-22): how much integral-gain margin should a drone tuner keep? Still 0.8× the linear ceiling, and without it a fifth of tunes crash at their own tilt limit

**Question.** Section VI's Table VI-1 (milestones 7b, 7e, 7f) says a CMA-ES tuner with the side-force feed-forward should keep the attitude integral gain at 0.8× the 11-state linear model's ceiling. It rested on six seeds per arm. With seeds 6-9 added to all six arms (nothing else changed), exact Wilcoxon tests and bootstrap intervals, does it hold?

**Headline ([`experiments/m12b_ten_seeds_vi/stats.txt`](experiments/m12b_ten_seeds_vi/stats.txt); 48 new CMA-ES runs, 51 min on 4 cores; 8 predictions committed to `LOG.md` before the run, 7 held; three reproduction checks exact; simulated).**

- **The knee holds at 0.8×.** At PX4's default 45° tilt limit, held-out flights diverged (of 640) with no bound / 1.0× / 0.9× / 0.8× / 0.7× / 0.6× of the ceiling: **31 / 19 / 6 / 1 / 1 / 0**. From 0.8× down every arm beats the unconstrained tune in 10 of 10 seeds (Wilcoxon p = 0.002).
- **New at ten seeds: unconstrained tunes crash at the limit they were trained at.** Two of the four new unconstrained designs each diverge on 1 of 64 flights at the 20° tilt limit and lever they were tuned for; seeds 0-5 never did. No constrained design diverges there (0 of 640 in all five arms). So the linear check is not only insurance against a looser autopilot setting.
- **The margin's price is about 0.8% of held-out cost**, measured post hoc over the 8 seeds whose unconstrained tune stayed stable (0.012, 95% interval 0.008-0.016, worse in 8 of 8, p = 0.008). Over all ten seeds the two crashing tunes make the constrained arms cheaper on average, not significantly.
- **The torque-authority floor is unchanged:** at twice the trained centre-of-pressure lever 23 of 640 flights diverge at 0.8×, 0.7× and 0.6× alike. No gain margin removes it (milestone 7g: thrust headroom does).

## Ten seeds (2026-11-21): does canting a quadrotor's motors still pay with ten seeds and proper tests? Yes, but the shared thrust budget does not make it pay more

**Question.** Milestones 1 and 2 ran five seeds, so their paired results rested on sign counts with a floor of p = 0.06. With seeds 5-9 added (nothing else changed) and exact Wilcoxon tests and bootstrap intervals, which findings hold?

**Headline ([`experiments/m12_ten_seeds/results.txt`](experiments/m12_ten_seeds/results.txt); 205 new CMA-ES runs, 27 min on 4 cores; predictions committed to `LOG.md` before the run; simulated).**

- **The cant result holds at ten seeds.** With the corrected allocation at TWR 2 cant ≤ 35° beats no cant by 4.85° of held-out attitude RMS (95% interval 4.79-4.92°, 10 of 10 seeds, Wilcoxon p = 0.002). Under the per-axis torque box it wins 10 of 10 at every power price. Under PX4-style attitude-priority mixing it wins 9 of 10 (p = 0.004), and 9 of 10 at 1° per 100 W with three starts (3.84°, p = 0.004).
- **Correction: the shared polytope does not make cant worth more.** At five seeds cant's advantage looked larger under the attitude-priority mixer (6.08° against 4.81°). At ten it is 4.98° (3.64-5.91°) against 4.86°. Three of the five new uncanted seeds found a second optimum at about 1700 W that barely saturates, and the five-seed claim rested on seeds that all found the saturated one. The paper draft's section IV is rewritten to match.
- **Single-start CMA-ES fails on the polytope even with no power price:** one of ten seeds at λ = 0 chose 9.5° and lost to no cant. Restarts remain necessary.
- Sections IV-V of the [draft](paper/DRAFT.md) now quote Wilcoxon p and bootstrap intervals for every paired result (`stats.py`, stdlib). `paper/check_numbers.py` checks 124 figures.

## Paper step (2026-11-21, second): the whole draft, introduction to conclusion, and one figure for the cant results

**Question.** With the model, results and stability sections written, what does the paper argue end to end, and where exactly does the co-designed cant fail to win?

**Headline ([`paper/DRAFT.md`](paper/DRAFT.md), sections I, II, VIII, IX and figure IV-V; reads existing results files and runs no new flights; simulated).**

- **Every section is now written in full.** The introduction states the gap (tilted-rotor work chooses tilt for full actuation on six or more rotors; co-design work fixes or derives the controller) and five contributions; the related work covers both literatures, attitude and learned control, randomisation ranges and plant-family stability with the checked bibliography; the limitations section groups what is still open.
- **Figure IV-V** ([`paper/fig_IV_V.png`](paper/fig_IV_V.png), [`paper/figures_iv_v.py`](paper/figures_iv_v.py)): cant wins 148 of 150 seed-conditions (3 laws × 10 seeds × the stylised simulator and four RotorPy conditions). Both losses are INDI under RotorPy's injected-torque condition, the law that leans hardest on an actuator model. The chosen cant is 31-37° in all 30 milestone-4 seeds, above the rule of thumb's 5-20°.
- `paper/check_numbers.py` checks 119 quoted figures; a new test recomputes the figure's points from the printed results.

![Left: each seed's cant-minus-no-cant held-out attitude RMS for PID, INDI and geometric control, in the stylised simulator and four RotorPy conditions, all below zero except two INDI seeds under injected torque. Right: each seed's chosen cant, 31 to 37 degrees for the three laws, above a grey 5 to 20 degree band.](paper/fig_IV_V.png)

## Paper step (2026-11-21): does canting a quadrotor's motors pay under every attitude controller? Sections III-V of the draft

**Question.** The paper's central result (a fixed rotor cant of about 30-35° pays on a small X quadrotor, whichever attitude law flies it, and survives a second simulator) sat in three-line outlines. Written out in full, with every number checked against its results file, what does it say?

**Headline ([`paper/DRAFT.md`](paper/DRAFT.md), sections III-V; reads existing results files and runs no new flights; simulated).**

- **Table IV-1:** cant ≤ 80° beats no cant by 5.27° (PID), 4.18° (INDI) and 4.88° (geometric) of held-out attitude RMS, 10 of 10 seeds each, with the median chosen cant 33.9-35.3°. INDI without cant stays 4.02° worse than PID with cant.
- **Pricing hover power shrinks the vehicle, not the angle:** at 0.3° per 100 W hover power falls 4.9-7.1× and the chosen cant stays at 28-37° (9 of 10 seed-arms with three starts).
- **RotorPy keeps the arm ranking** (ρ 0.943-1.000) and cant's win (10 of 10 seeds per law in every aero condition). The stylised model is 1.25-1.47° optimistic, most for INDI.
- `paper/check_numbers.py` now checks 115 quoted figures. Two new tests recompute Table IV-1 and the arm ranks from the raw per-seed values.
- **Corrections:** the outline's "34-35°" was 33.9-35.3°, and milestone 2's "4-7× in every arm" misses uncanted airmode (10.8×). Neither changes a reading.

## Milestone 7ai: can you compute a drone's attitude-loop lag from its gains, with no test flight? Yes: linearise the loop, average over the plant range

**Question.** 7ah read the lag between the commanded and achieved horizontal acceleration off one flown acceleration step, and with it the point mass predicts rise time within 0.10 s for 36 of 36 designs. Can a builder get the same lag from the design file alone, and what made 7ah's untraced early jump and steady overshoot?

**Headline (`experiments/m7ai_lag_model/verdicts.txt`, `results.json`, `posthoc.txt`; 216 flights, 67 s on 4 cores; simulated; 9 predictions committed first, 7 held).**

- **The lag is computable.** The 11-state linearisation of the loop (`linstab.accel_step`, outer loop open), averaged over a 3×3×3 grid of the plant randomisation box, gives each design's area lag within 10 ms of the flown one for 36 of 36 (median 0.5 ms) and its 63% time within 15 ms for 34 of 36.
- **Rise time with no flight at all:** that computed 63% time in the lagged point mass is within 0.10 s of the flown rise for 36 of 36 designs in all seven conditions, never more than 1 ms worse in median error than the flown lag.
- **Average over the range, not the nominal plant:** at the nominal plant alone the 63% time is within 15 ms for only 18 of 36.
- **The early jump is the canted rotors' side force:** switched off, the share of the request reached at 50 ms falls from 0.22 to 0.10 (median), and the 63% time moves by more than 15 ms for 28 of 36 designs, so a lag measured on a flat frame does not carry over to a canted one.
- **7ah's 6% steady overshoot was the small-angle lean map** (with arctan(a/g): 1.7%) plus a slow ring of the loop that the linear model reproduces within 0.01 for 36 of 36.
- **Limits:** the linear model is the simulator's own linearisation, so this shows the simulated lag is computable, not that a real vehicle's is; one evaluation seed; rise times scored are 7ag's, already published.

![Left: lag from the linear model against the lag read off a flown acceleration step, 36 designs; the area estimates lie on the equal line from about 50 to 285 ms, the 63% times on it except one at 30 ms flown against 156 ms computed and three about 15-40 ms high. Right: achieved over steady acceleration after a 1 m/s² request for the median-lag design: flown and linear curves overlap; with the side force the response jumps to about 0.35 within 50 ms and dips before the lean arrives, without it the rise starts slower, overshoots to about 1.07 of the 2 s window's final value and is still settling at 1 s.](experiments/m7ai_lag_model/m7ai_lag_model.png)

## Milestone 7ah: how do you get a drone's attitude-loop lag without fitting it to a position step? Fly one acceleration step and read its 63% time

**Question.** 7ag's point mass predicts a capped, gated position loop's rise time from its gains, and one first-order lag on the achieved acceleration fixes its misses on short steps and hard caps. But that lag (135 ms) was fitted on a flown position step, the very thing it predicts. Can a builder read it off a test that does not contain the answer: an open-outer-loop acceleration (lean) step?

**Headline (`experiments/m7ah_att_step/verdicts.txt`, `results.json`, `posthoc.txt`; 216 probe flights, 27 s on 4 cores; simulated; 9 predictions committed first, 4 held).**

- **The lag is the attitude loop's, and it is about 170-180 ms, not 135.** From hover, the horizontal acceleration request stepped to 3.5 m/s² (new probe `poshold.rollout(acc_cmd=...)`), the achieved acceleration's area estimate is 171 ms and its 63% time 182 ms (medians over 36 designs). Neither the motor law (33 to 39.1 ms) nor the step size (1 or 3.5 m/s²) moves any design's lag by more than 10-15 ms.
- **The identified lag predicts rise at least as well as the fitted one.** With each design's 63% time, the lagged point mass puts 36 of 36 designs within 0.10 s in all seven of 7ag's conditions, A_P = 8 m/s² and the 0.5 m step included (median error 0.017 and 0.011 s, against 0.035 and 0.020 s fitted and 0.085 and 0.062 s with no lag). The area estimate does nearly as well (34 and 35 of 36).
- **One lag per airframe class is enough:** the pooled median does as well as each design's own in 5 of 7 conditions.
- **Why the fit came out short:** 7ag's grid stopped at 150 ms and its in-sample objective is flat (0.006 s error at 135 ms, 0.004 s at 190 ms). The response is not first order: about a fifth of the request arrives within 50 ms, before the frame has leaned far (most likely the canted rotors' side force; not isolated), then the lean, 95% at 0.5 s.
- **For a builder:** fly one acceleration step, read the time to 63% of the steady acceleration, and integrate the lagged point mass with that lag; no position flight is needed to predict rise time.
- **Limits:** one simulator, whose attitude loop is the stylised one of the earlier milestones; the lags were identified blind to the rise times, but scored against 7ag's already-published flights; one evaluation seed; calm air.

![Left: achieved over steady acceleration after a 3.5 m/s² request step for the designs with the shortest, median and longest identified lag, against a 171 ms first-order lag; the curves jump to about 0.1-0.3 within 50 ms, then rise, reaching about 0.95 by 0.5 s. Right: median rise-prediction error per condition; the no-lag point mass reaches 85 ms at A_P 8 and 62 ms at the 0.5 m step, the fitted 135 ms lag 35 and 20 ms, the identified lags 17-20 and 11-12 ms.](experiments/m7ah_att_step/m7ah_att_step.png)

## Milestone 7ag: can you predict a drone's step-response rise time from its position gains without flying it? Yes, to 0.04 s, where the proportional cap governs

**Question.** 7af fitted a line through 36 flown designs: with the proportional request capped at A_P, a 1 m step's rise time follows A_P/kd. A builder can only use that where it was not fitted. Flown again at other caps (2 to 8 m/s²) and step sizes (0.5 to 2 m), does it hold, and does a fitted-nothing model of the outer loop do better?

**Headline (`experiments/m7ag_cruise/verdicts.txt`, `results.json`, `posthoc.txt`; 756 flights, 3 min on 4 cores; simulated; 10 predictions committed first, 7 held).**

- **A 20-line point mass predicts the rise.** Integrating x'' = −min(kp|x|, A_P) sgn x − kd x' + ki I (integrator gated at 0.25 m) from rest, with no fitted constant, predicts each design's median rise within 0.10 s for 35-36 of 36 designs at A_P = 2, 2.5 and 5 m/s² and at a 2 m step; median error 0.002 to 0.040 s on rises of 0.8 to 4.6 s ([`cruise_model.py`](experiments/m7ag_cruise/cruise_model.py)).
- **7af's line is a local fit.** It is biased +0.11 s at A_P = 2 and +0.14 s at a 2 m step, where the point mass is within 0.006 s; the point mass has the smaller error in all six out-of-sample conditions.
- **Motor lag does not move rise:** under the 33 and 39.1 ms laws every design's rise is within 0.05 s of the 36 ms law's, in every condition. No flight diverged at any cap (0 of 2,304 per condition), A_P = 8 included.
- **It misses where braking is most of the travel:** at a 0.5 m step (31 of 36 within 0.10 s) and at A_P = 8 (23 of 36), always on the same side: the drone is faster and overshoots more. Post hoc, one 135 ms lag on the achieved acceleration, fitted on the in-sample condition alone, brings those to 36 and 33 of 36 (median error 0.020 and 0.035 s). The braking lean comes late; it is the attitude loop, not the motor.
- **For a builder:** with a capped, gated position loop, compute the rise time from kp, kd, ki, A_P and the step size before flying; for short steps or a cap above about half of g·tan(tilt limit), add one acceleration lag read off a single flown step.

![Left: simulated median rise time against the point-mass prediction for 36 designs in seven conditions; the points lie on the y = x line from 0.8 to 4.6 s, inside a ±0.10 s band except at A_P 8 and the 0.5 m step, where they sit just below it. Right: simulator minus prediction per condition, for the point mass (circles, within ±0.04 s at A_P 2-5 and S 1-2 m, down to −0.19 s at A_P 8) and 7af's line (crosses, +0.1 s at A_P 2, +0.15 s at S 2 m).](experiments/m7ag_cruise/m7ag_cruise.png)

## Milestone 7af: ask a drone tuner for a fast set-point step and it wins back the rise time by lowering kd, with no extra crashes

**Question.** Gating the position integrator near the set point (milestone 7ad) fixed every tune that stopped short of a 1 m step but slowed the rise by 10%, and retraining with the gate on (7ae) did not win it back. The training objective (gusts, small start offsets, yaw steps) never contained a set-point step. If one is added as a fourth training condition, does the tuner buy the rise time back, and at what cost?

**Headline (`experiments/m7af_step_obj/verdicts.txt`, `results.json`; about 2 h on 4 cores; simulated; 9 predictions committed first, 7 held).**

- **All the rise time comes back, and more.** Trained with the gate and a 1 m step, the 12 designs rise to 90% in a median 1.41 s against 1.83 s for 7ae's (Mann-Whitney p = 3.7e-05), faster than the original always-on-integrator tunes (1.57, 1.65 s).
- **The knob is kd, because the proportional term is capped.** With the proportional request capped at A_P = 3.5 m/s² the vehicle cruises most of the step at about A_P/kd. The tuner lowered kd from about 6.5 to 4.7 s⁻¹ (and kp from about 17 to 13 s⁻²); over 36 designs rise time follows kd with Spearman ρ = 0.999, and rise ≈ 0.90 · 0.9 m / (A_P/kd) + 0.33 s (r = 0.9994, post hoc).
- **No crash price:** 97 against 107 crashes over the identified lags (of 2,304, p = 0.84), every design certified and settled with the gate.
- **The price is overshoot:** 4.7-5.3 cm median against 1.1-1.8 cm, a few millimetres more wind-step drift and 0.5-3.6% worse gust tracking. Two of twelve designs reach 1.37-1.41 s at 2.3-2.5 cm, off the frontier 7ae's sets sat on, so 7ae's "slower rise is the price of not overshooting" was too strong: the rise was slow because training never asked for it.
- **For a builder:** gate the integrator and put a set-point step in the tuning objective; with a capped proportional term, read the rise time off A_P/kd before flying.

![Left: rise time against overshoot on a 1 m step, one point per design, all flown with the integrator gated at 0.25 m. 7ac's designs (orange) and 7ae's band-trained designs (blue) rise in 1.65-2.35 s with 1-3.5 cm overshoot; 7af's designs trained with a 1 m step (green) rise in 1.3-1.6 s with 2.3-7.3 cm. Right: rise time against outer-loop kd for the same 36 designs: one straight rising line from 1.3 s at kd 4.1 to 2.35 s at kd 8.6, with the cruise speed A_P/kd on the top axis.](experiments/m7af_step_obj/m7af_step_obj.png)

## Milestone 7ae: if a drone tuner trains with integrator anti-windup on, does it win back the rise time? No: it drops the integral gain instead

**Question.** Milestone 7ad fixed the tunes that stop short of a 1 m step by running the position integrator only within 0.25 m of the set point (conditional integration), at no crash cost but a 10% slower rise. That fix was bolted on after training. If the CMA-ES tuner sees the band while it tunes, does it raise the other gains and buy the rise time back?

**Headline (`experiments/m7ae_cint_train/verdicts.txt`, `results.json`; about 1.7 h on 4 cores; simulated; 7 predictions committed first, 4 held).**

- **No rise time comes back.** Retrained at the 125 ms lag ceiling with the band on, the 12 designs rise to 90% of the step in a median 1.83 s against 1.84 s for the old tunes flown with the band (Mann-Whitney p = 0.95); slower with the centre of pressure above (2.11 against 1.91 s), faster below (1.74 against 1.82 s).
- **The tuner drops integral action instead of stiffening the loop.** Position kp and kd are unchanged (p = 0.84, 0.98), while ki/kp falls about tenfold (median 0.057 → 0.005 s⁻¹, p = 0.069 post hoc). The new tunes settle with or without the band (0 and 1 of 12 unsettled, against 5 of 12 for the old tunes without it).
- **Nothing else moves:** all 12 certified, crashes over the identified lags 47, 60 against 39, 62 of 1152 (p = 0.52, 1.0), overshoot 1.1-1.8 cm; the 6 m/s wind-step residual grows by 1-3 mm.
- **For a builder:** the old tunes' fast rises (1.35-1.6 s) came with 7-16 cm overshoots; every set lies on one rise-overshoot frontier (figure, left). The slower rise is the price of not overshooting, not a mis-tune. Gate the integrator; retraining is optional.

![Left: rise time against overshoot on a 1 m step, one point per design. Tunes trained and flown with the integrator always on (red) rise in 1.35-1.6 s with 7-16 cm overshoot or in 1.7-2.2 s with 1-3 cm; with the band added after training (orange) or trained with it (blue) every design overshoots under 4 cm and rises in 1.65-2.35 s, along the same frontier. Right: outer-loop kp against ki/kp: the band-trained designs (blue) keep kp at 14-23 but sit at ki/kp below 0.025 except one, while the always-on designs spread to 0.17.](experiments/m7ae_cint_train/m7ae_cint_train.png)

## Milestone 7ad: why does a co-designed drone stop 5-8 cm short of its set point? The position integrator's slow pole, and conditional integration fixes it

**Question.** In every motor-lag training range of milestones 7y-7ac, one to five of twelve tuned quadrotors end a 1 m position step 5-8 cm from the hold point. Is it the motor lag, the soft position gain, or something else, and can a builder fix it without retuning?

**Headline (`experiments/m7ad_settle/verdicts.txt`, `results.json`; about 32 min on 4 cores; simulated; 8 predictions committed first, 7 held).**

- **The cause is the outer loop alone.** A PID position loop on a double integrator has a slow root near −ki/kp, so what the integrator stores on the way in leaves a tail that decays over kp/ki seconds. A three-state model of the outer loop (no attitude loop, motor lag or side force; [`experiments/m7ad_settle/model.py`](experiments/m7ad_settle/model.py)) called **96 of 96** designs never step-tested before correctly (15 unsettled) and matched the full simulator's last-second distance with **r = 0.9995**; the call did not change between the 33, 36 and 39.1 ms motor-lag laws for any of them.
- **Conditional integration fixes it for free in crashes.** Running the position integrator only while the error is under 0.25 m (textbook anti-windup) left **0 of 72** designs unsettled (18 before), cut the median overshoot from 5.1 to 2.0 cm and left the stress test where it was (819 against 820 crashes over the identified lags; paired p = 0.89) and the wind-step response unchanged.
- **The price is rise time:** median 1.74 → 1.91 s on the 1 m step, because the integrator no longer helps pull the vehicle in. A 0.1 m band behaves the same (814 crashes).
- **For a builder:** if your position loop has integral action, gate it near the set point; and check a tune's ki/kp with a three-state simulation before flying it: on a 6 s horizon, ki/kp above about 0.07 s⁻¹ leaves a visible tail.

![Left: each design's distance from the hold point over the last second of a 1 m step against its outer-loop ki/kp. With the integrator always on (red, 72 designs; orange, 96 untested designs) the distance rises from under 1 cm at ki/kp near 0 to 5-9 cm above 0.07 and 14 cm at 0.17; with conditional integration (blue) every design stays under about 2 cm. Right: the three-state model's last-second distance against the full simulator's for the same 168 designs, all on the diagonal.](experiments/m7ad_settle/m7ad_settle.png)

## Paper step (2026-11-19): how wide should a drone tuner randomise motor lag? Section VII of the draft, with pooled tests

**Question.** Eleven milestones (7s-7ac) retrained the co-designed quadrotor with different motor-lag training ranges, each reported with six seeds per geometry and per-cell tests that rarely separated neighbours. Written up as one section, what do they say, and which differences hold once the two centre-of-pressure geometries are pooled (12 designs a side)?

**Headline ([`paper/DRAFT.md`](paper/DRAFT.md), section VII; [`paper/table7_stats.py`](paper/table7_stats.py) and [`paper/table7_stats.txt`](paper/table7_stats.txt); post hoc, reads existing results files, runs no new flights; simulated).**

- **Drawing the training lag exactly across the measured range is the worst choice tested.** 33-78.2 ms crashes on 486 of 2,304 identified-range stress flights; moving only the floor to the slow identified value (39.1-78.2 ms) gives 348 (pooled Mann-Whitney p = 0.011).
- **The ceiling, not the floor, buys robustness.** With a 150 ms ceiling the floor no longer matters (39.1 against 75 ms floor: 65 against 62, p = 0.83). Along the ceiling sweep 78.2 / 100 / 125 / 150 / 200 ms the identified-range total falls 348 / 191 / 101 / 65 / 53 (Jonckheere-Terpstra trend p at the permutation floor in both geometries); neighbours separate up to 125 ms (p = 0.018, 0.025), not after (p = 0.10, 0.16). At a 75 ms motor every step of ceiling pays (all p ≤ 0.0002).
- **Table VII-1** gathers all eleven training ranges with crashes, rise time and mass, and is generated from the results files by `paper/check_numbers.py` (58 checks), so the draft cannot drift from the data.
- **For a builder:** anchor the randomised lag at the slowest identification for your motor class, never draw faster plants, and set the ceiling at about 4× it (ten seeds at 125 and 150 ms, 2026-11-22, separated the pair this six-seed sweep could not); the price is rise time (1.44 s at 78.2 ms to 2.0-2.3 s at 200 ms), not crashes.

## Milestone 7ac: is there a sharp knee in how wide a drone's motor-lag training range must be? No: a slope, and 3× gets most of it at the measured lag

**Question.** Milestone 7ab found that training over 100 ms of motor lag (2.6× the measured 39.1 ms) leaves the co-designed quadrotor crashing three times as often in the stress test as training up to 150 ms, and that the 150 ms tune rises much slower on a step. Where between the two does the robustness arrive, and does the response price come with it? The same arm was retrained at the 39.1 ms floor with a 125 ms ceiling (24 CMA-ES runs) and scored with all five earlier tunes, which reproduced exactly.

**Headline (`experiments/m7ac_ceil125/results.txt`, `verdicts.txt`, `posthoc.txt`; about 1.5 h on 4 cores; simulated; 6 predictions committed first, 4 held).**

- **A slope, not a cliff.** Stress crashes over the identified lags (of 1152, centre of pressure above, below) by ceiling 78.2 / 100 / 125 / 150 / 200 ms: 170 / 82 / **39** / 27 / 17 and 178 / 109 / **62** / 38 / 36. With six seeds the 125 ms tune is not separated from the 150 ms tune in 5 of 6 identified-lag cells.
- **Robustness to slower-than-measured motors grows about linearly with the ceiling:** flown at a 75 ms lag, 266 / **204** / 138 / 50 crashes of 384 (above) for 100 / 125 / 150 / 200 ms, 125 against 150 ms p = 0.010.
- **Response:** rise to 90% of a 1 m step 1.57, 1.65 s, close to the 100 ms tune's 1.47, 1.54 s and faster than the 150 ms tune's 2.23 s with the centre of pressure above (p = 0.026). The cost: 5 of 12 designs never settle within 5 cm (they hover 6-8 cm off), the most of any ceiling.
- **For a builder:** if your motors are known to sit near the measured lag, about 3× it buys nearly all the robustness at a fast rise; if they may be slower, each extra millisecond of training range keeps paying, so 4× or more.

![Three panels against the training lag ceiling at the 39.1 ms floor (78.2, 100, 125, 150, 200 ms), centre of pressure above in blue and below in red, the 75 ms tune dashed, 125 ms marked. Left: crashes over the identified lags fall 170-178, 82-109, 39-62, 27-38, 17-36. Middle: crashes at the 75 ms law fall almost on a straight line, 331-339, 266-277, 204-206, 131-138, 50-71. Right: rise time 1.4, 1.5, 1.6 s up to 125 ms, then 1.8-2.2 s at 150 ms and 2.0-2.3 s at 200 ms.](experiments/m7ac_ceil125/m7ac_ceil125.png)

## Milestone 7ab: how wide a motor-lag range should you train a drone over? At least 4× the measured lag

**Question.** Milestone 7aa found that training across a wide motor-lag range (the measured 39.1 ms up to 150 ms), not tuning for a slower nominal motor, is what makes the co-designed quadrotor robust in the stress test (twice the trained centre-of-pressure lever, 45° tilt limit). How wide is enough, and does wider cost anything? The same arm was retrained at the 39.1 ms floor with ceilings of 100 and 200 ms (48 CMA-ES runs) and scored with 7u's 78.2 ms, 7aa's 150 ms and 7z's 75 ms tunes.

**Headline (`experiments/m7ab_ceilsweep/results.txt`, `verdicts.txt`, `posthoc.txt`; about 2.2 h on 4 cores; simulated; 7 predictions committed first, 4 held, one after a disclosed scoring fix).**

- **100 ms is not enough.** Stress crashes over the identified lags (of 1152, centre of pressure above, below) by ceiling 78.2 / 100 / 150 / 200 ms: 170 / 82 / 27 / 17 and 178 / 109 / 38 / 36. The 100 ms tune crashes more than the 150 ms tune in 11 of 12 cells from 33 to 75 ms (p = 0.002-0.046).
- **Beyond 150 ms, more coverage is free inside the measured range and pays at slow motors:** flown at a 75 ms lag the 200 ms tune crashes on 50, 71 of 384 against 138, 131 (p = 0.005, 0.020) and the 75 ms tune's 117, 103.
- **The price is response:** rise to 90% of a 1 m step 1.47, 1.54 s at 100 ms (as fast as the narrow tune), 2.23, 1.76 s at 150 ms, 2.02, 2.27 s at 200 ms; the 200 ms designs are 5-7% heavier and half of the `above` ones never settle within 5 cm. The widest range is also the hardest to certify (20%, 17% of candidates rejected against 15%, 13%).
- **For a builder:** train over at least about 4× your measured motor lag; go wider only if your motors may really be that slow, and expect a slower approach for it.

![Three panels against the training lag ceiling at the 39.1 ms floor (78.2, 100, 150, 200 ms), centre of pressure above in blue and below in red, the 75 ms tune dashed. Left: crashes over the identified lags fall 170-178, 82-109, 27-38, 17-36. Middle: crashes at the 75 ms law fall 331-339, 266-277, 131-138, 50-71, below the 75 ms tune's 103-117 only at 200 ms. Right: rise time grows from about 1.4 s to 2.0-2.3 s.](experiments/m7ab_ceilsweep/m7ab_ceilsweep.png)

## Milestone 7aa: tune a drone for its measured motor lag or a slower one? Train across a wide lag range instead

**Question.** Milestones 7u-7z found that tuning for a slower motor lag than the measured one cuts crashes in the stress test (twice the trained centre-of-pressure lever, 45° tilt limit). But each slower floor F also raised the ceiling of the training plants (lag F to 2F). Is the robustness bought by leaving out fast plants or by covering slow ones? The lever-aware arm was retrained at the identified 39.1 ms floor with the ceiling at 150 ms (training lags 39.1-150 ms, certificate at 33, 39.1 and 150 ms; 24 CMA-ES runs) and scored on 7x's stress test and 7y's response tests.

**Headline (`experiments/m7aa_ceiling/results.txt`, `verdicts.txt`, `posthoc.txt`; about 1.5 h on 4 cores; simulated; 6 predictions committed first, 4 held).**

- **Coverage, not a slow nominal lag, is what makes the tune robust.** Stress crashes over the identified lags: 27, 38 of 1152 (centre of pressure above, below), against 170, 178 for the 39.1 ms tune trained on 39.1-78.2 ms, 36, 51 for the 60 ms tune and 29, 33 for the 75 ms tune. Against the narrow 39.1 ms tune it crashes less in all 12 cells from 33 to 75 ms (p = 0.002-0.005); against the 75 ms tune it is not separated in any (p = 0.38-1.0).
- **Training on exactly the test range was the worst choice.** The narrow tune, trained on the very interval the 39.1 ms law flies, crashes 72, 73 times there; the wide tune, trained mostly on slower plants, crashes 11, 15.
- **No response bonus:** rise to 90% of a 1 m step 2.23, 1.76 s against the 75 ms tune's 1.98, 1.86 (not separated); overshoot 3.6, 3.5 cm. Four of 12 designs keep a slow final approach (position kp 5-8).
- **For a builder:** train across the lag range your motors could plausibly have, anchored at the measured lag, rather than picking a slower nominal one; on these tests the result matches the 75 ms tune and states the assumption honestly.

![Left: 7z's tuning-floor frontier (stress-test crashes over the identified lags, of 1152, against rise time to 90% of a 1 m step) with the wide tune as a star: centre of pressure below at 38 crashes and 1.76 s, on the frontier and better than the 60 ms tune (51 at 1.77 s); above at 27 and 2.23 s. Right: crashes at lever 2, 45 degrees, of 384, against the flown lag law from 33 to 75 ms: the narrow 39.1 ms tune rises from about 40 to 335, the wide and 75 ms tunes from about 10 to 103-138.](experiments/m7aa_ceiling/m7aa_ceiling.png)

## Milestone 7z: should you tune a drone for a 75 ms motor? Only if your motors may be slower than measured

**Question.** Milestones 7u-7y found that each slower tuning floor (39.1, 45, 52, 60 ms) crashes less in the stress test (twice the trained centre-of-pressure lever, 45° tilt limit), at about 0.1 s of extra rise time per step on a 1 m position step. Does a 75 ms floor keep paying, and at what price? 7x's lever-aware arm was retrained at 75 ms (24 CMA-ES runs, certificate at 33, 75 and 150 ms) and scored on both 7x's stress test and 7y's response tests.

**Headline (`experiments/m7z_floor75/results.txt`, `verdicts.txt`, `posthoc.txt`; about 1.2 h on 4 cores; simulated; 7 predictions committed first, 4 held).**

- **Inside the identified motor lags (33-39.1 ms) the gain is small:** stress crashes 29, 33 of 1152 against the 60 ms tune's 36, 51 (centre of pressure above, below), not separated at six seeds in five of six cells; at the fast 33 ms motor the two tie.
- **At slower motors the 75 ms tune clearly wins:** flown at 60 ms lag, 49, 45 crashes of 384 against 105, 83; at 75 ms, 117, 103 against 193, 188 (p = 0.010-0.026 in three of four cells).
- **The price grows:** rise to 90% of a 1 m step 1.98, 1.86 s against 1.74, 1.77 (+14%, +5%), and the overshoot trend reverses (4.8, 3.2 cm against 3.2, 2.7), so settle time to 5 cm gets worse (3.2, 2.2 s against 2.4, 1.9). Crashes avoided per extra 0.1 s of rise fall from 41 to 3 with the centre of pressure above (22 to 20 below).
- **Lighter, not heavier:** 1.43 kg on a 0.08-0.09 m propeller against 1.47-1.51 kg on 0.11 m; every design keeps the stability certificate.
- **For a builder:** with motors near the published identifications, tune at 60 ms; tune at 75 ms only if your motors may be slower than the identifications (this test did not model why they would be), and accept a slower, less crisp step.

![Left: stress-test crashes over the identified lags (of 1152) against rise time to 90% of a 1 m step, one point per tuning floor from 39.1 to 75 ms: centre of pressure above 170 at 1.44 s down to 36 at 1.74 s (60 ms) and 29 at 1.98 s (75 ms); below 178 at 1.39 s down to 51 at 1.77 s and 33 at 1.86 s. Right: crashes avoided per extra 0.1 s of rise for each step between floors; with the centre of pressure above it falls from 41 (52 to 60 ms) to 3 (60 to 75 ms).](experiments/m7z_floor75/m7z_floor75.png)

## Milestone 7y: what does tuning a drone for a slower motor cost in step response and wind drift? A 10-20% slower rise, half the overshoot, millimetres of drift

**Question.** Milestones 7u-7x found that tuning for a slower motor lag than the one flown keeps cutting crashes in a stress test (twice the centre-of-pressure lever, 45° tilt limit), with no knee by 60 ms. That test rewards a slow, heavy vehicle by construction. What does the slower tune cost in the units a builder writes into a requirement? 7x's 48 lever-aware designs (39.1, 45, 52 and 60 ms floors) were flown, without retraining, through a **1 m position step** and a **calm-to-wind step (3 and 6 m/s)** at the design lever, under the three identified lags (33, 36, 39.1 ms), with turbulence and yaw steps off.

**Headline (`experiments/m7y_response/results.txt`, `verdicts.txt`, `posthoc.txt`; 137 s on 4 cores; simulated; 6 predictions committed first, 4 held).**

- **The trade is rise time for overshoot.** Rise time to 90% of a 1 m step grows with every slower floor (1.44, 1.58, 1.64, 1.74 s with the centre of pressure above; 1.39, 1.47, 1.61, 1.77 s below), while overshoot shrinks (6.4, 5.9, 3.8, 3.2 cm; 9.7, 7.6, 5.5, 2.7 cm). Both orderings are monotone in all six cells. The 60 ms tune rises 10-20% slower than the 45 ms tune and overshoots a half to a third as much.
- **Settle time barely moves:** to stay within 5 cm, 2.04 against 2.37 s above (+16%) and 2.56 against 1.95 s below (−24%). The slower rise is paid back by the smaller overshoot.
- **Wind drift grows by millimetres:** peak drift after a 6 m/s wind step is 2.3, 1.9 cm (45 ms) against 2.8, 2.4 cm (60 ms), not separated at six seeds.
- **The motor lag itself does not matter in calm air at the design lever** (every metric the same to three decimals at 33, 36 and 39.1 ms); it only matters near the torque limit, where the stress test lives. No flight diverged.
- **A slow tail whatever the floor:** 8 of 48 designs (one to three per set) never settle inside 5 cm in 6 s; they park 5-8 cm short with position gains of 4.5-9.7 s⁻² against a set mean near 20. The stress objective never asks for a fast final approach.
- **For a builder:** read along the four floors, each slower step trades about 0.1 s of rise time for 30-50 fewer stress-test crashes of 1152. If your mission can live with a 1.7-1.8 s rise to 90% on a 1 m step, the 60 ms tune is the recommendation; check the final approach (position gain) separately.

![Left: stress-test crashes over the identified lags (of 1152) against rise time to 90% of a 1 m step, one point per tuning floor: centre of pressure above, 170 crashes at 1.44 s (39.1 ms tune) down to 36 at 1.74 s (60 ms); below, 178 at 1.39 s down to 51 at 1.77 s. Right: step overshoot falls from 6.4 and 9.7 cm (39.1 ms) to 3.2 and 2.7 cm (60 ms) while peak drift after a 6 m/s wind step stays between 1.9 and 2.8 cm.](experiments/m7y_response/m7y_response.png)

## Milestone 7x: is there a motor-lag tuning floor past which a drone stops gaining? Not by 60 ms: crashes keep falling; mass and gain pay

**Question.** Milestone 7w found that tuning a 5-inch quadrotor for a 45 ms motor lag, slower than either published identification (33 and 39.1 ms), crashes less than tuning at 39.1 ms even when flown at 33 ms. Where is the knee? 7w's lever-aware objective was retuned at **52 ms** and **60 ms** (not sourced: tuning floors chosen to bracket a knee; training plants floor × U(1, 2)), with the stability certificate also required at 33 ms, and scored next to 7w's 45 ms and 7u's 39.1 ms designs under seven lag laws.

**Headline (`experiments/m7x_knee/results.txt`, `verdicts.txt`, `posthoc.txt`, `corner_bind.txt`; 48 CMA-ES runs, about 2.6 h on 4 cores; simulated; 7 predictions committed first, 4 held).**

- **No knee by 60 ms.** At twice the centre-of-pressure lever and a 45° tilt limit, crashes over the identified range (33, 36, 39.1 ms; both geometries; of 2304 flights) fall with every slower floor: **348, 236, 162, 87** for 39.1, 45, 52 and 60 ms tunes. At the fast 33 ms end: 27, 34 crashes for the 45 ms tune against 8, 12 for the 60 ms tune. Monotone in 13 of 14 law × geometry cells.
- **A measured gap this time:** 60 ms against 45 ms, Mann-Whitney p = 0.004-0.014 in all six identified cells (post hoc, six seeds). 52 against 45 ms is not separated (p 0.14-0.87).
- **All 24 new designs are certified across 33-39.1 ms.** The extra 33 ms certificate corner was slack on 22 of 24 designs (the radius is set by a mode the lag does not move), so the gain is the floor, not the constraint.
- **The price is a heavier vehicle and a softer loop:** at 60 ms the designs are 4-8% heavier, take a larger propeller and a 20% lower position gain, and track about 5% worse at lever 1. The 52 ms tune has no mass cost and about 3% worse tracking.
- **For a builder:** in this simulator the crash count never sets the tuning floor; slower keeps buying robustness. Pick the floor from what you will give up (mass, endurance, tracking), and keep the certificate checked at the fastest measured lag.

![Two panels, centre of pressure above and below the centre of mass: diverged flights of 384 at lever 2, 45 degrees, against the motor lag flown (33 to 60 ms), one line per tuning floor. The 60 ms line (red) is lowest everywhere, then 52 ms (orange), 45 ms (purple) and 39.1 ms (green): at 39.1 ms, 17, 30, 52 and 72 crashes with the centre of pressure above.](experiments/m7x_knee/m7x_knee.png)

## Milestone 7w: how slow should you tune a drone's motor lag? Slower than the slowest measurement, and it still pays at the fast end

**Question.** Milestones 7u and 7v found that a tuner that knows the 5-inch quadrotor motor lag only as a range (33-39.1 ms, two published identifications) should train on plants no faster than its slow end. Where does tuning slower stop paying? 7u's two objectives were retuned at **45 ms** (not sourced: 15% beyond the slower identification, chosen on purpose to bracket the knee from above; training plants 45-90 ms, certificate corners 45 and 90 ms) and scored next to 7u's 39.1 ms and 7t's 36 ms designs.

**Headline (`experiments/m7w_slow45/results.txt`, `verdicts.txt`, `posthoc.txt`; 48 CMA-ES runs, about 1.7 h on 4 cores; simulated; 7 predictions committed first, 4 held).**

- **Tuning at 45 ms beats tuning at 39.1 ms in 19 of 20 law × arm-geometry cells (one tie), including all four at 33 ms**, the fast end it never trains on: at twice the centre-of-pressure lever and a 45° tilt limit, 75, 77, 27, 34 against 80, 107, 37, 46 crashes of 384 at 33 ms, and 123, 108, 52, 46 against 150, 167, 72, 73 at 39.1 ms. Over the identified range, 21-29% fewer crashes than the slow-end tune and 37-45% fewer than the midpoint tune.
- **No knee yet:** the predicted cost at the fast end did not appear. Mass, propeller and position gain barely move, and tracking is no worse.
- **The price is at the certificate, on its boundary:** 22 of 24 designs stay certified across 33-39.1 ms (7u: 24); the two that fail sit at ρ = 1.0000-1.0002 against a strict ρ < 1. All 24 are certified at 45 ms (7u: 15).
- **Not significant per cell** at six seeds (Mann-Whitney p 0.05-0.47 inside the identified range; all four arm-geometries agree at every lag, sign test p = 0.125). Lever-aware training still halves crashes by buying mass (+9% and +25%).
- **For a builder:** if you know your motor lag only as a range, tune for a motor slower than its slow end, and keep the stability certificate checked at the fast end as the limit on how slow; in this simulator the knee lies beyond 45 ms.

![Two panels, centre of pressure above and below the centre of mass: diverged flights of 384 at lever 2, 45 degrees, under five lag laws, for designs tuned at 36 ms, 39.1 ms and 45 ms. In every group the 45 ms bars (orange, purple) are shorter than the 39.1 ms bars (dark blue, green), for example 46 against 73 for the lever-aware designs at 39.1 ms, centre of pressure below.](experiments/m7w_slow45/m7w_slow45.png)

## Milestone 7v: should you randomise motor lag across its measured range when tuning a drone? No: train at the slow end only

**Question.** Milestone 7u found that tuning at 39.1 ms, the slow end of the measured 33-39 ms motor lag of 5-inch quadrotors, beats tuning at the 36 ms midpoint. Is that the slow value, or would domain randomisation across the whole range do as well or better? In these controllers the lag has no internal model; it sets only the fastest plants the tuner trains on and the corners of the stability certificate. 7u's two objectives were retrained with the lag drawn per episode across 33-39.1 ms (times the usual plant randomisation) and certified at both ends, then scored next to 7u's and 7t's designs.

**Headline (`experiments/m7v_lag_rand/results.txt`, `verdicts.txt`, `posthoc.txt`; 48 CMA-ES runs, about 1.5 h on 4 cores; simulated; 7 predictions committed first, 4 held).**

- **Randomising across the range is worse in 11 of 12 identified cells, including all four at the fast end it added.** At twice the centre-of-pressure lever and a 45° tilt limit, the range-trained designs crash on more flights than the slow-end designs at 33 ms (101, 112, 61, 53 against 80, 107, 37, 46 of 384) and at 39.1 ms (191, 177, 132, 90 against 150, 167, 72, 73), and in 3 of 4 cells at 36 ms.
- **They land between the midpoint and slow-end tunes** (post hoc): the draw's mean lag is 36 ms, and the designs behave like a slightly better midpoint tune. So 7u's gain comes from never training on a plant faster than the slow end, not from the width of the draw.
- **Same vehicles, no fast-end payoff:** mass, propeller and position gain barely move; the extra certificate corner at 33 ms keeps 21 of 24 designs certified at the old 15 ms law against 20 of 24, and loses at the 45 ms stress value (8 against 15 of 24).
- **Not significant per cell** at six seeds (Mann-Whitney p 0.05-0.94; all four arm-geometries agree at 33 and 39.1 ms, sign test p = 0.125). Lever-aware training still halves crashes by buying mass (+12% and +25%).
- **For a builder:** if you know your motor lag only as a range, tune on plants no faster than its slow end; uniform randomisation over the range gives robustness back.

![Two panels, centre of pressure above and below the centre of mass: diverged flights of 384 at lever 2, 45 degrees, under five lag laws, for designs tuned at 36 ms, at 39.1 ms, and trained across 33-39.1 ms. In the shaded identified range the range-trained bars (orange, purple) are taller than the 39.1 ms bars (dark blue, green) in every group, for example 132 against 72 for the lever-aware designs at 39.1 ms, centre of pressure above.](experiments/m7v_lag_rand/m7v_lag_rand.png)

## Milestone 7u: tune a drone at the fast or the slow end of its measured motor lag? The slow end: certified across the range and never worse

**Question.** Milestone 7t sourced the motor lag of 5-inch quadrotors at 33-39 ms (two published identifications) and tuned at the 36 ms midpoint. It found the lag error one-sided: tuning for a slower motor than the real one costs little, tuning for a faster one fails. So should a tuner that knows only the range tune at its slow end? 7t's two objectives were retuned at **39.1 ms** (the slower identification, Foehn et al. 2022) and scored with 7t's 36 ms designs at 33, 36 and 39.1 ms, at an unsourced 45 ms stress value and at the inherited 15 ms law.

**Headline (`experiments/m7u_slow_end/results.txt`, `verdicts.txt`, `posthoc.txt`; 48 CMA-ES runs, about 1.4 h on 4 cores; simulated; 8 predictions committed first, 7 held).**

- **The slow-end tune is never worse inside the identified range.** At twice the centre-of-pressure lever and a 45° tilt limit, the 39.1 ms designs crash less than the 36 ms ones under all three identified lags in all four arm-geometries, including at 36 ms, the midpoint designs' own training lag (109, 132, 61, 59 against 149, 161, 63, 82 of 384).
- **Its stability certificate covers the range:** all 24 slow-end designs pass the margin test at 33, 36 and 39.1 ms, against 20 of 24 midpoint designs; at 45 ms, 15 against 10.
- **The gain is consistent but not yet measured:** every cell leans the same way, but with six seeds per set no single comparison is significant (Mann-Whitney p 0.08-0.81, post hoc). Same mass, similar propellers, and better tracking at 36 ms.
- **The cost sits at the far fast end:** at the old 15 ms law the crash counts tie, but 4 of 6 lever-aware `above` slow-end designs lose the margin certificate.
- **For a builder:** with only a range for your motor lag, tune at its slow end. **For this programme:** the tuning law is now 39.1 ms; lever-aware training still halves crashes by buying mass (+9% and +29%).

![Two panels, centre of pressure above and below the centre of mass: diverged flights of 384 at lever 2, 45 degrees, for designs tuned at 36 ms (light bars) and at 39.1 ms (dark bars), under five lag laws. In the shaded identified range (33, 36, 39.1 ms) the dark bars are lower in every group: for example 150 against 198 and 72 against 93 at 39.1 ms, centre of pressure above.](experiments/m7u_slow_end/m7u_slow_end.png)

## Milestone 7t: what motor lag does a 5-inch quadrotor have, and do the co-designs survive it? 33-39 ms, 2.4× the assumed value: the old tunes fail, retuned ones fly

**Question.** Milestone 7s showed the programme's counts and stability margins hang on a motor lag nobody had sourced (15 ms at 5 inches). What lag do real 5-inch quadrotors have, and what happens to the co-designs at that value? Two published system identifications of 5-5.1 inch, 2306-motor racing quadrotors give **33 ms** (Bauersfeld et al. 2021, NeuroBEM, arXiv:2106.08015) and **39.1 ms** (Foehn et al. 2022, Agilicious, arXiv:2307.06100); the rows read, used and excluded (brushed Crazyflie motors, a platform with no propeller stated, simulator defaults) are in [`data/motor_lag/identified.csv`](data/motor_lag/identified.csv). 7r's two arms were retuned at 36 ms (their midpoint, the same for every propeller) and scored under five laws.

**Headline (`experiments/m7t_lag_src/results.txt`, `verdicts.txt`; 48 CMA-ES runs, about 1.7 h on 4 cores; simulated; 8 predictions committed first, 6 held).**

- **The 15 ms tunes do not fly at the identified lag.** None of 7r's 24 retuned designs passes the stability-margin test at 33, 36 or 39.1 ms, and they crash on 359-384 of 384 flights at twice the centre-of-pressure lever and a 45° tilt limit.
- **Retuned at 36 ms, all 24 designs are certified and fly:** 149 and 161 crashes of 384 for the lever-1 objective, 63 and 82 for the lever-aware one, 17-41% more than 7r's designs at their own 15 ms. The tuners pay with a softer position loop (kp 21-25 against 27-31 s⁻²) and 6-10% more mass.
- **The programme's findings hold at the sourced lag.** Lever-aware training still halves the crashes by buying mass (+14% and +28%); ρ(mass, crashes) is −0.50 to −0.94 under every scoring law.
- **The risk is one-sided.** Tuned for 36 ms, the designs crash less than the 15 ms tunes even at 15 ms (8-59 against 54-131 of 384, at nearly the same tracking), and 21 of 24 stay certified at 39.1 ms. Tuned for 15 ms, they fail at 36 ms.
- **For a builder:** if you tune in simulation without a measured motor step response, assume the slow end (about 35-40 ms for a 5-inch 2306 setup, from these two identifications); a too-fast lag model is the expensive mistake. **For this programme:** the tuning law is now 36 ms; earlier counts describe vehicles with motors 2.4 times faster than the identified ones.

![Two panels, centre of pressure above and below the centre of mass: diverged flights of 384 at lever 2, 45 degrees, for 7r's designs tuned at 15 ms (light bars) and the designs retuned at 36 ms (dark bars), under five lag laws. Under the inherited 15 ms law the 7r designs crash on 54-131 and the 36 ms designs on 8-59; at 33, 36 and 39.1 ms the 7r designs crash on 359-384 while the retuned ones crash on 53-198.](experiments/m7t_lag_src/m7t_lag_src.png)

## Milestone 7s: does a quadrotor co-design result depend on the motor lag model? The orderings survive a 4× range; the counts and the stability margins do not

**Question.** Every design in this programme flies a first-order motor-propeller lag of 0.015 (D / 0.127 m)<sup>1.5</sup> s, inherited and never sourced. Milestone 7r's retuned designs shrank their propellers to 0.106-0.115 m, which under that law makes their motors 3-4 ms faster than the published designs'. Are 7r's findings an artefact of the lag law? The law could not be sourced from this session (the retailer catalogues are unreachable through its proxy), so the milestone sweeps it: lag at 5 inches K ∈ {7.5, 15, 30} ms × diameter exponent b ∈ {0, 1.5, 3}, over 7r's 72 designs, not retuned.

**Headline (`experiments/m7s_lag/results.txt`, `verdicts.txt`; 72 designs × 9 laws; simulated; 6 predictions committed first, all held).**

- **The orderings survive.** Lever-aware training beats lever-1 training at twice the centre-of-pressure lever under all nine laws, and heavier designs crash less under every law up to 15 ms (Spearman ρ −0.68 to −0.93).
- **The exponent made the retuned designs look as good as the published ones.** With a 15 ms lag for every propeller, the retuned lever-aware designs crash on 85 and 92 of 384 flights against 51 and 53 for the published ones (54 and 64 under the inherited law).
- **Each design's stability margin holds only at the lag it was tuned for.** At b 0 only 5 of the 24 retuned designs pass the margin test (24 of 24 under the inherited law); at b 3 only 4 of 12 published lever-1 designs do.
- **The lag constant dominates.** At 30 ms at most one design of 72 passes the margin test, and at b 1.5 every set crashes on 244-378 of 384 flights; at 7.5 ms the published and retuned sets' crashes fall 26-44%.
- **For a builder:** measure your motor-propeller step response before trusting a tuned gain set; a tuner that assumed faster motors puts you on the edge of stability. **For this programme:** report counts as orderings until K and b are sourced, and retune with the lag randomised over its plausible range.

![Two panels, centre of pressure above and below the centre of mass: diverged flights of 384 at lever 2, 45 degrees, against the motor lag each set flies under nine lag laws. Every set's crashes rise with lag, from 30-90 at 5-8 ms to 250-380 at 30-35 ms; the not-retuned sourced designs sit highest throughout; at a common 15 ms the retuned designs (blue, green) sit above the published ones (grey).](experiments/m7s_lag/m7s_lag.png)

## Milestone 7r: retuned for a sourced battery and motor model, does a quadrotor still buy gust robustness with mass? Yes: the tuner shrinks the propeller and gets heavy again

**Question.** Milestone 7q found that the programme's sizing closure was solved by a truncated iteration and built on component constants 12-72% off listed data. On the sourced Li-ion closure every published design shrinks to about 0.75 kg, and on its old gains it crashes far more. Those gains were tuned for vehicles that do not exist. Retuned on the sourced, exactly solved closure, does training across centre-of-pressure levers still buy robustness (milestone 7i), and is it still bought with mass?

**Headline (`experiments/m7r_retune/results.txt`, `verdicts.txt`; 48 CMA-ES runs; simulated; 7 predictions committed first).**

- **The tuner buys the mass back.** None of the 24 retuned designs is the 0.75 kg vehicle 7q sized. Both objectives shrink the propeller (set means 0.129-0.134 → 0.106-0.115 m), which raises hover power (set means: lever-1 objective 313-402 W, lever-aware 455-495 W), and the closure grows the battery and motors until the vehicle weighs 0.99-1.29 kg (set means; designs 0.94-1.50 kg) and sits on the closure's edge again (longest closing endurance 15.0-16.7 min, against 19-21 min for the published designs on the same closure).
- **Robustness still follows mass, on one curve.** At twice the centre-of-pressure lever and a 45° tilt limit, the retuned designs crash on 106 and 131 (lever-1 objective) and 54 and 64 (lever-aware) of 384 flights, against 260 and 263 for the old gains on the sourced closure. Plotted against mass, retuned and published designs fall on the same curve (figure).
- **Training across levers still pays, at the same price.** The lever-aware designs crash on half as many flights as the lever-1 designs and are 14-24% heavier, matching the published lever-aware designs (53 and 52). Predictions R1, R3-R6 held; R2 (retuned mass 0.65-0.90 kg) was refuted, R7 held in one geometry.
- **For a builder:** on this model a quadrotor tuned for gust robustness with a hover-power price and a fixed flight time will trade propeller size for mass; if you want the light, efficient vehicle, put a price on mass or a requirement on flight time, not only on power.
- **For this programme:** the mass-robustness relation from 7i is not an artefact of the truncated solve; it reappears under the sourced closure. The objective's power price and the fixed endurance, both inherited, are now what set the vehicle's mass.

![Two panels, centre of pressure above and below the centre of mass: diverged flights of 64 at lever 2, 45 degrees, against sized mass for each design. Published designs (grey, 1.0 to 2.0 kg) and designs retuned on the sourced Li-ion closure (blue and green, 0.94 to 1.50 kg) fall on one falling curve from about 23 crashes at 0.95 kg to 0 at 2 kg; the published designs re-sized on the sourced closure without retuning (orange) sit apart at 0.73 to 0.80 kg and 36 to 48 crashes.](experiments/m7r_retune/m7r_retune.png)

## Milestone 7q: can a 5-inch quadrotor fly 15 minutes on LiPo? The sizing closure, checked against listed batteries and motor bench data

**Question.** Every mass in this programme comes from an endurance sizing closure: the battery for 15 minutes of hover, the motors for a thrust-to-weight of 2, the frame, payload and electronics, iterated until the mass stops changing. Its three component constants (150 Wh/kg battery, motor mass 0.045 (T<sub>max</sub>/9 N)<sup>1.2</sup> kg, propulsive efficiency FM·η = 0.4875) were inherited and assumed, and milestone 7p found the closure multiplies any mass change 6-15 times. What do listed components say, and what happens to the 48 tuned designs when the closure is sourced? Data ([`data/components/`](data/components/), accessed 2026-11-16, each row with its URL): 405 battery listings from six FPV retailers (195 in class), 29 SunnySky motor pages with the manufacturer's bench tables (5,292 rows of propeller, thrust and watts), 16 FPV motor listings with a stated maximum thrust.

**Headline (`experiments/m7q_closure/closure.txt`, `results.txt`, `verdicts.txt`; simulated; 6 predictions committed first).**

- **The solver stopped before the answer.** `aero.size` iterated the mass 60 times from 1 kg and returned wherever it was. Solved exactly, 28 of the 48 tuned designs have **no fixed point at 15 minutes**: no vehicle of that arm, propeller and cant can carry its own battery that long. All six heavy (≥ 1.7 kg), near-crash-free designs of milestones 7i, 7m and 7n are among them. Every design's longest closing endurance is 14.6-15.8 min, so the tuners sat every design on the edge of the closure.
- **Listed components move every constant.** LiPo packs store a median **132 Wh/kg** (140 packs, 3-6S; assumed 150); Li-ion 210 Wh/kg (24 packs). At half maximum thrust on 5-inch propellers, the motor, ESC and propeller turn **0.426** of electrical power into ideal momentum power (assumed 0.4875; 0.52-0.56 on 11-29 inch propellers). Motors weigh **0.0290 (T<sub>max</sub>/9 N)<sup>1.04</sup> kg**, 0.58 of the assumed law at the median of 33 motors.
- **A 15-minute 5-inch quadrotor does not close on LiPo.** With all three sourced constants, no design closes on LiPo (longest endurance 11.9-13.0 min). On Li-ion every design closes at about 0.75 kg (19-21 min possible), half the mass the tuners settled at.
- **On their old tunes the sourced vehicles crash far more.** Paired by design, at twice the centre-of-pressure lever and a 45° tilt limit: lighter motors alone add 4-20 crashes of 64 per design in every set (e.g. 73 → 160 of 384 for the lever-1 designs, `above`); the full Li-ion closure adds 20-33. The designs are not retuned, so this measures the old gains on the new vehicles.
- **What survives.** Where a fixed point exists the exact mass is within 7% and the crash counts within 3 flights per design. The arm's monotone effect (7o) holds under the sourced closure: crashes fall from 210 to 157 of 320 between 105 and 145 mm for the lever-1 designs (`below`).
- **For a builder:** budget about 132 Wh/kg for LiPo packs and 0.43 for 5-inch propulsive efficiency at cruise thrust, not the textbook 150 and 0.49; at 5 inches, 15 minutes of hover with a 250 g payload is a Li-ion job.
- **For this programme:** robustness bought with mass (7i onward) came from an unconverged, unsourced closure. `aero.SIZE_SOLVE = "exact"` and the sourced constants are now available; earlier results keep the default and reproduce bit for bit. Predictions Q1-Q5 held, Q6 refuted (`LOG.md`).

![Left: listed motor mass against maximum thrust per motor on log axes, 27 SunnySky bench motors and 6 FPV listings, with the inherited law (dashed) about 1.7 times above the fitted line through the data. Right: the longest endurance each of 48 tuned designs can be sized for, under six closures: inherited constants 14.6 to 15.8 minutes, straddling the 15-minute mission line; LiPo at 132 Wh/kg or efficiency 0.426 alone, 12.8 to 13.9; the motor fit alone, 15.4 to 16.8; all three on LiPo, 11.9 to 13.0; all three on Li-ion, 18.9 to 20.6.](experiments/m7q_closure/m7q_closure.png)

## Milestone 7p: how much does a quadrotor frame weigh per millimetre of arm, and does milestone 7o survive the real figure?

**Question.** Milestone 7o's arm sweep ran on an inherited, assumed frame-mass law (0.05 + 0.8 L kg, L the centre-to-rotor arm). What do listed commercial frames say, and do 7o's conclusions hold under it? Data: 39 open-propeller frame listings (3-10 inch, 7 brands; [`data/frames/frames_hobbyrc.csv`](data/frames/frames_hobbyrc.csv), each with its verbatim spec line and URL, accessed 2026-11-15). Then 7o's 48 fixed designs re-swept from 85 to 150 mm under each law, with no retraining.

**Headline (`experiments/m7p_frame_law/frame_law.txt`, `analysis.txt`, `posthoc.txt`; simulated; 7 predictions committed first).**

- **Two sourced slopes bracket the assumed one.** Stretching one frame design (GEPRC Mark4 5/6/7 inch, Foxeer Aura V2 Pro 5/6) adds 0.26 g per mm of wheelbase, i.e. **0.51 kg per metre of arm**, 64% of the assumed 0.8. Across 30 frames from 162 to 342 mm, a frame designed for a larger size weighs −131 + 1.14 W g (**2.27 kg/m of arm**, residual SD 47 g; weight grows about as W<sup>2</sup>).
- **The frame slope decides where the arm stops.** The longest arm at which all six lever-1 designs stay valid moves from 130 mm (assumed slope) to 150 mm (stretched design) or 110 mm (cross-brand) with the centre of pressure above.
- **With the stretched-design slope, a longer arm buys less.** At twice the centre-of-pressure lever the lever-1 designs crash on 48 of 384 flights at 115 mm instead of 31, and on 66 at 135 mm instead of 44 (below). Crashes still fall monotonically with the arm.
- **Part of 7o's arm effect was mass.** At the same arm, the heavier frame law crashes less on 253 of 350 design-points and more on 5. A fixed-effects fit gives −0.14 to −0.18 flights (of 64) per mm of arm *and* −0.15 to −0.89 per 100 g.
- **The sizing model amplifies frame mass 6-15 times.** A frame 20-43 g lighter at the tuned arm makes the sized vehicle 0.18-0.64 kg lighter through the battery-and-motor closure. On the same tunes the lighter vehicles crash on 160 and 151 of 384 flights instead of 73 and 105. Every mass-dependent result in this programme carries that sensitivity until the closure is checked against built quadrotors.
- **For a builder:** stretching your frame's arms costs about 0.26 g per mm of wheelbase in carbon. The robustness a longer arm buys on a fixed tune is smaller than 7o reported, because 7o's model added more mass with the arm than a real stretched frame does.
- Predictions: P1, P2, P3 (above only) and P6 held; P4, P5 and P7 refuted (`LOG.md`).

![Left: listed frame weights against wheelbase from 150 to 350 mm, with the assumed law (a shallow line from 110 to 190 g), the cross-brand fit (steeper, 40 to 270 g) and the stretched-design slope (dashed, 85 to 135 g) through the GEPRC Mark4 and Foxeer Aura points. Middle and right: diverged flights of 384 at lever 2, 45 degrees, for the lever-1 designs against arm length under four frame laws. With the stretched-design slope the curve falls more slowly and runs to 150 mm; with the cross-brand slope it falls fast but ends at 110-115 mm; with the cross-brand law itself the designs start from 136-139 crashes at 105 mm.](experiments/m7p_frame_law/m7p_frame_law.png)

## Milestone 7o: how long should a quadrotor's arms be for gust robustness on a fixed tune? Longer keeps helping until the design stops being valid

**Question.** Milestone 7n found that a few millimetres more arm cuts a fixed design's crashes at twice the centre-of-pressure lever. Does that keep going, is there a best arm length once the extra frontal area and lever (more gust torque) are counted, and what limits it? No training: the arm of each of 48 fixed designs (7e, 7l `t45 cap wide`, 7m `aware cap wide`, 7n `aware cap wide fixL`; 6 seeds × 2 rigid geometries) swept from 85 to 135 mm, with the full sizing model and with the gust exposure held at its own-L value, scored on the same 64 held-out flights with the proportional-request cap.

**Headline (`experiments/m7o_arm_sweep/results.txt`, `analysis.txt`; simulated; 7 predictions committed first).**

- **Crashes fall monotonically with the arm, with no interior optimum.** At twice the lever and a 45° tilt limit, the lever-1 designs go from 62 to 6 of 384 flights between 105 and 130 mm (`above`) and from 103 to 44 between 105 and 135 mm (`below`); no design of 46 has a curve that turns back up.
- **Validity is the limit, not robustness.** Below its tuned length a design fails the stability-margin test (47 of 48 fail at 85 mm; none at or above its own length). Above, the frame mass feeds the battery and motors: the lever-1 `above` designs gain 26% mass and 42% hover power by 120 mm and 98% and 188% by 135 mm, and 7e's heavier designs run into the cost cap from 110-120 mm.
- **The extra gust exposure costs up to a third of the gain.** With frontal area and centre-of-pressure lever held fixed, the lever-1 `below` designs drop to 12 crashes at 135 mm instead of 44.
- **A longer arm alone matches the lever-aware co-design.** The lever-1 tune at 110 mm (`above`) or 135 mm (`below`) crashes no more than 7m's lever-aware designs (52 against 53; 44 against 52) at slightly lower mass and hover power (1.41 against 1.45 kg; 1.38 against 1.40 kg) and the same tracking. The tuners stop short because their scores barely see the doubled lever or price mass through hover power, not because longer arms stop helping.
- **For a builder:** on an existing tune, lengthen arms rather than shorten them (shorter can fail the stability margin), and stop where hover power starts to climb steeply.
- **Method note:** a sub-micron change in a design's arm flipped one marginal flight in a first run; single-flight differences between nearby designs are noise.
- Predictions: O1, O2, O4, O5, O6 held; O3 (an interior optimum) and O7 (flat tracking) refuted (`LOG.md`).

![Left: diverged flights out of 384 at lever 2, 45 degrees, with the cap, against frame arm length, drawn where all six seeds are valid. Every curve falls: lever-1 designs above from 62 at 105 mm to 6 at 130 mm, below from 103 at 105 mm to 44 at 135 mm; 7e below from 55 at 100 mm to 5 at 135 mm. Middle: the same with frontal area and centre-of-pressure lever held at each design's own values; curves fall further, to 1 and 12. Right: seeds that pass the stability margin test and feasibility at each length: none at 85 mm, all six from about 105 mm, and 7e above falls to none by 120 mm as its mass runs away.](experiments/m7o_arm_sweep/m7o_arm_sweep.png)

## Milestone 7n: does a longer frame arm make a quadrotor co-design robust to an uncertain centre of pressure? A little, on a given design; it is not why the robust designs are robust

**Question.** Milestone 7m's lever-aware designs (trained across centre-of-pressure levers 0-2, with the capped proportional request and the wide position-gain box) crashed less at twice the lever than 7l's lever-1 designs and had longer frame arms, which 7m read as the handle that buys torque per weight. Here that reading gets a control: 7m's training repeated with the arm pinned at 7l's length (0.102 and 0.103 m; 6 seeds, 2 starts, both rigid geometries), and an arm swap with no training: each 7l design given 7m's arm, and each 7m design given 7l's.

**Headline (`experiments/m7n_fixed_arm/results.txt`; simulated; 8 predictions committed first).**

- **Pinning the arm costs no robustness.** At lever 2, 45°, with the cap, the pinned-arm designs crash on 39 and 46 of 384 flights, against 53 and 52 with the arm free and 73 and 105 for 7l. Per seed they crash less or equally in 11 of 12. The tuner gets there through mass and gains instead (1.50 and 1.40 kg; position kp 22 s⁻²), with one heavy basin per geometry as in 7i and 7m.
- **On a fixed design, a longer arm helps a little.** Raising only the arm of each 7l design by 4-7 mm cuts the lever-2, 45° crashes from 73 to 59 and from 105 to 87 (fewer in 11 of 12 seeds) and does not hurt tracking. It is not free: on this sizing model the frame mass grows with the arm, so the swap adds 4% mass and 6-7% hover power while torque per weight rises 5-7%.
- **Shortening an arm can break the design.** Half of the 7m designs given 7l's shorter arm fail the stability-margin test the tuner trained under (rho up to 1.0008), and one no longer clears its propellers.
- **Correction to 7m:** the arm was read there as raising torque "without mass"; on this model it raises torque faster than mass, not without it.
- **For a builder:** a few millimetres more arm is a cheap robustness margin on an existing tune. It is not what makes a robustly-trained co-design robust, and shortening the arm of a tune that sits on its stability margin can push it over.
- Predictions: N1, N2, N3, N4 (in one geometry), N7, N8 held; N5 and N6 refuted (`LOG.md`).

![Left: diverged flights out of 768 with the cap. Lever 2 at 20 degrees: 7e 50, 7l t45 cap wide 94, 7l long arm 79, aware cap wide 53, 7m short arm 66, aware cap wide with the arm fixed 52. Lever 2 at 45 degrees: 64, 178, 146, 105, 132, 85. Lever 3 at 20 degrees: 227, 365, 311, 234, 295, 227. Right: each design's lever-2, 45-degree crash count before and after only its arm changes: lengthening 7l's arms moves every arrow down or level; shortening 7m's arms moves most by minus 2 to plus 1, one design that no longer clears its propellers from 13 to 20, and two heavy designs at 116 and 122 mm from 0 to 8.](experiments/m7n_fixed_arm/m7n_fixed_arm.png)

## Milestone 7m: if a quadrotor co-design is asked to survive an uncertain centre of pressure, what does it do with a wider position-gain box? It takes most of the stiffness, keeps part of the mass, and lengthens the arms

**Question.** Milestone 7l gave a lever-1 tuner a capped proportional request (3.5 m/s²) and a position-gain box widened from 10 to 31.6 s⁻²; it took about 27 s⁻² and spent it on a 11-19% lighter airframe that crashed more at twice the centre-of-pressure lever. Milestone 7i's lever-aware objective (levers 0, 1 and 2 in the training score) pulled the other way and bought mass, which on this sizing model is torque authority. With both present, which wins? Two arms, trained at 45° with the cap and the lever-aware objective: `aware cap` (box 10 s⁻²) and `aware cap wide` (box 31.6 s⁻²); 6 seeds, 2 starts, both rigid geometries, scored on the same 64 held-out flights (26 conditions, including lever 3, outside all training) against 7e, 7i's lever-aware designs and 7l's `t45 cap wide`.

**Headline (`experiments/m7m_aware_wide/results.txt`; simulated; 7 predictions committed first).**

- **The lever-aware objective does not undo the stiffness.** `aware cap wide` picks a mean position kp of 23.8 (`above`) and 24.3 s⁻² (`below`), against 7l's 27.5 and 27.2; with the old box (`aware cap`) every seed stays at 9.95-10.00 s⁻², as in every earlier arm.
- **It keeps part of the mass and lengthens the arms.** `aware cap wide` weighs 1.45 kg (`above`) and 1.40 kg (`below`): heavier than 7l's 1.29 and 1.10, lighter than the lever-aware designs at the old box (1.60 and 1.53). Its frame arm grows (0.106 and 0.110 m against 0.094-0.103 for every other set), so roll/pitch torque per newton of weight is the highest of any set (0.070 and 0.073 m against 0.062-0.068).
- **It tracks best at the trained levers.** At lever 1 with the cap its held-out cost beats 7e by 0.030 (`above`, 5 of 6 seeds) and 0.044 (`below`, 6 of 6), the largest gains of the five sets.
- **Robustness lands in between.** At lever 2, 45°, with the cap: 53 and 52 crashes of 384 against 7l's 73 and 105 (7e: 12 and 52; `aware cap`: 19 and 26). At lever 2, 20°, `below`: 32 against the lever-aware 7i designs' 20. At lever 3: 107 and 127 against 7l's 142 and 223.
- **It still needs the cap.** Without it at 45°, 231-250 of 384 flights crash (7l: 267-284).
- **For a builder:** asking for robustness to the centre of pressure doesn't stop the tuner from using a higher position gain behind a cap. It makes the tuner pay for the gain partly in arm length, not only in lost mass. You still give up some robustness at twice the lever, and the cap stays safety-critical.
- Predictions: M1, M2, M3, M5, M7 held; M4 (`above` lighter than 7e) and M6 refuted (`LOG.md`).

![Left: diverged flights out of 768 (12 designs times 64) with the cap. At lever 2 and 20 degrees: 7e 50, 7i aware 26, 7l t45 cap wide 94, aware cap 29, aware cap wide 53. At lever 2 and 45 degrees: 64, 40, 178, 45, 105. At lever 3 and 20 degrees: 227, 153, 365, 159, 234. Right: each design's mass against its chosen position gain: 7e, 7i and aware cap at 10 per second squared and 1.1 to 2.0 kg; 7l t45 cap wide at 21 to 31 and 1.0 to 1.4 kg; aware cap wide at 20 to 31 and 1.15 to 1.99 kg.](experiments/m7m_aware_wide/m7m_aware_wide.png)

## Milestone 7l: should you retune a quadrotor at a 45° tilt limit, and does a wider gain box help? Retuning buys nothing; a wider box buys a lighter, fragile vehicle

**Question.** Milestone 7j advised retuning at the tilt limit you fly; milestone 7k removed the 45° crash without retuning by capping the proportional position request at 3.5 m/s² (the 20° lean), and noted that every design's position gain sits at the 10 s⁻² top of its search box. Here the co-design is retrained at PX4's 45° limit: without the cap (`t45`), with it (`t45 cap`), and with the cap and the position-gain box widened to 31.6 s⁻² (`t45 cap wide`); milestone 7e's training otherwise (6 seeds, 2 starts, both rigid geometries), scored on the same 64 held-out flights against 7e's 20°-tuned designs.

**Headline (`experiments/m7l_train45/results.txt`; simulated; 9 predictions committed first).**

- **Retuning at 45° buys nothing over 7k's retrofit.** `t45` lands on the 20° tune's cost (paired change within ±0.005 in `above`) and keeps its gains, and at a 1.0 m start offset it crashes as often (92-103 of 384 flights against 97-118). Adding the cap to the 20° tune removes those (0 of 384).
- **The tuner never backs off position kp.** With or without the cap it sits at 10 s⁻². Trained with the cap in the loop, the designs are no better than 7e with the cap added later, and worse than 7e if flown without it.
- **Given room, it triples the gain and builds a lighter vehicle.** The wide arm picks 22-31 s⁻² and a 19% lighter airframe in `above` (11% in `below`) with 30% less hover power (18%), holding position as well as 7e at the trained lever.
- **That vehicle needs the cap and a known centre of pressure.** Without the cap it crashes on 70% of flights at 45° (267-274 of 384); with it, at twice the centre-of-pressure lever it crashes on 73 and 105 of 384 against 7e's 12 and 52.
- **For a builder:** add the cap to the tune you have rather than retune at 45°. If you raise the position gain under a cap, treat the cap as safety-critical and test at the lever uncertainty you expect.
- Predictions: L1, L4, L5, L8, L9 held; L2, L3, L6, L7 refuted (`LOG.md`).

![Left: diverged flights out of 768 (12 designs times 64) at a 45 degree tilt limit for 7e, t45, t45 cap and t45 cap wide. Lever 0 without the cap: 1, 0, 7, 545. Lever 1 without the cap: 6, 3, 9, 536; with the cap: 1, 0, 1, 3. Lever 1 with a 1.0 m start offset without the cap: 219, 195, 255, 704; with the cap: 0, 0, 1, 6. Right: the position gain each design chose: 7e, t45 and t45 cap all at 10 per second squared, the inherited box edge; t45 cap wide between 21.7 and 31.5, near the widened edge of 31.6.](experiments/m7l_train45/m7l_train45.png)

## Milestone 7k: how do you fly a quadrotor tuned at a 20° tilt limit at 45° without retuning? Cap the position loop's proportional request

**Question.** Milestone 7j traced the retrained designs' crashes at PX4's default 45° tilt limit to the opening transient: the proportional position term asks for a lean the 20° training limit had always clipped. Its advice was to retune at the limit you fly. Can a builder fix it in the controller instead, and what does that cost? No training: milestone 7i's 48 designs on the same 64 held-out flights, under four controller-side changes (each inert at its default, `tests/test_poshold.py`): a tilt-magnitude cone (PX4's semantics, where the simulator clipped each axis), a tilt-rate slew limit (0.5, 1, 2 rad/s), a clip on the position error in the proportional term (0.15, 0.25, 0.35 m) and a speed-limited setpoint ramp (0.5, 1, 2 m/s), at tilt limits 20°, 30° and 45°, levers 0-2, start offsets 0.5 and 1.0 m.

**Headline (`experiments/m7k_fixes/results.txt`; simulated; 9 predictions committed first).**

- **Capping the proportional request removes every transient crash.** At 45° and the trained lever, crashes over all 48 designs fall from 34 of 3,072 flights to 0 (perr 0.25 m) or 1 (0.35 m); with the start offset doubled to 1.0 m, from 935 to 0. A setpoint ramp at 0.5-2 m/s does the same.
- **It costs 1-2% where the designs were tuned.** At 20°, the 0.35 m cap (0.35 m × kp 10 = 3.5 m/s², the 20° lean) raises held-out cost by +0.016 to +0.024 on a base of about 1.5; a 1 m/s ramp costs +0.13. At 45° both make the cost better, because the crashes go.
- **Do not slow the lean.** A tilt-rate limit of 0.5 rad/s crashes flights even at the trained condition (0 → 15-73 per group), and 1 rad/s turns 34 crashes at 45° into 515: a lagged lean destabilises a stiff position loop.
- **The tilt cone is not the issue at the trained offset** (34 → 34); it removes 59% of the crashes at 1.0 m. The gust-torque crashes at twice the lever (7g) mostly stay (20°: 72 → 68-74 in `below`).
- **For a builder:** before raising `MPC_TILTMAX_AIR` or `ANGLE_MAX` on a tune made at a lower limit, cap the lean the position error alone may ask for at what the tune saw (in a PX4-style cascade, the velocity setpoint), or limit setpoint speed; leave the derivative and integral terms the full limit for wind.
- Predictions: K1, K3-K9 held; K2 (the cone halves the transient crashes) refuted (`LOG.md`).

![Left: diverged flights out of 3,072 at a 45 degree tilt limit and the trained centre-of-pressure lever, per controller fix, with the start offset at 0.5 m and 1.0 m. Base 34 and 935; cone 34 and 381; tilt-rate 0.5, 1 and 2 rad/s 1,732 and 2,919, 515 and 2,051, 10 and 126; position-error caps 0.15, 0.25 and 0.35 m 0, 0, 1 and 0; setpoint ramps 0, every one (zero bars drawn as stubs). Right: mean change in held-out cost at the trained 20 degree condition: cone +0.007, rate limits +11.1, +0.39, +0.044, error caps +0.195, +0.068, +0.020, ramps +0.258, +0.134, +0.060.](experiments/m7k_fixes/m7k_fixes.png)

## Milestone 7j: why do retrained quadrotors crash at a 45° tilt limit with no gust torque? A tilt limit they were never tuned at

**Question.** Milestones 7h and 7i left a crash unexplained: with the centre of pressure on the centre of mass (lever 0, no gust torque) and PX4's default 45° tilt-command limit, the retrained `above` designs diverge on 3-12 of 384 held-out flights each, where 7e's designs diverge on none and every design passes the linear stability test. No training: the 48 designs milestone 7i scored, re-flown on the same 64 held-out flights under one probe at a time (ideal mixer, position gains halved, side force off, integrator feed-forward off, motors 10% faster, an 85° divergence bound), plus a post-hoc sweep of the start offset.

**Headline (`experiments/m7j_lever0/results.txt`, `posthoc.txt`, `offset.txt`; simulated; 10 predictions committed first).**

- **It is the opening transient, not the wind.** All 24 retrained `above` crashes at 45° are tip-overs past 60°, all before the 3 s wind step (0.16-0.79 s, median 0.39 s). The episodes start up to 0.5 m off the hold point; with that offset at 0.25 m or 0, nothing crashes in either geometry.
- **The tilt limit was hiding it.** Every design's position kp sits at the top of its search box (10 s⁻²), so a 0.5 m offset asks for a lean near 27° per axis. The 20° limit used in training clips that; 45° lets it through, and in the crashing flights the mixer scales roll/pitch on 74-84% of steps (0% in survivors).
- **Any slack removes it.** Pooled count 24: ideal mixer 0, position gains ×0.5 0, side force off 1, feed-forward off 2, motors 10% faster 8, 85° bound 23 (a real tip-over, not a scoring artefact). The retrained designs have stiffer attitude loops (kp 2.33-2.41 against 7e's 2.13) and crash most on slow-motor plants.
- **For a builder:** tune at the tilt limit you will fly, or fly at the limit you tuned at; ArduPilot's 30° default leaves 1 of 1,152 here.
- **Addendum (`experiments/m7j_lever0/onset_resize.txt`, an independent implementation from a parallel run, same counts):** re-sizing the thrust-to-weight-free designs at thrust-to-weight 2.0 leaves 21 of 21 crashes, so the free thrust-to-weight is not the cause; summed crashes rise 1, 11, 23 and 24 at 30°, 35°, 40° and 45°, so a limit opened only to 35° already brings about half.
- Predictions: J1, J2, J4-J8, J10 held; J3 (after the wind step) and J9 (85° bound) refuted (`LOG.md`).

![Held-out flights that diverged at lever 0 with a 45 degree tilt-command limit, centre of pressure above. Retrained designs (18, of 1152 flights): base 24, 85 degree bound 23, ideal mixer 0, position gains halved 0, side force off 1, feed-forward off 2, motor lag times 0.9 8. Milestone 7e's six designs: 0 under every probe.](experiments/m7j_lever0/m7j_lever0.png)

## Milestone 7i: does training across centre-of-pressure levers make a co-designed quadrotor robust? Where it was fragile, by getting heavier

**Question.** Milestone 7h found that a tuner trained at one centre-of-pressure lever spends free thrust-to-weight on efficiency. If the objective covers levers 0, 1 and 2 (6 training episodes each), does the co-design buy the roll/pitch authority a doubled lever needs, and does thrust-to-weight as a design variable help? Milestone 7e's margin-constrained training, repeated with the lever-aware objective at thrust-to-weight 2 and free (6 seeds × 2 starts × 3,200 evaluations, both rigid geometries), scored with 7e's and 7h's designs on the same 64 held-out flights at levers 0-3 and tilt limits 20°, 30° and 45°.

**Headline (`experiments/m7i_aware/results.txt`, `posthoc.txt`; simulated; 8 predictions committed first).**

- **Where the old designs were fragile, crashes roughly halve.** Centre of pressure below: 45 → 20 (thrust-to-weight 2) and 14 (free) of 384 at lever 2; 159 → 87 and 86 at lever 3, outside all training; held-out cost at lever 2 better in 6 of 6 seeds, unchanged at the design lever (+0.011, 5 of 6).
- **Where they were already robust, nothing changes.** Centre of pressure above: 4 → 7 and 8 at lever 2, 68 → 66 and 75 at lever 3. A 1% crash rate gives 6 training episodes per lever almost nothing to push against.
- **Thrust-to-weight is the wrong handle.** The lever-aware tuner picks 2.07-2.67, the same as 7h's lever-1 tuner, and does no better than the fixed-2 arm. What it buys is mass: at fixed thrust-to-weight a heavier vehicle carries bigger motors, and the gust torque, set by frame area and lever, does not grow with it. Across all 24 designs per geometry, mass ranks with lever-3 crashes at ρ = −0.87 (above) and −0.94 (below); thrust-to-weight at +0.08 and −0.02 (post hoc).
- **For a builder:** if the centre of pressure is uncertain, compare roll/pitch torque with the frame's gust torque, not thrust-to-weight; on this endurance-sized frame the lever-aware `below` designs weigh 1.49-1.52 kg on average against 7e's 1.23 kg and hover on 35% more power; the most robust (about 2.0 kg, one seed in each arm) on twice the power.
- Predictions: A3, A6, A8 held (A3 only by 0.02-0.08); A1, A2 (missed by one flight at 45°), A4, A5 and A7 refuted (`LOG.md`).

![Left: held-out flights that diverged at twice the trained centre-of-pressure lever, out of 384, at 20 and 45 degree tilt limits. Milestone 7e's designs as trained (thrust-to-weight 2): 4, 12, 45 and 55. The same designs at the largest thrust-to-weight their sizing still closes: 0, 0, 0 and 2. Designs retrained with thrust-to-weight free: 9, 28, 38 and 49. Right: thrust-to-weight against hover power. The retrofit designs reach only 2.1 to 2.5 and their hover power more than doubles to about 1 kW; the retrained designs choose 2.05 to 2.55 at the same or lower hover power.](experiments/m7h_twr/m7h_twr.png)

## Milestone 7h: does a co-designed quadrotor buy thrust headroom when it may? Yes, and spends it on efficiency

**Question.** Milestone 7g traced the last crashes at twice the trained centre-of-pressure lever to motors running out of differential thrust, and advised thrust-to-weight above 2. Can a builder add that headroom to an existing design, and does the co-design choose it when thrust-to-weight is a design variable? Milestone 7e's margin-constrained training, repeated with thrust-to-weight free on 1.5-4 (6 seeds × 2 starts × 3,200 evaluations, both rigid geometries), against 7e's designs re-sized at the largest thrust-to-weight their sizing still closes, all scored on the same 64 held-out flights.

**Headline (`experiments/m7h_twr/results.txt`; simulated; 7 predictions committed first).**

- **Little room to retrofit.** On the co-designed airframes the 15-minute endurance sizing closes only up to thrust-to-weight 2.10-2.15 (centre of pressure above) and 2.25-2.50 (below). Past that, heavier motors need a bigger battery, which needs more thrust, and the mass runs away. At the edge, mass rises 78% (1.61 to 2.86 kg), hover power 2.4× (486 to 1157 W) and cost from $134 to $248.
- **At that price, the lever-2 crashes go.** 4 → 0 and 12 → 0 (`above`, 20° and 45°), 45 → 0 and 55 → 2 (`below`). Held-out cost at the design lever is 0.13-0.14 worse in 12 of 12 pairs, almost all of it the hover-power price.
- **The tuner buys headroom and spends it on efficiency.** Retrained with thrust-to-weight free, all 12 seeds pick 2.05-2.55, with slightly larger propellers and the same or lower hover power. The torque limit stays where it was (0.995 against 0.981 N m), so the doubled-lever crashes do not go away: 9 against 4 (`above`, 20°), 38 against 45 (`below`). At a 45° tilt limit the retrained `above` designs even diverge at the trained lever (9-10 of 384, against 0); every one passes the linear margin test, and why is open.
- **For a builder:** robustness to an uncertain centre of pressure has to be in the tuning objective (train on the range of levers), not left to the design space; and check the sizing closure before ordering bigger motors.
- Predictions: H1, H2, H3 held; H6 and H7 held only in part (`above` for H6; `below`'s H7 margin is within one se); H4 (retrofit goes linearly unstable) and H5 (the tuner picks less than 2) refuted (`LOG.md`).

![Held-out flights that diverged at twice the trained centre-of-pressure lever, one probe at a time, at 20 and 45 degree tilt-command limits. Base: 12 and 37 of 1,152 for the margin-constrained designs with the centre of pressure above, 45 and 55 of 384 with it below. Raising the divergence bound to 85 degrees, halving the position gains or switching to an airmode mixer leave most of them; an ideal mixer removes two thirds; an ideal mixer with 1.25 to 1.5 times the torque removes them all.](experiments/m7g_lever2/m7g_lever2.png)

## Milestone 7g: why do the stable designs still crash in a doubled gust lever? Thrust headroom

**Question.** Milestone 7f's margin stops every divergence the tilt limit exposes, but at twice the trained centre-of-pressure lever 4 of 384 flights per arm still crash at a 20° tilt limit and 12-13 at 45°, at every margin, and 45 in the `below` geometry where the margin does not bind. What causes them: the mixer, too little torque, the 60° crash bound, or the position loop? No training: the 7b, 7e and 7f designs re-flown on the same 64 held-out flights under one probe at a time (four new `poshold.rollout` probes, bit-for-bit inert at their defaults).

**Headline (`experiments/m7g_lever2/results.txt`, `headroom.txt`; simulated; 8 predictions committed first).**

- **They tip over because the motors run out of differential thrust.** Every death is a roll or pitch past 60°. In diverged flights the attitude-priority mixer is scaling roll/pitch on 6-51% of steps (0% in survivors), and the gust torque reaches 0.87-1.13 of the plant's torque limit (0.50 in survivors).
- **More room fixes it; nothing else does.** An ideal mixer cuts the constrained `above` deaths from 12 to 4 (20°) and 37 to 8 (45°); with 1.25× torque on top, to 0. A crash bound of 85° (12 → 8, 37 → 29), halved position gains (12 → 10, 37 → 12) and airmode (12 → 19, 37 → 40) do not.
- **For a builder:** if the centre of pressure may sit twice as far from the centre of mass as designed, buy thrust-to-weight above 2 (milestone 7h: on these airframes that costs a mass spiral, and a tuner given the choice spends the headroom on efficiency). No gain tuning, stability margin or airmode recovers the authority. The `below` geometry needs about 1.5× (45 → 0).
- Predictions: G1, G3, G4, G5 and G8 held; G2 (authority not the cause) and G6 (crash bound) refuted; G7 split (`LOG.md`).

![Left: held-out cost at the design wind and at the trained lever, paired against the unconstrained designs, as the ki bound is tightened from 1.0 to 0.6 times the linear ceiling: about 0.01 worse from 0.9 times on, flat beyond that. Right: held-out flights that diverged out of 384: with a 45 degree tilt limit, 13 unconstrained, 9 at 1.0 times, 3 at 0.9 times and none from 0.8 times on; at twice the trained lever the counts fall to a floor of 4 (20 degree limit) and 12 (45 degree) at 0.8 times and stay there.](experiments/m7f_sweep/m7f_sweep.png)

## Paper draft (milestone 7, started 2026-11-14): the tilt limit we tested at is PX4's minimum

[`paper/DRAFT.md`](paper/DRAFT.md) is the first draft of the RA-L paper: sections III–V (model, the cant optimum, the RotorPy check; written in full 2026-11-21), the stability section (milestones 7c–7g) and the motor-lag randomisation section (milestones 7s–7ac, with Table VII-1 and pooled tests from [`paper/table7_stats.py`](paper/table7_stats.py)) written in full, a bibliography ([`paper/references.bib`](paper/references.bib)), and [`paper/check_numbers.py`](paper/check_numbers.py), which fails if a quoted figure no longer matches its results file (115 checks since 2026-11-21, including every row of Tables IV-1 and VII-1; run by `tests/test_paper_numbers.py`).

- **Writing it changed how the stability results read.** The simulator's default tilt-command limit is 20°. PX4's `MPC_TILTMAX_AIR` defaults to 45° with 20° as its floor, and ArduPilot's `ANGLE_MAX` defaults to 30° (both read from the autopilots' source on 2026-11-14). So the 45° condition in milestones 7d–7f is the stock PX4 setting, not a stress test: at it, designs CMA-ES tuned onto the linear ceiling diverge on 13 of 384 held-out flights and their position error rises from 0.105 to 0.257 m (`experiments/m7e_margin/tilt.txt`), and the 0.8× margin removes all 13 for 0.7% of cost.
- No new experiment: the draft only collects numbers already in `experiments/`. Simulated throughout; the gaps before submission (ten seeds, bootstrap intervals, LaTeX and the cut to length, hardware; sections I, II, VIII and IX were written out 2026-11-21) are listed at its end.

## Milestone 7f: how much stability margin should the tuner keep?

> **Revised at ten seeds (2026-11-22, `experiments/m12b_ten_seeds_vi`).** At 45° the counts are 31 / 19 / 6 / 1 / 1 / 0 of 640 (no bound to 0.6×); two of ten unconstrained tunes diverge at the trained 20° limit, so the cost penalty is measured over the other 8 seeds (0.012 at 0.8×, p = 0.008); the lever-2 floor is 23 of 640 in all three arms from 0.8× down. The bullets below are the six-seed record.

**Question.** Milestone 7e made CMA-ES keep the attitude integral gain at or below 0.8× its linear stability ceiling and found it cheap and protective. Is 0.8× the right number? We trained the same designs (centre of pressure above, 6 seeds × 2 starts × 3,200 evaluations) with the bound at 1.0×, 0.9×, 0.7× and 0.6× of the ceiling, and scored all seven arms on the same 64 held-out flights at 20° and 45° tilt-command limits and at 0, 1 and 2× the trained centre-of-pressure lever.

**Headline (`experiments/m7f_sweep/results.txt`; simulated, 48 new CMA-ES runs, 42 designs; 7 predictions committed first).**

- **0.8× is the knee.** At a 45° tilt limit the designs diverge on 13 of 384 held-out flights unconstrained, 9 when only required to be stable at every plant corner (1.0×), 3 at 0.9×, and 0 at 0.8×, 0.7× and 0.6×. At twice the trained lever the counts fall to 4 of 384 (20° limit) and 12 (45°) at 0.8× and do not improve further.
- **Tighter costs nothing more.** The held-out cost penalty is about 0.011 (0.7%) at every bound from 0.9× to 0.6×, position error 0.105 m in all arms; the optimiser sits on whichever bound it is given and makes up the integral gain with the other gains.
- **For a builder:** add the linear check to the tuning loop with ki at 0.8× of its ceiling or a little below. Stability at the plant corners alone is not enough.
- Predictions: F1, F3, F4b and F6 held; F2 refuted narrowly, F4a refuted (the price steps, then is flat), F5 split (0.9× still diverges) (`LOG.md`).

![Left: each trained design's attitude integral gain as a multiple of its own linear stability ceiling against its held-out cost at the design wind: the unconstrained designs (milestone 7b) sit at 0.9 to 1.1 times the ceiling, the designs trained with the 0.8 times margin as a constraint sit at 0.77 to 0.79 times it, with the same cost; the centre-of-pressure-below designs barely use the integrator. Right: held-out flights that diverged at lever 0, 1 and 2: with the centre of pressure above, 15 of 384 unconstrained flights diverge at lever 2 against 4 constrained; with it below, 42 against 45.](experiments/m7e_margin/m7e_margin.png)

## Milestone 7e: train inside the linear stability margin

**Question.** Milestones 7c and 7d showed that CMA-ES tunes the integrator feed-forward designs onto the linear stability boundary, and that the 20° tilt-command limit hides the instability that leaves. If the optimiser is made to keep the margin, with the linear test (both axes, eight plant corners) required to pass at 1.25× the design's own integral gain, what does that cost, and what does it buy?

**Headline (`experiments/m7e_margin/results.txt`, `tilt.txt`; simulated, 24 CMA-ES runs of 3,200 evaluations, 12 designs per arm × 64 held-out flights; 5 predictions committed first).**

- **The margin costs almost nothing.** Trained under the constraint, the centre-of-pressure-above designs land on it (ceiling multiple 1.26–1.30 in all six seeds; ki/kp 3.3–3.9 against 3.7–4.4 unconstrained) and lose 0.011 in held-out cost at the design wind (se 0.003, about 0.7%); below, 0.000.
- **It removes the hidden risk.** With the tilt-command limit raised to 45° or 59°, the unconstrained `above` designs diverge on 13 of 384 held-out flights and their position error more than doubles (0.26 m); the constrained ones diverge on none and hold 0.10 m, as at 20° (follow-up, written after the main results).
- **It helps outside the training range, on one side.** At twice the trained centre-of-pressure lever, `above` divergence falls from 15 to 4 of 384 and cost improves in 6 of 6 seeds (+0.60). With the centre of pressure below, the integrator carries almost no gain, the constraint barely binds, and lever-2 divergence (42 against 45) is not a linear-gain effect.
- Predictions: E1, E2, E3 and E5 held; E4 refuted (fewer divergences at lever 2 in `above` only).

![Share of 384 held-out flights that diverge against the tilt-command clip, at 6 s and 18 s: designs bolted onto an existing tune diverge on 20% at the default 20 degree clip and on all of them from 45 degrees; designs at 1.25 times the linear ki ceiling never diverge at 20 degrees but diverge on 83 to 88% of 18 s flights at 45 to 59 degrees; designs retrained onto the ceiling lose 3 to 4%; designs at 0.8 times the ceiling never diverge at any clip.](experiments/m7d_clip/m7d_clip.png)

## Milestone 7d: what keeps an unstable feed-forward loop from diverging? The tilt limit

**Question.** Milestone 7c's linear test called 367 of the 384 held-out flights of the designs at 1.25× their ki ceiling unstable, and none diverged. Is that because the attitude integrator's clip caps the feed-forward (7c's guess), because a slow instability (0.5–0.7 per s) needs more than a 6 s flight, or something else?

**Headline (`experiments/m7d_clip/results.txt` and the post-hoc `diag.txt`; simulated, 24 design-conditions × 64 held-out flights; 8 predictions committed first).**

- **Not the integrator clip:** it is never reached (0.000 of steps in every design set), and removing it changes no divergence count.
- **Not the flight length:** the linear model kills 60% of those flights within 6 s from their initial offset alone and 87% within 18 s; in the simulator none diverges at 6 s or 18 s.
- **The 20° tilt-command limit holds them** (post hoc). It is active on 13–24% of their steps; raise it to 45–59° and 83–88% of the 18 s flights diverge, close to the 96% the linear model calls unstable. At 20° they hold position but oscillate against the limit (tilt tracking error 8.7–10.0° RMS against 2.6–3.6° for stable designs).
- **For a builder:** the 0.8× margin on the linear ki ceiling is the only setting that never diverged at any tilt limit; designs tuned onto the ceiling lose 3–4% of flights once the limit is raised to 45°. A loose tilt limit (aggressive or racing position modes) removes the safety net the default gave.
- Predictions: V1 and V5 held; V7 held in part; V2, V3, V6 and V8 refuted; V4 held only trivially (`LOG.md`).

![Left: each centre-of-pressure-above design's attitude ki/kp against the ki/kp ceiling the linear model gives with the integrator feed-forward: milestone 6b's designs sit at 2.3 to 3.4 times their ceiling, the designs retrained with the feed-forward sit on it, and the new designs at 0.8 and 1.25 times the ceiling straddle it. Right: growth rate of the most unstable held-out plant against the share of held-out episodes that diverged; no linearly stable design diverged at the design wind.](experiments/m7c_stab/m7c_stab.png)

## Milestone 7c: a linear stability test for the side-force feed-forward

**Question.** Milestone 7b's integrator feed-forward is safe when retrained with it and runs away when bolted onto an existing tune, and no simple rule said which. Does a linear stability analysis of the full attitude-plus-position loop (`src/codesign_cant/linstab.py`: one horizontal axis, 11 states, motor lag, one-step-old measurements and either feed-forward; checked against the simulator to 10⁻³ by `tests/test_linstab.py`) predict which designs and which flights diverge, and give a gain ceiling a builder can use?

**Headline (`experiments/m7c_stab/results.txt`; simulated, 84 design-conditions × 64 held-out flights, each flight's own randomised plant; 6 predictions committed first).**

- **Necessary, not sufficient.** No flight the model calls stable at its own plant diverged at the design wind (0 of 2,688 with the integrator feed-forward or none; 1 of 758 with milestone 7's commanded-torque feed-forward). Every diverged flight was called unstable, but 300 unstable ones did not diverge: accuracy 0.90, against the 0.95 predicted.
- **The optimiser tuned onto the boundary.** Retrained with the integrator feed-forward, the designs' integral-to-proportional gain ratio (3.7–4.4 per s) sits at 0.88–1.11× the linear ceiling (3.5–4.6 per s). The bolted-on designs sit at 2.3–3.4× it, and the model calls every one of their flights unstable (growth 3.9–7.4 per s); 11–44% diverge.
- **Keep a margin.** New designs at 0.8× their ceiling: no divergence, position error unchanged (0.10 m). At 1.25×: unstable by the model, yet no divergence and 0.11 m, because the instability is slow (0.5–0.7 per s) and stays bounded. How fast it grows ranks how many flights diverge (Spearman 0.83, post hoc).
- **Milestone 7's divergences are linear, flight by flight:** the model names the same two seeds and 7 of the 8 diverged flights (accuracy 0.995).
- Predictions: U3 and U4 held; U1, U5 and U2 held in part; U6 failed. An analysis bug (a held, unobservable state counted as eigenvalue 1) was found in the first run and fixed before the verdicts (`LOG.md`).

![Left: late-window position error after a wind step on the axis the canted rotor's side force hurts (circles) and the one it helps (squares), for milestone 6b's designs without a feed-forward, milestone 7's commanded-torque feed-forward, the integrator feed-forward added to 6b's designs, and designs retrained with it. Middle: diverged held-out episodes (6 seeds of 64) at lever 1 and 2. Right: composite J of the retrained integrator feed-forward designs minus milestone 6b, milestone 7 and no cant, paired by seed.](experiments/m7b_integ/m7b_integ.png)

## Milestone 7b: a side-force feed-forward from the attitude integrator alone

**Question.** Milestone 7's feed-forward predicted the side force from the whole commanded torque and diverged on a few flights, because the proportional and derivative torque closed a fast loop through the motor lag. The steady side force comes from the steady counter-torque to the gust, which the attitude integrator already estimates. Does a feed-forward from the integrator alone (`poshold.rollout(ff_mode="integ")`, no filter, no new sensor) keep the fix and drop the divergences?

**Headline (`experiments/m7b_integ/results.txt`; simulated, 6 seeds, best of two CMA-ES starts, retrained with it, both rigid geometries; 9 predictions committed first).**

- **Centre of pressure above the centre of mass: yes.** Retrained with it, no held-out episode diverges at lever 0 or 1 (milestones 6b and 7: one each), the hurt/helped late-window ratio is 0.83 (2.06 with it switched off on the same designs), and at lever 2 15 of 384 episodes diverge against 23 (6b) and 19 (milestone 7). Mean J −1.58 against −1.68 and −1.67, though by sign only 2 and 1 of 6 seeds are better: the mean gain is the rare divergence the others had.
- **Below: nearly inert, and harmless.** Those designs barely use their integrator (ki/kp 0.05–0.28 per s against 3.7–12.6 above; `experiments/m7b_integ/diag.txt`), so it sees little of the side force: ratio 2.04 against 3.01 off. No more divergences than without it, and 2 against milestone 7's 8.
- **Never bolt it onto an existing tune.** Added to milestone 6b's integrator-heavy `above` designs without retraining, it diverges on 23% of held-out episodes even with no gust torque: the integrator path also closes a loop, slowly. A simple quasi-steady runaway criterion did not explain which designs diverge; ki/kp did (post hoc).
- **Cant still pays:** yaw −5.2° and −7.7° against no cant, J better in 6 of 6 seeds in both geometries; chosen cant 31–33°.
- Predictions: T6 and T7 held in both geometries, T4 held on means only; T2, T3, T8 and T9 held above and failed below; T1 failed in both and T5 failed above.


## Milestone 7: can the flight controller cancel the side force itself? A position-loop feed-forward

![Left: late-window position error after a wind step on the axis the canted rotor's side force hurts (circles) and the one it helps (squares), without the feed-forward, with it added to milestone 6b's designs, and retrained with it. Middle: share of held-out episodes that diverge against the feed-forward's filter constant; stars are the retrained designs at the filter CMA-ES chose. Right: composite J of the retrained feed-forward designs minus milestone 6b's canted and uncanted designs, paired by seed.](experiments/m7_ff/m7_ff.png)

**Question.** Milestone 6b found that on a rigid frame the canted rotor's side force hurts position hold along one horizontal axis. The mixer cannot cancel it (four rotors, four commands), but the controller knows lat, its own commanded torque and its nominal motor lag. If the position loop predicts the side force and leans against it, does the penalty go away?

**Headline (`experiments/m7_ff/results.txt`; simulated, 6 seeds, best of two CMA-ES starts, retrained with the feed-forward and its filter constant as a 13th parameter, both rigid geometries).**

- **It evens the axes.** The hurt/helped late-window ratio drops from 1.91 and 3.41 to 1.08 and 1.10; switch the feed-forward off on the same designs and it returns (2.10, 3.33). Median hurt-axis error after the wind step falls from 0.047 to 0.037 m and from 0.040 to 0.030 m.
- **It does not pay overall.** The term feeds the commanded torque back into the attitude reference through the motor lag, and under plant uncertainty that loop can diverge. Added to milestone 6b's designs, a 0.2 s filter diverges on 16% of held-out episodes (0.5% without the feed-forward); 1 s on 1.3%, 2 s on 0.8%. Retrained, two of six `below` designs chose fast filters (0.17, 0.18 s) and diverge on 4 of 64 episodes each, so J falls by 0.33 against no feed-forward. Above, it is a wash (J +0.009, 5 of 6 seeds better).
- **The typical design still barely notices the side force** (median on/off 1.01–1.02); the mean is the divergence tail, as in milestone 6b.
- **Cant still pays:** yaw −5.1° and −7.2° against no cant (6 of 6 seeds each), J better in 5 of 6. Chosen cant 33–34°.
- For a builder: if you add the feed-forward, filter it slowly (1 s or more). Its gain is about a centimetre of late-window error on one axis.
- Committed predictions: 4 of 7 held in both geometries; S2 (H3 within 5% with the feed-forward) was refuted in both, by the divergence tail.
![Left: held-out composite score J of the 60 milestone-4 designs in RotorPy with canted rotors against the same designs in the stylised simulator, one colour per RotorPy condition; filled markers are canted designs, open ones uncanted. Right: held-out RMS attitude error, cant minus no cant, paired by seed, for PID, INDI and geometric control in the stylised simulator and the four RotorPy conditions.](experiments/m5_rotorpy/m5_rotorpy.png)

## Milestone 5: do the co-designed quadrotors keep their ranking in RotorPy? (H5)

**Question.** Every result here came from one stylised simulator. Do the designs keep their order, and does cant keep its advantage, in RotorPy (Folk et al. 2023), an independently written multirotor simulator with quaternion dynamics, motor-speed dynamics and rotor aerodynamics, once its rotors are canted?

**Headline (`experiments/m5_rotorpy/results.txt` and `noise_ceiling.txt`; simulated; the 60 milestone-4 designs, not retuned, 32 held-out episodes each, four RotorPy conditions).**

- **Cant still wins in RotorPy:** 10 of 10 seeds for PID, INDI and geometric control in every aerodynamic condition, by 4.8–5.8° (PID), 4.7–5.1° (geometric) and 3.1–3.5° (INDI) of RMS attitude error. INDI without cant is still worse than PID with cant in 10 of 10 seeds (H4 survives).
- **H5 is refuted as written, but its test cannot be passed.** Spearman ρ over the top ten designs is 0.20–0.30 (threshold 0.5). Those ten are tied: their stylised scores span 0.064. Scored again in the *stylised* simulator on fresh episodes, they reach a top-ten ρ of only 0.26. The test measures episode noise.
- **What a designer uses survives:** ρ over all 60 designs is 0.88–0.91 with RotorPy aerodynamics (0.80 with the stylised gust torque), against 0.95–0.97 for the stylised simulator against itself. The six law × cant arms keep their order (ρ 0.94–1.00); geometric control with cant is best everywhere.
- **The stylised model is optimistic by 1–2°, and most for INDI.** Canted INDI designs lose 1.8–2.1° in RotorPy, PID 1.4–1.8°, geometric 0.9–1.1°. INDI's increment trusts a torque-lag actuator model; RotorPy's actuator is a speed lag with thrust ∝ ω².
- Injecting the stylised gust torque into RotorPy is harsher than RotorPy's own aerodynamics: +3.4° and 2.8% divergent episodes (mostly uncanted), against +1.3–1.5° and ≤ 0.16%. Doubling the assumed rotor-drag coefficients moves mean error by under 0.25°.
- Predictions committed before the run: F5 held; F2, F4 and F6 held in the aerodynamic conditions and failed under the injected torque; F1 (H5) and F3 were refuted.

![Left: position RMS with the canted rotor's side force on divided by off, for force-aware designs retrained with the centre of pressure above (blue) or below (red) the centre of mass, against the centre-of-pressure lever; dashed: H3's 20% line. Middle: late-window position error on the axis the side force hurts and the one it helps. Right: composite J, cant minus no cant, paired by seed.](experiments/m6b_cop/m6b_cop.png)

## Milestone 6b: which way does the side force push on a real frame? One axis hurt, one helped

**Question.** Milestone 6 found that H3 depends on the sign of the gust's disturbance torque. Which sign does a real, rigid frame have?

**Headline (`experiments/m6b_cop/results.txt`; simulated, 6 seeds, best of two CMA-ES starts, retrained under each geometry).**

- **Neither.** Drag acting at a centre of pressure r = (0, 0, h) gives τ = r × F = (−h F_y, h F_x, 0): opposite signs on roll and pitch. Milestone 6's inherited signs (+1, +1) and its flip (−1, −1) each put the centre of pressure below the centre of mass on one axis and above it on the other. The canted layout's side-force map (F_y = lat·τ_x, F_x = lat·τ_y) is a reflection. So in a rigid frame the steady counter-torque's side force **opposes the drag on one horizontal axis and adds to it on the other, whichever side the centre of pressure is on.** A test checks the signs against `np.cross`.
- **The hurt axis holds position 1.9–3.4× worse after a wind step** than the helped axis (late window, retrained force-aware designs; without cant the axes match at 0.96×). With the force switched off the same axis drops from 0.054 to 0.030 m (above) and from 0.057 to 0.021 m (below).
- **Averaged over both axes, the typical design barely notices it:** median on/off 1.03× in both geometries. The mean is 1.14× (above) and 1.26× (below) because one seed in six diverges on 1–2 of 64 episodes. H3's 20% line is crossed by the mean in one geometry, not by the typical design.
- **No gust torque, no cost:** with the lever at zero the side force costs nothing (1.00×, 12 of 12). The whole cost runs through the counter-torque to the gust.
- **Cant still pays for a rigid frame:** yaw RMS −5.1° and −7.7° (6 of 6 seeds each), composite better in 5 of 6 and 6 of 6. Chosen cant 31–33°.
- At twice the lever, side-force cost rises in 5 of 6 seeds per geometry, but designs trained at the inherited lever start to diverge (6–27% of episodes, with or without cant).
- Predictions committed before the run: 6 of 7 held. R2 failed in one geometry, on one seed's divergences.

![Left: held-out RMS position error of the co-designed vehicles in 6 s position-hold episodes with a wind step, with the canted rotor's side force on (blue) and switched off as an ablation (grey). Middle: RMS yaw error during the same episodes. Right: position RMS with the side force on divided by off, for the gust torque sign the designs were trained under (blue) and flipped (red); the dashed line is H3's 20% refutation line.](experiments/m6_poshold/m6_poshold.png)

## Milestone 6: does a canted rotor's side force cost position hold? (H3)

**Question.** When the mixer makes roll or pitch torque on a canted quadrotor, the tangential thrust components stop cancelling and push the body sideways. Does that force cost position-hold accuracy by more than cant's yaw gain is worth? (H3 is refuted if position RMS rises by more than 20% with the force on.)

**Headline (`experiments/m6_poshold/results.txt` and `dist_sign.txt`; simulated, 6 seeds, best of two CMA-ES starts, 12 parameters, attitude-priority mixer, TWR 2, 6 s episodes in which the mean wind steps by ±3 m/s at 3 s).**

- **The side force, derived from the allocation:** F_y = lat·τ_x and F_x = lat·τ_y with lat = sin α / (L cos α − κ sin α). Yaw torque makes none. Tests check this against the full wrench map on 100 random designs. The `-poshold` project's tan α / (L/√2) was √2 too large.
- **H3's verdict depends on where the centre of pressure sits.** In the inherited model the gust's disturbance torque has a sign that makes the attitude loop's counter-torque produce a side force *against* the drag. There the force does not cost position: 0.96× with it on against off (one seed of six at 1.24×), and 0.71× after the wind step. Re-scored with that sign flipped, the same designs lose **1.21×** (all six seeds 1.18–1.24×) and 1.62× after the step: refuted by the proposal's own line, though without retraining.
- **Cant still buys yaw, not position.** Against no cant, cant cuts yaw RMS by 4.7° in 6 of 6 seeds (14.9° to 10.2°). Position is +0.03 m (4 of 6 seeds lower, one outlier carries the mean). The composite improves in 4 of 6 seeds as trained and 6 of 6 with the sign flipped. The yaw gain outweighs the position cost either way.
- **Ignoring the force in design costs less than `-poshold` found.** Designs trained with the force off are worse by 0.35 in the composite (2 of 6 seeds better), not the 1.07 m blow-up of the earlier study. They do lose 1.59× in position once the sign is flipped.
- **The co-designed cant does not move:** 36–38° (median 38°), as in milestones 2 and 4.
- Committed predictions: 5 of 7 held. Q2 (ignoring the force hurts in 5 of 6 seeds) and Q7 (the wind step costs at least 10% in every arm) were refuted.

![Left: held-out RMS attitude error of the co-designed vehicles for three attitude laws (PID, INDI, geometric SO(3)), without cant (grey) and with cant up to 80° (blue), 10 seeds each. Right: cant minus no cant, paired by seed, at the design gusts (blue) and at twice the gust intensity (red); below zero cant is better.](experiments/m4_controllers/m4_controllers.png)

## Milestone 4: is cant just a patch for a weak controller? INDI and geometric attitude control

**Question.** Every earlier result used one per-axis PID law. Does a stronger attitude law, incremental nonlinear dynamic inversion (INDI, Smeur et al. 2016) or geometric control on SO(3) (Lee et al. 2010), shrink or remove the advantage of rotor cant? (Hypothesis H4: it narrows but does not remove it; refuted if INDI without cant matches PID with cant.)

**Headline (`experiments/m4_controllers/results.txt`; simulated, 10 seeds per arm, three CMA-ES starts each, attitude-priority mixer, TWR 2, hover power priced at 0.3° per 100 W).**

- **Cant survives a stronger controller.** Paired by seed, cant beats no cant by **4.18°** RMS under INDI (SD 0.25), **4.88°** under geometric control (SD 0.20) and 5.27° under PID (SD 1.32), in 10 of 10 seeds for every law (sign test p = 0.002).
- **H4 passes its refutation test.** INDI without cant is 4.02° worse than PID with cant in 10 of 10 seeds. Without cant the mixer still scales yaw on 54–60% of steps whatever the law: no controller makes yaw torque the rotors cannot.
- **The stronger law narrows the gap a little.** INDI shrinks the cant advantage by 1.09° against PID (9 of 10 seeds), geometric control by 0.38° (5 of 10).
- **INDI mostly buys consistency for the uncanted vehicle.** PID without cant ranges 17.2–21.1° across seeds, INDI 16.9–17.6°. At twice the gust intensity INDI beats PID by 5.4° without cant and by 0.05° with it, so about half of PID's 9.8° gust-time cant advantage is a controller effect; the remaining 4.5° is the actuator.
- **The co-designed cant does not depend on the law:** median 34° (PID), 34° (INDI), 35° (geometric).
- All eight predictions committed to `LOG.md` before the run held, and the PID arms reproduce milestone 2 exactly.

![Left: held-out RMS error against hover power for every milestone-2 vehicle (grey: per-axis torque box; blue: attitude-priority mixer on the shared thrust polytope; orange: the same with airmode). Right: chosen cant as hover power is priced; crosses are the best of three CMA-ES starts.](experiments/m2_polytope/m2_polytope.png)

## Milestone 2: one thrust polytope for combined commands, and a price on hover power

**Question.** Milestone 1 let roll, pitch and yaw each saturate at their own limit at once, and left hover power free. Does cant still pay when the three torques share one thrust budget through a real mixer, and when power costs something?

**Headline (`experiments/m2_polytope/results.txt` and `restarts.txt`; simulated, 5 seeds, TWR 2).**

> **Revised at ten seeds (2026-11-21, `experiments/m12_ten_seeds`).** Cant's advantage under the attitude-priority mixer is 4.98° (9 of 10, p = 0.004), not 6.08°, no larger than under the box (4.86°); hover power falls 3.0-7.0×; with three starts the chosen cant is 28-37° in 19 of 20 seed-arms; airmode helps by 1.14° and 0.88°. The bullets below are the five-seed record.

- **The shared polytope costs accuracy, and cant more than makes up for it.** With an attitude-priority mixer (roll and pitch first, yaw gets the rest, as PX4 and Betaflight do) held-out RMS error rises by 2.90° without cant and 1.63° with it (5 of 5 seeds each). Cant's paired advantage grows from 4.81° to **6.08°** (SD 0.28, 5 of 5). The tuned no-cant vehicle saturates roll and pitch on 97% of steps, leaving yaw nothing; with cant, yaw rides on the tangential thrust and is scaled on 39% of steps.
- **Pricing hover power shrinks the vehicle, not the cant.** At 0.3° per 100 W, hover power falls 4–7× (canted design 1380 W to 219–256 W) for at most 0.5° of extra error. The chosen cant stays at **28–37° in 9 of 10 seed-arms** from 0 to 1° per 100 W (best of three CMA-ES starts). The proposal's H1, a small 5–20° optimum, is refuted under this objective.
- **Cant still wins once power is priced:** −5.28 composite at 0.3° per 100 W (5 of 5) and −2.92 at 1° per 100 W (4 of 5).
- **Single-start CMA-ES is unreliable on the polytope.** One start per seed sent 2 of 5 seeds to 0–13° of cant at 0.3° per 100 W, with scores 4–6° worse; restarts recovered 32–37°. The no-cant landscape is multimodal too (restarts moved it 0.6° at 1° per 100 W).
- **Airmode helps** (collective free): −1.56° without cant (5 of 5), −0.26° with it (4 of 5).

## Milestone 1: the earlier actuator model, checked against a full allocation

**Question.** All seven earlier projects gave the simulator two hand-written torque limits. Are they right, and do the conclusions survive if they are not?

**Headline (numbers from `experiments/m1_allocation/results.txt`; simulated, 5 seeds).**

> **Revised at ten seeds (2026-11-21, `experiments/m12_ten_seeds`).** 4.85° against 4.50° at TWR 2 (10 of 10, p = 0.002); with TWR free at hover the uncanted designs pick TWR 2.1-3.7, the canted ones 2.0-2.1. The bullets below are the five-seed record.

- **The formulas were wrong in three places.** The full 6×4 thrust-to-wrench map with every thrust in [0, Tmax], maximised by a linear programme (closed forms agree to 1e-15 on 300 random designs), gives yaw 4Δ(L sin α + κ cos α) and roll 4Δ(L cos α − κ sin α)/√2, where Δ = min(Th, Tmax − Th) with altitude held, or Tmax/2 if the mixer may give up altitude. The earlier yaw limit used 2 in place of 4 and the moment arm L/√2 in place of L, which understated yaw authority by 2× with no cant and up to 2.8× with cant. The earlier roll limit kept growing above TWR 2 by assuming negative rotor thrust. The side force per unit roll torque in `-poshold` was √2 too large.
- **Cant's advantage survives the correction.** Paired by seed, cant ≤ 35° beats no cant by 4.81° RMS (SD 0.12, 5 of 5 seeds) with corrected limits at TWR 2, against 4.62° with the old ones. With TWR free the gap is 4.81° (altitude held) or 2.77° (collective free), against 2.43° before.
- **The chosen cant does not move.** 35–37° at an 80° bound, the same plateau as before. That plateau comes from the objective: attitude error only, with cost as a $300 cap. The 35° design weighs 3.17 kg against 1.74 kg without cant and needs cos(35°)^−1.5 = 1.35× the ideal hover power. Naming a best cant angle needs an objective that prices energy.
- **The motor-headroom result does not survive.** `-twrceil`'s interior optimum near TWR 5 depended on the roll limit growing past TWR 2. With altitude held the optimiser picks TWR 2.0–2.3; with collective free it picks 3.3–4.7.
- The earlier numbers are reproduced exactly when the old limits are switched back on (13.65° and 11.22° for twrceil, 17.06° and 12.46° for propdata).

## Method

**Milestone 5.** `src/codesign_cant/rotorpy_twin.py` subclasses RotorPy 3.0.0's `Multirotor` (MIT) and replaces only its wrench: each rotor thrusts along its canted axis from `allocation.layout`, its rotor drag and induced inflow act in the rotor's own frame, its reaction torque turns with the axis, and the frame drag can act at a centre of pressure above the centre of mass. At zero cant the wrench equals RotorPy's own to 1e-12 (tested). Mass, inertia, arm, propeller, thrusts, motor lag and frame area come from `aero.size`. The aerodynamic coefficients come from RotorPy's AscTec Hummingbird file, scaled to each propeller by momentum-theory exponents (thrust with D⁴, rotor drag and inflow with D³, translational lift with D²). The controllers are the stylised ones with the same gains, measurements and mixer, plus an altitude loop. `experiments/m5_rotorpy/run.py` re-scores the 60 milestone-4 designs in four conditions: `torque` (aero off, the stylised gust torque injected), `aero` (RotorPy aerodynamics driven by the stylised wind), `aero_cop` (frame drag at the stylised centre-of-pressure lever) and `aero_cop2` (rotor-drag coefficients doubled). `noise_ceiling.py` (post hoc) re-scores the designs in the stylised simulator on five fresh episode sets.

**Milestone 6b.** `poshold.cop_signs(h)` gives the per-axis gust-torque signs of a rigid centre-of-pressure offset, `rollout(dist_sign=(roll, pitch), lever_scale=...)` takes them, and `rollout` reports late-window position RMS per world axis. `experiments/m6b_cop/run.py` retrains milestone 6's `aware` and `nocant` arms under both rigid geometries (48 CMA-ES runs, same budget and seeds), then scores every design, and milestone 6's designs, on the 64 held-out episodes with the force on and off at lever 0, 0.5, 1 and 2 times the inherited value.

**Milestone 6.** `src/codesign_cant/poshold.py` adds translation to the attitude model: perfect altitude hold, drag from the same gust that drives the disturbance torque, GNSS-class position and velocity noise, an outer PID that sets roll and pitch references, and the side force from the delivered (mixed, lagged, saturated) torque. All of these are inherited from `codesign-aero-cant-poshold` and assumed. Joint CMA-ES runs over arm, propeller, cant, six attitude and three position gains, with 3200 evaluations on 16 training episodes. J = −sqrt((pos/0.10 m)² + (yaw/10°)²) − 0.03·P_hover/100 W, which is milestone 4's power price in composite units. Each design is held-out scored on 64 episodes with the force on, off and in calm air. `dist_sign.py` re-scores the same designs with the gust torque's sign flipped.

**Milestone 4.** `aero.rollout(ctrl=...)` adds two attitude laws next to the PID law; all three read the same noisy, one-step-old angles and rates and send their torque request through the same mixer. `indi`: an attitude P loop gives a rate demand, a rate P loop gives a desired angular acceleration ν, and the torque command is the filtered estimate of the delivered torque plus g·I_nom·(ν − filtered angular acceleration); the estimate runs the command through the design's nominal lag and limits, so the plant's randomised torque scale, inertia and lag stay unknown to it; gyro and estimate share a tuned two-pole filter. `geo`: τ = I_nom(−k_R e_R − k_Ω Ω − k_I ∫e_R) + Ω × I_nom Ω with e_R = vee(R_dᵀR − RᵀR_d)/2. Each law has six tuned parameters, searched jointly with arm, propeller and cant. `experiments/m4_controllers/run.py` runs law {PID, INDI, geo} × cant bound {0, 80°}, 10 seeds, three CMA-ES starts (cant started at 4, 32, 64°), 1920 evaluations each, best training score kept (180 runs), and scores the chosen designs on 64 held-out episodes and at twice the gust intensity. Tests (`tests/test_controllers.py`) check the rotation and SO(3) error against closed forms, the gain maps, step tracking on the nominal plant and INDI's disturbance rejection.

**Milestone 2.** `allocation.mix_priority` uses the fact that the roll, pitch, yaw and Fz rows of the canted-X wrench map are orthogonal sign patterns. It computes the thrust change for a request, then the largest scales for roll and pitch together and then for yaw that keep every thrust in [0, Tmax] (collective held at hover) or the thrust spread within Tmax (airmode). Tests check it against the vector-built `layout`, the thrust bounds and maximality. `aero.score(mixer=..., lam=...)` scores J = −RMS − λ·P_hover/100 W, with P_hover the sizing closure's electrical hover power. `experiments/m2_polytope/run.py` runs mixer {box, prio} × cant bound {0, 80°} × λ {0, 0.1, 0.3, 1}, plus airmode, with milestone 1's search (100 CMA-ES runs). `restarts.py` reruns the polytope arms at λ 0.3 and 1 with three starts per seed. Predictions for both were committed to `LOG.md` before each ran. Q1–Q3 and Q5–Q7 held; Q4 and H1 were refuted; the restart prediction R1 held for the angle but not for a 5-of-5 win, and R2 was refuted.

**Milestone 1.** 
`src/codesign_cant/allocation.py` builds the wrench map from vectors (rotor positions, canted thrust axes, spin-signed reaction torque). It solves the largest pure roll, pitch and yaw torque as a linear programme (`scipy.optimize.linprog`, HiGHS), with no net side force and the other torques at zero, and gives the closed forms the tests check against it. `src/codesign_cant/aero.py` is `codesign-aero-cant-twrceil`'s simulator, unchanged except for an `actuator` switch (`prior`, `hover`, `free`) that sets the two torque limits. `experiments/m1_allocation/run.py` reruns joint CMA-ES over arm length, propeller diameter, cant, optional TWR and six PID gains: 1920 evaluations, 5 seeds, 16 training and 64 held-out wide-plant episodes, $300 cap, κ = c·D with c = 0.081, the median of 77 measured UIUC propellers. The predictions in `LOG.md` were committed before the run. P1, P4 and P6 held; P2, P3 and P5 were refuted.

## Reproduce

```bash
cd research/codesign-cant
PY=$(python3 ../../platform/ci/pyenv.py pytest numpy scipy cma matplotlib)
"$PY" -m pytest -q tests                        # 40 tests; the ones in test_rotorpy_twin.py skip without RotorPy
"$PY" experiments/m1_allocation/run.py          # about 9 minutes on 4 cores; results.txt, results.json
"$PY" experiments/m1_allocation/figure.py       # m1_allocation.png
"$PY" experiments/m2_polytope/run.py            # about 20 minutes on 4 cores
"$PY" experiments/m2_polytope/restarts.py       # about 16 minutes on 4 cores
"$PY" experiments/m2_polytope/figure.py         # m2_polytope.png
"$PY" experiments/m4_controllers/run.py         # about 45 minutes on 4 cores
"$PY" experiments/m4_controllers/figure.py      # m4_controllers.png
"$PY" experiments/m6_poshold/run.py             # about 55 minutes on 4 cores
"$PY" experiments/m6_poshold/dist_sign.py       # under a minute; post-hoc sign check
"$PY" experiments/m6_poshold/figure.py          # m6_poshold.png
"$PY" experiments/m6b_cop/run.py                # about 75 minutes on 4 cores; SMOKE=1 for a 1-minute pipeline check
"$PY" experiments/m6b_cop/figure.py             # m6b_cop.png
"$PY" -m pip install rotorpy==3.0.0 --no-deps    # milestone 5 only (its imports need only numpy and scipy)
"$PY" experiments/m5_rotorpy/run.py             # about 60 minutes on 4 cores; M5_EP=4 M5_ONLY=0,10 for a smoke run
"$PY" experiments/m5_rotorpy/noise_ceiling.py   # under a minute; post-hoc self-agreement of the stylised simulator
"$PY" experiments/m5_rotorpy/figure.py          # m5_rotorpy.png
"$PY" experiments/m7_ff/run.py                  # about 40 minutes on 4 cores; SMOKE=1 for a pipeline check
"$PY" experiments/m7_ff/figure.py               # m7_ff.png
"$PY" experiments/m7b_integ/run.py              # about 50 minutes on 4 cores; SMOKE=1 for a pipeline check (never the held-out seed)
"$PY" experiments/m7b_integ/diag.py             # seconds; post-hoc gain diagnostic, diag.txt
"$PY" experiments/m7b_integ/figure.py           # m7b_integ.png
"$PY" experiments/m7c_stab/run.py               # about a minute on 4 cores: linear stability vs held-out divergence
"$PY" experiments/m7c_stab/diag.py              # seconds; post-hoc growth-rate check, diag.txt
"$PY" experiments/m7c_stab/figure.py            # m7c_stab.png
"$PY" experiments/m7d_clip/run.py               # about 3 minutes on 4 cores: clip and horizon probes
"$PY" experiments/m7d_clip/diag.py              # under 2 minutes; post-hoc tilt-command clip sweep, diag.txt
"$PY" experiments/m7e_margin/run.py            # about 35 minutes on 4 cores: CMA-ES under the linear margin
"$PY" experiments/m7e_margin/tilt.py           # under 2 minutes; follow-up tilt-limit scoring, tilt.txt
"$PY" experiments/m7e_margin/figure.py
"$PY" experiments/m7d_clip/figure.py            # m7d_clip.png
"$PY" experiments/m7j_lever0/run.py            # under a minute on 4 cores: lever-0 probes at 30/45 deg; SMOKE=1 for a check
"$PY" experiments/m7j_lever0/posthoc.py        # seconds; post-hoc gains, posthoc.txt
"$PY" experiments/m7j_lever0/offset.py         # seconds; post-hoc start-offset sweep, offset.txt
"$PY" experiments/m7j_lever0/figure.py         # m7j_lever0.png
"$PY" experiments/m7k_fixes/run.py             # about 5 minutes on 4 cores: controller-side fixes; SMOKE=1 for a check (never the held-out seed)
"$PY" experiments/m7k_fixes/figure.py          # m7k_fixes.png
"$PY" experiments/m7l_train45/run.py           # about 100 minutes on 4 cores: retrain at 45 deg; SMOKE=1 for a 2-minute check (never the held-out seed)
"$PY" experiments/m7l_train45/figure.py        # m7l_train45.png
"$PY" experiments/m7m_aware_wide/run.py        # about 2 h 10 min on 4 cores (resumable from .cache): lever-aware objective with the cap and the wide box; SMOKE=1 for a 4-minute check
"$PY" experiments/m7m_aware_wide/figure.py     # m7m_aware_wide.png
"$PY" experiments/m7n_fixed_arm/run.py         # about 70 min on 4 cores (resumable from .cache): 7m with the arm pinned, plus arm swaps; SMOKE=1 for a 3-minute check
"$PY" experiments/m7n_fixed_arm/figure.py      # m7n_fixed_arm.png
"$PY" experiments/m7p_frame_law/fit_frames.py  # seconds: frame-mass laws from data/frames/frames_hobbyrc.csv -> frame_law.json/.txt
"$PY" experiments/m7p_frame_law/run.py         # about 12 minutes on 4 cores: 7o's sweep under four frame laws (SIZING_ONLY=1: sizing table, no flights)
"$PY" experiments/m7p_frame_law/analyse.py && "$PY" experiments/m7p_frame_law/posthoc.py && "$PY" experiments/m7p_frame_law/figure.py
python3 experiments/m7q_closure/collect.py <cache>  # downloads the retailers' public catalogues; rewrites data/components/ (listings change: a new snapshot, not a reproduction)
python3 experiments/m7q_closure/fit.py         # seconds, stdlib: closure constants -> closure.json/.txt
"$PY" experiments/m7q_closure/run.py           # about 16 minutes on 4 cores: 48 designs under seven closures (SIZING_ONLY=1: sizing and emax only, seconds)
"$PY" experiments/m7q_closure/analyse.py && "$PY" experiments/m7q_closure/verdicts.py && "$PY" experiments/m7q_closure/figure.py
"$PY" experiments/m7r_retune/run.py           # about 2 h on 4 cores (48 CMA-ES runs, cached in .cache/; then 11 min of held-out flights)
"$PY" experiments/m7r_retune/verdicts.py && "$PY" experiments/m7r_retune/figure.py
"$PY" experiments/m7s_lag/run.py              # about 15 min on 4 cores (72 designs x 9 lag laws x 4 conditions; no training)
"$PY" experiments/m7s_lag/verdicts.py && "$PY" experiments/m7s_lag/figure.py
"$PY" experiments/m7t_lag_src/run.py          # about 1.7 h on 4 cores (48 CMA-ES runs at the sourced 36 ms lag, cached in .cache/; then 5 min of held-out flights)
"$PY" experiments/m7t_lag_src/verdicts.py && "$PY" experiments/m7t_lag_src/figure.py
"$PY" experiments/m7u_slow_end/run.py         # about 1.4 h on 4 cores (48 CMA-ES runs at 39.1 ms, cached in .cache/; then 4 min of held-out flights)
"$PY" experiments/m7u_slow_end/verdicts.py && "$PY" experiments/m7u_slow_end/posthoc.py && "$PY" experiments/m7u_slow_end/figure.py
"$PY" experiments/m7v_lag_rand/run.py         # about 1.6 h on 4 cores (48 CMA-ES runs across 33-39.1 ms, cached in .cache/; then 6 min of held-out flights)
"$PY" experiments/m7v_lag_rand/verdicts.py && "$PY" experiments/m7v_lag_rand/posthoc.py && "$PY" experiments/m7v_lag_rand/figure.py
"$PY" experiments/m7w_slow45/run.py           # about 1.8 h on 4 cores (48 CMA-ES runs at 45 ms, cached in .cache/; then 7 min of held-out flights)
"$PY" experiments/m7w_slow45/verdicts.py && "$PY" experiments/m7w_slow45/posthoc.py && "$PY" experiments/m7w_slow45/figure.py
"$PY" experiments/m7x_knee/run.py             # about 2.6 h on 4 cores (48 CMA-ES runs at 52 and 60 ms, cached in .cache/; then 7 min of held-out flights)
"$PY" experiments/m7x_knee/verdicts.py && "$PY" experiments/m7x_knee/posthoc.py && "$PY" experiments/m7x_knee/corner_bind.py && "$PY" experiments/m7x_knee/figure.py
"$PY" experiments/m7y_response/run.py         # about 2.5 min on 4 cores (7x's 48 designs, no retraining; step and wind-step tests)
"$PY" experiments/m7y_response/verdicts.py && "$PY" experiments/m7y_response/posthoc.py && "$PY" experiments/m7y_response/figure.py
"$PY" experiments/m7z_floor75/run.py          # about 1.2 h on 4 cores (24 CMA-ES runs at 75 ms, cached in .cache/; 7 min of stress flights; 1 min of response tests)
"$PY" experiments/m7z_floor75/verdicts.py && "$PY" experiments/m7z_floor75/posthoc.py && "$PY" experiments/m7z_floor75/figure.py
"$PY" experiments/m7aa_ceiling/run.py         # about 1.5 h on 4 cores (24 CMA-ES runs at 39.1 ms x U(1, 3.84), cached in .cache/; 8 min of stress flights; 1 min of response tests)
"$PY" experiments/m7aa_ceiling/verdicts.py && "$PY" experiments/m7aa_ceiling/posthoc.py && "$PY" experiments/m7aa_ceiling/figure.py
"$PY" experiments/m7ab_ceilsweep/run.py       # about 2.2 h on 4 cores (48 CMA-ES runs at 39.1 ms x U(1, c/39.1), c = 100 and 200 ms, cached in .cache/; 8 min of stress flights)
"$PY" experiments/m7ab_ceilsweep/verdicts.py && "$PY" experiments/m7ab_ceilsweep/posthoc.py && "$PY" experiments/m7ab_ceilsweep/figure.py
"$PY" experiments/m7ac_ceil125/run.py        # about 1.5 h on 4 cores (24 CMA-ES runs at 39.1 ms x U(1, 125/39.1), cached in .cache/; re-scores all five earlier tunes)
"$PY" experiments/m7ac_ceil125/verdicts.py && "$PY" experiments/m7ac_ceil125/posthoc.py && "$PY" experiments/m7ac_ceil125/figure.py
python3 paper/check_numbers.py                  # stdlib; every number the paper draft quotes against its results file
```

## Limitations

- Milestone 1's arms use a per-axis torque box. Milestone 2's polytope mixer has TWR fixed at 2, where a hover-held mixer has the least room. The power price λ is a modelling choice, swept from 0 to 1° per 100 W, not a measured mission value.
- Under the polytope mixer the search landscape is multimodal, so single-start results are unreliable. Three starts were used only for four arms.
- Milestone 4 uses one power price and TWR 2; its INDI has no adaptive effectiveness estimation, and the geometric law no feed-forward (the references are steps).
- Milestones 7 and 7b use a feed-forward of fixed gain 1. Milestone 7b's explanation of which designs diverge (the integral-to-proportional gain ratio) is post hoc and rests on two design families; milestone 7c's linear analysis is a necessary test only: it is linearised about hover, and the clips and mixer saturation where divergence happens are outside it (milestone 7d found that the 20° tilt-command limit, not the integrator clip, is what contains its false alarms, from a post-hoc sweep on one geometry); its ki/kp ceiling is numerical, per design, with no closed form yet.
- Milestone 6's translation model (drag, noise, perfect altitude hold, one wind state driving both the drag and the disturbance torque) is inherited and assumed. Milestone 6b derives the rigid-frame signs and retrains under them, but the centre-of-pressure lever is still assumed (0.05 + 0.3 L, swept 0–2×), the gust torque goes from world-frame wind straight to body axes, and lever 2 was not retrained. Six seeds, two starts.
- Milestone 5 re-scores designs without retuning them in RotorPy; its aerodynamic coefficients are the Hummingbird's scaled by momentum-theory exponents, not measured for these propellers; the altitude loop is assumed; 32 episodes.
- Attitude steps only (milestones 1–4), 2 s episodes, ten seeds (milestones 1-2 extended from five on 2026-11-21), one κ. The cost fit and the plant ranges are inherited assumptions. Milestone 7q sourced the battery, motor-mass and propulsive-efficiency constants from listings and found the 60-step closure unconverged near its edge; milestones before 7q ran on the inherited closure (`SIZE_SOLVE = "iter60"`). No hardware.

## Next steps

After milestone 7ac: a settle-time or position-kp floor as a training constraint, since the 125 ms tune's unsettled designs (5 of 12) are what keep 3× the measured lag from being the default; twelve seeds at 125 and 150 ms to separate them inside the identified range; the same coverage test on the torque-scale and mass ranges. Older items: milestone 7w follow-up: 52 ms and 60 ms tuning floors to find where slower stops paying, with the certificate also checked at the fast identified corner (33 ms) as a constraint; separate the slower floor from the higher training ceiling (39.1 ms × U(1, 2.3)); 12 seeds for the best floor against 7u; a slow-weighted or worst-case objective over the range; redo 7r's two open steps (a flight-time requirement instead of a fixed 15 min, LiPo at about 12 min) at the chosen floor; a measured step response for one 4-inch and one 6-inch motor-propeller pair to source the diameter exponent.

## Owner steps

Print canted motor mounts at 0° and about 32° for one frame. Then log yaw step response, and measure side force on a load cell while roll torque is commanded. Not done here.

## Builds on

The seven `codesign-aero-cant*` projects. Simulator: Folk, Paulos and Kumar (2023), "RotorPy: a Python-based multirotor simulator with aerodynamics for education and research", arXiv:2306.04485 (MIT). Attitude laws: Smeur, Chu and de Croon (2016), *JGCD* 39(3), doi:10.2514/1.G001490; Lee, Leok and McClamroch (2010), IEEE CDC, doi:10.1109/CDC.2010.5717652. Allocation theory: Johansen and Fossen (2013), *Automatica* 49(5), doi:10.1016/j.automatica.2013.01.035; Crowther et al. (2011), *JGCD* 34(4), doi:10.2514/1.51186. Propeller data: Brandt and Selig (2011), AIAA 2011-1255, doi:10.2514/6.2011-1255. CMA-ES: Hansen and Ostermeier (2001), *Evolutionary Computation* 9(2), doi:10.1162/106365601750190398. The full related work is in `PROPOSAL.md`.

Domain randomisation, for section VII of the draft: Tobin et al. (2017), "Domain randomization for transferring deep neural networks from simulation to the real world", IROS, arXiv:1703.06907; Peng et al. (2018), "Sim-to-real transfer of robotic control with dynamics randomization", ICRA, arXiv:1710.06537; Mehta et al. (2019), "Active domain randomization", CoRL, arXiv:1904.04762.

## Lab tags

RECUV and the Autonomous Systems IRT (UAV simulation, safe autonomy), as a direction only. Nothing here is affiliated with or endorsed by them.

## Outside dependencies (vitamins)

numpy, scipy, cma, matplotlib; RotorPy 3.0.0 (MIT) for milestone 5 only. No model API is called. `data/propdata_c.csv` holds derived per-propeller ratios from the UIUC Propeller Data Site (copied from `codesign-aero-cant-propdata`).

MIT.
