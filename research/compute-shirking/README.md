# Compute shirking: skipped steps hidden in the loss noise

Stdlib-only Python. A worker paid for `T` steps runs `(1−f)T`; the verifier compares held-out loss to reference runs. Shows the hidden fraction is the loss curve inverted at the noise band (`L((1−f*)T) = L(T)e^{σ'(z_α+z_P)}`), closed form for a power law with a floor (`f* = 1−(1+(e^q−1)/r)^{−1/β}`), rises as the reducible loss share `r` falls, has a seed-noise floor no evaluation size removes, matches exact quadratic-GD simulation within 1.5 points, prices the deterring stake, and shows the loss test is worth ≈4.4 random step audits at best. See `paper/whitepaper.md`.

```bash
cd research/compute-shirking
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 14 tests, ~7 s
PYTHONPATH=src python3 experiments/run.py                  # ~1 min; output in experiments/results.txt
```
One scalar statistic, normal approximation, known curve family, independent noise sources; MIT.
