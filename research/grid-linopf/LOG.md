# Research log

## 2026-11-22 · Rule K: a curvature-aware thermal margin on rows whose AC remainder broke the rating (plan)
- Plan, rule K (`vlin.slp(kmargin=cap)`: an armed row's bound pulled in by its observed remainder, decayed by 4 per halving, capped at 0.05) and predictions K0 to K7: `research/infra-dcopf/LOG.md` (2026-11-22); script `research/infra-dcopf/experiments/run_kmargin.py`. Development and held-out, against the frozen repair.

## 2026-11-21 · Confirmation split, J+R and a third DC solver: outcome. The IPOPT reactive stage finishes 8 of 22 unfinished cases at +0.008 to +0.212 %; J or J+R 15 of 23 under the protocol (J 9), 18 of 33 over the split; HiGHS solves case2853_sdet API's DC OPF (H1 refuted), so all 33 reach the repair
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-21); numbers in `research/infra-dcopf/experiments/results_confirm_reactive.txt` and `results_dc_highs.txt`. G0 to G5 held.
- 10 of the 22 unfinished cases failed only on reactive limits under 0.1 MVAr in total; 8 of those finish after the reactive stage. No case with real overloads finishes.

## 2026-11-21 · Confirmation split: J+R on all 22 unfinished cases, HiGHS on case2853_sdet API (plan)
- Plan, gate G0, predictions G1 to G5 and H1: `research/infra-dcopf/LOG.md` (2026-11-21); scripts `run_confirm_reactive.py`, `diag_dc_highs.py`.

## 2026-11-21 · Confirmation split, second-solver DC start: outcome. Clarabel starts 9 of the 10 no-start cases, all 9 reach full load, the frozen repair finishes 1 (case2742_goc API, +1.394 %); split tally 10 of 33 (32 reach the repair); R0 to R5 held
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-21); numbers in `research/infra-dcopf/experiments/results_confirm_rescue.txt`.
- case2383wp_k TYP and SAD miss only on reactive limits (64 and 55 units, 0.09 MVAr in total); case2853_sdet API has no DC start on Clarabel either (InsufficientProgress / MaxIterations, not a certificate).

## 2026-11-21 · Confirmation split: a second-solver DC start for the 10 cases with no PIPS DC start (plan)
- Plan, cases, start rule and predictions R0 to R5: `research/infra-dcopf/LOG.md` (2026-11-21); script `research/infra-dcopf/experiments/run_confirm_rescue.py`. A separate arm; the 23 scored cases are untouched.

## 2026-11-21 · Confirmation split: outcome, complete. Rules C and P each finish 7 of 23 against the frozen repair's 9 (lost 2, gained 0); Q2 to Q4 refuted, final. The frozen repair stays; the widening line closes as a finisher rule
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-21); numbers in `research/infra-dcopf/experiments/results_confirm.txt`. All 12 pending cases ran; none reversed the partial result.
- Where all three finish (7 cases), the widened runs are 0.3 points cheaper on average; 11 of the 20 cases meet only a round-1 failed hard QP, where C and P take the same single widening.

## 2026-11-20 · Confirmation split: partial outcome. On the 11 of 23 cases scored so far rule P (and rule C, identical there) loses 2 frozen finishers (case2848_rte TYP, case2868_rte TYP), gains none; Q3 refuted, final; frozen repair stays unless 12 pending cases reverse it
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-20); numbers in `research/infra-dcopf/experiments/results_confirm.txt`. Frozen arm complete: 23 of 33 reach the repair, 9 finish. Both losses come from a round-1 widening, before any halving, so rule P's guard does not apply.
- The C and P job hit the 2-hour background limit after 16 of 40 runs; parts are cached and `run_confirm.py CP` resumes the 12 pending cases.

## 2026-11-20 · Confirmation split: frozen, rule C and rule P on 33 unused PGLib cases of 2,001 to 2,999 buses (plan)
- Plan, split, adoption rule and predictions Q0 to Q6: `research/infra-dcopf/LOG.md` (2026-11-20); script `research/infra-dcopf/experiments/run_confirm.py`.

## 2026-11-20 · Rule P: outcome. All seven predictions held: development 32 of 34, held-out 11 of 19 (10 of 18 without case1888 API), none lost against the frozen repair or rule C. Leading candidate; needs the unused split
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-20); numbers in `research/infra-dcopf/experiments/results_enlarge_pre.txt`. P0 to P6 held.
- 53 of 76 development and 123 of 152 held-out failed hard QPs came after a halving and went to the elastic chain. case1888 API finishes at round 17 (+0.268 %); case200 and case57 API return near their frozen cost (+0.237 %, +0.710 %; rule C +2.299 %, +1.440 %).
- Next: a confirmation split of PGLib-OPF cases above 2,000 buses with frozen, C and P fixed before it runs.

