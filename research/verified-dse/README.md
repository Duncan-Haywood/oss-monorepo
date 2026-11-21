# verified-dse: how much of a chip design search can cheap fidelity rungs save, with a guarantee?

Research programme on multi-fidelity, verification-aware design-space search for
open-source chip flows (Yosys, ABC, OpenROAD) on SKY130. **Status: milestones 1 to 160 done;
the full list is in [`LOG.md`](LOG.md), newest first. Headline results so far:**
- **The ladder's edge survives a tool upgrade; tuned recipes do not** (milestone 158): on 27 SKY130 ss designs under Yosys 0.70
  and 0.71, the clipped ladder beats equal-cost random routing by about 4 points under both (change -0.48, interval -3.05 to
  +1.78), but a routed-best synthesis sequence carried from one build to the other has 14% mean regret, against 6% for random
  routing on the new build: [`experiments/tool_build/`](experiments/tool_build/results.txt).
- **All of that drift is Yosys's; renaming alone moves routing about 2%** (milestone 160, correcting milestone 159): the two
  builds ran a byte-identical OpenROAD executable, and with it fixed, swapping only Yosys 0.70 for 0.71 reproduces both
  tables on 90 of 90 sampled points; on points whose mapped netlists differ only in names and order, every routed result
  still moves (median 1.75%): [`experiments/yosys_swap/`](experiments/yosys_swap/results.txt).
- **Cheap rungs mis-rank routed area x delay** (generic-gate tau-b median -0.04; the mapped rung is
  nearly exact only at a relaxed clock): [`experiments/rung_bias/`](experiments/rung_bias/results.txt).
- **Successive halving does not reliably beat random routed search** once budgets exceed a few
  hundred seconds: it stops at a rung-bias floor, and one cut rung can leave a cell at 6.9% regret
  where random routing reaches 0.2% (milestone 68, [`experiments/bohb/`](experiments/bohb/results_unfaithful.txt)).
  A simple no-R2-cut arm is as good as a five-point pilot gate
  ([`experiments/pilot_gate/`](experiments/pilot_gate/results.txt)).
- **A theorem bounds halving's regret by the cut rungs' inversions**, and a pilot with ratio below 1
  certifies the search returns a cost no worse than the pilot's best point (0 violations in about
  1.5 million draws, milestones 96 and 97), a ceiling about 2.7 times the realised regret; it says
  nothing relative to the unknown optimum (still open). The chance a pilot yields such a ceiling plateaus near 0.45 from about 24 points (milestone 99): a bigger pilot tightens it, not makes it likelier.
- **On a fresh 120-sequence pool (milestone 108), the schedule chosen without peeking holds out**: "skip the
  generic-gate rung, score everything at the mapped rung, keep 8, route 8" has mean routed regret 1.04% against
  5.49% for the hand-chosen three-rung schedule and 8.00% for random routing of 8; the gap is one tie-heavy design
  (a ripple adder whose generic-gate cut discards the optimum, 34 to 40% regret) and one barrel-shifter cell, and
  elsewhere the two are equal: [`experiments/fresh_pool/`](experiments/fresh_pool/results.txt).
  Priced at equal wall-clock (milestone 109), it costs 0.69 of routing everything and edges random routing of the
  same cost only slightly (1.04% against 1.26% regret, better in 14 of 20 cells, sign test p = 0.12); the hand-chosen
  schedule loses to its equal-cost random baseline (5.48% against 1.43%):
  [`experiments/fresh_pool/price_results.txt`](experiments/fresh_pool/price_results.txt).
- **On 26 held-out designs (milestone 110), the ladder pays where routing is dear.** Where a routed point costs more than
  3 times a mapped score (16 to 40-bit multipliers, a crossbar, a GF(2) matrix), "skip r1, keep 8" costs a quarter of
  routing everything and beats random routing of the same wall-clock (2.07% against 3.59% mean regret, 18 of 23 cells).
  Where routing is cheap, random routing is safer (1.29% against 6.21%), because a misleading mapped rung sends the
  ladder to a bad 8: over all 52 cells it wins 37 and loses 13 (sign test p = 0.001) but loses on the mean (4.38% against
  2.31%): [`experiments/heldout_designs/`](experiments/heldout_designs/results.txt).
- **A rule fixed before any routing (milestone 111): time one point, run the ladder only if routing costs over 3x a
  mapped score, else route randomly.** Chosen by leave-one-design-out on the 26 held-out designs (every fold picks 3), it
  has 1.66% mean regret against 2.29% for random routing and 4.38% for always running the ladder, at the same wall-clock,
  and its worst cell is 13% instead of 50%. Testing the mapped rung on a small routed pilot (tau-b on 3 to 6 points) does
  not help; routing a few random points inside the ladder's budget hedges as well. On the small designs it costs 0.17
  points against always running the ladder, within noise: [`experiments/switch_guard/`](experiments/switch_guard/results.txt).
- **The rule's ladder branch holds on fresh data where routing is dear (milestone 112, flow run).** 120 new pass sequences on
  six designs where a routed point costs 3.6 to 19.5 times a mapped score (12 cells, about 103 points each, newer tools):
  "score everything at the mapped rung, route the best 8" has 1.05% mean regret against 3.16% for random routing of the
  same wall-clock (better in 9 cells, worse in 3; design bootstrap interval of the difference -3.95 to -0.06 points). The
  six-point random hedge milestone 111 preferred by 0.07 points in-sample is worse than random routing here (3.55%), so it
  is dropped from the rule; relaxed-clock 24-bit multipliers and a crossbar remain the failures:
  [`experiments/fresh_dear/`](experiments/fresh_dear/results.txt).
- **The switch holds on eight designs no table had run (milestone 113, flow run).** Unseen multiplier widths, a squarer (a new
  family), a 32-port crossbar, a 64-bit GF(2) matrix, a 32-bit adder, popcount and barrel shifter, 120 fresh sequences, both
  clocks: the rule, with theta = 3 fixed in advance, has 0.91% mean regret against 2.64% for random routing and 1.44% for
  always running the ladder (better than random in 9 of 16 cells, worse in 1, sign test p = 0.02). Each branch picked the
  better policy on average; the one miss is a relaxed-clock 18-bit multiplier (10.5%), the family's known failure:
  [`experiments/fresh_designs/`](experiments/fresh_designs/results.txt).
- **No guard from the mapped rung alone (milestone 114, no flow run).** A guard on the mapped slack and delay spread, chosen
  on the held-out cells (where it caught exactly the five failing relaxed multipliers, 1.66% to 1.25% leave-one-family-out),
  missed both relaxed multipliers on 28 fresh dear-pool cells and raised regret from 0.97% to 1.16%: the spread is a property
  of the sequence pool, not the design, and the stable slack does not separate the failures. The switch stays the rule:
  [`experiments/r2_guard/`](experiments/r2_guard/results.txt).
