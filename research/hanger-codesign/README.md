# hanger-codesign: how good does a cloth simulator have to be before the laundry-robot hanger it designs is the right one?

A research programme (opened 2026-11-10) on designing a laundry robot's hangers in a cloth
simulation: how much simulator fidelity and how much measured fabric data the design loop needs
before the hanger it picks is still the best one on a validated, calibrated cloth solver. **First
result (milestone 1): on four fabrics with published KES-FB bending rigidity and weight, our 2D
chain and 3D sheet agree on every hanger decision (the wood-shaped hanger, with an arm 1 cm wider
than the half shoulder), but on a deep arm they agree to 0.004 cm because they are the same
model, so the agreement says nothing about fidelity; and on a 3 cm deep arm the solver's own
convergence error (0.05 to 0.11 cm) is as large as the margin that decides the arm width (0.08
to 0.13 cm). Milestone 1b solves those cases to convergence. The 3 cm arm's best width then moves
to +1.5 cm on all four fabrics, while the 2D chain stays at +1.0 cm: the tiers disagree by 0.5 cm,
and the iteration cap had hidden it by flattering narrow arms (bias +0.22 cm at -1 cm, -0.07 cm at
+3 cm).** Produced with AI assistance (Claude). Research track 18 (`hanger`,
`research/PROJECTS.md`). Simulation only; nothing here is a measurement of real garments.

**Live page:** https://marisstella.app/research/hanger-codesign/

![Shape error against arm width offset on fabric D for three model tiers](experiments/m1_kes_fidelity/err_vs_offset_D.svg)

## Milestone 1b: the 3 cm arm, solved to convergence

`experiments/m1b_converged/run.py`. Same models and fabrics as milestone 1; wood-shaped profile on
the 3 cm half-depth arm, offsets -1 to +3 cm with +0.5 and +1.5 added; L-BFGS in 3000-iteration
chunks until the whole-sheet error moves under 0.002 cm over a chunk (12,000 to 24,000 iterations;
all 28 cases met it). The first chunk reproduces milestone 1. Predictions were written before the run.

![Shape error against arm width on fabric D: 3000-iteration and converged 3D solves, and the 2D chain](experiments/m1b_converged/converged_vs_capped_D.svg)

| | prediction | outcome |
|---|---|---|
| Q1 | converged best integer offset still +1 cm | **refuted** on fabric D (+2 cm, by 0.066 cm); A to C keep +1 by only 0.020 to 0.033 cm |
| Q2 | margin more than twice the solver residual | held (8 to 25 times) |
| Q3 | 3000 iterations underestimate every case | **refuted**: the bias depends on width, +0.22 cm at -1 cm, +0.13 at +1, -0.07 at +3 |
| Q4 | converged half-cm best in [+0.5, +1.5] | held: +1.5 cm on all four fabrics |

Post hoc, the 2D chain on the same grid picks +1.0 cm on every fabric (`posthoc_2d.txt`), sharply.
So the converged shallow arm and the 2D chain disagree by half a centimetre of arm width. The
3000-iteration solves agreed with the 2D chain only because stopping early favours narrow arms. A
tier comparison is only as good as its stopping rule, so the programme now judges convergence
against the decision margin, not against a fixed iteration count.

## The programme

[`PROPOSAL.md`](PROPOSAL.md) has the question, 19 related works, the gap, four hypotheses
(rank robustness across solver tiers, which fabric tests are enough, whether calibration changes
the choice, whether a multi-fidelity loop pays), the method, the evaluation and the milestones.
Target: *IEEE Robotics and Automation Letters*. [`LOG.md`](LOG.md) records each step's
predictions before its run, then the outcome.

## Builds on

This repository's track 18 projects, reused unchanged: [`hanger-fit`](../hanger-fit) (2D chain,
stock hangers, worn-shape score), [`hanger-3d`](../hanger-3d) (3D sheet over an arm of finite
depth) and [`hanger-kes`](../hanger-kes) (four fabrics with B and W from Ramaiah, Radhalakshmi
and Nachane, Table 3, a fibre2fashion.com PDF). Cloth model: Baraff and Witkin (1998,
doi:10.1145/280814.280821) springs and Bergou et al. (2008, doi:10.1145/1360612.1360662)
bending. The rest of the literature is in the proposal. **Lab tags:** none.

## Milestone 1: do the cheap tiers agree on measured fabrics?

`experiments/m1_kes_fidelity/run.py`. Size M, stretch stiffness EA 150 N/m (assumed; not in the
source table), fabrics A to D of `hanger-kes` (B 0.0066 to 0.1249 gf·cm²/cm, W 12.5 to 24.6
mg/cm²). Three tiers: the 2D chain at 5 mm rows, the 3D sheet on a slab arm (centre column), and
the 3D sheet on a 3 cm half-depth arm scored over the whole sheet. Predictions were written
before the run (docstring and `LOG.md`).

Results (`experiments/m1_kes_fidelity/results.txt`):

| | prediction | outcome |
|---|---|---|
| P1 | same stock-hanger ranking in all tiers on all fabrics | **refuted, on a tie**: wood-shaped is best everywhere; on fabric D the 2D chain scores wire and plastic both 3.201 cm |
| P2 | best width offset the same in 2D and 3D slab | held: +1 cm on all four fabrics |
| P3 | 3 cm arm's best offset within 1 cm of 2D | held: +1 cm on all four |
| P4 | wood-shaped 3D slab within 0.10 cm of 2D | held: at most 0.004 cm |

- Wood-shaped hanger: 0.38 to 0.47 cm RMS from the worn shape on the slab arm, 1.97 to 2.14 cm
  over the whole sheet on the 3 cm arm. Wire and plastic: 3.1 to 3.4 cm and 4.4 to 4.7 cm.
- Convergence (3000 against 6000 L-BFGS iterations, wood-shaped): 0.0004 cm on the slab arm,
  0.110 cm (A) and 0.049 cm (D) on the 3 cm arm. The 3 cm arm's margin between the best and the
  next width is 0.126, 0.111, 0.115 and 0.077 cm on A to D.

What it means: the cheap tiers do not disagree, but that is weak evidence. On a deep arm the 3D
sheet reduces to the 2D chain, and where it adds physics its answer is not converged tightly
enough to separate the width choices with margin. Testing H1 needs the validated top tier
(milestones 3 and 4) and a stopping rule tied to the decision margin, not an iteration cap.

## Limitations

EA assumed and fixed; one garment size and one 20 cm strip, not a shirt; one hanger profile for
the width sweep; no friction; the four fabrics are unfinished and come from a trade-site PDF;
no validated solver yet; no real garment.

## Next steps

1. Milestone 2: a simulated Cusick drape test on the 3D sheet, against a sourced table that
   gives drape coefficient, B and W for the same fabrics.
2. Rerun the 3 cm arm cases to a gradient tolerance and report the width margin with its
   solver error.
3. Milestone 3: build an open validated solver (ARCSim or C-IPC) as the top tier.

## Reproduce

```bash
cd research/hanger-codesign
python3 -m unittest discover -s tests              # 4 tests, under 1 s; needs numpy
python3 experiments/m1_kes_fidelity/run.py         # about 4 min on 4 cores
python3 experiments/m1_kes_fidelity/figure.py      # the SVG above, stdlib only
```
