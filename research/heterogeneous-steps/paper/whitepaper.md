# Heterogeneous inner steps: how to weight fast and slow workers in local SGD

*Stylised: independent quadratic modes with a shared optimum (no client drift), Gaussian gradient noise, fixed outer step `α`, no momentum, each worker's `H_i` fixed. Pure Python; formulas are checked against a literal simulation (`tests/`, `experiments/results.txt`).*

## Question
In an open training network devices differ in speed, so in one wall-clock window worker `i` completes `H_i` inner steps. `noisy-local-sgd` fixed the noise floor when all workers are identical. How should the server weight displacements from workers that did different amounts of work, and how much does the choice matter? Common practice weights by work done (FedAvg); the alternative is to ignore speed.

## Model
Mode `j` has curvature `a_j`; `q = 1−ηa`. Worker `i` returns `q^{H_i}x + n_i`, `Var n_i = V_i = η²σ²(1−q^{2H_i})/(1−q²)`, outer curvature `s_i = 1−q^{H_i}`, displacement `d_i = s_i x − n_i`. The server applies `x' = x − αΣw_i d_i`.

## Exact results
1. **Floor.** With `r = αΣw_i s_i`: `Var x = α²Σw_i²V_i / (r(2−r))`, stable iff `0<r<2`. Identical workers recover `noisy-local-sgd`.
2. **Information is a tanh.** `I(H) = s²/V = I_∞ tanh(λH/2)`, `λ=−ln q`, `I_∞=(1−q²)/(ησ)²`. For `a=0.25`, `η=0.2`: `H=8` has 20% of `I_∞`, `H=32` 68%, `H=64` 93%; information per step is flat up to `H≈8` and falls 43% by `H=64`. A fast worker is worth far less than its step count.
3. **Optimal weights and floor.** At fixed `r` the floor is minimised by `w_i ∝ s_i/V_i = 1/(c(1+q^{H_i}))`, giving `Var x = r/((2−r)ΣI(H_i))`: information adds across workers, so under these weights a worker never hurts.
4. **Equal weights are nearly optimal.** The optimal weights lie within a factor 2 of each other, so by Kantorovich equal weights cost at most `(1+2)²/(4·2) = 9/8`. Measured penalties over the best weights: 1.0001–1.089 across four fleets and `a=0.05, 0.25, 1` (worst: one 256-step worker among seven 1-step ones, `a=0.25`, 1.089).
5. **Step-proportional weights are not.** Weighting by `H_i` ignores saturation: penalty 1.02–1.76 single-mode (1.76 for one 256-step among seven 1-step, `a=1`; 1.63 for a geometric `1..64` fleet). Over three modes (`a=1, ¼, 0.05`, `α=1`, weights summing to 1) the floor is 1.4×, 2.4×, 2.9× and 10.5× the equal-weight floor for the four fleets; simulation within 1%.
6. **Wall-clock-optimal inner steps.** Maximising `I(H)/(C+H)` with sync cost `C` inner steps gives `H*=1` at `C=0` and, for `a=0.25`, 22, 34, 54 at `C=5, 20, 100`; flatter modes want longer loops (`a=0.05`: 66, 104, 172).
7. **Slow workers help.** With equal weights at `α=1`, dropping the slowest of `[1,8,8,8]` raises the floor 0.0376→0.0524 and of `[1,1,1,64]` 0.0303→0.0406: stragglers still contribute noise averaging, at fixed `α`.

## Limitations
Shared optimum, so none of the bias `local-sgd-bias` finds when heterogeneity is in the data; weights are common to all modes, so the optimum in result 3 is per-mode and the multi-mode comparison at `α=1` with `Σw=1` also changes `r` (information weights derived from the flattest mode are 1.0–1.37× *worse* than equal weights there, which is a normalisation artefact, not a contradiction of result 3). Result 7 holds at fixed `α` and does not show dropping is never right. `H_i` are fixed, not random.

## Relevance
For DiLoCo-style training over mixed hardware: average equally (or by an inverse-variance weight that stays within 2×) rather than by steps done; cap `H` near the point where `tanh` saturates for the stiffest direction you care about; count a fast worker by `tanh(λH/2)`, not by `H`. Companion to `noisy-local-sgd`, `partial-participation`, `compressed-sync`, `local-sgd-bias` and `straggler-backup`.
