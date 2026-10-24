"""All experiments for hanger-fit; writes results.txt and drapes.json next to this file.

PYTHONPATH=src python3 experiments/run.py          crease-penalised objective (about 15 min on 4 cores)
PYTHONPATH=src python3 experiments/run.py shape    shape error only -> results_shape_only.txt
"""
import itertools
import json
import math
import multiprocessing as mp
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from hanger_fit.model import CM, FABRICS, SIZES, STOCK, Hanger, drape, garment, objective, score  # noqa: E402
from hanger_fit.opt import BOUNDS, cmaes, random_search, to_hanger  # noqa: E402

HERE = Path(__file__).resolve().parent
SZ = list(SIZES)
BUDGET = 150
MODE = sys.argv[1] if len(sys.argv) > 1 else "penalised"


def err(h, g):
    return objective(score(h, g), MODE)


def custom(args):
    size, fabric, seed, method, budget = args
    g = garment(size, fabric)
    fn = cmaes if method == "cmaes" else random_search
    u, fb, hist = fn(lambda u: err(to_hanger(u), g), 4, budget, seed)
    return args, to_hanger(u), fb, hist


def universal_obj(u, fabric):
    h = to_hanger(u)
    return float(np.mean([err(h, garment(s, fabric)) for s in SZ]))


ADJ = np.array([[-4.0, 4.0]])   # width offset from the half shoulder (cm)


def adjustable_hanger(u, size):
    off = ADJ[0, 0] + np.clip(u[0], 0, 1) * (ADJ[0, 1] - ADJ[0, 0])
    v = BOUNDS[1:, 0] + np.clip(u[1:], 0, 1) * (BOUNDS[1:, 1] - BOUNDS[1:, 0])
    return Hanger(w=SIZES[size] + float(off), slope=float(v[0]), bow=float(v[1]), r=float(v[2]))


def adjustable_obj(u, fabric):
    return float(np.mean([err(adjustable_hanger(u, s), garment(s, fabric)) for s in SZ]))


def shared_run(args):
    kind, seed = args
    f = universal_obj if kind == "universal" else adjustable_obj
    u, fb, _ = cmaes(lambda u: f(u, "tee"), 4, 100, seed)
    return args, u, fb


def eval_cell(args):
    h, size, fabric = args
    return args, score(h, garment(size, fabric))


def fmt(h):
    return f"w={h.w:5.2f} slope={h.slope:5.2f} bow={h.bow:5.2f} r={h.r:4.2f}"