## 2026-11-20 · Rule P: rule C with the enlarged step only before the first halving (plan)
- Plan, rule P (`enlarge_pre=True`) and predictions P0 to P6: `research/infra-dcopf/LOG.md` (2026-11-20); script `research/infra-dcopf/experiments/run_enlarge_pre.py`. Held-out is reported with and without case1888 API, where the rule came from.

## 2026-11-20 · Why does every widening variant lose held-out case1888 API? Outcome. A 20-round budget miss, not a stall; withholding any one of rule C's three firings finishes it, each cheaper than the frozen point
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-20); numbers in `research/infra-dcopf/experiments/diag_case1888.txt`. K0, K2, K4, K5 held; K1, K3 refuted.
- 12 of rule C's 15 tail trials are accepted; it ends at the merit the frozen run had at round 11. The widened steps trade voltage violations (35 to 7) for overloads (178 %, 211 %) that curvature-limited hard QPs repay slowly: rows predicted at 99.9 % land up to 8 points over.
- Withholding the round-1, 2 or 5 firing finishes at round 18, 20 or 17, at +0.537, +0.229 or +0.268 % against the frozen +0.617 %.

## 2026-11-20 · Why does every widening variant lose held-out case1888 API? (plan)
- Plan, a per-round trace of the repair on case1888_rte API under the frozen repair and rule C, three single-firing ablations of rule C, and predictions K0 to K5: `research/infra-dcopf/LOG.md` (2026-11-20); script `research/infra-dcopf/experiments/diag_case1888.py`.

## 2026-11-20 · Rule C: outcome. All seven predictions held: development finishers 32 of 34 (none lost, case73 API clean at +3.26 %), held-out 10 of 19 as frozen (case500 SAD in, case1888 API out), 0 repeats. The leading candidate, not yet adopted
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-20); numbers in `research/infra-dcopf/experiments/results_enlarge_rel.txt`. C1 to C7 held.
- With the cap at twice the current stored box the rule fired on 25 and declined on 50 of 75 failed development QPs; case30 API and case200 API finish again (later and dearer than frozen) and case73 API keeps rule E's finish.
- Next: diagnose case1888 API (lost by every widening variant) and confirm rule C on an unused split before it replaces the frozen repair.

## 2026-11-20 · Rule C: cap the widened box at twice the current stored box (plan)
- Plan, rule C (rule E with its cap at 2 times the current stored boxes, so every halving also halves what widening can reach) and predictions C1 to C7: `research/infra-dcopf/LOG.md` (2026-11-20); script `research/infra-dcopf/experiments/run_enlarge_rel.py`. Frozen on the 34 development cases, scored on the 19 held-out cases that reach the repair.

## 2026-11-19 · Rule E-once: outcome. 0 repeats and case73 API still clean (round 12, +3.26 %), but a two-round cycle (rejected widened step, tiny accepted elastic step that re-arms the rule) loses case30 API and held-out case793 API; development 31 of 34 (as frozen), held-out 9 of 19 (frozen 10). Not adopted
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-19); numbers in `research/infra-dcopf/experiments/results_enlarge_once.txt`. O1, O2, O4, O6 held; O3, O5 refuted.
- Next: cap the widened box at twice the current stored box (so each rejection also shrinks what widening can reach), frozen on development, scored held-out.

## 2026-11-19 · Rule E-once: enlarge the box at most once per base point (plan)
- Plan, rule O (rule E, but at most one enlarged step per base point: after a rejected enlarged step the frozen elastic chain runs at the unchanged box) and predictions O1 to O6: `research/infra-dcopf/LOG.md` (2026-11-19); script `research/infra-dcopf/experiments/run_enlarge_once.py`. Frozen on the 34 development cases, scored on the 19 held-out cases that reach the repair.

## 2026-11-19 · Box enlargement before the elastic fallback: outcome. case73 API clean at round 12 (+3.26 %) under the full margins, but 68 of 94 firings rebuild the QP just rejected; development 31 to 30 of 34, held-out 10 to 8 of 19. Not adopted
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-19); numbers in `research/infra-dcopf/experiments/results_enlarge.txt`. E2, E5, E7 held; E3, E4, E6 refuted; E1 untestable.
- The LP finds a scale that makes the hard QP solvable on 94 of 112 failed development rounds and the enlarged QP solves on all 94. But after a rejected enlarged step the base point is unchanged and the needed scale doubles as the box halves, so the same QP comes back: case30 API and case200 API (finished by the frozen repair) and case118 API repeat one rejected step for about 20 rounds. Gains come from firings on rounds 1 to 3 (case73 API, held-out case500 SAD).
- Next: the same enlargement at most once per base point (after a rejected enlarged step, the elastic chain), frozen on development, scored held-out.

