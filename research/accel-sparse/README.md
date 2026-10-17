# accel-sparse: when does a task's accuracy tolerance let the hardware drop multipliers? (stylised, substitute task, preliminary)

Fifth milestone of track 8 (task-specific AI accelerators) in `PROJECTS.md`. A small MLP is pruned, quantised to 4 or 8 bits, or made ternary or binary, and each variant's accuracy is set against a modelled energy per inference for a serial engine. The question is whether the accuracy slack lets the engine drop multipliers altogether. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-sparse/

**Substitute task, said up front.** The milestone is written for the keyword-spotting task of `accel-kws`. Speech Commands could not be downloaded in this run (the dataset host returned HTTP 403 through the sandbox proxy), so the sweep runs on scikit-learn's bundled 8x8 handwritten-digit set instead (1,797 images, 10 classes, 4-bit pixels; the UCI Optical Recognition of Handwritten Digits test set of Alpaydin and Kaynak, as shipped with scikit-learn). It is a toy stand-in: the numbers say nothing about keyword spotting. The method and cost model carry over, and the sweep can be re-run on `accel-kws` features once the data is reachable.

**Builds on.** `research/accel-kws` (energy constants, serial-MAC engine idea) and `research/accel-policy` (its next steps name this milestone). Ideas used, none reproduced: magnitude pruning with gradual sparsity (Zhu and Gupta 2017, "To prune, or not to prune", arXiv:1710.01878; Han et al. 2015, "Learning both weights and connections for efficient neural networks", NeurIPS), ternary weights (Li and Liu 2016, "Ternary weight networks", arXiv:1605.04711; the 0.7*mean|w| threshold rule is theirs), binary weights (Courbariaux et al. 2015, BinaryConnect, NeurIPS), straight-through gradients (Bengio et al. 2013, arXiv:1308.3432). Energy figures are in the spirit of Horowitz (2014), ISSCC (not re-checked). The citation details above were written from memory and **not re-verified in this run**. No CU Boulder group's work is built on or implied.

## Method
- **Model.** 64-32-10 ReLU MLP, NumPy Adam (lr 3e-3, batch 64), straight-through gradients to latent float weights. Inputs are the native 4-bit pixels; hidden activations are fake-quantised to 8 bits (scale from the training set) at evaluation only.
- **Designs (14).** float32 dense; int8, int4 dense (symmetric per-tensor); ternary; binary (all quantisation-aware from scratch, 150 epochs); int8 with magnitude pruning to 50, 75, 90, 95, 98% (60 dense epochs, then 180 with a cubic sparsity schedule, pruned weights held at 0); ternary pruned to 50, 75, 90%.
- **Splits.** 10 stratified 60/20/20 splits with different seeds (test set 360 images each); drops are paired against float32 on the same split.
- **Cost model** (`src/accel_sparse/cost.py`, every constant assumed, reused from `accel-kws`): per weight, a read of `wbits` plus a read of the activation (0.16 pJ/bit), an 8x8 multiply scaled by bit widths (0.2 pJ), a 24-bit add (0.075 pJ). Ternary and binary designs replace the multiply by a 0.01 pJ conditional negate and add only nonzero weights. Pruned designs are stored sparsely (value plus a column index of ceil(log2 fan-in) bits per nonzero) and cost nothing for zeros. Dense ternary and binary store 2 and 1 bits per weight with clock-gated adds.
- **Not done.** No RTL, no Yosys area (neither tool was installable here), so area is storage bits only. The lookup-table inference named in the milestone was not attempted. Pruning and quantisation are not combined beyond int8 and ternary.

## Reproduce
```bash
pip install numpy scikit-learn matplotlib
cd research/accel-sparse
python3 -m unittest discover -s tests -v     # 7 tests, <1 s
python3 experiments/run.py                   # about 2 min; writes results.json, results.txt
python3 experiments/run.py --report          # rebuild results.txt from results.json
python3 experiments/figure.py                # writes experiments/frontier.png
```