- **A mapped score clipped at the clock fixes the relaxed-clock multiplier miss, blind (milestone 115, flow run).** At a relaxed
  clock the routed flow repairs timing up to the period and stops, so routed delay is the period (median 0.993 to 1.000 of it
  on every relaxed multiplier and squarer) and routed area x delay ranks by area alone; the mapped score keeps rewarding mapped
  speed nobody will see. Scoring a point as area x max(period, 1.25 x mapped delay), chosen on the 52 held-out cells (1.66% to
  0.77% in-sample; 1.66% leave-one-family-out, since the gain is all in one family), then run blind on seven new designs
  (1,680 flow runs, predictions committed first): the switch's mean regret falls from 2.73% to 0.83%, better in 5 cells and
  worse in none, every relaxed cell on the ladder at 0.00% (mult26 9.58%, sq24 11.30% before); design bootstrap interval of the
  difference -3.63 to -0.41 points. All six predictions held. It can hurt where routed delay sits far below the period: on an
  earlier, already seen table it sent barrel128 relaxed from 0.00% to 19.2%:
  [`experiments/clip_score/`](experiments/clip_score/results.txt).
- **The switch's routed pilot cannot tell when to clip (milestone 116, flow run, negative).** A guard that keeps the clip only
  when the timing pilot's routed delay is at least 0.9 of the period, fixed by mechanism before five blind designs ran (1,200
  flow runs): the pilot share does separate barrel shifters (0.41 to 0.59) from multipliers and squarers (1.00), but the clip
  helped on two of three blind relaxed barrels (barrel192 8.21% to 0.00%, barrel256 8.66% to 0.00%) and hurt on one (barrel96,
  3.18% to 9.42%). Blind mean regret: unguarded clip 2.69%, guarded 3.76%, plain switch 5.58%, equal-cost random 3.28%. Over
  all 124 cells of milestones 110 to 116 the unguarded clip has 1.02% against 1.87% for the plain switch and 2.36% for random
  routing, so it stays the rule: [`experiments/pilot_clip/`](experiments/pilot_clip/results.txt).
- **Counted by what each rule had seen, the clip is what beats random routing (milestone 117, no flow run).** The plain
  switch (theta fixed in milestone 111) is level with equal-cost random routing on the 20 designs it had not seen (2.71% against
  2.80% mean regret, 40 cells). The clipped switch (alpha fixed in milestone 115) has 1.60% against 2.91% on its only test cells,
  the 24 of the 12 designs run blind in milestones 115 and 116: better in 18, worse in 5 (sign p = 0.011), design-bootstrap
  interval of the difference -2.45 to +0.22 points, so not yet significant across designs. Squarers, multipliers and crossbars
  carry the win; wide barrel shifters split 3 to 3: [`experiments/switch_pooled/`](experiments/switch_pooled/results.txt).
- **On three families no table had run, the clipped switch loses to random routing because of one shifter (milestone 118,
  flow run, mostly negative).** Funnel shifters, FIR tap sums and CORDIC stages; six designs and eight predictions committed
  before 1,440 flow runs. Blind mean regret: clipped switch 8.34%, plain switch 9.19%, equal-cost random 2.48%. funnel128's
  routed-best point ranks 70.5 of 103 on the mapped score, so a top-8 ladder costs it 39 to 51% at both clocks. FIR and the
  larger CORDIC go to 0.00 to 1.31%. Over the clipped switch's 36 test cells it is better than random in 22 and worse in 11, but
  the design-bootstrap interval is -1.68 to +5.55 points. Without the two shifter families (post hoc) it is 0.79% against
  2.59%, interval -2.53 to -1.03. A 4-point rank-agreement guard halves the funnel loss but does not fix it:
  [`experiments/new_families/`](experiments/new_families/results.txt).
- **A guard that reads the RTL for a wide data shifter fixes the shifter failure, run blind (milestone 119, flow run).** SWS(64)
  is the clipped switch, except that it routes randomly when the RTL has a data shifter of 64 bits or more. It was chosen on 136
  seen cells (1.08% against 1.67% for SWC). On three families no table had run (rotate-and-mask, leading-zero normaliser,
  maximum tree), it has 4.03% blind regret against 5.27% for SWC and 4.79% for equal-cost random routing. It is better than
  random in 3 cells and worse in none. It acts on only 3 of the 12 cells, so the interval is -1.58 to +0.00 points. The max-tree
  decoy, mux-heavy but no shifter, stays on the ladder and wins (0.73% against 2.99%):
  [`experiments/struct_guard/`](experiments/struct_guard/results.txt).
- **The RTL shifter guard fails its second blind test (milestone 120, flow run, mostly negative).** A barrel written as explicit
  mux stages (proved equal to `barrel_w`) has no shift operator, so SWS(64) does not flag it, and the clipped switch loses there
  (muxshl128 19.68% and 17.85% against 2.99% and 2.37% random). A mux-share band catches it. But the guard also flags a 128-bit
  leading-zero normaliser where the ladder reaches 0.00% against 11.4 to 11.8% random. Blind regret: SWS(64) 9.84%, the
  band-extended guard SWG 7.16%, random 7.16%, the unguarded rule 8.38%. The property that defeats the ladder looks like a shift
  amount taken straight from an input, not a shift operator:
  [`experiments/shift_power/`](experiments/shift_power/results.txt).
- **Where the shift amount comes from decides it (milestone 121, flow run, three new families run blind).** A left shifter whose
  amount is the popcount of a mask (a counter chain 63 to 127 cells deep) is where the clipped ladder wins: 0.00% regret in all 4
  cells against 0.92 to 1.81% for random routing. One adder (`x >> (a + b)`) or an exponent difference (`x >> |ea - eb|`) in front
  of the amount is not enough: the ladder still loses (8.60% and 13.29% against 1.69% and 6.98%). The registered guard "route
  randomly on a 64-bit-plus shifter whose amount is under 8 word-level cells deep", SWD(8), has 2.89% blind regret against 3.34%
  for random routing and 7.30% for the unguarded rule (better in 4 cells, worse in none); the primary "pins only" version was too
  literal: [`experiments/amount_depth/`](experiments/amount_depth/results.txt).
- **The cut is between depth 2 and 4, not 8 (milestone 122, flow run, three new 128-bit families run blind from both sides of
  k = 8).** On every cell where the rule takes its ladder branch, the clipped ladder reaches 0.00% regret, against 2.79 to 5.65%
  for random routing, including an amount only 4 word-level cells deep (a short xor-add chain) that SWD(8) wrongly routes randomly.
  Over the 24 blind cells of milestones 121 and 122, SWD(8) has 2.99% against 3.94% random and 4.93% unguarded, better than random
  in 8 cells and worse in none (sign p = 0.008); post hoc, SWD(3) does better (2.73%):
  [`experiments/amount_threshold/`](experiments/amount_threshold/results.txt).
- **Gates in front of the shift amount decide it, not word-level cells (milestone 123, flow run, three new 128-bit families built so
  the two counts disagree).** A guard that routes randomly when fewer than 36 AND/NOT gates feed a wide shifter's amount, SWG(36),
  has 1.28% blind regret against 5.33% for the word-level guard SWD(3) and 3.95% for random routing (better than random in 7 of
  12 cells, worse in 1). A 7-way xor of 7-bit fields (7 word-level cells, 15 gates) costs the unguarded ladder 16.9% against
  0.02% random, while two chained 12-bit multiplies (2 cells, 159 gates) give it 0.00%. All seven registered predictions held.
  Over milestones 121 to 123's 36 blind cells SWG(36) has 2.25% against 3.94% random (better in 17, worse in 1):
  [`experiments/amount_cut/`](experiments/amount_cut/results.txt).
