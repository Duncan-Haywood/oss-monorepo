# Speed race: paying the first k of n finishers

Stdlib-only Python. When a decentralised training round pays the `k` earliest of `n` workers a prize `R`, workers choose how much speed to buy at cost `c` per unit rate, so the round is a contest. Exact answer for exponential races: the win probability of a worker at `r×` the rivals' rate is a finite Beta sum, its slope at `r=1` telescopes to `(1−k/n)(H_n−H_{n−k})`, the symmetric equilibrium speed is `m* = R(n−k)(H_n−H_{n−k})/(nc)` (checked as a global best response), and the harmonic factor cancels in the round time: `E X_(k) = nc/((n−k)R)`. Paying all finishers (`k=n`) buys no speed; under a budget `B=kR` speed alone wants `k=1` (round time `nck/((n−k)B)`), and only an accuracy floor `k ≥ k_min` (from `straggler-backup`) pushes `k` up; entry of more workers buys almost no speed (total rate saturates at `kR/c`). See `paper/whitepaper.md`.

```bash
cd research/speed-race
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 12 tests, <1 s
PYTHONPATH=src python3 experiments/run.py                  # seconds; output in experiments/results.txt
```
Exponential finishing times with a chosen rate, linear cost, risk-neutral symmetric workers, static one-shot race; MIT.
