"""Milestone 57: one-at-a-time sensitivity of the BOHB arm to gamma, random fraction and min observations, pooled over the 40 + 10 cells.
Usage: python3 sweep.py (about 30 min; runs bohb.py 14 times, no flow). Writes sweep.txt."""
import json, os, subprocess, sys
from pathlib import Path
H = Path(__file__).resolve().parent
CFG = [("base", {})] + [(f"gamma{g}", {"BOHB_GAMMA": str(g)}) for g in (0.1, 0.15, 0.4)] + [(f"prand{p}", {"BOHB_PRANDOM": str(p)}) for p in (0, 0.15, 0.6)] + [(f"minobs{m}", {"BOHB_MINOBS": str(m)}) for m in (4, 10)]
ARMS = ("rand", "sh_r2", "hb", "bohb", "bohb_r4first")
lines = ["config | budget | " + " | ".join(ARMS) + "   (mean regret %, 50 cells pooled = (40*main + 10*unseen)/50)"]
for name, env in CFG:
    res = {}
    for mode in ("main", "unseen"):
        tag = "s_" + name
        e = dict(os.environ, BOHB_TAG=tag, **env)
        subprocess.run([sys.executable, str(H / "bohb.py")] + (["unseen"] if mode == "unseen" else []), env=e, check=True, capture_output=True)
        suf = ("_unseen" if mode == "unseen" else "") + "_" + tag
        res[mode] = json.loads((H / f"summary{suf}.json").read_text())
        for ext in ("json", "txt"):
            (H / f"{'summary' if ext == 'json' else 'results'}{suf}.{ext}").unlink()
    for B in (15, 25, 40):
        k = f"mean_B{B}"
        row = [(40 * float(res["main"][k][a]) + 10 * float(res["unseen"][k][a])) / 50 for a in ARMS]
        lines.append(f"{name} | {B} | " + " | ".join(f"{v:.2f}" for v in row))
(H / "sweep.txt").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