## Results (from `experiments/results.txt`; mean over 10 splits)
| design | test acc. | drop vs float32 (paired, se) | nonzero weights | energy (nJ) | storage (kbit) |
|---|---|---|---|---|---|
| float32 dense | 0.972 | 0 | 2368 | 15.1 | 75.8 |
| int8 dense | 0.971 | +0.001 (0.001) | 2333 | 5.2 | 18.9 |
| int4 dense | 0.968 | +0.004 (0.002) | 1771 | 3.6 | 9.5 |
| ternary | 0.958 | +0.014 (0.005) | 1262 | 2.7 | 4.7 |
| binary | 0.942 | +0.030 (0.006) | 2368 | 2.3 | 2.4 |
| int8 pruned 75% | 0.970 | +0.002 (0.002) | 592 | 1.85 | 8.2 |
| int8 pruned 90% | 0.925 | +0.047 (0.006) | 237 | 0.74 | 3.3 |
| ternary pruned 50% | 0.966 | +0.006 (0.004) | 1076 | 2.25 | 8.5 |
| ternary pruned 75% | 0.941 | +0.031 (0.003) | 560 | 1.17 | 4.4 |

(All 14 rows, including 50/95/98% int8 and 90% ternary pruning, are in `results.txt`; "float32" energy uses a 32-bit multiplier under the same scaling, so it is an upper reference only.)

- **Pruning pays first, and cheaply.** Removing 75% of the int8 weights costs 0.2 points of accuracy (within the paired standard error) and cuts modelled energy to 36% of dense int8. Accuracy then falls fast: 90% pruning costs 4.7 points, 95% costs 21.
- **Dropping multipliers is not free of accuracy.** Ternary costs 1.4 points and binary 3.0 against float32 on this task. Ternary plus 50% pruning is the best multiplier-free point (0.6 points down).
- **At a tolerance of 1 or 2 points the cheapest design still has multipliers** (int8 pruned 75%, 1.85 nJ) and beats the best multiplier-free design (ternary pruned 50%, 2.25 nJ). Reason in this model: operand reads (about 0.16 pJ/bit) cost far more than the 8x8 multiply (0.2 pJ), so sparsity, which removes reads, beats removing the multiplier. Loosening the tolerance to 5 points does not change the order (int8 pruned 90%, 0.74 nJ, against ternary pruned 75%, 1.17 nJ).
- **Sensitivity.** Scaling the multiplier energy by 1, 3, 10 and 30, the cheapest design within 2 points stays int8 pruned 75% up to a factor of 10 (2.46 nJ against 2.53 nJ for the best multiplier-free design, a near tie) and flips to ternary pruned 50% at a factor of 30. So the multiplier has to cost about 10x the assumed value before dropping it clearly pays, here.
- **Noise.** With 10 splits the standard error of a paired drop is 0.1 to 1 point; differences under about 1 point between neighbouring rows are not resolved. One architecture and one small task.

## Limitations
- Energy and storage are modelled with assumed constants, not measured or synthesised, and the read-versus-multiply ratio drives the main finding. A design that holds weights in registers next to the multipliers would change it.
- Digits is easy (float32 reaches 97%) and tiny; the conclusion may not carry to keyword spotting or to larger models, which is the point of the substituted-task warning above.
- Activation quantisation is post-training only, and training recipes are untuned, so low-bit and high-sparsity rows are lower bounds on what a tuned recipe reaches.
- Sparse indexing overhead is a simple per-nonzero index; real formats (run-length, blocks) differ, and irregular sparsity may not map well to a parallel array.

## Next steps
Re-run on `accel-kws` MFCC features when Speech Commands is reachable; add the lookup-table variant; synthesise the ternary and sparse engines with Yosys and compare real gate counts (`accel-fpga` after that); combine ternary or int4 with pruning schedules and tune.

## Owner steps
None. Simulation and arithmetic only; nothing bought or measured.

## Outside dependencies
scikit-learn (BSD-3, bundled digits data), NumPy, matplotlib.

**Figure.** `experiments/frontier.png`: accuracy against modelled energy for all 14 designs.
