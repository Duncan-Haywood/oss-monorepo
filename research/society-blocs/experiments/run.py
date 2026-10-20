"""Write experiments/results.txt.   PYTHONPATH=src python3 experiments/run.py   (a few minutes, seeded)"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_blocs import critical_share, critical_sl, simulate  # noqa: E402

N, ROUNDS, SEEDS, EPS, M = 200, 500, 12, 0.02, 9
SLS = [0.0, 0.05, 0.10, 0.15, 0.20, 0.25]
RHOS = [round(0.02 * i, 2) for i in range(16)]
out = []


def say(x=""):
    print(x, flush=True)
    out.append(x)


mean = lambda xs: sum(xs) / len(xs)  # noqa: E731

say(f"society-blocs results. N={N}, {ROUNDS} rounds, {SEEDS} seeds per cell, eps={EPS}, M={M} unless stated. "
    "Committed robots and stubborn-L people walk L; stubborn-R people walk R. sl, sr are shares of humans.")
say()
say("== A. Mean-field tipping robot share rho_c by stubborn-L share sl (sr=0); 0 = tips with no robots")
say("sl    " + "  ".join(f"M{m:<5}" for m in (5, 9, 17)))
for sl in SLS:
    say(f"{sl:<5} " + "  ".join(f"{critical_share(sl, 0.0, m, EPS):<6.4f}" for m in (5, 9, 17)))
say()
say("== B. Mean-field self-tipping share: least sl at which the crowd tips with no robots, by sr")
say("sr    " + "  ".join(f"M{m:<5}" for m in (5, 9, 17)))
for sr in (0.0, 0.1, 0.2, 0.3):
    say(f"{sr:<5} " + "  ".join(f"{critical_sl(sr, m, EPS):<6.4f}" for m in (5, 9, 17)))
say()
say("== C. Mean-field rho_c (M=9) when a total stubborn share S is split, a fraction f of it on L")
fs = [0.0, 0.25, 0.5, 0.75, 1.0]
say("S     " + "  ".join(f"f={f:<5}" for f in fs))
for S in (0.1, 0.2, 0.4):
    say(f"{S:<5} " + "  ".join(f"{critical_share(f * S, (1 - f) * S, M, EPS):<7.4f}" for f in fs))
say()
configs = [(0.0, 0.0), (0.05, 0.0), (0.10, 0.0), (0.15, 0.0), (0.10, 0.10), (0.10, 0.20), (0.20, 0.20)]
say("== D. Simulation, M=9: mean final share of ADAPTIVE people on L")
say("rho   " + "  ".join(f"sl={a},sr={b}" for a, b in configs))
tip = {}
for rho in RHOS:
    row = []
    for cfg in configs:
        f = [simulate(N, rho, cfg[0], cfg[1], M, EPS, ROUNDS, seed=k)["final_share_l"] for k in range(SEEDS)]
        row.append(mean(f))
        if cfg not in tip and mean([x >= 0.5 for x in f]) >= 0.5:
            tip[cfg] = rho
    say(f"{rho:<5} " + "  ".join(f"{v:<{len(f'sl={a},sr={b}')}.3f}" for v, (a, b) in zip(row, configs)))
say()
say("== E. Least simulated robot share (grid 0.02) after which at least half of the crowds end with a majority of adaptive people on L, vs mean field")
say("sl    sr    simulated  mean-field")
for cfg in configs:
    say(f"{cfg[0]:<5} {cfg[1]:<5} {tip.get(cfg, float('nan')):<10} {critical_share(cfg[0], cfg[1], M, EPS):.4f}")
say()
say("== F. Human conflict rate per human meeting, M=9, sl=0.10, sr=0.10")
say("rho   committed")
for rho in (0.0, 0.05, 0.10, 0.20):
    say(f"{rho:<5} {mean([simulate(N, rho, 0.10, 0.10, M, EPS, ROUNDS, seed=k)['human_conflict_rate'] for k in range(SEEDS)]):.3f}")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
