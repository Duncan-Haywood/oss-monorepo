# Grinding hash-derived spot-check challenges

Stdlib-only Python. A prover commits to a training trace and the audit challenge is the hash of the commitment (Fiat-Shamir); the prover re-rolls until the challenge misses its corrupted steps. See `paper/whitepaper.md`.

```bash
cd research/fiat-shamir-grinding
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 12 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Results: with free retries the cheat pays `G − c/p` (`p = C(T−k,q)/C(T,q)`), so deterrence needs `q ≳ ln(G/c)·T/k`, not the `ln2·T/k` a post-commitment beacon needs: 10×–60× more opened steps for `G/c = 2^10…2^60`. Optimal proof-of-work on the challenge costs exactly `x* = v/λ_p − c0`, saving 1.23× total overhead in the worked example. Real SHA-256 grinding matches the geometric law. Stylised (uniform challenge, free re-rolls at constant cost); MIT.