- **The gate cut sits between 31 and 33, not at 36 (milestone 124, flow run, seven blind 128- and 64-bit shifters from three new
  families with 31 to 41 gates in front of the amount).** In this test the clipped ladder reaches 0.00 to 1.59% regret on every
  ladder-branch cell from 33 gates up (against 3.25 to 22.73% for random routing), including two the registered SWG(36) routes randomly; at 31
  gates (an 8-bit absolute difference) it loses at the tight clock (27.73% against 4.32%). SWG(36) still beats random routing in 6
  cells and loses in none (2.84% against 8.11%); post hoc SWG(32) has 1.38%. Six of seven predictions held; the refuted one said
  the ladder would lose at 33 gates. The 64-bit twin falls under the routing-cost threshold, so width scaling stays untested.
  Over milestones 121 to 124's 50 blind cells SWG(36) has 2.41% against 5.11% random (better in 23, worse in 1):
  [`experiments/amount_place/`](experiments/amount_place/results.txt).
- **Hedging the pilot-probe guard's fall-back is nearly free and nearly useless (milestone 130, replay of the same 90 cells,
  no flow run).** When the pilot beats the subset's best, routing the subset's next 3 clipped-ladder ranks before the random
  fall-back (SWH(32, 3)) moves mean regret from 4.39% to 4.37% (paired draws; better on 24 cells, worse on 1; interval -0.04 to
  -0.01 points). The hedge holds the cell's best point in only 19% of false alarms on the 40 cells where the ladder is perfect,
  because a 32-point subset rarely contains the global winner. Mapping the rest first and routing the global ladder's next 3
  (SWHM(32, 3)) halves the false-alarm cost (0.53 points) but starves the fall-back where the ladder fails (14.94% against
  11.83%), 4.69% overall. All six predictions held; the false alarms are the test's, not the fall-back's:
  [`experiments/hedge_probe/`](experiments/hedge_probe/results.txt).
- **Confirming the pilot-probe guard's alarm with a second random probe trades true alarms for false ones (milestone 131,
  replay of the same 90 cells, no flow run).** SWQ(32, 1) falls back only when one more of the subset's mapped points (one the
  fall-back routes first anyway) also beats the subset's best. False alarms on the 40 cells where the ladder is perfect drop from
  12% to 4% of draws (cost 1.15 to 0.39 points), but true alarms on the 17 failing cells drop from 34% to 14% (11.83% to 14.40%),
  so mean regret rises to 4.53% against SWP(32)'s 4.39%, though SWQ is better on 47 cells and worse on 20 (interval -0.24 to
  +0.57 points). Given an alarm, the second probe confirms 42% of the time on failing cells and 30% on perfect ones: one more
  random point carries little evidence. A relative margin of 0.5% to 5% on y[u] - y[t] is flat (4.38% to 4.42%). Two of six
  predictions refuted; the subset test with random probes looks exhausted, and SWG(32) (3.91%) stays ahead:
  [`experiments/confirm_probe/`](experiments/confirm_probe/results.txt).
- **Why the clipped ladder fails where it fails: the delay half, not the area half (milestone 134, replay, no flow run).** On the
  36 blind ladder-branch cells of milestones 125, 132 and 133, mapped area ranks routed area almost exactly in both groups (Kendall
  tau-b 0.95 on the 8 failing cells, 0.93 on the 26 winning ones). On the failing cells the ladder's best routed pick is 0.4% to
  16% *smaller* than the routed optimum but 3% to 27% *slower*, so delay carries 149% of its log regret. Mapped delay says
  nothing about routed delay there (tau 0.00, against 0.13 where the ladder wins), and among the mapped points smaller area means
  slower routing (tau of mapped area against routed delay -0.15 against +0.10; AUC 0.06). The clip is not the cause: it binds on
  fewer points where the ladder fails (0.42 against 0.55; prediction refuted), and the unclipped key does worse (16.9% against
  14.3%). The trade-off appears only after routing: mapped area and mapped delay rise together on every cell (tau 0.47 against
  0.37, AUC 0.68, post hoc), so no mapped-rung statistic seen so far flags these cells. Five of six predictions held:
  [`experiments/ladder_diagnosis/`](experiments/ladder_diagnosis/results.txt).
- **Checking routed delay inside the ladder's own top 3 does not find its failures (milestone 135, replay of the 90 seen cells,
  no flow run, negative).** The guard SWX(3, 0.02) routes the clipped ladder's top 3 (points it routes anyway) and, if the
  smallest-area one routes more than 2% slower than the fastest, spends the other 5 routes in the larger-area band. It alarms on
  45% of failing cells and 47% of winning ones: a smaller netlist routing slower than a slightly larger one is the common case
  near the top, not a failure sign. Mean regret 5.01% against 4.77% for the unguarded SWC and 3.91% for SWG(32); it saves 1 point
  where the ladder fails (15.64% against 16.63%) and gives up 0.97 where it is perfect. Four of six predictions refuted; the
  probe-guard search for this rule closes here:
  [`experiments/delay_check/`](experiments/delay_check/results.txt).
- **Where the ladder loses, across both corners (milestone 155, replay of 223 units, four of seven predictions held; the primary
  failed).** On 183 ladder-branch units its 38 losses to random routing sit where mapped delay ranks routed delay worst (median
  tau-b 0.015 against 0.160; loser AUC 0.69), ahead of clip share (0.59; 0.67 at ff, 0.51 at tt) but not significantly
  (difference +0.11, interval -0.03 to +0.24). No flag on either pays: switching flagged units to area-only has 2.81% (oracle)
  and 2.98% (one 8-point pilot) against SWC's 2.76%:
  [`experiments/delay_rank/`](experiments/delay_rank/results.txt).
- **The ladder's ff edge on short add chains is not thinner on the same designs (milestone 154, paired replay of 13 designs run
  at both ff and tt, five of seven predictions held; the primary failed narrowly).** SWC(1.25) beats equal-cost random routing by
  1.51 points at ff and 1.50 at tt; milestone 152's thinner 1.05 comes from csum4, which ran only at ff. Across the 26 units the
  ladder key's rank agreement with routing predicts its edge (Spearman -0.62), carried by mapped delay (-0.58), not mapped area
  (+0.04, tau-b 0.92 at both corners); the key's tau-b falls 0.44 to 0.36 at ff (interval -0.18 to +0.01):
  [`experiments/corner_rank/`](experiments/corner_rank/results.txt).
- **The clip's alpha stays at 1.25 (milestone 153, blind flow run at tt on 13 of milestone 152's designs, six of seven
  predictions held, the primary among them).** alpha = 1, the best ff alpha on these designs after the fact, has 2.08% mean
  regret at tt against SWC(1.25)'s 1.69% (interval of the difference -0.05 to +1.01 points); every alpha from 0 to 1 gives the
  same regret on every design at tt. A design's alpha preference at ff does not carry to tt (Spearman
  -0.46), and over all 223 ff and tt units 1.25 is the best single alpha (2.58% against 2.73% for 1):
  [`experiments/addshort_tt/`](experiments/addshort_tt/results.txt).
- **csum2's area-only miss is rare at ff (milestone 152, blind flow run on 15 fresh short add chains, four of seven predictions
  held; the primary failed).** No fresh design repeats csum2's miss; area-only ranking (alpha = 0) has 6.15% mean regret against
  SWC(1.25)'s 7.18% (interval -4.50 to +2.38), but a leave-one-milestone-out alpha over five ff folds still loses to the fixed
  1.25 (4.04% against 3.66% on 92 designs):
  [`experiments/addshort_ff/`](experiments/addshort_ff/results.txt).
