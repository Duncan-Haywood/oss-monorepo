# accel-surrogate: can a quantised MLP surrogate of a finite-element beam beat the beam's own model-form error, and when would an accelerator for it pay? (stylised, preliminary)

Track 8 (task-specific AI accelerators), milestone 7 ("accelerators for ... track 5's surrogates"). A small MLP imitates a finite-element (FE) cantilever from `simdesign`'s theme, is quantised to 3 to 8 weight bits, and its error is set against the gap between two beam theories (the `simdesign-fidelity` question) and its modelled energy against the FE solve. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-surrogate/

**Why it seemed worth doing.** The accel chain had been refining engines for the same MLPs. This asks the missing question: what accuracy does a surrogate owe the simulator, and does hardware for it pay at all?

## Headline (all numbers from `experiments/results.txt`)
- **The surrogate does not reach the model-form gap.** Shear deformation (Timoshenko vs Euler-Bernoulli) shifts tip deflection by a median 0.09 % (max 0.25 %). A float 8-32-32-1 MLP trained on 3,000 FE solves has median error 1.66 % (95th percentile 4.9 %): about 18 times the gap, so only 3 % of test designs fall under it. Quantisation cannot fix that; the float model is the limit here (small network, 300 epochs, untuned).
- **Quantisation cost, relative to the float model.** Post-training quantisation: 8 bits +0.1 points of median error, 6 bits +1.4, 5 bits +2.1, 4 bits +5.5, 3 bits +21. Quantisation-aware training (80 epochs, straight-through) recovers most of it: 6 bits is within 0.3 points of float (1.95 % vs 1.66 %), 4 bits 3.8 %, 3 bits 6.4 %. So about 6 bits with QAT, or 8 with post-training quantisation, is the floor for this surrogate.
- **Energy against the solver.** Modelled MLP inference is 3.7 nJ at 8 bits and 3.2 nJ at 6, against about 407 nJ of arithmetic for the 64-dof FE solve on a CPU, roughly 110 times. But the break-even is only about 1,600 simulator flops at 8 bits, and the closed-form Euler-Bernoulli integral for this beam costs on the order of 100 flops. **For this simulator no surrogate or accelerator pays**; it would only for a solver with thousands of flops per query or more (a 2D/3D FE model, say), which is where a follow-up should look.

## Method
- **Simulator** (`src/accel_surrogate/beam.py`): 1 m aluminium-like cantilever (E = 70 GPa, width 30 mm, tip load 100 N), 8 piecewise-constant section heights drawn uniformly from 20 to 60 mm; Hermite Euler-Bernoulli beam elements (4 per segment) solved densely. Checked against the exact unit-load integral to 1e-6 (tests). The **gap** is the closed-form Timoshenko shear term (kappa = 5/6, nu = 0.33) divided by the Euler-Bernoulli deflection.
- **Surrogate** (`mlp.py`): 8-32-32-1 ReLU MLP on normalised heights, target the standardised log deflection, NumPy Adam. Weights symmetric per-tensor to k bits, activations 8 bits at evaluation. Error is the relative error of the deflection, `|exp(pred - true) - 1|`.
- **Protocol:** 5 seeds, each with 3,000 training and 1,000 test designs; PTQ quantises the float model; QAT fine-tunes it for 80 epochs at the target width.
- **Cost** (`cost.py`): the serial-MAC model of `accel-sparse` (constants copied, all assumed, 45 nm orders of magnitude after Horowitz 2014, ISSCC, typed from memory and not re-checked), and 2.3 pJ per fp32 flop for the CPU (assumed mean of add and multiply). The FE flop count is a dense-LU estimate (2/3 n^3 on 64 dof), not a profile.

## Reproduce
```bash
pip install numpy
cd research/accel-surrogate
python3 -m unittest discover -s tests -v     # 8 tests, <1 s
python3 experiments/run.py                   # about 30 s; writes results.json, results.txt
python3 experiments/run.py --report          # rebuild results.txt from results.json
```

## Results
See `experiments/results.txt` (variant, weight bits, median and 95th-percentile error, share of designs under the gap, energy, break-even flop count).

## Limitations
- One tiny network and one smooth, low-dimensional problem; the float error floor (1.7 %) comes from an untuned recipe, so a larger or longer-trained model would move every row down. The headline "misses the gap" is about this recipe, not surrogates in general.
- Energy is a model with assumed constants; the CPU figure ignores memory traffic and the FE count is estimated. The accelerator was not written in RTL or synthesised.
- The gap used as a tolerance is one choice of tolerance; a design review might demand something looser (then 4-bit QAT passes at about 4 %).
- Only dispersion across test designs is shown, with 5 seeds; differences under about 0.3 points are not resolved.

## Next steps
Make the simulator expensive (2D plane-stress FE from `simdesign-fidelity`) so the break-even is met; train longer or wider to reach the gap; map the 6-bit engine to RTL with `accel-kws`'s serial MAC and compare cells.

## Owner steps
None. Simulation and arithmetic only.

## Outside dependencies
NumPy (BSD-3). Prior work: Horowitz (2014), ISSCC (energy per operation); Jacob et al. (2018), CVPR (integer-only quantised inference); Timoshenko (1921) beam theory.
