"""Control for run.py: the same 3D loop with hanger-fit's original bounds (bow -2..3, r 0.15..3), 8 seeds.

python3 experiments/control.py     (about 10 min on 4 cores; needs numpy)
Writes control_results.txt next to this file.
"""
import multiprocessing as mp
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parent / "src"), str(HERE)]
import run  # noqa: E402,F401  (sets up the import paths and the objective)
from hanger_fit.opt import cmaes, to_hanger  # noqa: E402
from hanger3dseeds.stats import paired_summary  # noqa: E402


def loop3o(seed):
    u, fb, hist = cmaes(lambda u: run.obj3(to_hanger(u))[0], 4, run.BUDGET, seed)
    h = to_hanger(u)
    return seed, h, run.obj3(h)[1]


def main():
    r = mp.Pool().map(loop3o, run.SEEDS, chunksize=1)
    out = ["3D loop, original bounds, M tee, 3 cm half-depth, 64 drapes on err_all", "loop seed err err_all crease sag design"]
    for s, h, sc in r:
        out.append(f"3d-orig {s} {sc['err']:.3f} {sc['err_all']:.3f} {sc['crease']:.1f} {sc['sag']:.2f} {run.fmt(h)}")
    wide = [float(l.split()[3]) for l in (HERE / "results.txt").read_text().splitlines() if l.startswith("3d-wide")]
    two = [float(l.split()[3]) for l in (HERE / "results.txt").read_text().splitlines() if l.startswith("2d-design")]
    orig = [sc["err_all"] for _, _, sc in r]
    out += ["", "err_all, 3D original bounds minus 2D-designed:", paired_summary(orig, two),
            "err_all, 3D wide bounds minus 3D original bounds:", paired_summary(wide, orig)]
    (HERE / "control_results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