- **The clip's alpha should not be taken per corner (milestone 151, replay of 77 ff designs and 118 tt cells, five of seven
  predictions held; the primary failed).** Chosen leave-one-milestone-out at ff over alpha in {0, 0.5, 0.8, 1, 1.25}, the rule
  picks area-only on three folds and has 3.62% against SWC(1.25)'s 2.98%; one design (csum2, 66.6% under area-only) decides it.
  On 118 tt cells every fold keeps 1.25, and area-only has 9.90% against 1.84% (worst cell 343%):
  [`experiments/alpha_corner/`](experiments/alpha_corner/results.txt).
- **No pre-routing signal flags the ladder's fast-corner losses well enough to pay (milestone 150, replay of 77 ff designs, one
  of eight predictions held; the primary failed).** A signal read off the mapped pool has already spent the mapping, so its only
  response is to route a different 8 mapped points. Chosen leave-one-milestone-out over eight features, every cut and three
  responses, the detector has 3.61% against SWC's 2.98%, and the best in-sample searches sit inside their permutation nulls
  (p = 0.25 and 0.88). SWC loses where its clip does not bind (median share 0.04 against 0.49). Post hoc, ranking by mapped area
  alone beats SWC on its losers (6.25% against 13.06%) at a cost of 1.23 points elsewhere, 2.69% against 2.98% pooled
  (interval -2.19 to +2.07, worst design 66.6%):
  [`experiments/detector_ff/`](experiments/detector_ff/results.txt).
- **Hedging the fall-back does not rescue the fast-corner guard (milestone 149, replay of 77 ff designs, two of seven predictions
  held; the primary failed).** Keeping the cheap score's best 1 to 3 points of a mapped 8 to 32-point subset when the pilot
  distrusts the ladder cuts what a false alarm costs from 9.89% to 7.07% regret but lifts the break-even ratio only from 0.17 to
  0.24, while the pilots' false-alarm/hit ratios sit near 0.58. No hedged guard beats the unguarded ladder even in sample (best
  4.04% against 2.98%), so the guard search closes at ff as at tt:
  [`experiments/hedge_ff/`](experiments/hedge_ff/results.txt).
- **A routed-pilot rank check does not fix the ladder's fast-corner losses (milestone 148, replay of 77 ff designs, two of seven
  predictions held; the primary failed).** A guard that routes a few random points and falls back to random routing when the
  clipped mapped score ranks them badly, chosen leave-one-milestone-out, has 4.21% mean regret against the unguarded SWC's 2.98%
  (random 8.95%; difference +1.23 points, interval +0.12 to +3.09), and no setting beats SWC even in sample. The pilot does see
  the weak rung (it falls back on 30% of draws where SWC loses, 18% elsewhere), but a fall-back costs 9.39 points where SWC wins
  and saves only 6.77 where it loses, so a guard would need a false-alarm rate below 0.17 times its hit rate:
  [`experiments/pilot_tau_ff/`](experiments/pilot_tau_ff/results.txt).
- **On fresh designs neither add-chain structure nor short mapped delay explains the ladder's fast-corner losses (milestone 147,
  flow run, blind 2 x 2, three of eight predictions held; the primary failed).** At ff_n40C_1v95, a rule fixed in advance put fresh
  128-bit designs in four cells: add-chain or compare-chain amount, by a short (<= 15 ns) or long (>= 16.5 ns) mapped no-wire
  period. On 20 designs (5 a cell, 4 of them disclosed top-ups) the add-chain effect at matched delay is -2.55 points (stratified
  permutation p = 0.66) and the delay effect at matched structure -0.09 (p = 0.99); pooled with milestone 146's six other fresh
  designs, delay +0.01 (p = 0.997). Milestone 146's delay effect needs milestone 145's fast add chains. The flow reproduces bit for
  bit across the two sessions (515 of 515 shared points). SWC beats random on 15 of 20 (sign p = 0.0075):
  [`experiments/addchain_delay/`](experiments/addchain_delay/results.txt).
- **At the fast corner the ladder's weaker edge follows short mapped delay, not add chains (milestone 146, flow run, blind,
  four of eight predictions held; the primary failed).** On 13 fresh designs, slow add chains (5 csum designs, 18 to 42 ns) and
  fast control chains (8, 7 to 15 ns), SWC wins all 5 slow add chains (mean advantage 6.21 points) and only 4 of the 8 fast
  controls (1.31). In the 2 x 2 with milestone 145's designs, the delay main effect is +6.08 points (interval +2.58 to +9.73) and
  the structure main effect +1.18 (-2.43 to +4.69); every loss in either milestone is on a design that maps under 15 ns. Caveat:
  the slow add-chain cell is one family, because sad, wsum and dot chains all map fast however long they are:
  [`experiments/delay_split_ff/`](experiments/delay_split_ff/results.txt).
- **At the fast corner the ladder's edge is smaller on add-chain shift amounts, but it does not lose on most of them (milestone 145,
  flow run, blind, four of seven predictions held; the primary failed).** On 20 fresh 128-bit designs at ff_n40C_1v95, SWC loses
  to equal-cost random routing on 3 of 10 designs whose amount is a chain of multi-bit adds and on 0 of 10 compare, select or
  divide chains (Fisher p = 0.105). Its mean advantage is 1.57 points on add chains against 8.83 on the others (permutation
  p = 0.026), and the mapped rung's rank correlation with routing is lower there (median tau-b 0.27 against 0.47). Overall SWC wins
  16 to 3 (sign p = 0.0044). Caveat: every add-chain design maps to a shorter critical path than every control, so structure and
  delay are confounded. Yosys 0.71 (earlier ff runs: 0.70):
  [`experiments/addchain_ff/`](experiments/addchain_ff/results.txt).
- **At the fast corner, SKY130 ff_n40C_1v95, the clipped ladder still beats equal-cost random routing on 20 of 27 blind designs
  (milestone 144, flow run, six of seven predictions held).** Only the liberty changes, as at ss. The routed ranking between tt and
  ff shares almost nothing (median tau-b 0.19, lower than tt against ss at 0.34; the routed-best sequence differs on all 27), and
  random routing does worse at ff (10.06% mean regret against 6.35% at tt), while SWC has 4.03% (sign p = 0.019; interval of the
  mean difference -10.06 to -1.14 points). Over tt 40%, tt 65%, ss and ff on these 27 designs SWC is ahead at all four on 14 and
  behind at all four on none. Post hoc: all three carry-save adders and all three dot products lose at ff (division, the weak tt
  family, wins all five by a mean 18.5 points). Some ff baselines are slower than tt (four 256-bit left clamps, 1.6 to 2.0 times)
  because ABC maps a different netlist against the ff liberty, not because the cells are slower: on the same netlist ff is 42%
  faster. The stopping rule was set after an interim look at 14 designs (written down in
  [`STOP_RULE.md`](experiments/corner_ff_blind/STOP_RULE.md)):
  [`experiments/corner_ff_blind/`](experiments/corner_ff_blind/results.txt).
