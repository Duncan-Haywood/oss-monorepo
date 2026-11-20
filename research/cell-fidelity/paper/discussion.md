# Discussion: what a modelling engineer can adopt, and what it costs in wall time

Draft discussion section of the `cell-fidelity` paper (follows `paper/results.md`, sections 4.1 to 4.8).
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

## 5.4 Limitations and next steps

Every limitation of section 4.8 carries over. Specific to this section: the fixed cost is measured on two
runners that are not the x-resolved child the triage was scored with (that child was only ever run to
cycle 100, so its own fixed cost cannot be separated from these logs), and the wall times come from a
shared container. The cheapest test of the continuation assumption is to rerun a handful of 7h designs
to cycle 10, checkpoint, resume to cycle 50, and compare both the wall time and the cycle-50 lithium loss
with the uninterrupted runs.

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
measured defect of its fit, not a property of the rule; more sets need degradation parameters that
make `Mohtat2020` or `Ecker2015` fade, reported as a sweep; (2) the continuation test
above, now done (7k, 7l: free if the runner keeps the `Simulation`; packaging that runner is the artefact step); (3) the measured-cell check of the rankings (`PROPOSAL.md`, milestone 6), an owner step that needs
built pouch cells and certified test equipment.
