"""Writes results.txt: hanger-fit's width finding re-scored across swept fabric constants.

python3 experiments/run.py        (about 8 min on 4 cores)
"""
import itertools
import multiprocessing as mp
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from hanger_sweep.sweep import OFFSETS, make_garment, summarise, width_curve  # noqa: E402

BASE = dict(B=0.03, mass=1.0, EA=150.0, depth=0.20)          # hanger-fit's tee
GRID = dict(B=[0.003, 0.01, 0.03, 0.1, 0.3, 1.0], mass=[0.5, 1.0, 2.0],
            EA=[40.0, 150.0, 800.0], depth=[0.10, 0.20, 0.30])


def one(args):
    size, p = args
    g = make_garment(size, "tee", p["B"], p["mass"], p["EA"])
    e = width_curve(g, p["depth"])
    return args, e, summarise(e)


def main():
    keys = list(GRID)
    full = [("M", dict(zip(keys, v))) for v in itertools.product(*GRID.values())]
    oat = []
    for size in ("child", "XXL"):
        oat.append((size, dict(BASE)))
        for k in keys:
            for v in GRID[k]:
                if v != BASE[k]:
                    oat.append((size, {**BASE, k: v}))
    with mp.Pool(4) as pool:
        full_r = pool.map(one, full, chunksize=2)
        oat_r = pool.map(one, oat, chunksize=2)
    o = [f"offsets of arm half width from half shoulder (cm): {OFFSETS}",
         "hanger: hanger-fit's wood-shaped stock hanger (slope 16, bow 0.8, r 2) with the width replaced; score = shape error cm RMS, no crease charge",
         f"base (hanger-fit's assumed tee): {BASE}", ""]
    o.append("== A. Full factorial, size M tee: 6 B x 3 mass x 3 EA x 3 depth = 162 garments")
    o.append(f"{'B':>6} {'mass':>5} {'EA':>5} {'depth':>6}  best_off best_err err@+1  errors at offsets")
    for (size, p), e, s in full_r:
        o.append(f"{p['B']:6.3f} {p['mass']:5.1f} {p['EA']:5.0f} {p['depth']:6.2f}  {s['best_offset']:+8.1f} {s['best_err']:8.3f} {s['err_at_1']:6.3f}  "
                 + " ".join(f"{x:6.2f}" for x in e))
    o.append("")
    o.append("== B. One at a time, child and XXL tees (others at base)")
    o.append(f"{'size':>5} {'B':>6} {'mass':>5} {'EA':>5} {'depth':>6}  best_off best_err err@+1")
    for (size, p), e, s in oat_r:
        o.append(f"{size:>5} {p['B']:6.3f} {p['mass']:5.1f} {p['EA']:5.0f} {p['depth']:6.2f}  {s['best_offset']:+8.1f} {s['best_err']:8.3f} {s['err_at_1']:6.3f}")
    (HERE / "results.txt").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