- **At a second library corner, SKY130 ss_100C_1v60, the clipped ladder beats equal-cost random routing on 24 of 27 blind
  designs, although the routed ranking barely carries over between corners (milestone 143, flow run, six of seven predictions
  held).** Only the liberty changes (40% utilisation, clocks from each design's own ss baseline, a median 2.19 times the tt
  period). The routed score's median tau-b between tt and ss is 0.34, against 0.74 for 40% to 65%, and the routed-best sequence is
  the same at both corners on 3 of 27 designs; with nothing retuned SWC has 1.96% mean regret against 6.11% (sign p = 0.00005;
  tt on the same designs 2.76% against 6.35%, 22 to 5). The losing designs at tt and at ss do not overlap: division, the weak
  family at tt, wins all five of its designs at ss (the refuted prediction), and the carry-save adders lose two of three:
  [`experiments/corner_ss_blind/`](experiments/corner_ss_blind/results.txt).
- **On 26 more blind designs at 65% placement utilisation the clipped ladder beats equal-cost random routing 22 to 4, and over
  46 designs at 65% it wins 38 to 8 with the same edge as at 40% (milestone 142, flow run, all eight predictions held).** The rest
  of milestone 141's seeded order (26 of 32 finished): SWC 2.41% mean regret against 5.75% (sign p = 0.0005). Over all 46: 2.46%
  against 6.35%; the change from 40% is -0.61 points (95% interval -1.60 to +0.37) and the sign agrees on 39 of 46. Division is
  the one family where SWC is no better than random on the mean:
  [`experiments/util65_rest/`](experiments/util65_rest/results.txt).
- **At a second operating point, 65% placement utilisation, the clipped ladder still beats equal-cost random routing on 16 of 20
  blind designs, with the same size of edge as at 40% (milestone 141, flow run, all seven predictions held).** Routing is dearer
  (median routed/r2 7.56 against 5.29) and the routed ranking moves (median tau-b 0.74 against the 40% table), yet SWC has 2.52%
  mean regret against 7.13% (sign p = 0.012); the change from 40% is -0.47 points (95% interval -1.82 to +1.06). Its losses are
  the 256-bit dividers. One 256-bit design lost most points to pin placement at 65%; without it, 15 to 4:
  [`experiments/util65_blind/`](experiments/util65_blind/results.txt).
- **Milestone 138's set run to completion: the clipped ladder beats equal-cost random routing on 34 of 40 blind designs, and on
  55 of 73 over every blind set with the mean's interval clear of zero (milestone 140, flow run, all seven predictions held).**
  The 15 designs milestone 138's time limit cut, resumed with the same run.py: SWC 2.23% mean regret against 6.25%, better on
  13, worse on 2 (sign p = 0.0074). Over 73 blind designs: 55 better, 15 worse (p = 0.000002), design-level mean -2.79 points
  (95% interval -3.98 to -1.59). Above a routing-cost ratio of 6 it wins 18 of 19 cells:
  [`experiments/ladder_rest/`](experiments/ladder_rest/results.txt).
- **The clipped ladder's losses sit near the switch threshold, not at the tight clock, and a raised threshold buys nothing
  (milestone 139, replay, pre-registered).** Milestone 138's post-hoc reading tested on the 99 earlier ladder-branch cells that
  did not suggest it. Clock: refuted (failure rate 14/51 tight against 11/48 relaxed, Fisher p = 0.39; paired by design 19
  against 23, p = 0.64). Ratio: held (failing cells have lower routed/r2, AUC 0.67, permutation p = 0.006; 16 of the 25
  failures have routed/r2 at most 4). But the band (3, 4] holds big wins too, so there SWC and random tie on the mean
  (6.20% against 6.03%); above 4 SWC has 2.65% against 4.44%. The guard SWCT(4) (random at the tight clock when routed/r2 <= 4)
  gives 4.01% against SWC's 4.21%, better on 12 designs and worse on 11 (interval -1.25 to +0.78 points); theta = 3 stays:
  [`experiments/tight_theta/`](experiments/tight_theta/results.txt).
- **A second confirmatory blind set, on 128-bit right and 256-bit left shifters: the clipped ladder beats equal-cost random
  routing on 21 of 25 new designs (sign p = 0.0009), and over all 58 blind designs its mean advantage is now significant
  (milestone 138, flow run).** Five new families (restoring division, chained clamps, max - min range, 3-bit dot product,
  threshold count), each dial at both shifters; all 40 candidates passed the cost probe, and the flow stopped at its time
  limit after 25 complete designs, the analysed set by a run-order rule fixed beforehand. SWC 2.45% mean regret against 6.44%
  for random (right shifters 2.18% against 4.75%, 256-bit left 2.74% against 8.27%); its four losses are all at the tight
  clock. Pooled with the 33 earlier blind designs: better on 42, worse on 13 (p = 0.0001), design-level mean -2.47 points
  with a 95% interval of -3.87 to -1.06. All eight predictions held:
  [`experiments/ladder_confirm2/`](experiments/ladder_confirm2/results.txt).
- **A confirmatory blind set at one clock per design: the clipped ladder wins on 21 of 33 blind designs and loses on 9 (sign
  p = 0.043), but the size of its edge is not yet pinned down (milestone 137, flow run).** Twelve new 128-bit left shifters from
  four families (integer square root, argmin index, ones'-complement checksum, nibble-match count), kept from 16 by milestone
  133's cost probe and run at one clock each: SWC 2.91% mean regret against 4.15% for equal-cost random routing, better on 8
  designs and worse on 4 (p = 0.39, the registered primary test refuted). Two square-root designs carry most of the loss
  (+3.89 and +7.08 points). Pooled with the 21 earlier blind designs the design-level mean difference is -1.32 points with a 95%
  interval of -3.26 to +0.63, so about 73 designs would be needed to put it below zero. Five of seven predictions held:
  [`experiments/ladder_confirm/`](experiments/ladder_confirm/results.txt).
- **The blind evaluation, rule by rule: the unguarded ladder is the rule to report, but its edge over random routing is not yet
  established at the design level (milestone 136, replay of the 42 blind cells, no flow run).** Each rule is scored only on the
  cells that were out of sample for it. Over all 42 cells (21 designs) the clipped ladder SWC has 3.30% mean regret, random
  routing 4.65%, the gate-depth guard 4.26%; no guard beats SWC on its own blind cells after a Holm correction (smallest adjusted
  p 0.23), though SWG(32)'s flag in front of the pilot probe comes out lower on its 26 (2.85% against 3.14%, interval -2.40 to
  +1.64 points). SWC beats random on 28 cells and loses on 8 (p = 0.001), but cells within a design move together: by design it
  is 13 better, 5 worse (p = 0.096), and at the observed spread about 95 blind designs would be needed for a 95% interval below
  zero. A perfect guard would sit 1.99 points below SWC, all of it on 8 cells of 5 designs. Four of six predictions held:
  [`experiments/blind_pooled/`](experiments/blind_pooled/results.txt).
