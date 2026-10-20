"""Writes experiments/results.txt. Synthetic scans only; about a minute on one CPU core."""
import os
import sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from sensing_scan2cad import Part, sample_part, add_noise, fit_part, dimension_errors, cadquery_script

HERE = os.path.dirname(__file__)
TRIALS = 20
TOL = 0.2          # mm, a typical FDM press-fit allowance used as the "usable" bar (assumption, see README)
SIGMAS = [0.05, 0.1, 0.2, 0.5, 1.0]
NS = [2000, 5000, 20000, 80000]
KEYS = ["length", "width", "thickness", "hole_d", "hole_gap"]
part = Part()
truth = part.true_dims()
out = []


def p(s=""):
    print(s)
    out.append(s)


def trial_set(sigma, n, seed0, outlier=0.0):
    errs, fails = [], 0
    for t in range(TRIALS):
        rng = np.random.default_rng(seed0 + t)
        pts = add_noise(sample_part(part, n, rng), sigma, rng, outlier_frac=outlier)
        e = dimension_errors(fit_part(pts, sigma, rng), truth)
        if e is None:
            fails += 1
        else:
            errs.append([e[k] for k in KEYS])
    return np.array(errs), fails


p("sensing-scan2cad: synthetic scans of an 80 x 40 x 10 mm plate, two 8 mm holes 40 mm apart")
p(f"{TRIALS} scans per cell; usable = no failure and every dimension within +-{TOL} mm")
p()
p("== A. usable fraction, rms error of worst dimension (mm), failures")
p("sigma_mm  n_points  usable  worst_rms_mm  failed")
cells = {}
for si, s in enumerate(SIGMAS):
    for ni, n in enumerate(NS):
        E, f = trial_set(s, n, 1000 * si + 100 * ni)
        cells[(s, n)] = (E, f)
        if len(E):
            ok = int(((np.abs(E) <= TOL).all(1)).sum())
            worst = float(np.sqrt((E ** 2).mean(0)).max())
        else:
            ok, worst = 0, float("nan")
        p(f"{s:<9} {n:<9} {ok / TRIALS:<7.2f} {worst:<13.3f} {f}")
p()
p("== B. per-dimension bias and rms (mm) at sigma = 0.5, n = 80000 (successful fits)")
E, f = cells[(0.5, 80000)]
p("dimension   bias    rms")
for j, k in enumerate(KEYS):
    p(f"{k:<11} {E[:, j].mean():+.3f}  {np.sqrt((E[:, j] ** 2).mean()):.3f}")
p()
p("== C. per-dimension rms (mm) at sigma = 0.1 against point count")
p("n_points  " + "  ".join(f"{k:>9}" for k in KEYS))
for n in NS:
    E, f = cells[(0.1, n)]
    p(f"{n:<9} " + "  ".join(f"{np.sqrt((E[:, j] ** 2).mean()):9.3f}" for j in range(len(KEYS))))
p()
p("== D. scale error (a reconstruction with no scale reference): dimension error in mm for a given scale error")
p("scale_err_pct  length  width  thickness  hole_d  hole_gap")
for pct in [0.1, 0.25, 0.5, 1.0, 2.0]:
    f = pct / 100
    p(f"{pct:<13} " + "  ".join(f"{truth[k] * f:6.2f}" for k in KEYS))
p()
p("== E. 2% uniform outliers at sigma = 0.1, n = 20000")
E, f = trial_set(0.1, 20000, 99000, outlier=0.02)
ok = int(((np.abs(E) <= TOL).all(1)).sum()) if len(E) else 0
p(f"usable {ok / TRIALS:.2f}  failed {f}  worst_rms_mm {np.sqrt((E ** 2).mean(0)).max():.3f}")
p()
p("== F. generated CadQuery script for one fit (sigma 0.1, n 20000); not executed here")
rng = np.random.default_rng(5)
d = fit_part(add_noise(sample_part(part, 20000, rng), 0.1, rng), 0.1, rng)
p(cadquery_script(d).rstrip())

p()
p("== G. thickness bias (mm) against RANSAC inlier band k*sigma, sigma = 0.5, n = 80000, 12 scans")
p("k_thresh  failed  thickness_bias_mm")
for k in [1.5, 2.0, 3.0, 4.0]:
    e, nf = [], 0
    for t in range(12):
        rng = np.random.default_rng(t)
        pts = add_noise(sample_part(part, 80000, rng), 0.5, rng)
        d = fit_part(pts, 0.5, rng, k_thresh=k)
        if d is None:
            nf += 1
        else:
            e.append(d["thickness"] - truth["thickness"])
    p(f"{k:<9} {nf:<7} {np.mean(e):+.3f}" if e else f"{k:<9} {nf:<7} n/a")
p()
p("== H. usable fraction against point count (columns: sigma 0.1, 0.2, 0.5 mm)")
p("n_points  s0.1  s0.2  s0.5")
for n in NS:
    row = []
    for s in (0.1, 0.2, 0.5):
        E, f = cells[(s, n)]
        row.append(f"{int(((np.abs(E) <= TOL).all(1)).sum()) / TRIALS:.2f}" if len(E) else "0.00")
    p(f"{n:<9} " + "  ".join(row))

with open(os.path.join(HERE, "results.txt"), "w") as fh:
    fh.write("\n".join(out) + "\n")
