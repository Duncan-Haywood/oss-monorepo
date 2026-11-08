"""Process-damping sweep: how much does a linear process-damping term lift the SD depth limit, and where (by speed)?

Deterministic. Writes experiments/process_damping.txt. cp is swept because no measured coefficient was reachable.
"""
import sys
from dataclasses import replace
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from infra_chatter.model import Tool, sd_limit  # noqa: E402

out = []
def p(s=""):
    out.append(s); print(s, flush=True)

RPM = np.array([2000, 3000, 4000, 6000, 8000, 12000, 16000, 20000], float)
p("== Slotting, SD depth limit (mm) with linear process damping F = -cp w v / V, V = pi D rpm / 60, D = 16 mm")
p("cp (N/m^2)   " + " ".join(f"{int(r):7d}" for r in RPM))
base = None
for cp in [0, 1e3, 3e3, 1e4, 3e4, 1e5, 3e5]:
    t = replace(Tool(), cp=cp)
    row = np.array([sd_limit(t, r, 1.0, True, 0.05, nw=50) for r in RPM]) * 1e3
    if cp == 0: base = row
    p(f"{cp:10.0e}   " + " ".join(f"{x:7.2f}" for x in row))
    if cp: p(f"  gain vs cp=0 " + " ".join(f"{x/b:7.2f}" for x, b in zip(row, base)))
open(Path(__file__).with_name("process_damping.txt"), "w").write("\n".join(out) + "\n")