def main():
    out = [f"objective: {MODE} (shape error cm RMS" + ("" if MODE == "shape" else
           " + 0.05 cm per deg/cm of crease above 30 deg/cm") + "); err columns in B-F are this objective"]
    P = mp.Pool()
    # A. stock hangers on every size and fabric
    cells = [(h, s, f) for h in STOCK.values() for f in FABRICS for s in SZ]
    resA = dict(P.map(eval_cell, cells))
    out.append("== A. Stock hangers (assumed dimensions): shape error cm RMS / sharpest bend deg per cm / peak strain")
    for f in FABRICS:
        out.append(f"-- fabric {f}")
        out.append("size  half_shoulder  " + "  ".join(f"{k:>22s}" for k in STOCK))
        for s in SZ:
            row = []
            for h in STOCK.values():
                r = resA[(h, s, f)]
                row.append(f"{r['err']:6.2f} {r['crease']:5.1f} {r['strain']:5.3f}".rjust(22))
            out.append(f"{s:5s} {SIZES[s]:13.1f}  " + "  ".join(row))

    # B. custom hanger per size (tee) and per fabric (size M), CMA-ES, 3 seeds, best kept
    jobs = [(s, "tee", k, "cmaes", BUDGET) for s in SZ for k in range(3)]
    jobs += [("M", f, k, "cmaes", BUDGET) for f in ("shirt", "sweater") for k in range(3)]
    resB = P.map(custom, jobs)
    best = {}
    for a, h, fb, _ in resB:
        key = (a[0], a[1])
        if key not in best or fb < best[key][1]:
            best[key] = (h, fb, [])
        best[key][2].append(fb)
    out.append(f"== B. Custom hanger per garment: CMA-ES, budget {BUDGET}, best of 3 seeds (all 3 shown)")
    out.append("size fabric  err_best  err_seeds            design            crease  strain")
    customs = {}
    for (s, f), (h, fb, seeds) in best.items():
        sc = score(h, garment(s, f))
        customs[(s, f)] = h
        out.append(f"{s:5s} {f:7s} {fb:6.3f}  {' '.join(f'{x:.3f}' for x in seeds):18s} {fmt(h)}  {sc['crease']:5.1f} {sc['strain']:.3f}")

    # C/D. one universal hanger vs one adjustable-width hanger for all sizes (tee), mean error
    resCD = P.map(shared_run, [(k, s) for k in ("universal", "adjustable") for s in range(3)])
    out.append("== C. One fixed universal hanger for all 7 sizes (tee), CMA-ES budget 100 x 7 drapes, 3 seeds")
    sel = {}
    for kind in ("universal", "adjustable"):
        rs = [r for r in resCD if r[0][0] == kind]
        a, u, fb = min(rs, key=lambda r: r[2])
        sel[kind] = u
        if kind == "adjustable":
            out.append("== D. One adjustable-width hanger (width = half shoulder + offset; shape shared), same budget")
        out.append("seeds mean err: " + " ".join(f"{r[2]:.3f}" for r in rs))
        out.append("size  err   design")
        errs = []
        for s in SZ:
            h = to_hanger(u) if kind == "universal" else adjustable_hanger(u, s)
            e = err(h, garment(s, "tee"))
            errs.append(e)
            out.append(f"{s:5s} {e:5.2f}  {fmt(h)}")
        out.append(f"mean {np.mean(errs):.3f} worst {max(errs):.3f}")

    # E. a rack of k fixed widths, shape from D: which k gets within reach of custom?
    ua = sel["adjustable"]
    shape = adjustable_hanger(ua, "M")
    widths = np.arange(13.0, 28.01, 1.0)
    cells = [(Hanger(w=float(w), slope=shape.slope, bow=shape.bow, r=shape.r), s, "tee") for w in widths for s in SZ]
    resE = P.map(eval_cell, cells)
    Emat = np.array([r["err"] for _, r in resE]).reshape(len(widths), len(SZ))
    out.append(f"== E. Rack of k fixed widths with D's shape (slope={shape.slope:.2f} bow={shape.bow:.2f} r={shape.r:.2f}); widths 13..28 cm")
    out.append("width  " + " ".join(f"{s:>6s}" for s in SZ))
    for i, w in enumerate(widths):
        out.append(f"{w:5.1f}  " + " ".join(f"{x:6.2f}" for x in Emat[i]))
    out.append("k  mean_err  worst_err  widths")
    rack = {}
    for k in range(1, 5):
        bestk = min(itertools.combinations(range(len(widths)), k), key=lambda c: Emat[list(c)].min(0).mean())
        m = Emat[list(bestk)].min(0)
        rack[k] = [float(widths[i]) for i in bestk]
        out.append(f"{k}  {m.mean():8.3f}  {m.max():9.3f}  {' '.join(f'{widths[i]:.0f}' for i in bestk)}")
    cm = np.mean([best[(s, 'tee')][1] for s in SZ])
    out.append(f"custom per size (B) mean {cm:.3f} worst {max(best[(s, 'tee')][1] for s in SZ):.3f}")

    # F. proposer comparison at equal budget on size M tee
    jobs = [("M", "tee", k, m, BUDGET) for m in ("random", "cmaes") for k in range(10, 15)]
    resF = P.map(custom, jobs)
    out.append(f"== F. Proposers on M tee, 5 seeds each, best-so-far error at budget")
    out.append("budget  random_median  random_worst  cmaes_median  cmaes_worst")
    for b in (25, 50, 100, 150):
        rr = [r[3][b - 1] for r in resF if r[0][3] == "random"]
        cc = [r[3][b - 1] for r in resF if r[0][3] == "cmaes"]
        out.append(f"{b:6d}  {np.median(rr):13.3f}  {max(rr):12.3f}  {np.median(cc):12.3f}  {max(cc):11.3f}")
    P.close()

    (HERE / ("results_shape_only.txt" if MODE == "shape" else "results.txt")).write_text("\n".join(out) + "\n")
    print("\n".join(out))
    if MODE == "shape":
        return
    # drapes for the figure: M tee on the three stock hangers and its custom hanger
    g = garment("M", "tee")
    dd = {}
    for name, h in list(STOCK.items()) + [("custom", customs[("M", "tee")])]:
        X, s = drape(h, g)
        dd[name] = dict(h=h.__dict__, X=(X / CM).round(3).tolist(), err=round(score(h, g, X, s)["err"], 3), crease=round(score(h, g, X, s)["crease"], 1),
                        centre=(h.centreline() / CM).round(3).tolist())
    from hanger_fit.model import target
    dd["target"] = ((target(g, s) + X[0]) / CM).round(3).tolist()
    (HERE / "drapes.json").write_text(json.dumps(dd))


if __name__ == "__main__":
    main()
