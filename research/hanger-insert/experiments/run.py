"""All experiments for hanger-insert; writes results.txt (deterministic).

PYTHONPATH=src python3 experiments/run.py      about 1-2 minutes
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "hanger-fit" / "src"))
from hanger_insert import model as M  # noqa: E402
from hanger_fit.model import SIZES, Hanger as FitHanger, garment, objective, score  # noqa: E402

HERE = Path(__file__).resolve().parent
out = []


def say(s=""):
    print(s)
    out.append(s)


ADJ = dict(slope=15.9, r=2.86)      # hanger-fit result D: bow 0.6 cm, round 2.86 cm end, width = shoulder + 0.8 cm


def stock(name):
    return {"wire": M.Hanger(20.5, 22.0, 0.15), "plastic": M.Hanger(20.0, 20.0, 0.5),
            "wood-shaped": M.Hanger(22.5, 16.0, 2.0)}[name]


def designs(r=ADJ["r"]):
    """name -> function of the half shoulder -> insertion hanger (width set per garment where the design allows)."""
    return {
        "wire": lambda hs: stock("wire"),
        "plastic": lambda hs: stock("plastic"),
        "wood-shaped": lambda hs: stock("wood-shaped"),
        "custom-rigid": lambda hs: M.Hanger(hs + 0.8, ADJ["slope"], r),
        "adjustable": lambda hs: M.Hanger(hs + 0.8, ADJ["slope"], r, w_collapsed=10.0, t_mech=1.0),
        "collapsible": lambda hs: M.Hanger(hs + 0.8, ADJ["slope"], r, fold=60.0, t_mech=1.5),
    }


def sweep(make, fabric, **kw):
    rs = [M.best_route(make(hs), hs, fabric, **kw) for hs in SIZES.values()]
    return dict(p=np.mean([x["p_success"] for x in rs]), worst=min(x["p_success"] for x in rs),
                t=np.mean([x["time"] for x in rs if x["time"] is not None] or [float("nan")]),
                hem=sum(x["route"] == "hem" for x in rs), strain=max(x["neck_strain"] for x in rs),
                peak=max(x["hanger_peak"] for x in rs))


say("== A. Insertion by design and fabric (7 sizes each, best of neck and hem route, 2 grippers)")
say("hanger         fabric   mean_p  worst_p  time_s  hem_n  peak_cm  neck_strain_%")
for name, make in designs().items():
    for fab in M.GARMENTS:
        a = sweep(make, fab)
        say(f"{name:<14} {fab:<8} {a['p']:6.3f}  {a['worst']:6.3f}  {a['t']:6.2f}  {a['hem']:5d}  {a['peak']:7.1f}  {100 * a['strain']:8.1f}")
say()

say("== B. Smallest loop each hanger needs: peak P_req (cm) against end radius r (cm), width 22.8 cm")
say("r      rigid  adjustable_wc10  collapsible_60")
for r in (0.15, 0.5, 1.0, 1.5, 2.0, 2.86, 3.5):
    row = [M.Grid(M.Hanger(22.8, 15.9, r, **kw)).min_peak()[0]
           for kw in ({}, dict(w_collapsed=10.0), dict(fold=60.0))]
    say(f"{r:<6} {row[0]:5.1f}  {row[1]:14.1f}  {row[2]:14.1f}")
say()

say("== C. Peak P_req (cm) of the adjustable hanger against its collapsed half-width (r 2.86)")
say("w_c   peak")
for wc in (4, 6, 8, 10, 12, 14, 16, 20):
    say(f"{wc:<5} {M.Grid(M.Hanger(22.8, 15.9, 2.86, w_collapsed=float(wc))).min_peak()[0]:5.1f}")
say()

say("== D. Sensitivity: mean success over 7 sizes (route chosen per size)")
say("design        fabric   baseline  sigma3  one_gripper  grip6  hem_blind4  eps_half")
for name in ("wood-shaped", "custom-rigid", "adjustable", "collapsible"):
    make = designs()[name]
    for fab in ("tee", "shirt", "sweater"):
        e = M.GARMENTS[fab]["eps_max"]
        v = [sweep(make, fab)["p"], sweep(make, fab, sigma=3.0)["p"], sweep(make, fab, grippers=1)["p"],
             sweep(make, fab, grip_len=6.0)["p"], sweep(make, fab, sigma_blind=4.0)["p"], sweep(make, fab, eps_max=e / 2)["p"]]
        say(f"{name:<13} {fab:<8} " + "  ".join(f"{x:8.3f}" for x in v))
say()

say("== E. Feedback to hanger-fit: end radius r against shape error and insertion (adjustable hanger, width shoulder + 0.8)")
say("r      fit_tee_M  fit_shirt_M  fit_tee_child  fit_tee_XXL  ins_tee  ins_shirt  ins_sweater  time_shirt_s")
rows = []
for r in (0.5, 1.0, 1.5, 2.0, 2.86, 3.5):
    fit = []
    for size, fab in (("M", "tee"), ("M", "shirt"), ("child", "tee"), ("XXL", "tee")):
        g = garment(size, fab)
        fit.append(objective(score(FitHanger(w=g.half_shoulder + 0.8, slope=15.9, bow=0.6, r=r), g)))
    make = designs(r)["adjustable"]
    ins = [sweep(make, fab) for fab in ("tee", "shirt", "sweater")]
    rows.append((r, fit, ins))
    say(f"{r:<6} {fit[0]:9.3f}  {fit[1]:11.3f}  {fit[2]:13.3f}  {fit[3]:11.3f}  {ins[0]['p']:7.3f}  {ins[1]['p']:9.3f}  {ins[2]['p']:11.3f}  {ins[1]['t']:12.2f}")
say()

say("== F. Route and neck stretch (%) per size: n = neck, h = hem; stretch is on the opening used")
say("design        fabric   " + "  ".join(f"{k:>7}" for k in SIZES))
for name in ("wood-shaped", "custom-rigid", "adjustable"):
    for fab in ("tee", "shirt", "sweater"):
        cells = []
        for hs in SIZES.values():
            x = M.best_route(designs()[name](hs), hs, fab)
            cells.append(f"{x['route'][0]}{100 * x['neck_strain']:5.0f}")
        say(f"{name:<13} {fab:<8} " + "  ".join(f"{c:>7}" for c in cells))
say()

(HERE / "results.txt").write_text("\n".join(out) + "\n")