## 2026-11-19 · Box enlargement before the elastic fallback (plan)
- Plan, rule E (on a failed hard QP, one LP finds the smallest non-empty box scale, capped at twice the first box; re-solve the hard QP at 1.1 times it before the elastic fallback) and predictions E1 to E7: `research/infra-dcopf/LOG.md` (2026-11-19); script `research/infra-dcopf/experiments/run_enlarge.py`. Frozen on the 34 development cases, scored on the 19 held-out cases that reach the repair.

## 2026-11-19 · Why is the hard QP infeasible on the development stalls? Outcome. The trust box, not the margins: the linearised set without the box is non-empty on all 58 failed rounds
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-19); numbers in `research/infra-dcopf/experiments/results_iis.txt`. I1, I2, I5, I6 held; I3, I4 refuted.
- HiGHS confirms every failed hard QP is empty (58 of 58). Removing the trust box makes every one non-empty; removing the margins fixes 13. case73 API needs 1.08 to 1.11 times its first box on rounds 3 to 25 while rejections halve the box 18 times; case118 API needs 0.19 to 0.90 of it, shrinking more slowly than the box. case118 API's IISs (78 to 94 rows) tie thermal rows to units at P<sub>max</sub> and the balance row.
- Next: enlarge the box to the smallest non-empty scale before the elastic fallback (frozen on development, scored held-out).

## 2026-11-19 · Why is the hard QP infeasible on the development stalls? An IIS of every round (plan)
- Plan and predictions I1 to I6 (box, margins, or both; an irreducible infeasible subset per round, checked by HiGHS): `research/infra-dcopf/LOG.md` (2026-11-19); script `research/infra-dcopf/experiments/run_iis.py`.

## 2026-11-18 · A merit that matches the QP: outcome. Inert in development (31 of 34 either way; case118 API still stalls, every round from 3 an elastic QP); held-out finishers 10 to 8 of 19, cheaper by 0.13 points where both finish. Not adopted
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-18); numbers in `research/infra-dcopf/experiments/results_summerit.txt`. S2, S3, S4, S5 held; S1, S6 refuted.
- The merits disagree on 5 trials in development. case118 API's stall is the hard QP's infeasibility, not the acceptance test, which withdraws the 2026-11-17 reading. Held-out S loses case793 API and case588 TYP and is slower on 3 of 8 common finishers, but lands cheaper clean points (mean &minus;0.13 points, up to &minus;0.56). The frozen worst-excess merit stands.

## 2026-11-18 · A merit that matches the QP: accept a step on the summed thermal excess (plan)
- Plan, rule S (the merit's worst thermal excess replaced by the summed excess, every round) and predictions S1 to S6: `research/infra-dcopf/LOG.md` (2026-11-18); script `research/infra-dcopf/experiments/run_summerit.py`. Frozen on the 34 development cases, scored on the 19 held-out cases that reach the repair.

## 2026-11-17 · A margin-backoff rule for an empty margin-shifted set: outcome. Development 32 of 34 (case73 API clean at round 8, +0.96 %), none lost; held-out it fires on 1 of 19 and changes no verdict
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-17); numbers in `research/infra-dcopf/experiments/results_backoff.txt`. B1, B2, B4, B5, B6 held; B3, B7 refuted.
- Rule B fires on case73 API and case24 API (margins halved once). case73 API finishes for the first time; case24 API finishes two rounds sooner at +0.17 % instead of +0.71 %. case240 TYP and SAD stay empty at an eighth of the margins, so the rule declines and their frozen finishes stand.
- Held-out it fires only on case588 API: same round (19), cost +0.66 % instead of +0.87 %. The two-solver panel prevented PIPS-only firings on case179 SAD and case793 API. The check costs up to 57 minutes on a 1,354-bus case, so it is a stall diagnostic, not a per-case step.

## 2026-11-17 · A margin-backoff rule for an empty margin-shifted set (plan)
- Plan, rule B (a two-solver check of the margin-shifted AC OPF before round 1; on an empty set, halve every margin up to three times) and predictions B1 to B7: `research/infra-dcopf/LOG.md` (2026-11-17); script `research/infra-dcopf/experiments/run_backoff.py`. Frozen on the 34 development cases, scored on the held-out 24.

## 2026-11-17 · Do the two development stalls come from the repair's own safety margins? Outcome. case73 API: its margin-shifted AC OPF has no solution on PIPS or IPOPT; case118 API: it solves; zero margins finish neither and lose 5 to 21 finishers
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-17); numbers in `research/infra-dcopf/experiments/results_margin.txt`. A1, M2, Z3 held; M1, M3, Z1, Z2, Z4 refuted. Reproduction gate passed on all 34 cases.
- case73 API's AC optimum sits on its voltage bounds (all 14 generator buses at the ceiling, 7 PQ buses at the floor) and 10 branch ends at their rating; pulling in thermal and voltage bounds together leaves no AC point (each alone is solvable, +0.41 % and +1.99 %). The repair stalls because it aims at an empty set.
- The shifted OPF is empty on 4 of 34 cases by both solvers, and the repair still finishes 3 of them; the 0.001 pu voltage margin costs up to +6.9 % (case57 API) at the shifted optimum.

