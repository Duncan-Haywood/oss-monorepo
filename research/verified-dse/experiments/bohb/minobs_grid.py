"""Milestone 58: min-observations grid (3, 5, 8, 12) at the other defaults, pooled over 50 cells.
Usage: python3 minobs_grid.py (about 30 min; runs bohb.py 8 times, no flow). Writes minobs_grid.txt."""
import json, os, subprocess, sys
from pathlib import Path
H = Path(__file__).resolve().parent
CFG = [(f"minobs{m}", {"BOHB_MINOBS": str(m)}) for m in (3, 5, 8, 12)]
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
(H / "minobs_grid.txt").write_text("\n".join(lines) + "\n")
print("\n".join(lines))
