# Error feedback in compressed local SGD

Pure Python, no dependencies. Companion to `compressed-sync`, which covered unbiased compressors and left biased ones with error feedback open. Each of `N` workers keeps a residual and sends a random fraction `ρ` of `e + d` (rand-k, unscaled), keeping the rest. The second moments of `(x, e)` close into a 4×4 linear system, solved in closed form: stability limit `αs < 2(2−ρ)Nρ/(Nρ²+4(1−ρ))` (below unbiased rand-k for `N=1`, above the uncompressed limit 2 for large cohorts) and floor `α V/(N s(2−αs)) · [1−z/2+(1−1/N)·k·z(2−z)/2]/(1−z/z_max)`, `z=αs`, `k=2(1−ρ)/(ρ(2−ρ))`. At small steps the floor is the *uncompressed* one (unbiased compression: `1/ρ` times more) and the mean contracts at `1−αs`, not `1−αρs`; the price is a smaller stable step at small `N` and, when workers send at unequal rates, a larger variance than plain dropping. Dropping is biased to the rate-weighted mean `Σρ_i b_i/Σρ_i`, the residual removes the bias exactly. Matched to simulation within 1%. See `paper/whitepaper.md`.

```bash
cd research/error-feedback-sync
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~4 s
PYTHONPATH=src python3 experiments/run.py                 # output in experiments/results.txt
```
Quadratics, Gaussian noise, independent Bernoulli sparsifiers; top-k is simulation only; MIT.
