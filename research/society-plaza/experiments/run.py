"""Run every experiment and write experiments/results.txt.

    PYTHONPATH=src python3 experiments/run.py

Deterministic (seeded). About 10 minutes on 4 cores (multiprocessing), 40 on one.
"""
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_plaza import run  # noqa: E402

N, SECONDS, SEEDS = 60, 300.0, 8
RHOS = [round(0.05 * i, 2) for i in range(13)]
out = []


def say(s=""):
    print(s, flush=True)
    out.append(s)


def one(args):
    kw, seed = args
    r = run(n=N, seconds=SECONDS, seed=seed, **kw)
    return {k: v for k, v in r.items() if k not in ("frames", "side_trace")}


def cell(pool, **kw):
    rs = pool.map(one, [(kw, s) for s in range(SEEDS)])
    return {k: sum(r[k] for r in rs) / len(rs) for k in rs[0]}, rs


def main():
    with Pool(4) as pool:
        say(f"society-plaza results. {N} agents in a 30 m x 6 m periodic corridor, half walking each way, "
            f"{SECONDS:.0f} s per run (second half measured), {SEEDS} seeds per cell. People start keeping "
            f"right and copy the majority side of their last M partners; committed robots keep left.")
        say()
        say("== A. Committed (left) robots, people M=9: outcomes by robot share")
        say("rho   tipped  tipped_late lane_m  intrude detour  speed   close/min")
        a = {}
        for rho in RHOS:
            m, _ = cell(pool, rho=rho, policy="left", m=9)
            a[rho] = m
            say(f"{rho:<5} {m['tipped']:.3f}   {m['tipped_late']:.3f}       {m['lane']:.2f}    {m['intrude']:.4f}  "
                f"{m['detour']:.4f}  {m['speed']:.3f}   {m['close']:.2f}")
        say()
        say("== B. Adaptive robots (follow the people's rule), people M=9: the same outcomes")
        say("rho   tipped  tipped_late lane_m  intrude detour  speed   close/min")
        for rho in RHOS:
            m, _ = cell(pool, rho=rho, policy="adaptive", m=9)
            say(f"{rho:<5} {m['tipped']:.3f}   {m['tipped_late']:.3f}       {m['lane']:.2f}    {m['intrude']:.4f}  "
                f"{m['detour']:.4f}  {m['speed']:.3f}   {m['close']:.2f}")
        say()
        say("== C. Committed (left) robots by people's memory M: tipped_late")
        say("rho   M3      M9      M25")
        for rho in RHOS:
            row = [cell(pool, rho=rho, policy="left", m=mm)[0]["tipped_late"] for mm in (3, 9, 25)]
            say(f"{rho:<5} " + "  ".join(f"{v:.3f}" for v in row))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