## 2026-11-17 · Do the two development stalls come from the repair's own safety margins? (plan)
- Plan and predictions A1, M1 to M3 (margin-shifted AC OPF) and Z1 to Z4 (the repair with margins removed): `research/infra-dcopf/LOG.md` (2026-11-17); script `research/infra-dcopf/experiments/run_margin.py`.

## 2026-11-17 · What stalls the repair on case73 and case118 API: outcome. case73 API is a local infeasibility of the repair's controls (the l1 voltage violation is within 1.6 &times; 10<sup>&minus;5</sup> of stationary); case118 API is the acceptance test; acceptance on the penalty changes no verdict
- Plan, outcome and Next: `research/infra-dcopf/LOG.md` (2026-11-17); numbers in `research/infra-dcopf/experiments/results_elastic.txt`. S1, S2, V1 refuted; S3, S4, V2 held.
- On case73 API from round 22 the elastic QP can lower the margin-shifted voltage violation by at most 8.8 &times; 10<sup>&minus;6</sup> at any box scale from 1 to 10<sup>&minus;3</sup>: two PQ buses sit up to 0.002 pu below V<sub>min</sub>, 14 of 33 setpoints are on their upper bound and the lines on their margins. Proposition 2 applies; the earlier Q7 reading (not stationary, because the step scales with the box) is withdrawn: the step moves along directions that leave the violation flat.
- On case118 API every late elastic step lowers the QP's penalty (sum of overloads) and is rejected by the merit (worst overload). Accepting elastic rounds on the penalty instead finishes neither case and loses none of the 31 development finishers (one finishes a round later, +0.68 % instead of +0.34 %).

