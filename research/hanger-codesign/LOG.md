# Research log: hanger-codesign

Newest first. Write the hypothesis and the planned analysis before running an experiment, then the outcome.

## 2026-11-10 · Milestone 1: does the 2D chain's choice of hanger survive in the 3D sheet on four fabrics with measured KES-FB bending rigidity and weight? (predictions in `experiments/m1_kes_fidelity/run.py`'s docstring, written before the first run)
- Why: every hanger design in track 18 so far comes from the 2D chain or the 3D sheet on assumed fabrics; `hanger-kes` sourced B and W for four fabrics but scored only the 2D chain. Before building a validated top tier (milestone 3), check whether the two cheap tiers even agree with each other on measured fabrics, on the decisions that matter: which stock hanger, which arm width.
- Plan: size M, EA 150 N/m, fabrics A to D of `hanger-kes`; three stock hangers and the wood-shaped profile at width offsets -1 to +3 cm; 2D chain at 5 mm rows, 3D slab arm (centre column), 3D 3 cm half-depth arm (whole sheet); a 3000-vs-6000-iteration convergence check on the softest and stiffest fabric.
- Predictions: P1 same stock ranking in all three models on all fabrics; P2 best offset identical in 2D and 3D slab; P3 3 cm arm's best offset within 1 cm of 2D; P4 |3D slab − 2D| under 0.10 cm for the wood-shaped hanger.
