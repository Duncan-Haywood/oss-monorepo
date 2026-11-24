# Discussion: what a modelling engineer can adopt, and what it costs in wall time

Draft discussion section of the `cell-fidelity` paper (follows `paper/results.md`, sections 4.1 to 4.9).
Produced with AI assistance (Claude). Numbers come from `paper/tables.json` (results) and
`paper/cost.json` (this section's time accounting); one command each regenerates them and the figures:

    python3 research/cell-fidelity/paper/tables.py
    python3 research/cell-fidelity/paper/cost.py       # wall-time accounting, stdlib, < 1 s
    python3 research/cell-fidelity/paper/figures.py    # fig1_insample.svg, fig2_outofbatch.svg, fig3_time.svg

The time accounting was done for this section, after every milestone had reported, from wall times
already logged with the committed runs. It tests no hypothesis. All results are PyBaMM 26.10.1.1 DFN
simulations, not measured cells.

## 5.1 The recipe

The results support a three-step recipe for a design search that ranks electrode designs by
DFN-forecast lithium loss at cycle 100:

1. **Run every candidate design to cycle 10** and fit the fade law's line. On its own this forecast's
   tail error is 1.7 to 3.4 times that of a 50-cycle fit (Table 1), so it is not good enough to rank on.
2. **Score each design's drift risk** S<sub>C</sub> = |m&#770;<sub>C</sub> &minus; 1| from where the
   plating sits at cycle 2 (section 4.4). The score costs no extra simulation.
3. **Run the flagged designs on to cycle 50,** flagging by an absolute threshold on S<sub>C</sub> whose
   margin is set by nested leave-one-pool-out on earlier batches (section 4.6). Leave the rest at 10.
4. **Correct the ten-cycle forecast where the training designs drift** (conditional; section 4.7, Table 3).
   Fit the correction on the training pools and switch it on by a gate read out of fold: the drift-size
   gate (median |m &minus; 1| &ge; 0.10 on the training designs) or the out-of-fold error gate. Neither
   tests whether the drift runs one way, which is where the correction actually pays; both are on for
   most published sets, whose drift runs both ways, and cost +3.25 (drift gate) and +1.88 (error gate)
   cycles per design there with 17 of 20 folds met against step 3's 19.
   Where it is on, every design stops at ten cycles. Over eight set-conditions, three of them tuned plating
   cells and one an engineered plating-free cell, this saves 14.7 (drift gate) and 15.4 (error gate) DFN
   cycles per design against step 3 alone (set bootstrap upper ends &minus;1.8 and &minus;3.1) at 36 of 40
   folds met against 35. Up to milestone 7zb this step said "only on cells known to be plating-limited";
   7zc's plating-free cell gains as much, and a gate on plating share switches it off there, so plating
   share is dropped as the condition (7zc, 7zd).
   Milestone 7ze adds the direction test as a third gate (gS: the drift gate, and at least 80% of the
   training designs drifting the same way). It switches the correction off on three of the four published
   sets (direction shares 0.50 to 0.75) and is the cheapest deployable gate over the eight conditions,
   &minus;15.4 cycles per design against step 3 (&minus;28.0 to &minus;3.2; 20 cheaper, 4 dearer, p = 0.002)
   at 37 of 40 folds met. It does not fix `NCA_Kim2011`, whose designs drift one way (share 0.93 to 0.97),
   so on the published sets it still costs +1.75 cycles per design with 18 of 20 folds against 19. The
   recipe's default gate is therefore gS, with the caveat that it was designed after seeing what gD missed.

Figure 2 places every out-of-batch look at this rule against its two rivals. The threshold rule met the
tail target on 75% to 95% of held-out pools at 38 to 44 DFN cycles per design. Running every design to a
fixed length met as often or more (95% to 100%) but at 48 to 50 cycles. Frozen and applied to 96
designs nothing had simulated, the rule met 18 of 24 policy-pool pairs at 40.5 cycles per design
(section 4.6, finding 1).

What the recipe does not license. The in-sample savings of Figure 1 (33% to 61%) are hindsight; the
honest number is the out-of-batch one, a seventh to a fifth of the DFN cycles. Without the out-of-batch
margin the rule fails (3 of 12 folds met at zero margin). And with four parameter sets the threshold
rule's advantage over a uniform length is consistent fold by fold (sign test p = 0.031 over 20 folds) but
its interval across chemistries still includes zero (&minus;8.5 to +0.25 cycles per design).

## 5.2 The saving in wall time

Sections 4.5 and 4.6 count DFN cycles. A run also has a fixed cost: building and discretising the model and
the first solve. From the 192 designs that milestone 5l ran both to cycle 10 and to cycle 100 with the
same runner (`experiments/fade/bench.jsonl`), a straight line t(k) = a + bk through each design's two wall
times puts that fixed cost at a median of **5.66 cycles' worth** (IQR 4.65 to 6.18). A least-squares
fit to the per-cycle end times of 2a's 49 thirty-cycle DFN runs (`experiments/horizon`) gives a smaller
2.63 (IQR 2.04 to 3.01), so the true figure depends on the runner; both are reported.

The fixed cost matters because of how many designs the rule flags. At 40.5 cycles per design with
extension to cycle 50, the flagged share is (40.5 &minus; 10) / 40 = **76%**: the triage rule saves by
leaving a quarter of the designs at cycle 10, not by extending a few. Two ways to run a flagged design on
then give very different answers (Figure 3, `paper/cost.txt`):

- **Continue the cycle-10 run to cycle 50.** The fixed cost is paid once and the cycle saving carries
  over almost whole: 19.1% fewer cycles is **17.1% less wall time** at the pooled fresh-pool rate
  (12% to 22% across the looks of Table 2). This is what the cycle counts in section 4 assume.
- **Restart flagged designs from cycle 0.** A flagged design then pays the fixed cost and ten cycles twice.
  The pooled saving becomes a **4.3% loss** against simply running every design to cycle 50, and only
  one look of Table 2 (7g's refit policies on the 7h pool, 70% flagged) stays positive, at 2.3%.
  Restarting breaks even with U50 only when at most 72% of designs are flagged (76% at the horizon
  cross-check's fixed cost).

So the triage rule is worth adopting only in a toolchain that can continue a run: checkpoint the
solution at cycle 10 and resume it. PyBaMM's `Simulation.solve` accepts a `starting_solution`, but this
programme's runner simulates all 100 cycles in one experiment and has not tested continuation; the
continuation numbers assume the resumed run costs the same per cycle as an uninterrupted one. A
uniform length has no such requirement, which narrows the practical gap between the two rules
whenever runs cannot be resumed.

**Tested in milestone 7k, and the assumption failed.** Sixteen 7h designs were run to cycle 10, saved,
and resumed to cycle 50 with `starting_solution` in a new process (`experiments/resume7k`). The resumed
state matched the uninterrupted run to within 5 &times; 10<sup>&minus;5</sup> in cycle-50 lithium loss, but
the resume paid the fixed cost again (13.4 cycle equivalents against 11.8 for a fresh run, on that
bench's lean recorder), so the cycle-10 run plus its resume took 1.22 times one uninterrupted run. Priced
in, the continued saving is about &minus;1% in that bench's units and 8% scaled to 7j's runner, not 17%.
The saving needs a runner that keeps the built model between the look and the extension.

**Tested again in milestone 7l, and the condition is easy to meet.** Kept alive, one `Simulation` built
with a 10-cycle experiment and solved again from its own last solution reaches cycle 50 in a median 1.000
times one uninterrupted run (IQR 0.95 to 1.06; extra cost 0.02 cycle equivalents against a fixed cost of
6.34), with a bit-identical cycle-50 state; a 1-cycle-chunk runner pays 0.03 cycles per extra call
(`experiments/keep7l`). The rebuild, not the continuation, was 7k's cost. With continuation free the
triage saves 16.9% of wall time in that bench's units and 17.1% on 7j's runner. Because the absolute
threshold scores a lone design, each design's process can take the cycle-10 look and stop or extend by
itself, with no checkpoint written to disk.

In absolute terms the numbers are small for one search and large for a design office. On the shared
three-worker cloud container that ran 7g and 7h, a 100-cycle x-resolved DFN run took a median 8.9 s
(`Chen2020`) to 29.1 s (`Ai2020`). Running 1000 designs to cycle 50 then costs 1.3 to 4.3 CPU-hours, and
continued triage at the pooled rate gives back 0.22 to 0.73 of them. These seconds price relative cost
on one machine; a workstation or a commercial P2D code will differ in level, and the fixed-cost share,
not the level, is what decides the continue-or-restart question.

## 5.3 Why ten cycles say anything about drift

The rule works because one model internal at cycle 2, the depth of lithium plating into the negative
electrode, predicts whether a design's fade rate will drift from its ten-cycle slope (Spearman 0.80 on
both LG M50 sets, section 4.4). Where that link is weak (`Ai2020` 0.37, `NCA_Kim2011` &minus;0.08) the
score still ranks better than random flagging in sample (Table 1) but the margin has to do more of the
work. Two consequences for a reader:

- The score reads a quantity a real cell exposes only through a diagnosis (three-electrode or
  post-mortem measurement). In a simulation-only search that is free; for a measured-cell programme
  it is a cost the recipe does not count.
- The law's own floor, not its inputs, is now the larger part of the forecast's error on fresh LG M50
  designs (section 4.2, 7a). Better inputs for the ten-cycle forecast will not by themselves close the gap
  to a 50-cycle fit; that is why the recipe extends runs rather than correcting forecasts.
- Milestone 7t says why the forecast gets worse when plating is faster. On the two tuned cells, plating
  per cycle over cycles 90 to 99 falls to 0.24 to 0.30 of its cycle 2 to 10 rate at plating multiplier 30
  (0.51 to 0.56 at 10). Designs that throttle more drift more (Spearman 0.83 to 0.88). Across all eight
  set-conditions the median throttle orders the median drift (&rho; = &minus;0.81, p = 0.024). The bend runs
  through cycle 99, so no look up to 50 cycles brings the f = 30 error back to the f = 10 ten-cycle error.
  On throttling cells a longer straight line only chases the bend.
- Milestone 7u finds the remedy already in the recipe. The early sign of the throttle, the bend of
  lithium plated over cycles 2 to 10, equals 7c's O3 (the bend of all lithium lost) to within 3e-4 on
  these plating-dominated cells, and 7c's correction picks O3 on every f = 30 fold. Leave-one-pool-out, it
  cuts the f = 30 median cycle-99 error from 0.105 to 0.038 and from 0.249 to 0.072, below the f = 10
  straight-line error and below a straight 50-cycle look. On these cells, correct the ten-cycle forecast
  rather than lengthen it.
- Milestone 7v puts that correction inside the rule, in place of the straight-line ten-cycle forecast,
  with nothing else changed. On both f = 30 cells every held-out fold then stops every design at ten
  cycles and meets its target (10 of 10), 30 DFN cycles per design below a uniform run length (40) and
  35.5 below the uncorrected rule. A uniform run length on the corrected forecast also stops at ten, so
  on these cells the recipe reduces to "run ten cycles and correct"; the flag has nothing left to catch.
  At f = 10 the saving is uneven (&minus;36 cycles on `Ecker2015`, &minus;2.4 on `Mohtat2020`, where the
  corrected rule meets 2 of 5 folds).
- Milestone 7w runs the same swap on the four committed sets, and there it does not pay. Against the
  uncorrected rule it costs +1.4 DFN cycles per design and meets the target on 16 of 20 folds instead of
  19. On `Ai2020` the observable the correction picks (O2) does not carry over to the held-out pool, and
  the median ten-cycle error rises from about 0.04 to about 0.4. On `Chen2020` and `OKane2022` it changes
  little, and only `NCA_Kim2011` gains. A post-hoc gate on the training pools' medians gives the same cost
  as the uncorrected rule but fewer folds met. So the recipe of section 5.1 stands as written. Correcting
  the ten-cycle forecast is a conditional step for cells where one early-visible mechanism (here plating)
  dominates the fade, and the decision to apply it has to be made out of fold.
- Milestone 7x makes that decision out of fold. Every corrected error the rule is scored on (the gate, the
  margin's inner folds and the final pick) comes from a correction fitted without that row's pool. The
  gate turns the correction off on every `Ai2020` fold and keeps the plating cells' full saving
  (&minus;30 cycles against U at f = 30), but on the committed sets the gated rule meets 17 of 20 folds,
  not the uncorrected rule's 19, at +1.9 cycles per design. Without a gate, removing 7w's leak gives the
  same 17 of 20. The remaining misses come from pool shift: on three sets the correction wins on every
  training pool out of fold and still fails on one held-out pool. Four pools of 8 to 16 designs cannot
  separate such a set from a plating cell, so the condition for correcting has to come from mechanism
  (how far one reaction dominates the early lithium loss), not from the training errors alone.

- Milestone 7y tries the two signals that were left: a mechanism gate (correct only where plating is at least 90%
  of the lithium lost over cycles 2 to 10) and a drift-size gate (correct only where the training designs' median
  |m &minus; 1| is at least 0.10), both fixed before they were scored. Neither separates the sets. Plating is 99.1 to
  99.9% of the early loss on every design of `Chen2020`, `OKane2022` and `NCA_Kim2011`, so the plating gate repeats
  7x's choice (17 of 20 at 45.4 cycles). The committed sets drift per design as far as the plating cells (median
  |m &minus; 1| 0.12 to 0.26, against 0.19 and 0.42 at f = 30), only in both directions, so the drift gate is on almost
  everywhere and costs +3.25 cycles per design against triage alone. A per-set oracle that knows the held-out
  outcome picks the straight forecast on all four committed sets. So the correction's value is confined to the
  tuned plating cells, and no training-pool signal in this programme states that condition in advance:
  `NCA_Kim2011` has one-directional drift (0.23) and plating-dominated loss and still misses one held-out pool.
- Table 3 (section 4.7) puts 7w to 7y side by side. Fold for fold the plating gate repeats 7x's error gate on
  all 30 six-set folds and the drift gate repeats the ungated honest rule, so three gates amount to two
  decisions, and the best of them reaches 89% of the hindsight oracle's six-set saving while meeting two
  fewer committed folds than triage alone.
- Milestone 7za checks that reading out of sample on `Marquis2019` at 30 times the copied plating rate, a cell
  added after every rule and gate was fixed and the first whose drift runs above 1 (median m 1.29). The honest
  corrected rule meets 4 of 5 held-out pools at 14.6 cycles per design, where triage alone meets 2 of 5 at 34.8
  and a uniform run length 4 of 5 at 44.0. All three plating cells now save about 30 cycles per design against
  the uniform rule (&minus;29.8, set bootstrap &minus;30.0 to &minus;29.4), whichever way their drift runs. Over
  seven set-conditions the plating-share recipe saves &minus;12.0 cycles per design against triage alone
  (&minus;25.0 to +0.1) and meets 31 of 35 folds against 30. The interval still touches zero, and
  `NCA_Kim2011` remains the case the mechanism condition does not explain.

## 5.4 Limitations and next steps

Every limitation of section 4.9 carries over. Specific to this section: the fixed cost is measured on two
runners that are not the x-resolved child the triage was scored with (that child was only ever run to
cycle 100, so its own fixed cost cannot be separated from these logs), and the wall times come from a
shared container. The cheapest test of the continuation assumption is to rerun a handful of 7h designs
to cycle 10, checkpoint, resume to cycle 50, and compare both the wall time and the cycle-50 lithium loss
with the uninterrupted runs.

Milestone 7zb tried to separate the two readings of where the corrected forecast pays (plating-dominated loss, or large one-directional drift) with a cell that drifts without plating. It could not build one: with plating off, no multiplier from 10 to 10<sup>6</sup> on `Marquis2019`'s SEI solvent diffusivity brings its cycle 2 to 20 lithium loss above 0.96% of n<sub>Li</sub>, because the film's resistance ends the charge step early and the loss limits itself.

Milestone 7zc removed the film's resistance and built the cell: with plating off and SEI film resistivity set to zero, the 10<sup>5</sup> rung loses 3.7% of n<sub>Li</sub> over cycles 2 to 20, grows as &radic;t, and drifts further from the straight forecast than any plating cell (median m 0.365). On it the corrected rule meets 5 of 5 folds at 10.0 DFN cycles per design against triage's 49.2, the plating-share gate is off on every fold and the drift gate on. Milestone 7zd gave the film back 200, 2,000 and 20,000 &Omega;&nbsp;m (a thousandth to a tenth of `Marquis2019`'s 200,000) and nothing changed: same fade band, same drift, same gate decisions, 5 of 5 folds at 10.0 cycles on every rung; the charge choking of 7zb sets in between 2 &times; 10<sup>4</sup> and 2 &times; 10<sup>5</sup> &Omega;&nbsp;m. Drift size, not plating, is what makes the correction pay, and step 4 of the recipe (section 5.1) now gates on it. Two limits go with that change. The cell is engineered and tests the gate's logic, not a measured cell; whether real SEI films sit below or above the takeover resistivity is a literature question still open. And the eight-set interval against triage excludes zero only because this cell is in it (Table 3, finding 9).

For the paper, in order of value: (1) a fifth and sixth parameter set, since across-chemistry spread,
not the number of pools, now limits the main claim (section 4.6, finding 2). Milestone 7p tried this and
found that PyBaMM's stock cells do not supply one under this protocol. Of eight conditions on the four
unused cells, `Mohtat2020`, `Ecker2015` and `Marquis2019` lose 0.08 to 0.61% of their cyclable lithium
from cycle 2 to 20 even at 3x to 4x current (the four committed sets lose 4.8 to 17%). On
`Ramadass2004@1x`, the only one that fades, the ten-cycle lithium-loss forecast breaks upstream of
triage (cycle-99 error q75 12.6), so every rule stops at cycle 10 and the pooled interval stays at
&minus;7.53 to +0.33 cycles per design. Milestone 7q found why: PyBaMM's `lico2_ocp_Ramadass2004` is a rational fit
evaluated at 1.13 y, and the stretch puts three narrow pole-zero pairs inside 0 < y < 1, the last at
y = 0.889, in the cycling range. The DFN cells charge a median 9.8% of their cathode per cycle (28 to
44% on the committed sets) and half of them step across that pole. No repair of the table the law
reads fixes the forecast: a running-maximum envelope cuts the cycle-10 error q75 from 12.6 to 0.90,
still eight times the committed sets', and bridging the spikes is worse. As a fifth set the repaired
cell makes the rule dearer (+8.4 cycles per design) and widens the interval to &minus;7.53 to
+3.81. So the paper states its breadth as four parameter sets and excludes `Ramadass2004` for a
measured defect of its fit, not a property of the rule. Milestone 7r then made `Mohtat2020` and
`Ecker2015` fade by scaling only their plating exchange-current density, by the smallest step (10) of
a pre-registered ladder that brought four probe designs into the committed sets' fade range. On both
the forecast works (cycle-10 error q75 0.074 and 0.201) and all 112 designs finish 100 cycles. With
them as a fifth and sixth set, the threshold rule's mean saving over the uniform run length is
3.73 cycles per design, set bootstrap 95% &minus;6.94 to &minus;0.57, the first interval in this
paper that excludes zero across chemistries. Two qualifications go with it: the new sets are tuned
cells, so the result is breadth over electrode chemistry at matched fade, not over published
parameterisations; and on `Mohtat2020` the rule meets its tail target on only 2 of 5 folds (the
uniform rule on 3), so one of the thirty paired savings is bought with a miss (26 against 27 folds
met overall). Milestone 7s reran the same code at the ladder's other passing step (30), and the interval did not hold: on the faster-fading tuned cells the rule is dearer than a uniform 40 cycles (+5.5 cycles per design over 10 folds, 7 dearer, 1 cheaper) while meeting its target on 9 of 10 folds, and the six-set interval is &minus;6.19 to +3.75. The paper therefore states the across-chemistry result as the four-set interval (&minus;8.50 to +0.25), with the tuned cells as a sensitivity range whose sign depends on the chosen plating rate. Milestone 7z added the last stock PyBaMM cell the design mapping accepts, `Marquis2019`, by the same ladder (its probe chose 30): over seven set-conditions at each cell's probe-chosen rate the interval is &minus;7.55 to &minus;1.43 (&minus;4.52 cycles per design, 21 folds cheaper, 6 dearer), and with the 7r cells at 30 it is &minus;6.86 to +2.48. On `Marquis2019` the rule meets 2 of 5 folds against the uniform rule's 4, so on three tuned cells of three the cheaper rule buys part of its saving with misses (28 against 31 of 35 folds met); (2) the continuation test
above, now done (7k, 7l: free if the runner keeps the `Simulation`; packaging that runner is the artefact step); (3) the measured-cell check of the rankings (`PROPOSAL.md`, milestone 6), an owner step that needs
built pouch cells and certified test equipment.
