"""Milestone 3k: Michell wave term (milestone 2) with form factors from the Delft tank bound (3i, k 0.03 to 0.15).

    PYTHONPATH=src:experiments python3 experiments/run_michell_lowk.py > experiments/results_michell_lowk.txt

3j reran the H2 box at low k but kept the placeholder wave term; milestone 2 used Michell theory but
k 0.10 to 0.40. This crosses the two. Prediction (logged before running): the catamaran still wins in
0 equal-length cases; its overall win share falls below milestone 2's 3.3%, as in 3j (0.4% -> 0).
Wave scale 1 only (milestone 2 showed the verdict is flat in it); battery 200 Wh/kg (range is proportional).
"""
import itertools
from run_michell import best

if __name__ == "__main__":
    cache = {}
    AX = dict(k_mono=[0.03, 0.08, 0.15], k_cat=[0.03, 0.08, 0.15], interf=[0.0, 0.15, 0.30],
              l_mono=[3.0, 4.0, 5.0], l_cat=[3.0, 4.0, 5.0], sep=[0.15, 0.25, 0.40])
    rows = []
    for km_, kc, itf, lm, lc, sp in itertools.product(*AX.values()):
        mono = best(lm, 1, 0.0, km_, 0.0, 1.0, 200.0, cache)
        cat = best(lc, 2, sp, kc, itf, 1.0, 200.0, cache)
        rows.append((km_, kc, itf, lm, lc, sp, mono, cat))
    n = len(rows)
    win = lambda r: r[7][0] > r[6][0]
    eq = [r for r in rows if r[3] == r[4]]
    print(f"cases {n}; catamaran out-ranges monohull in {sum(map(win, rows))} ({100*sum(map(win, rows))/n:.1f}%); equal length {sum(map(win, eq))}/{len(eq)}")
    rat = sorted(r[7][0] / r[6][0] for r in rows)
    print(f"range ratio cat/mono: min {rat[0]:.2f} median {rat[n//2]:.2f} max {rat[-1]:.2f}")
    mr = sorted(r[6][0] for r in rows)
    print(f"monohull best range km: min {mr[0]:.0f} median {mr[n//2]:.0f} max {mr[-1]:.0f}")
    print(f"monohull best speed m/s: median {sorted(r[6][1] for r in rows)[n//2]:.2f}")
    wf = sorted(r[6][2] for r in rows)
    print(f"mono wave/viscous at best speed: median {wf[n//2]:.3f}, max {wf[-1]:.3f}")
    for i, name in enumerate(AX):
        out = []
        for val in AX[name]:
            sub = [r for r in rows if r[i] == val]
            out.append(f"{val}: {100*sum(map(win, sub))/len(sub):.1f}%")
        print(f"cat win share by {name}: " + ", ".join(out))
