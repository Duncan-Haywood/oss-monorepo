"""Milestone 60: out-of-sample check of the min-observations choice.
Choose min obs on the 40 main cells (lowest BOHB mean regret at a budget), score that choice on the 10
held-out cells of milestone 27, and the reverse. No flow. Usage: python3 oos_minobs.py (about 10 min).
Writes oos_minobs.txt."""
import json, os, subprocess, sys
from pathlib import Path
H = Path(__file__).resolve().parent
MINOBS = (3, 5, 6, 8, 12)
ARMS = ("rand", "bohb", "bohb_r4first")
res = {}
for m in MINOBS:
    for mode in ("main", "unseen"):
        tag = f"oos{m}"
        e = dict(os.environ, BOHB_TAG=tag, BOHB_MINOBS=str(m))
        subprocess.run([sys.executable, str(H / "bohb.py")] + (["unseen"] if mode == "unseen" else []), env=e, check=True, capture_output=True)
        suf = ("_unseen" if mode == "unseen" else "") + "_" + tag
        res[(m, mode)] = json.loads((H / f"summary{suf}.json").read_text())
        for pre, ext in (("summary", "json"), ("results", "txt")):
            (H / f"{pre}{suf}.{ext}").unlink()
L = ["budget | minobs | main40 bohb | unseen10 bohb | main40 rand | unseen10 rand"]
for B in (15, 25, 40):
    k = f"mean_B{B}"
    for m in MINOBS:
        g = lambda mode, a: float(res[(m, mode)][k][a])
        L.append(f"{B} | {m} | {g('main','bohb'):.2f} | {g('unseen','bohb'):.2f} | {g('main','rand'):.2f} | {g('unseen','rand'):.2f}")
    best = min(MINOBS, key=lambda m: float(res[(m, "main")][k]["bohb"]))
    L.append(f"{B} | chosen on main = {best}: unseen bohb {float(res[(best,'unseen')][k]['bohb']):.2f} vs unseen rand {float(res[(best,'unseen')][k]['rand']):.2f}; "
             f"unseen-best = {min(MINOBS, key=lambda m: float(res[(m,'unseen')][k]['bohb']))}")
(H / "oos_minobs.txt").write_text("\n".join(L) + "\n")
print("\n".join(L))