- **On a blind set probed so every cell reaches the ladder branch, the unguarded ladder beats random routing and every guard
  loses to it (milestone 133, flow run).** Seven new 128-bit left shifters (a CRC-7, BCD-to-binary, compare-select and
  multiplicative-hash amount; 18 to 58 gates) were kept from nine by a one-point routing-cost probe written before it ran, and
  nine predictions were fixed before a 1,680-point flow run. All 14 cells are on the ladder branch. Blind mean regret: unguarded
  clipped ladder SWC 2.70%, the 32-gate rule SWG(32) 3.09%, the pilot-probe guard SWP(32) 3.35%, random 5.57%; SWC is perfect on
  11 cells and fails on crc7s16 relaxed and bcd3. Routing fresh points on distrust (SWPF) is 0.12 points better than SWP, all of
  it where the ladder was right. Pooled over all 42 blind cells (milestones 125, 132, 133): SWC 3.30%, SWG(32) 4.26%, random
  4.65%; SWC better than random on 28 cells, worse on 8: [`experiments/ladder_blind/`](experiments/ladder_blind/results.txt).
- **Tested blind on six new 128-bit shifters, neither guard beats random routing (milestone 132, flow run).** SWP(32), the
  pilot-probe guard, and SWG(32), the 32-gate rule, were registered side by side with eight predictions before a 1,440-point flow
  run on three new families: Gray decode (gray0, 24 gates in front of the amount; gray1, 43), a value mod 97 (mod8, mod10, mod12;
  27 to 80 gates) and one round of a 7-bit substitution table (lut1, 51). The mod family's right shifters all fell under the
  routing-cost threshold (routed/r2 about 2.2), so 6 of 12 cells are informative. Blind mean regret: SWG(32) 2.25%, SWP(32)
  3.01%, unguarded SWC 3.65%, random 2.20%. The ladder fails on gray0 (24 gates; 8.67% against 0.31% random), which SWG(32)
  flags, and on lut1 at the tight clock (51 gates; 12.66% against 5.11%), which it does not: a second blind miss above the cut
  after milestone 125's pmul4. SWP(32)'s test does see the failures (distrust 0.31 of draws where SWC loses, 0.04 where SWC is
  at most 0.5%), but its fall-back recovers only part of the loss (7.20% against 10.00% unguarded and 1.91% random). Five of
  eight predictions held; (3), (4) and (6) refuted. Over SWG(32)'s two blind sets (28 cells) it has 4.85% against 4.19% random
  and 3.60% for no guard: [`experiments/blind_probe/`](experiments/blind_probe/results.txt).
- **A probe the ladder pays for anyway makes the first measured guard that beats the unguarded ladder on mean (milestone 129,
  replay of the same 90 cells, no flow run).** Routing a mapped 32-point subset's clipped-ladder best against the timing pilot SWC
  already routes, and routing randomly with the unspent budget when the pilot wins (SWP(32)), has 4.39% mean regret against 4.77%
  unguarded and 5.44% random. A trusting draw routes exactly the unguarded ladder's 8 points in 90% to 99% of trusting draws, so the guard
  costs only its false alarms (12% of draws on the 40 cells where the ladder is perfect, 1.15 points) and falls back in 34% of draws
  on the 17 cells where it fails (16.63% to 11.83%). It loses to SWC on 48 cells and wins on 19 (interval -1.13 to +0.34 points),
  and stays behind the 32-gate rule's 3.91%. Four of six predictions held:
  [`experiments/pilot_probe/`](experiments/pilot_probe/results.txt).
- **Deciding before the pool is mapped gives the fall-back its budget back, but the probes cost more than they save (milestone 128,
  replay of the same 90 cells, no flow run).** Mapping a uniform 24-point subset, routing its clipped-ladder best 3 against 3 of
  its other points, and routing randomly with the unspent budget when the ladder's best loses (SWS(24, 3)) cuts regret on the 17
  cells where the ladder fails from 16.63% unguarded (13.32% for milestone 127's guard) to 9.16%, falling back in 40% of draws
  there and 9% where the ladder wins. On those 40 winning cells the 6 probes displace ladder routes and cost 4.23 points, so the
  mean over 90 cells is 5.31% against 4.77% unguarded and 5.44% random. Five of six predictions held. One probe (m = 1) costs
  less (4.50% to 4.55% for s from 16 to 32, read after the table, not chosen), still behind the 32-gate rule's 3.91%:
  [`experiments/staged_probe/`](experiments/staged_probe/results.txt).
- **A top-probe guard sees the ladder's failures but cannot afford to act on them (milestone 127, replay of the same 90 cells,
  no flow run).** Routing the clipped ladder's best 3 and 3 uniform points and trusting the ladder only when its best wins (SWT(3))
  falls back in 54% of draws where the ladder fails and 7% where it wins, far sharper than milestone 126's random probes (12% and 7%).
  But the whole pool is mapped before the test, so the fall-back has only 2 more routes: SWT(3) has 5.11% mean regret against 4.77%
  unguarded and 5.44% random. Even a free fall-back (a bound, not a schedule) reaches only 4.19%:
  [`experiments/top_probe/`](experiments/top_probe/results.txt).
- **A probe-rank guard cannot see the ladder's failures (milestone 126, replay of milestones 119 to 125's 90 cells, no flow run).**
  Routing 4 uniformly drawn probes and trusting the clipped ladder only when its order agrees with routed order on them (SWCV)
  gives 5.14% mean regret, worse than the unguarded ladder (4.77%) and barely better than random routing (5.44%). It falls back
  in 12% of draws where the ladder fails and 7% where it wins, because the mapped score orders a failing cell's points about as
  well overall (tau-b +0.45 against +0.53) and goes wrong only among its own top 16 (-0.18 against +0.23, post hoc):
  [`experiments/pilot_rank/`](experiments/pilot_rank/results.txt).
- **The gate-depth guard fails its second blind test (milestone 125, flow run, eight blind shifters from four new families,
  five 128-bit and three 64-bit multi-lane).** The clipped ladder reaches 0.00% regret at both clocks with 28, 31, 33 and 35 gates
  in front of the amount (random routing 2.40 to 12.44%), so the registered 32-gate guard routes two winning designs randomly; on a
  4-bit by 7-bit product (36 gates) it has 21 to 25% against about 4%. Unguarded, the ladder has 3.56% blind regret against 5.69%
  for random routing; SWG(32) has 6.79%. Four of eight predictions held. Wider data paths around a 64-bit shift do reach the
  ladder branch (routed/r2 up to 5.6), and there the ladder wins (1.20% against 3.84% at 48 gates). Gate depth is not the
  variable: [`experiments/amount_lanes/`](experiments/amount_lanes/results.txt).
- **Proof success (H5) is predicted by design size, not by the rewrite**; it is not testable on this benchmark as built.
- Limits: one corner and utilisation, global-route estimates, cached tables from tens of designs.

Produced with AI assistance (Claude Code).
It builds on none of the CU Boulder groups and claims no affiliation.

**Live page:** https://marisstella.app/research/verified-dse/

## Question
Can cheap rungs (generic gates, liberty mapping, placement, global route) and a
prediction of formal-equivalence success cut the cost of finding a Pareto-good
routed design, with a coverage guarantee that holds whatever the rung bias?

