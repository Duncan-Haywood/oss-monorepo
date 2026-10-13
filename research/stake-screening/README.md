# Stake screening

Stdlib-only Python. Can a bond separate reliable from unreliable hardware in a decentralised compute market? Workers have hidden per-job fault rates `θ`; a contract `(w, s)` pays `w` for a clean job and slashes `s` on a detected fault. Stake is the wrong screen: the *reliable* type is the one who would copy a high-stake contract, so the reliable type's rent is exactly `(θ_H−θ_L)(c+(1+ρ)s_H)/(1−θ_H)`, minimised at `s_H=0`, and with continuous types the optimal menu is a single flat wage with no stake (checked against 3000 random 2–4-item menus, none better). A stake required for deterrence is a tax: it multiplies reliable workers' rent by `(c+(1+ρ)s)/c`, cuts the pool's fault rate (0.169→0.089 at `s=1`) but costs 9–55% of profit. See `paper/whitepaper.md`.

```bash
cd research/stake-screening
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, ~1 s
PYTHONPATH=src python3 experiments/run.py                  # ~10 s; output in experiments/results.txt
```
Risk-neutral workers, hidden fault rate, uniform types, flat or menu contracts; MIT.
