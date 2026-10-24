# accel-surrogate2d: when the simulator is a 2D finite-element model, does a quantised surrogate (and an accelerator for it) pay? (stylised, preliminary)

Track 8 (task-specific AI accelerators), follow-up to `accel-surrogate`, whose "Next steps" asked for an expensive simulator so the break-even could be met. Here the beam of `accel-surrogate` is meshed as a 2D plane-stress continuum (bilinear quadrilaterals) at two mesh sizes; an 8-32-32-1 MLP imitates each, is quantised to 6 and 8 weight bits, and its error and modelled energy are set against the FE solve. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-surrogate2d/

**Why it seemed worth doing.** `accel-surrogate` found that no surrogate pays for a ~100-flop closed-form beam. This tests the other half: with a real FE solver, does the break-even flip, and what does the surrogate owe the simulator's own discretisation error?

## Headline (all numbers from `experiments/results.txt`)
- **The break-even is met.** The modelled 8-bit MLP costs 3.7 nJ per query (break-even about 1,600 simulator flops). A 32x4 mesh (~56 k flops, banded-Cholesky estimate) costs about 128 nJ of arithmetic, 34 times more; a 64x8 mesh (~516 k flops) about 1,190 nJ, 319 times more (40 and 367 times at 6 bits).
- **At useful mesh sizes the surrogate error is smaller than the simulator's own error.** Against a 128x16 reference mesh the 64x8 FE solve is off by a median 9.2 %, the float surrogate of that FE by 8.7 % and the 6-bit QAT surrogate by 9.2 %. The surrogate's error against its own FE is 2.1 to 2.5 % (float 2.05 %, PTQ 6 bits 2.45 %, QAT 6 bits 2.3 %, 8 bits 2.1 %), which is small beside the 9 % discretisation error. On the 32x4 mesh the FE is off by 30.6 % and the surrogate adds almost nothing (1.4 to 1.7 % against its FE).
- **Caveat on what "error" means.** The Q4 elements here lock (bending is under-predicted), so even 64x8 is not a trustworthy simulator; the comparison says the surrogate adds little *relative to that error*, not that it is accurate. The reference mesh is not converged either (the tests only show it within 12 % of Timoshenko theory for a uniform beam).
- **Quantisation again costs little:** 8 bits is within 0.1 points of float, 6 bits with QAT within 0.3.

## Method
- **Simulator** (`src/accel_surrogate2d/fe2d.py`): same beam as `accel-surrogate` (1 m, E = 70 GPa, nu = 0.33, width 30 mm, tip load 100 N, 8 section heights uniform 20 to 60 mm), bilinear Q4 plane-stress elements with 2x2 Gauss integration, nx x ny mesh, banded Cholesky (SciPy `solveh_banded`). Node columns between segments take the mean of the two heights, so the step is smoothed over one element. Tip deflection is the mid-height node on the free edge. Tests: rigid-body modes of the element stiffness, monotone convergence on a uniform beam, and the 128x16 answer within 12 % of Timoshenko beam theory.
- **Surrogate / cost:** `mlp.py` and `cost.py` are copied from `accel-surrogate` (NumPy MLP, symmetric per-tensor weight quantisation, activations 8 bits; assumed 45 nm energy constants after Horowitz 2014, ISSCC, typed from memory and not re-checked; 2.3 pJ per fp32 flop for the CPU). FE flops are the leading `n * bw^2` banded-Cholesky term, not a profile; memory traffic is ignored, which favours the CPU.
- **Protocol:** 3 seeds, 2,000 training and 500 test designs per mesh; float training 300 epochs, QAT 80 epochs. The discretisation-error comparison uses the first 100 test designs per seed, re-solved on 128x16.

## Reproduce
```bash
pip install numpy scipy
cd research/accel-surrogate2d
python3 -m unittest discover -s tests -v     # 7 tests, ~1 s
python3 experiments/run.py                   # about 21 min; writes results.json, results.txt
python3 experiments/run.py --report          # rebuild results.txt from results.json
python3 experiments/figure.py                # writes figure.svg
```

## Results
`experiments/results.txt`; figure: `experiments/figure.svg`.

## Limitations
- Locking Q4 elements and a smoothed step make the "simulator" inaccurate; a better element (or reduced integration) would lower the discretisation error and could make the surrogate's relative error matter. The reference mesh is not converged.
- Only two meshes, 3 seeds, one small untuned network; differences under ~0.3 points are not resolved. Median errors only.
- Energy is a model with assumed constants; the accelerator was not written in RTL or synthesised. The FE run time per solve (about 25 ms at 32x4 and 90 ms at 64x8 in Python) was not used in the energy figures.
- Surrogate breadth: eight smooth inputs, one scalar output. Nothing here says anything about field outputs or non-smooth responses.

## Next steps
Use a locking-free element (or the reference as training data) so the simulator error is small, then ask how much surrogate error a design loop tolerates; map the 6-bit engine to RTL with `accel-kws`'s serial MAC.

## Owner steps
None. Simulation and arithmetic only.

## Outside dependencies
NumPy (BSD-3), SciPy (BSD-3). Prior work: Horowitz (2014), ISSCC (energy per operation); Jacob et al. (2018), CVPR (integer-only quantised inference); Timoshenko (1921) beam theory; Zienkiewicz and Taylor, *The Finite Element Method* (bilinear quadrilateral and locking).