## 2026-11-17 · Is case73 API's stall a stationary point of the elastic penalty? (plan)
- Plan and predictions S1 to S4 (arm T, the elastic QP's own penalty logged per round with a box probe) and V1, V2 (arm P, acceptance on the penalty on elastic rounds): `research/infra-dcopf/LOG.md` (2026-11-17); script `research/infra-dcopf/experiments/run_elastic.py`.

## 2026-11-17 · Milestone 7, theory half: a step-based convergence statement replacing H4. Halvings bounded by a logarithm (H* &le; 12); accepted rounds, 162 of 228 misses, have no a priori bound; case73 API's stall is not first-order stationarity
- Statement and proofs: [`theory.md`](theory.md) (Proposition 1, Theorems 1 to 3, Proposition 2; assumptions A1 smooth power flow along the steps, A2 hard-QP feasibility). Plan, predictions Q1 to Q7 and outcome: `research/infra-dcopf/LOG.md` (2026-11-17); numbers in `research/infra-dcopf/experiments/results_theory.txt` (from the 2026-11-13 traces, no new solves).
- **Q1 to Q4 held:** halvings never exceed H&#770;* (range 1 to 12, observed 0 to 5); the finishing step is inside the worst-case radius on only 4 of 31 finishers; steps shrink before the finish on 28 of 28. **Q5 to Q7 refuted:** round 1's curvature does not predict the path (15 of 39); the path-length bound is 24x loose (median); case73 API's elastic step scales with its box over a 250-fold halving, so Proposition 2's d = 0 hypothesis is not met, which corrects the 2026-11-13 "stationary point" reading.
- Next: log the elastic penalty decrease on case73 and case118 API; a box tied to the violation (makes the accepted-round count a priori), held-out; acceptance on the elastic QP's own penalty.

## 2026-11-16 · The five unscored cases with a second-solver start: outcome. 13 of 24 with the reactive stage (was 12); J alone stays at 10
- Plan and outcome: `research/infra-dcopf/LOG.md` (2026-11-16); numbers in `research/infra-dcopf/experiments/results_dc_rescue.txt`.
- E1 (full-load power flow on at least 3 of 5) and E2 (J clean on at least 1) refuted: 2 of 5 and 0 of 5. case2000 API ends J one Q limit short and the IPOPT reactive stage makes it **fully feasible at +0.193 %**; case1951 API ends at one 104.5 % overload and its reactive stage hit the 45-minute limit. SNEM's warm-start angles were NaN (the x = 0 ties); with them fixed (declared variant) the continuation stalls at 75 to 84 % of load.
- Next: a certifying DC solver for every case's start, the SNEM stall, the near misses, the post-feasibility cost phase.

## 2026-11-16 · Why the DC OPF has no solution on five held-out cases: outcome. On 4 of 5 the reference DC solver fails, not the network
- Plan, outcome and the follow-up plan: `research/infra-dcopf/LOG.md` (2026-11-16); numbers in `research/infra-dcopf/experiments/results_dc_infeasible.txt`.
- A second solver (the same B-theta DC OPF on Clarabel) agrees with PYPOWER's PIPS on all 89 problems both solve (within 1e-5) and solves **26 that PIPS reports as having no solution**. case2000_goc API is feasible under MATPOWER's own convention; the SNEM network has two x = 0 bus ties that make MATPOWER's B infinite, and with them at 1e-4 pu its DC OPF solves; case1951_rte API is the one genuine case, infeasible by 1.61 MW on one rating row under b = 1/(x tap) and feasible under PowerModels' convention.
- D1 (PM on PIPS matches PGLib) and D2 (ratings cause it) refuted as written; D4 held on Clarabel. Next: the five cases through the unchanged repair from a second-solver start (E1 to E3).

## 2026-11-16 · Why the DC OPF has no solution on five held-out cases (plan)
- Plan and predictions D1 to D4 with control C0: `research/infra-dcopf/LOG.md` (2026-11-16); script `research/infra-dcopf/experiments/diag_dc_infeasible.py`. The five unscored cases (case1803_snem x3, case1951_rte API, case2000_goc API): data, ratings, angle limits or the DC convention?

## 2026-11-15 · Milestone 6 under one protocol: outcome. 10 of 24 fully feasible within 20 rounds, 12 of 24 with the IPOPT reactive stage, none lost against the earlier protocol
- Plan, predictions and outcome: `research/infra-dcopf/LOG.md` (2026-11-15); numbers in `research/infra-dcopf/experiments/results_heldout_slack.txt`.
- One protocol on all 24 held-out cases: reference at the largest live unit, DC start, continuation to the full-load power flow, frozen 20-round J-m-a, IPOPT reactive stage, cost against PGLib's published objective. Controls: identical statuses on the 6 cases whose reference does not move, and on the 5 RTE cases of the previous step.
- **R1 to R4 and R6 held, R5 refuted.** Scored 19 of 24 (5 have no DC OPF solution: SNEM x3, case1951 API, case2000 API). J fully feasible on **10 of 24**, J or J+R on **12 of 24** (DC dispatch: 0); paired on the 19 the earlier protocol scored, 3 gained and 0 lost. Clean points +0.01 to +2.12 %, mean +0.50 %; only case588 TYP above +1 %. H2 as written stays refuted (1 of 24 within 10 rounds).
- Next: why the DC OPF has no solution on five cases; the post-feasibility cost phase; the restated convergence theorem.

## 2026-11-15 · Milestone 6 under one protocol (plan): all 24 held-out cases with the slack at the largest unit and the PGLib/IPOPT reference
- Plan and predictions R1 to R6 with controls C0, C1: `research/infra-dcopf/LOG.md` (2026-11-15, "Held-out cases under one protocol"); script `research/infra-dcopf/experiments/run_heldout_slack.py`.

## 2026-11-14 · Milestone 6 Next (1) and (2): the stall is a fold on all six; repair-and-continue clears case300 TYP only
- Plan, predictions and outcome: `research/infra-dcopf/LOG.md` (2026-11-14, "Past the loading limit"); numbers in `research/infra-dcopf/experiments/results_fold.txt` and `results_fold_fallback.txt`; figure `fold_sigma.svg`.
- **Fold test, F1 to F3 held:** the Newton Jacobian's smallest singular value falls to 5 to 9 % of its no-load value at every stall, &sigma;<sub>min</sub><sup>2</sup> is linear in load near it (R<sup>2</sup> &ge; 0.996) with the fitted fold 0.001 to 0.004 past the stall, and the AC-optimum control keeps 84 % at full load. The DC dispatch at the file's voltage setpoints is past the loading limit on all six.
- **Repair-and-continue, M1 to M3 and M5 refuted:** repaired at the fold, round 1's linearisation has no power flow on any case, and the RTE stages end at points breaking hundreds of voltage limits. With a fallback declared after the run (re-solve the repaired point cold), case300 TYP walks up in four stages and is fully clean at full load at **+0.83 %** (M4 held), the first feasible point from the DC start on a no-power-flow case. The five RTE cases stay unsolved.
- Next: a reactive (V, Q) pre-stage at the fold point before the P repair, or the reduced-load AC OPF's voltage schedule as the start, on the same six; then the second reference AC solver.

## 2026-11-14 · Milestone 6 Next (1): a start with an AC power flow. The planned dispatch homotopy fails at its first point; the DC dispatch looks past the loading limit on all six no-power-flow cases
- Plan, predictions and outcome: `research/infra-dcopf/LOG.md` (2026-11-14); numbers in `research/infra-dcopf/experiments/results_homotopy.txt`, `results_homotopy_load.txt`, `results_homotopy_dcangle.txt`.
- **Planned run:** dispatch homotopy from the case file's dispatch to the DC point. Q1 to Q4 refuted (0 of 6), Q5 untestable. PGLib's file dispatch is not an operating point (generation 2.0 to 18.3 GW, 3 to 23 %, short of load), and it has no power flow on any of the six cases.
- **Declared diagnostics:** Newton from DC power-flow angles solves all six at no load (PYPOWER and pandapower fail from flat starts on the RTE networks). Scaling load and the DC dispatch up together then stalls at **48 to 85 %** of load on every case, with the lowest voltage falling to 0.72 to 0.79 pu, which looks like the nose of a loadability curve. On case300 TYP the AC optimum's dispatch at the same voltage setpoints reaches full load, so the DC dispatch is the obstacle.
- Reading: the RTE failures are decided before the first QP, as milestone 6 said, and no power-flow start fixes them. The start must move the dispatch or the voltages. Next: a load-continuation repair (J at &mu;*, then step &mu; up), and a Jacobian fold test.

## 2026-11-13 · Milestone 6: held-out 500 to 2,000-bus cases. H2 as written refuted (0 of 12 within 10 rounds); 6 of 12 within 20, 8 of 12 with the voltage stage
- The eight PGLib-OPF v23.07 networks of 500 to 2,000 buses, TYP, API and SAD (24 cases no rule was set on), with J-m-a frozen and the 20-round budget fixed by milestone 7. Pre-registered (plan, two amendments made before any repair outcome was read, and the outcome are in `research/infra-dcopf/LOG.md`; numbers in `research/infra-dcopf/experiments/results_heldout.txt`).
- **Scaling fix first:** the full QP did not finish one case in 25 minutes at 2,000 buses. Constraint generation on Clarabel reproduces the full-QP repair exactly on all 34 development cases (same statuses round by round, 0.0000 pp cost difference) at 11x the speed, and is what ran.
- **Scored 12 of 24.** PIPS's optima match PGLib's within 0.004 % where it solves (13 cases); none on the SNEM and RTE networks or on case588 and case1354 API; case2000 API has no DC start.
- **H1 held** (DC breaks a thermal, slack or angle limit on 7 of 7 scored API and SAD cases). **H2 as written refuted:** fully clean within 10 rounds on **0 of 12** (development 21 of 34). Within 20: **6 of 12** (all at round 14 to 20). With the voltage stage: **8 of 12**. J+R beats S+R 8 to 0 (P = 0.0078). Mean cost of clean points +0.66 % (bar +0.5 %, refuted).
- Elastic QPs rise to 44 % of rounds from 29 %; the DC starts break Q limits on 14 to 118 units (development 0 to 26), and the SAD starts need the DC OPF without angle limits.
- After-the-run diagnostic on the 11 unsolved cases, against PGLib's published objective: case588 API clean at round 15 (+0.95 %); on five RTE cases the AC power flow at the DC start does not converge, so the repair never starts.
- Next: a start with an AC power flow (damped or homotopy Newton from the DC point); a round budget or stopping rule scaled to the start's violation, set on development cases only; a second reference AC solver for the 11 unsolved cases.

## 2026-11-13 · Milestone 7 (empirical half): a 30-round budget clears 31 of 34; misses are curvature, one stall is local infeasibility; H4 as written refuted
- Frozen J-m-a traced round by round with a 30-round budget on the 36 PGLib cases (pre-registered; plan and outcome in `research/infra-dcopf/LOG.md`, numbers in `research/infra-dcopf/experiments/results_converge.txt`). First 10 rounds reproduce the nominal run exactly.
- **Budget:** fully clean on **31 of 34** within 20 rounds (10 rounds: 21), the ten late finishers at +0.41 % mean cost over the AC optimum. The repair alone matches what repair-then-voltage-stage got at 10 rounds.
- **Mechanism:** 168 of 224 misses in rounds 1 to 10 are curvature failures (hard QP, remainder above the margin), on thermal and Q rows; the one-step finishing condition (Proposition 1: a row breaks only if its second-order remainder exceeds its margin) holds on all 190 hard misses.
- **H4 as written refuted:** its bound 1 + k* + &phi;<sub>0</sub>/&delta;<sub>min</sub> is within 10x of the observed rounds on 6 of 31 finishers (up to 55,000x off), the curvature estimate varies by more than 10x along the path on half the cases, and case73 API stalls with a nonsingular Jacobian at a point of local infeasibility (all 30 QPs elastic, merit flat from round 14). The theory needs a hard-QP-feasibility assumption and a step-based, not decrease-based, statement.
- Next: milestone 6 with the budget frozen at 20 rounds; the convergence statement rewritten (theory half of milestone 7); per-row curvature-scaled margins, held-out only.

## 2026-11-13 · Milestone 5: load-perturbed copies. The counts hold on feasible copies; 101 of 360 copies have no AC optimum
- 360 copies of the 36 PGLib cases (seeds 0 to 9, every bus's load x U[0.9, 1.1], constant power factor), frozen arms, pre-registered (plan and outcome in `research/infra-dcopf/LOG.md`; numbers in `research/infra-dcopf/experiments/results_perturb.txt`).
- On the 244 scored copies of the 34 base cases: J-m-a fully clean **0.660** (cluster bootstrap over base cases 0.52 to 0.79; nominal 0.62), with the reactive stage **0.906** (0.83 to 0.97; nominal 0.91). Nominal verdict = majority verdict on 30 of 34 cases. J+R beats the reactive stage on the plain DC dispatch on 29 cases and loses none (sign test P = 3.7e-9). Mean cost of clean points +0.08 / +0.23 / +0.69 % (TYP / API / SAD). All five predictions held.
- **Caveat:** PIPS finds no AC optimum on 101 copies, 71 of the 120 API ones (31 of those with less total load than nominal). Running the arms on them anyway (a declared after-the-run diagnostic) finds a feasible point on only 4, so most are probably infeasible, but the API intervals rest on 42 copies.
- Fragility sits in the round budget: nominal finishers at round 8 or later stay clean on 0.68 of copies, earlier finishers on 0.97.
- Next: milestone 6 (held-out 500 to 2,000-bus cases), the post-feasibility cost phase, a round-budget sweep, the rest of milestone 4.

## 2026-11-13 · Milestone 4a: LPAC as a one-shot baseline. Fully feasible on 0 of 34; no solution on 9
- LPAC-C (Coffrin and Van Hentenryck 2014, the conic form of PowerModels' `LPACCPowerModel`), built in `infra-dcopf/src/infra_dcopf/lpac.py` and solved by Clarabel with SCS as a second opinion, then its P and voltages run through one AC power flow. Pre-registered (plan in `research/infra-dcopf/LOG.md`).
- **H3 held, strongly:** the one-shot LPAC dispatch is fully feasible on **0 of 34** PGLib cases (bar: at most 10; J-m-a: 21). On the 25 cases it solves, the AC power flow breaks Q limits on 21 and voltage limits on 20, and 376 of 1,000 units get a setpoint exactly on a voltage bound; P-clean on 4 (DC: 3). With the reactive stage after it, 8 of 34 (J-m-a+R: 31).
- **LPAC-C has no solution on 9 of 34**, 7 of the 11 SAD cases among them (SCS agrees on 8, inconclusive on 1). After-the-run diagnostic: removing the angle limits makes 8 of the 9 solvable.
- **As a warm start for the frozen repair:** 17 of the 25 LPAC-solvable cases fully clean against 15 from the DC start (5 gained, 3 lost, sign test P = 0.73); 24 against 23 with the reactive stage; finishes earlier on 7 of the 12 both finish.
- P1, P2, P3 refuted (P-clean 4 against a bar of 10; objective within 1 % on 16 against 27; with the reactive stage 8 against 15); P4 refuted as written (17 of 34, since 9 cases have no start). Numbers: `research/infra-dcopf/experiments/results_lpac.txt`, `results_lpac_infeasible.txt`.
- Next in milestone 4: LPAC-W (warm start, needs an AC base point) and the polyhedral LP form, then the one-shot optimised linearisation (Misra et al. 2018 or Chen and Singh 2025).

## 2026-11-13 · Milestone 2b: is the repair's QP solved correctly? PIPS fails on solvable elastic QPs; Clarabel adopted
- Every QP J-m-a poses on the 34 PGLib cases (347: 248 hard, 99 elastic) re-solved by Clarabel 0.11 as a referee and by a screened (constraint-generation) PIPS solve. Wherever PIPS reports success, its objective matches Clarabel's within 1e-6 (236 of 236), so finished repairs and their costs stand; screening is exact (228 of 228) on 7.8 % of the rows.
- PIPS's hard-QP failures are mostly real (Clarabel solves 5 of 75). Its elastic failures are not: 36 of 99, of which Clarabel solves 26. The repair had treated them as rejected steps.
- With Clarabel on every QP, J-m-a is fully clean on **21 of 34** (PIPS: 19) and **31 of 34** with the reactive stage (29); the two gains are case24 API and case73 SAD, no case is lost, and costs where both finish are unchanged. Repair time 1,353 s to 260 to 277 s (4.9 to 5.2x; the 5x prediction sits within timing noise). Screened PIPS: 21 and 29, 2.99x.
- For the programme: later milestones (4's baselines, 6's 500 to 2,000-bus held-out cases) run on Clarabel. Still open in 2b: a post-feasibility phase for the path-dependent cost (milestone 2's H3).
- Plan, predictions and outcome: `research/infra-dcopf/LOG.md`.

## 2026-11-13 · Milestone 2: analytic sensitivities from the power-flow Jacobian
- `vlin.jacobian_sens` gives the repair's sensitivities (slack P, branch |S| at both ends, angle differences, PQ-bus voltages, unit Q, with respect to unit P and generator voltage setpoints) from the Newton Jacobian at the base point: one sparse LU per round instead of n_gen + n_vbus power flows. It matches central differences to 2.3e-6 (scaled) on 32 of 34 cases and to 1.3e-5 on the other two once the difference step is refined (`results_sens.txt`).
- Re-running J-m with it on all 36 PGLib cases: fully clean **19 of 34** (finite differences: 18), **29 of 34** with the reactive stage (28); same verdict on 31. The counts are robust to the derivative source.
- Two assumptions refuted: (1) run time fell only 1.1x, because PIPS's QP over 758 to 2,452 rows takes 98 to 99 % of each repair; the power flows were never the bottleneck. (2) The cost of a finished repair moved by over 0.05 pp on 6 of 17 cases, worst 3.08 pp: the method stops at the first clean round, so its cost depends on the path. For the paper, H2's "at the AC optimum's cost" needs a post-feasibility phase; milestone 6 (larger cases) needs a sparse or screened QP first.
- Plan, predictions and outcome: `research/infra-dcopf/LOG.md`; numbers: `results_vlin_margin_analytic.txt`.

## 2026-11-12 · Milestone 3b: voltage setpoints as decision variables
- A successive linearisation over P *and* the generator voltage setpoints, with thermal, slack, angle, bus-voltage and Q rows (`infra-dcopf/src/infra_dcopf/vlin.py`), run from the plain DC dispatch at 1.0 pu on all 36 PGLib TYP, API and SAD cases. Pre-registered as planned (J), it is fully clean on only **5 of 34**: it ends within 0.1 % / 0.1 MVAr of every limit on 19 but rarely strictly inside (H1 and H2 refuted; plan and outcome in `research/infra-dcopf/LOG.md`). The 5 it finishes cost +0.0 to +0.13 % on average against the AC optimum.
- A declared, post-hoc variant (J-m) pulls every QP bound slightly inside its limit (0.1 % of rating, 0.1 MW, 0.01 deg, 0.001 pu, 0.1 MVAr): **18 of 34** fully clean on its own, and **28 of 34** with milestone 3's reactive stage on its misses, at mean +0.17 to +0.34 % against the AC optimum. Milestone 3's best non-oracle pipeline (F+R) got 16 at +0.8 to +4.3 %. On SAD, J-m alone (8 of 11) beats the P-only repair run at the oracle schedule (6).
- For the programme: H2 (a few relinearisations repair the dispatch) now has a non-oracle form that works on most cases, but it was tuned on these cases. Before the paper relies on J-m, it needs the held-out run (milestone 6, the larger PGLib cases, rules frozen as committed here) and the LPAC and optimised-linearisation baselines (milestone 4). Cost per round is n_gen + n_vbus power flows. Analytic sensitivities (milestone 2) matter more now: case300 API takes 10 minutes.

## 2026-11-12 · Milestone 3: a voltage schedule not from the AC optimum
- At PGLib's own 1.0 pu setpoints instead of the AC optimum's, the frozen angle-aware repair (C-ang) is clean on thermal, slack and angle limits on 8 of 12 TYP, **2 of 11 API and 2 of 11 SAD** cases (oracle schedule: 7, 6, 7), and none of those dispatches meets V and Q limits. A reactive stage (AC OPF over V and Q, non-slack P pinned) makes 16 of 34 fully feasible (oracle run: 17 fully clean) at a mean 0.8 to 4.3 % above the AC optimum's cost; on the plain DC dispatch it makes 4. Predictions H2 and H4 held, H1, H3 and H5 refuted (details and plan in `research/infra-dcopf/LOG.md`; numbers in `results_vsched.txt`).
- For the programme: H2 (a few relinearisations repair the dispatch) has so far been tested only with the oracle voltages, and without them it fails on the binding sets. The repair has to move voltage setpoints with P. Proposed new milestone 3b, before LPAC baselines: VG as decision variables in the linearisation (sensitivities of flows, angles, slack, V and Q to VG), scored at the case-file start on all three sets.

## 2026-11-12 · Programme opened; milestone 1 (held-out SAD test) landed
- Opened from track 21's draw: no open programme covered the grid, and `infra-dcopf` had grown into a programme's worth of steps (DC error, loss factors, PGLib validation, successive linearisation). The question is narrowed to dispatch feasibility and repair budget on held-out benchmark sets, which the accuracy and optimised-linearisation literature (Stott et al. 2009; Dvijotham and Molzahn 2016; Misra et al. 2018; Chen and Singh 2025) does not report.
- Milestone 1: the API-tuned successive linearisation, run unchanged with linearised angle rows, is clean on 7 of 11 held-out SAD cases (prediction at least 8: refuted narrowly); angle-blind, 3. Plan, predictions and outcome in `research/infra-dcopf/LOG.md`, numbers in `research/infra-dcopf/experiments/results_sad.txt`.
- Next: milestone 2 (analytic sensitivities) or 3 (a non-oracle voltage schedule); 3 matters more for the claim, since every result so far holds voltages at the AC optimum's schedule.