## Milestone 1 result: does the cheap rung rank ABC pass sequences like the routed one? (H1)
10 small designs, 60 ABC pass sequences each (length 0 to 3 over `balance`, `rewrite`, `rewrite -z`,
`refactor`, `refactor -z`, `dc2`, `dch`), two clock targets, four rungs, 1,200 runs. Score is area x period.
"Routed" is OpenROAD global route plus `repair_timing -setup` on SKY130 HD (chip-pnr's script, 40% utilisation).

| rung | cost per point (1 core) | tau-b vs routed, tight clock: median, designs < 0.7 | same, relaxed clock | median pick regret, tight / relaxed |
|---|---|---|---|---|
| R1 generic gates (cells x depth) | 0.15 s | -0.04, 9 of 9 defined | -0.01, 9 of 9 | 13.5% / 20.0% |
| R2 mapped, no wires | 0.8 s | 0.59, 6 of 10 | 0.73, 3 of 10 | 10.5% / 0.0% |
| R3 after placement | 1.0 s | 0.50, 7 of 10 | 0.76, 1 of 10 | 9.4% / 0.0% |
| R4 routed (reference) | 1.3 s | | | |

- **H1 holds:** the generic-gate score is uninformative to anti-correlated with routed area x delay (the 95% bootstrap interval lies below 0 for popcount16 and crc16 at the tight target). For the ripple adder R1 is constant, so tau is undefined.
- **Mapping is not enough when timing is tight.** Liberty-mapped scores mis-rank at the tight target (median regret 10.5%) and are nearly exact at the relaxed one, because timing repair, which only the later rungs see, reorders designs.
- **Cost:** on these small designs the routed rung costs only about 8x the generic one (1.3 s against 0.15 s), so there is little to save yet; larger designs are needed before H2 is testable.
- Full per-design tables with intervals: [`experiments/rung_bias/results.txt`](experiments/rung_bias/results.txt). Log: [`LOG.md`](LOG.md).

## Milestone 9 result: on larger designs, does a cheap rung finally pay? (H2)
5 larger designs (16, 24 and 32-bit multipliers, 64-bit adders), the same 60 pass sequences, two clocks, 600 runs. The routed rung now costs 19.4 s against 0.77 s for the generic one (25x, against 8x on the small designs).
- **Successive halving from the mapped rung (R2) beats random routed search at small budgets on the tight clock:** mean regret 1.34% against 4.44% at 100 s and 0.33% against 1.85% at 200 s, then random search overtakes it from about 600 s because halving stops at a 0.30% bias floor. At the relaxed clock it wins only at 100 s and floors at 5.0%. Halving from the generic rung (R1) loses everywhere.
- Rung bias is not the same story as on the small designs: R1 is weakly informative on multipliers (tau-b 0.31 tight), and mapped rungs mis-rank the 24 and 32-bit multipliers at the relaxed clock (regret 11 to 18%).
- Milestone 25: the same five designs at 65% placement utilisation (second operating point) give the same picture, R2 floor on mult24 and mult32 at the relaxed clock, routed rung 24 s against 19 s per point: [`experiments/util65/`](experiments/util65/results.txt).
- Five designs, pools of 50, one corner (40% utilisation); see [`LOG.md`](LOG.md) and [`experiments/large/`](experiments/large/results.txt), [`halving_results.txt`](experiments/large/halving_results.txt).

### Reproduce
```bash
# OpenROAD 26Q2 from the nixpkgs binary cache, Yosys 0.33 (apt), SKY130 platform files at chip-pnr's pinned ORFS commit
research/chip-pnr/fetch_pdk.sh /tmp/pdk
# Milestones 108 to 113 use Yosys 0.70 and OpenROAD 26Q3 instead (about a minute from the nixpkgs cache; put both bin/ dirs on PATH):
#   nix --extra-experimental-features 'nix-command flakes' build --no-link --print-out-paths nixpkgs#openroad nixpkgs#yosys
# Those flows run 1 to 2 hours on 4 cores: in a cloud session start them in the background with a long timeout, and use --resume if one stops.
python3 experiments/rung_bias/run.py --openroad <openroad> --pdk /tmp/pdk/orfs/flow/platforms/sky130hd   # ~40 min on 4 cores
python3 experiments/rung_bias/analyse.py                                                            # writes results.txt, summary.json
python3 -m unittest discover -s tests                                                               # rank statistics
```

### Limitations
One library corner (tt 25C 1.8 V), one utilisation, one tool version, ten small combinational designs and one FIFO.
"Routed" is global-route-estimated, not detail-routed. The same 60 sequences are used for every design; 10 of them fail in
ABC (all contain a `dch` followed later by `rewrite`/`refactor`) and are dropped. Clock targets are each design's own
baseline no-wire period (tight) and 1.5x that (relaxed), so they differ across designs. Bootstrap intervals resample
sequences within a design; there is no multiple-comparison correction. Sequences that give identical netlists tie, which
tau-b handles but which limits the ripple adder (4 distinct routed scores). Cumulative rung times are the Yosys mapping time plus the OpenROAD stage time, as in
`LOG.md`.

## Milestone 11 result: does a random hedge, or a gentler cut, fix halving's bias floor?
Replayed on both cached tables (no flow run), 400 paired seeds. A random-search hedge (75% or 50% of the budget to halving, the rest to random routed points) lowers the floor at 600 s and over on the larger designs but gives up the head start and still trails random search at 900 s. **Halving from R2 with eta = 2 instead of 3 is the stronger change at the tight clock:** on the small designs it beats random search on 4 to 7 of 10 designs at 20 to 45 s (mean regret 0.57% against 0.94% at 45 s), and on the larger designs its floor is 0.11% against 0.30%. At the relaxed clock nothing helps: worst-design regret stays 10 to 14%. Descriptive only (many comparisons, eta not tuned); see [`LOG.md`](LOG.md), [`experiments/hedge/results.txt`](experiments/hedge/results.txt).

## Contents
- [`PROPOSAL.md`](PROPOSAL.md): related work (12 checked ids), gap, hypotheses H1 to H5, evaluation, milestones, target venue (MLCAD).
- [`PAPER.md`](PAPER.md): the paper draft (MLCAD target, not submitted); `reproduce.sh` regenerates every number in it from the cached tables.
- [`LOG.md`](LOG.md): research log, with the plan written before the run.
- `designs/`, `src/verified_dse/` (flow and rank statistics), `experiments/rung_bias/` (run, analysis, raw `results.jsonl`), `tests/`.
- Designs: `adder_op`, `adder_ripple`, `mult_op`, `fifo` from [`chip-pnr`](../chip-pnr), `mac4` from [`chip-ppa-sky130mac`](../chip-ppa-sky130mac); `alu8`, `popcount16`, `barrel16`, `crc16`, `cmp_sat` are new, MIT.

## Next steps
Milestone 2: search baselines (random, hill climbing from `chip-scriptsearch`) at equal budget on the cached table; add
larger designs so rung costs separate; then successive halving and BO across rungs (H2, H3).

## Milestone 2 result: do cheap rungs beat plain search at equal wall-clock? (baselines for H2)
Replayed on the milestone 1 table (no flow re-run; per-rung costs measured: R1 0.15 s, R2 0.77 s, R4 1.26 s cumulative). Mean routed regret over 10 designs, tight clock, 400 paired seeds:

| budget | random (R4) | hill climbing (R4) | screen all at R1, verify top | screen all at R2, verify top |
|---|---|---|---|---|
| 10 s | 6.3% | 7.4% | 15.0% | cannot pay |
| 30 s | 2.1% | 1.7% | 5.3% | cannot pay |
| 45 s | 0.94% | 0.61% | 1.08% | 1.27% |

- A one-shot screen on a cheap rung does **not** beat plain random or hill-climbing search at equal wall-clock on this table: R1 screening loses to random on 10 of 10 designs at 10 s, and R2 screening wins on 6 to 8 designs at 45 s but loses by more on the rest, so its mean is worse. Hill climbing helps from 30 s even with sparse neighbourhoods.
- Limits: a pool of about 50 sequences per design makes every strategy converge to 0 regret, so this is the small-budget end only; NSGA-II is not yet run; Hyperband is (milestone 8, `experiments/hyperband/`: no mean-regret gain over random, a thinner tail than SH from R2); ridge, GP-EI and TPE (BOHB's model, single pool, not its bracket schedule) baselines were run in milestones 20 to 23 (`experiments/mf_surrogate/`, `mf_explore/`, `mf_gp/`, `mf_tpe/`) and none beats never cutting on R2. Code and log: `experiments/search_baselines/`, `LOG.md`.
- **Milestone 3 (H2, H3): successive halving across the rungs, replayed on the same table.** Plain halving from the generic-gate rung is the worst strategy at every budget of 10 s or more (about 10% mean routed regret at the tight clock, 8% relaxed, against 0.9% and 0.55% for random routed search at 45 s). Starting at the mapped rung beats random on 6 to 8 of 10 designs at a relaxed clock at small budgets, but its mean regret is still higher because barrel16 and the ripple adder lose 5 to 12%. A 6-point routed pilot that picks the starting rung (calibrated halving) recovers the designs plain halving loses (alu8 16.9% to 0.8%, fifo8x4 17.0% to 2.8%), so H3 holds, but most of that recovery is just "skip the generic-gate rung". Net on this table: no multi-fidelity gain at equal wall-clock yet; the pool (about 50 points) caps halving beyond roughly 30 s. Code and log: `experiments/halving/`, `LOG.md`.

- **Milestone 4 (H4): conformal shortlists, replayed on the same table** (`experiments/conformal/`). Fit routed area x delay from a cheap rung on a 10 to 16 point routed pilot and keep only points whose one-sided conformal bound could still beat the best pilot value. With the **mapped (R2) rung** the optimum is retained 0.99 of the time at nominal 0.90 (0.90 to 0.92 at nominal 0.80) while routing 42 to 57% of the pool, against 0.53 to 0.65 for random search with the same number of routed runs. With the **generic-gate (R1) rung** coverage is 0.65 at nominal 0.80 (0.88 at 0.90), no better than random search of equal cost: **H4 is refuted for R1** and holds for R2. A leave-one-design-out rank shortlist is at or near nominal but needs 89% of the pool with R1 and 33% with R2. Limits: 20 groups from 10 small designs, one corner, wide intervals (`LOG.md`).

- **Milestone 5 (H5): is equivalence-proof success predictable?** (`experiments/proof_success/`). 752 SAT-miter proofs (Yosys 0.33, 10 s timeout) of ABC-rewritten netlists against the unoptimised one, over 15 combinational designs (the milestone-1 designs plus multipliers of width 4 to 10). Rewrites never failed a proof; proof time is set by the design, not the rewrite (median 0.01 s at 4 bits, 2.1 s at 7, 11 s at 8; none of 100 proved in 10 s at 9 and 10 bits). Leave-one-design-out AUC is 0.96 to 0.998 pooled for logistic regression, but an oracle that only knows each design's success rate scores as high, so it is design size and not rewrite quality. Inside the one design with variation (8-bit multiplier, 17 of 50 proved) AUC is 0.65 to 0.78 and the one-feature rule "the rewrite is smaller than the reference" gets 0.81. **Verdict: H5 is vacuously met pooled and unsupported within a design; I would not claim proofs are predictable.** Limits: one solver and timeout, multipliers the only hard family, 10 s label censored. `LOG.md`.
- **Milestone 6 (theory): a regret bound for successive halving** (`experiments/theory/BOUND.md`, `bound.py`). Define a rung's inversion iota = the largest log-factor by which it ranks a truly worse candidate at or ahead of a better one; then halving from any rungs returns a routed value within the sum of the cut rungs' inversions of the pool optimum (proved in three lines; checked on 500 random instances and on all 40 cells of the cached table). It is vacuous for the generic-gate rung (iota above 0.3, a 35% factor, on 8 of 10 groups; bound 0.63 to 0.71) and loose even for the mapped rungs (median iota 0.14 to 0.16; the bound is 0.23 to 0.35 where realised regret from R2 is about 0). A 10-point pilot sees a median 52 to 67% of the inversion but, being a maximum over a subset, can never certify it. The probabilistic (quantile) version, which a guarantee with a stated probability needs, is open. `LOG.md`.
- **Milestone 7b (theory check): is a pilot-checkable halving bound valid, pilot by pilot?** (`experiments/theory/topk.py`, `topk_results.txt`). Random-pair quantiles from a 16-point pilot (7a) cover the realised halving regret in fewer than 80% of pilots in 6 of 40 group-start cells (worst 0.28, the ripple adder). A statistic aimed at the pairs that matter (the pilot's best 3 points against all other pilot points) covers in all 40 (minimum 0.81) but is a median 4.6 times the realised regret, and informative (under 0.1 log units) only for halving from the mapped rung at the relaxed clock (7 of 10 groups). Valid but only useful where the rung is already faithful; no proof for it yet, and the pilot is a third of a 50-point pool. `LOG.md`.
- **Milestone 7c (theory check): how small can the pilot be?** (`experiments/theory/sweep.py`, `sweep_results.txt`). Sweeping the pilot from 6 to 24 points and the "best few" from 1 to 5 on the same 20 groups: the top-3 bound covers the realised halving regret in 86% of regret-bearing cells at m = 6 and 99.5% at m = 24, but its median size grows with m (0.21 to 0.33 log units), so a bigger pilot buys coverage and costs informativeness. Coverage is far above the chance that the pilot holds one of the pool's best three (0.32 at m = 6), so that event is not what makes the bound valid; still empirical, no proof. `LOG.md`.
- **Milestone 24 (second corner): does the rung bias survive SKY130 ss_100C_1v60?** (`experiments/corner_ss/`, 1,200 runs of the milestone-1 protocol with only the liberty changed, `compare.py`). Routed-ADP rankings carry over poorly: median Spearman between corners 0.69, the tt-optimal sequence is still optimal in 8 of 20 design-clock cells and loses a median 3.4% (up to 27%) at ss. R1 stays rank-free (median tau -0.04); R2's median tau with routed falls from 0.71 to 0.60, and cells where picking on R2 alone costs over 10% go from 7 to 3 but on different designs. Limits: one extra corner, liberty only (wire parasitics unchanged), ten small designs. `LOG.md`.
- **Milestone 26 (strategy replay at ss): do halving and never-cut keep their ranking at SKY130 ss_100C_1v60?** (`experiments/corner_replay/`, the milestone 13 grid on the milestone 24 table, 400 paired seeds, no flow run). Not fully: at the tight clock chosen-eta halving beats random R4 only at 20 s and loses at 30 and 45 s (1.35% against 0.75%), where it won at every budget at tt; at the relaxed clock it ties or beats random and eta = 2 reaches 0.25% against 0.59% at 45 s, the clock that was bad at tt. An eta picked on tt beats random at ss relaxed and loses to it at ss tight. Limits: liberty-only corner, ten small designs. `LOG.md`.
