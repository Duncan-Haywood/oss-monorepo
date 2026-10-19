"""Run every experiment and write experiments/results.txt.

    PYTHONPATH=src python3 experiments/run.py

Deterministic (seeded). About 10 minutes on one CPU core.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_norms import critical_share, simulate  # noqa: E402

N, ROUNDS, SEEDS, EPS = 200, 500, 20, 0.02
RHOS = [round(0.02 * i, 2) for i in range(26)]
MS = [5, 9, 17, 25]
out = []


def say(s=""):
    print(s, flush=True)
    out.append(s)


def mean(xs):
    return sum(xs) / len(xs)


def batch(**kw):
    rs = [simulate(n=kw.pop("n", N), rounds=ROUNDS, eps=EPS, seed=s, **kw) for s in range(SEEDS)]
    return (mean([r["final_share_l"] for r in rs]),
            mean([r["flip_round"] is not None for r in rs]),
            mean([r["human_conflict_rate"] for r in rs]))


say(f"society-robotnorms results. N={N} agents, {ROUNDS} rounds (~{ROUNDS} meetings per agent), "
    f"{SEEDS} seeds per cell, human error eps={EPS}. Humans start on R; committed robots walk L.")
say()
say("== A. Mean-field tipping share rho_c (least committed robot share that flips the status quo)")
say("M    rho_c(eps=0)  rho_c(eps=0.02)  rho_c(eps=0.05)")
for m in [1, 3, 5, 7, 9, 13, 17, 25, 33, 41]:
    say(f"{m:<4} {critical_share(m, 0.0):.4f}        {critical_share(m, 0.02):.4f}           {critical_share(m, 0.05):.4f}")
say()
say("== B. Well-mixed crowd, committed robots: mean final share of humans on L, by memory M")
say("rho   " + "   ".join(f"M{m:<4}" for m in MS) + "   P(flip) " + " ".join(f"M{m:<3}" for m in MS))
flips = {m: [] for m in MS}
for rho in RHOS:
    row = {m: batch(rho=rho, m=m) for m in MS}
    for m in MS:
        flips[m].append((rho, row[m][1]))
    say(f"{rho:<5} " + "   ".join(f"{row[m][0]:.3f}" for m in MS) + "             "
        + " ".join(f"{row[m][1]:.2f}" for m in MS))
say()
say("== C. Simulated tipping share (least rho with P(flip) >= 0.5) against mean field")
say("M    simulated  mean-field")
for m in MS:
    sim = next((r for r, p in flips[m] if p >= 0.5), float("nan"))
    say(f"{m:<4} {sim:.2f}       {critical_share(m, EPS):.3f}")
say()
say("== D. Cost to people, M=9: conflicts per human meeting, committed vs adaptive robots")
say("rho   committed  adaptive  extra   P(flip)")
for rho in RHOS:
    fc, pc, cc = batch(rho=rho, m=9, robots="committed")
    fa, pa, ca = batch(rho=rho, m=9, robots="adaptive")
    say(f"{rho:<5} {cc:.4f}     {ca:.4f}    {cc - ca:+.4f} {pc:.2f}")
say()
say("== E. Space, M=9: mean final human share on L, well-mixed vs ring (partners within 2 sites)")
say("rho   mixed   ring-random  ring-spread  ring-cluster")
for rho in RHOS:
    a = batch(rho=rho, m=9)[0]
    b = batch(rho=rho, m=9, space="ring", place="random")[0]
    c = batch(rho=rho, m=9, space="ring", place="spread")[0]
    d = batch(rho=rho, m=9, space="ring", place="cluster")[0]
    say(f"{rho:<5} {a:.3f}   {b:.3f}        {c:.3f}        {d:.3f}")
say()
say("== F. Crowd size, M=9, well-mixed: P(flip) within the run")
say("rho   N50    N100   N200   N400")
for rho in [0.14, 0.16, 0.18, 0.20, 0.22, 0.24, 0.26]:
    say(f"{rho:<5} " + "   ".join(f"{batch(rho=rho, m=9, n=n)[1]:.2f}" for n in (50, 100, 200, 400)))

(HERE / "results.txt").write_text("\n".join(out) + "\n")
