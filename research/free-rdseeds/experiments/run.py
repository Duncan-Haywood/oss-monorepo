"""Run all experiments; prints the tables committed as results.txt.

    PYTHONPATH=src:../free-qmcdr/src python3 experiments/run.py > experiments/results.txt
"""
import time
from free_qmcdr import smooth, jump, rmse_curve as iid_curve, slope
from free_rdseeds import alpha, rmse_curve, resonance

NS = (64, 256, 1024, 4096)
REPS = 100
SEEDS = ("s1", "s2", "s3", "s4", "s5", "s6")
FINE = (500, 700, 1000, 1400, 2000, 2800, 4000)


def main():
    t0 = time.time()
    print("== 1. Seed sensitivity: fitted slope of RMSE ~ n^slope at d=5, six seed strings (%d randomisations per cell)" % REPS)
    for name, g in (("smooth d=5", smooth(5)), ("jump d=5", jump(5))):
        print(f"-- {name}")
        print(f"{'generator':<9}" + "".join(f"{s:>7}" for s in SEEDS) + f"{'mean':>8}{'sd':>7}")
        for kind in ("rd", "sqrt", "random"):
            sl = [slope(NS, rmse_curve(g, kind, NS, REPS, s)) for s in SEEDS]
            m = sum(sl) / len(sl)
            sd = (sum((x - m) ** 2 for x in sl) / (len(sl) - 1)) ** 0.5
            print(f"{kind:<9}" + "".join(f"{x:>7.2f}" for x in sl) + f"{m:>8.2f}{sd:>7.2f}")
        sl = [slope(NS, iid_curve(g, "mc", NS, REPS, s)) for s in SEEDS]
        m = sum(sl) / len(sl)
        print(f"{'iid':<9}" + "".join(f"{x:>7.2f}" for x in sl) + f"{m:>8.2f}")

    print()
    print("== 2. Dimension scan: mean slope over three seeds, smooth return (rd vs sqrt vs random generator)")
    print(f"{'d':>3}{'rd':>8}{'sqrt':>8}{'random':>8}   resonance score rd / sqrt (min ||k.a||*prod max(1,|k_j|), |k_j|<=3)")
    for d in range(2, 9):
        g = smooth(d)
        row = []
        for kind in ("rd", "sqrt", "random"):
            sl = [slope(NS, rmse_curve(g, kind, NS, 60, s)) for s in SEEDS[:3]]
            row.append(sum(sl) / len(sl))
        r1 = resonance(alpha("rd", d), 3)[0]
        r2 = resonance(alpha("sqrt", d), 3)[0]
        print(f"{d:>3}" + "".join(f"{x:>8.2f}" for x in row) + f"   {r1:.4f} / {r2:.4f}")

    print()
    print("== 3. RMSE * sqrt(n) at off-grid n, smooth d=5, seed s1 (a flat row is an n^-0.5 rate; a falling row is faster)")
    g = smooth(5)
    print(f"{'n':>6}{'rd':>10}{'sqrt':>10}{'random':>10}")
    cols = {k: rmse_curve(g, k, FINE, REPS, "s1") for k in ("rd", "sqrt", "random")}
    for i, n in enumerate(FINE):
        print(f"{n:>6}" + "".join(f"{cols[k][i] * n ** 0.5:>10.3f}" for k in cols))

    print()
    print("== 4. Resonance of the d=5 generators (|k_j|<=4): worst integer relation found")
    for kind in ("rd", "sqrt"):
        s, k = resonance(alpha(kind, 5), 4)
        print(f"{kind:<5} score {s:.5f} at k = {k}")
    print()
    print("== 5. Scope")
    print("Stylised: same uniform scenario parameters and analytic return functions as free-qmcdr; no simulator.")
    print(f"(runtime {time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()
