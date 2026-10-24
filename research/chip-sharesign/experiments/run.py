"""Score shared vs unshared common terms for every family/width/k under every ABC script."""
import os, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from chip_sharesign import flow, gens

GRID = [("addconst", 8, 2), ("addconst", 8, 4), ("addconst", 16, 2), ("addconst", 16, 4),
        ("addvar", 8, 2), ("addvar", 8, 4), ("addvar", 16, 2), ("addvar", 16, 4),
        ("sumthree", 8, 2), ("sumthree", 8, 4), ("sumthree", 16, 2)
        ]


def main():
    rows = []
    with tempfile.TemporaryDirectory() as d:
        for fam, w, k in GRID:
            fs = {}
            for sh in (True, False):
                f = os.path.join(d, f"{fam}_{w}_{k}_{int(sh)}.v")
                open(f, "w").write(gens.FAMILIES[fam](w, k, sh))
                fs[sh] = f
            eq = flow.equivalent(fs[True], "top", fs[False], "top")
            for sc in flow.SCRIPTS:
                s = flow.score(fs[True], "top", sc); u = flow.score(fs[False], "top", sc)
                rows.append((fam, w, k, sc, s["cells"], s["depth"], u["cells"], u["depth"], eq))
    print("family width k script shared_cells shared_depth unshared_cells unshared_depth equivalent")
    for r in rows:
        print(*r)
    print()
    for sc in flow.SCRIPTS:
        rs = [r for r in rows if r[3] == sc]
        bigger = sum(r[4] > r[6] for r in rs); smaller = sum(r[4] < r[6] for r in rs); same = len(rs) - bigger - smaller
        print(f"{sc}: cells: shared larger in {bigger}/{len(rs)}, smaller in {smaller}, equal in {same}")
        pw = sum(r[4] * r[5] < r[6] * r[7] for r in rs)
        deeper = sum(r[5] > r[7] for r in rs)
        ratios = sorted(r[4] / r[6] for r in rs)
        print(f"{sc}: cells x depth: shared smaller in {pw}/{len(rs)}; shared deeper in {deeper}; "
              f"cells ratio shared/unshared min {ratios[0]:.2f} median {ratios[len(ratios)//2]:.2f} max {ratios[-1]:.2f}")


if __name__ == "__main__":
    main()
