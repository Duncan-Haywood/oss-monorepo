"""Run every experiment and write experiments/results.txt.

    PYTHONPATH=src python3 experiments/run.py

Deterministic (seeded). A few minutes on one CPU core.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_trust import simulate, steady_trust, summarise  # noqa: E402

N, ROUNDS, START, LENGTH, SEEDS, E0 = 100, 800, 100, 50, 20, 0.05
BASE = steady_trust(E0)
out = []


def p(s=""):
    out.append(s)
    print(s, flush=True)


def runs(**kw):
    """(mean lowest trust, mean final trust, share of crowds back within 0.05 of baseline, median rounds to get back)."""
    rows = []
    for s in range(SEEDS):
        tr = simulate(n=N, rounds=ROUNDS, start=START, length=LENGTH, e0=E0, seed=s, **kw)
        rows.append(summarise(tr, START, LENGTH, BASE))
    low = sum(r[0] for r in rows) / SEEDS
    fin = sum(r[1] for r in rows) / SEEDS
    back = [r[2] for r in rows if r[2] is not None]
    share = len(back) / SEEDS
    med = sorted(back)[len(back) // 2] if len(back) * 2 > SEEDS else None
    return low, fin, share, med


def fmt(x):
    return "never" if x is None else str(x)


p(f"N={N} people, {ROUNDS} rounds, incident rounds {START}-{START + LENGTH - 1}, {SEEDS} seeds, baseline error {E0}, baseline trust {BASE:.3f}")
p()
p("== A. experience only (no gossip, no incident): final mean trust vs fixed point")
p("# e  sim_w1  mf_w1  sim_w0.3  mf_w0.3")
for e in (0.05, 0.1, 0.2, 0.3, 0.5, 0.7):
    sims = []
    for w in (1.0, 0.3):
        v = []
        for s in range(SEEDS):
            tr = simulate(n=N, rounds=600, e0=e, e_bad=e, g=0.0, tau=w, t_init=0.5, seed=s)
            v.append(sum(tr[-100:]) / 100)
        sims.append(sum(v) / SEEDS)
    p(f"{e:.2f} {sims[0]:.3f} {steady_trust(e):.3f} {sims[1]:.3f} {steady_trust(e, 0.3):.3f}")
p()
for sect, tau in (("B", 1.0), ("C", 0.3)):
    p(f"== {sect}. incident severity x negativity bias, gossip g=0.05, "
      + ("robots stay silent about failures (tau=1)" if tau == 1.0 else "robots explain failures (tau=0.3)"))
    p("# e_bad  then for beta=1,2,4: lowest  final  recovered_share  median_rounds_to_recover")
    for eb in (0.2, 0.4, 0.6, 0.8):
        cells = []
        for beta in (1.0, 2.0, 4.0):
            lo, fi, sh, md = runs(e_bad=eb, g=0.05, beta=beta, tau=tau)
            cells.append(f"{lo:.3f} {fi:.3f} {sh:.2f} {fmt(md)}")
        p(f"{eb:.2f} " + " | ".join(cells))
    p()
p("== D. gossip strength, incident e_bad=0.6, beta=2, tau=1: lowest final recovered_share median_rounds")
for g in (0.0, 0.02, 0.05, 0.1, 0.2):
    lo, fi, sh, md = runs(e_bad=0.6, g=g, beta=2.0, tau=1.0)
    p(f"{g:.2f} {lo:.3f} {fi:.3f} {sh:.2f} {fmt(md)}")
p()
p("== E. incident length, e_bad=0.6, g=0.05, beta=2: lowest final recovered_share (tau=1 | tau=0.3)")
import society_trust  # noqa: E402,F401
for length in (10, 25, 50, 100):
    cells = []
    for tau in (1.0, 0.3):
        rows = []
        for s in range(SEEDS):
            tr = simulate(n=N, rounds=ROUNDS, start=START, length=length, e0=E0, e_bad=0.6, g=0.05, beta=2.0, tau=tau, seed=s)
            rows.append(summarise(tr, START, length, BASE))
        lo = sum(r[0] for r in rows) / SEEDS
        fi = sum(r[1] for r in rows) / SEEDS
        sh = sum(r[2] is not None for r in rows) / SEEDS
        cells.append(f"{lo:.3f} {fi:.3f} {sh:.2f}")
    p(f"{length} " + " | ".join(cells))

p()
p("== F. avoidance trap: people with trust below theta stop using robots; incident e_bad=0.8, g=0.05")
p("# theta  then for beta=1,2,4 (tau=1 | tau=0.3): final  recovered_share")
for theta in (0.0, 0.2, 0.3, 0.4):
    cells = []
    for beta in (1.0, 2.0, 4.0):
        sub = []
        for tau in (1.0, 0.3):
            lo, fi, sh, md = runs(e_bad=0.8, g=0.05, beta=beta, tau=tau, theta=theta)
            sub.append(f"{fi:.3f} {sh:.2f}")
        cells.append(" | ".join(sub))
    p(f"{theta:.2f} " + " || ".join(cells))

p()
p("== G. final mean trust against the avoidance threshold, incident e_bad=0.8, g=0.05")
p("# theta  beta1  beta2  beta4  beta4_with_explanations")
for theta in (0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45):
    v = [runs(e_bad=0.8, g=0.05, beta=b, tau=1.0, theta=theta)[1] for b in (1.0, 2.0, 4.0)]
    v.append(runs(e_bad=0.8, g=0.05, beta=4.0, tau=0.3, theta=theta)[1])
    p(f"{theta:.2f} " + " ".join(f"{x:.3f}" for x in v))
p()
p("== H. mean trust over time (every 25 rounds), incident e_bad=0.8 in rounds 100-149, g=0.05, beta=2, theta=0.3")
p("# round  silent_robots  explaining_robots")
trs = []
for tau in (1.0, 0.3):
    acc = [0.0] * ROUNDS
    for s_ in range(SEEDS):
        tr = simulate(n=N, rounds=ROUNDS, start=START, length=LENGTH, e0=E0, e_bad=0.8, g=0.05, beta=2.0, tau=tau, theta=0.3, seed=s_)
        acc = [a + x for a, x in zip(acc, tr)]
    trs.append([a / SEEDS for a in acc])
for r in range(0, ROUNDS, 25):
    p(f"{r} {trs[0][r]:.3f} {trs[1][r]:.3f}")

(HERE / "results.txt").write_text("\n".join(out) + "\n")
