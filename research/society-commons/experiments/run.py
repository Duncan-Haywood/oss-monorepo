"""Run every experiment and write experiments/results.txt.

    PYTHONPATH=src python3 experiments/run.py

Deterministic (seeded). About a minute on one CPU core.
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_commons import cost_rate, simulate, theory  # noqa: E402

SEEDS, HORIZON, WARMUP = 12, 20000.0, 1000.0
out = []


def p(s=""):
    out.append(s)
    print(s, flush=True)


def run(lam_h, lam_r, f, **kw):
    """Mean over seeds of every numeric field from simulate()."""
    rs = [simulate(lam_h, lam_r, f, seed=s, horizon=HORIZON, warmup=WARMUP, **kw) for s in range(SEEDS)]
    return {k: sum(r[k] for r in rs) / SEEDS for k in rs[0]}


def split(rho, human_share=0.4, s_r=1.0):
    """Arrival rates for total load rho with a share of the load from people (unit service for people)."""
    return rho * human_share, rho * (1 - human_share) / s_r


p(f"One server, deterministic crossings (people 1.0; robots 1.0 unless stated), Poisson arrivals, {SEEDS} seeds of {HORIZON:.0f} time units after a {WARMUP:.0f} warm-up")
p()
p("== A. simulation against the closed forms (mean wait before crossing; relative error of the 12-seed mean)")
p("# rho  h_share  rule  wait_h_sim wait_h_th wait_r_sim wait_r_th  worst_rel_err")
worst = 0.0
for rho in (0.5, 0.7, 0.9):
    for share in (0.2, 0.5, 0.8):
        lh, lr = split(rho, share)
        th = theory(lh, lr)
        for rule, f in (("fifo", 0.0), ("prio", 1.0)):
            r = run(lh, lr, f)
            e = max(abs(r["wait_h"] / th[rule + "_h"] - 1), abs(r["wait_r"] / th[rule + "_r"] - 1))
            worst = max(worst, e)
            p(f"{rho:.1f} {share:.1f} {rule} {r['wait_h']:.3f} {th[rule + '_h']:.3f} {r['wait_r']:.3f} {th[rule + '_r']:.3f} {e:.3f}")
p(f"worst relative error over all rows: {worst:.3f}")
p()
p("== B. deference against load (people are 40% of the load; equal costs per unit wait)")
p("# rho  wait_h_fifo  wait_h_prio  wait_r_fifo  wait_r_prio  people_saved  robots_added")
for rho in (0.3, 0.5, 0.7, 0.8, 0.9, 0.95):
    lh, lr = split(rho)
    a, b = run(lh, lr, 0.0), run(lh, lr, 1.0)
    p(f"{rho:.2f} {a['wait_h']:.2f} {b['wait_h']:.2f} {a['wait_r']:.2f} {b['wait_r']:.2f} {a['wait_h'] - b['wait_h']:.2f} {b['wait_r'] - a['wait_r']:.2f}")
p()
LH, LR = split(0.9)
p(f"== C. share of deferential robots f at load 0.9 (people {LH:.2f}/unit time, robots {LR:.2f}/unit time)")
p("# f  wait_h  wait_r  wait_selfish_robot  wait_deferential_robot  cost_rate(equal costs)")
for f in (0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0):
    r = run(LH, LR, f)
    c = cost_rate(r, LH, LR)
    p(f"{f:.2f} {r['wait_h']:.2f} {r['wait_r']:.2f} {r['wait_rs']:.2f} {r['wait_rd']:.2f} {c:.2f}")
p()
p("== D. who should defer? waiting cost per person-unit c_h against per robot-unit c_r (c_r = 1), load 0.9")
p("# c_h  cost_fifo  cost_prio  cheaper   (cost = arrivals x c x mean wait, both classes)")
fifo, prio = run(LH, LR, 0.0), run(LH, LR, 1.0)
for ch in (0.25, 0.5, 0.9, 1.0, 1.1, 2.0, 4.0):
    cf, cp = cost_rate(fifo, LH, LR, ch, 1.0), cost_rate(prio, LH, LR, ch, 1.0)
    p(f"{ch:.2f} {cf:.2f} {cp:.2f} {'deference' if cp < cf else 'first-come'}")
p()
p("== E. slower robots (crossing takes s_r; people 1.0), load 0.9, people 40% of the load")
p("# s_r  wait_h_fifo  wait_h_prio  wait_r_fifo  wait_r_prio  people_saved_ratio")
for s_r in (0.5, 1.0, 2.0, 3.0):
    lh, lr = split(0.9, 0.4, s_r)
    a, b = run(lh, lr, 0.0, s_r=s_r), run(lh, lr, 1.0, s_r=s_r)
    p(f"{s_r:.1f} {a['wait_h']:.2f} {b['wait_h']:.2f} {a['wait_r']:.2f} {b['wait_r']:.2f} {a['wait_h'] / b['wait_h']:.2f}")
p()
OH, OR_ = 0.4, 0.8
p(f"== F. overload (load 1.2: people {OH}/unit time, robots {OR_}/unit time), everyone gives up after 20 time units")
p("# f  people_served  robots_served  robot_crossings_per_unit  people_crossings_per_unit  wait_h  robot_crossings_vs_f0")
base = None
for f in (0.0, 0.25, 0.5, 0.75, 1.0):
    r = run(OH, OR_, f, patience_h=20.0, patience_r=20.0)
    sh, sr = r["served_h"] / r["n_h"], r["served_r"] / r["n_r"]
    span = HORIZON - WARMUP
    rc, pc = r["served_r"] / span, r["served_h"] / span
    base = rc if base is None else base
    p(f"{f:.2f} {sh:.3f} {sr:.3f} {rc:.3f} {pc:.3f} {r['wait_h']:.2f} {rc / base:.3f}")
open(HERE / "results.txt", "w").write("\n".join(out) + "\n")
