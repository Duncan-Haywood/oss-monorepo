"""Compare garment-thermal's two_node with pythermalcomfort.two_nodes_gagge. Deterministic.
Writes experiments/results.txt."""
import itertools, os, sys, warnings
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodecheck.model import Fabric, Env, two_node
from pythermalcomfort.models import two_nodes_gagge

warnings.filterwarnings("ignore")
out = []
def P(*a):
    s = " ".join(str(x) for x in a); print(s); out.append(s)

import pythermalcomfort
from importlib.metadata import version
P("pythermalcomfort", version("pythermalcomfort"), "| numpy", np.__version__)

IM = 0.45   # pythermalcomfort's default clothing permeability index; ours defaults to 0.4
GRID = list(itertools.product([18, 24, 30, 36], [30, 60, 80], [1.0, 1.5, 2.0], [0.3, 0.7, 1.0]))
FIELDS = [("t_core", "tcr", "C"), ("t_skin", "tsk", "C"), ("w (skin wettedness)", "wet", "-"),
          ("e_skin (evaporative loss)", "evap", "W/m2"), ("q_sensible (dry loss)", "dry", "W/m2")]
REF = {"tcr": "t_core", "tsk": "t_skin", "wet": "w", "evap": "e_skin", "dry": "q_sensible"}

def run(minutes):
    rows = []
    for ta, rh, met, clo in GRID:
        r = two_nodes_gagge(tdb=ta, tr=ta, v=0.1, rh=rh, met=met, clo=clo, round_output=False)
        o = two_node(met, Fabric(clo=clo, im=IM), Env(ta, ta, 0.1, rh), minutes=minutes)
        rows.append((ta, rh, met, clo, {k: o[k] - float(getattr(r, v)) for k, v in REF.items()},
                     {k: float(getattr(r, v)) for k, v in REF.items()}))
    return rows

rows = run(60)
P(f"\n== A. {len(rows)} combinations, ta = tr (18-36 C), rh 30-80%, v 0.1, 1.0-2.0 met, 0.3-1.0 clo, im {IM}; ours run 60 min ==")
P("difference = ours - pythermalcomfort; columns: mean, mean |d|, min, max")
for name, key, unit in FIELDS:
    d = np.array([r[4][key] for r in rows])
    P(f"{name:28s} [{unit:4s}] mean {d.mean():+.3f}  mean|d| {np.abs(d).mean():.3f}  min {d.min():+.3f}  max {d.max():+.3f}")

P("\n== B. by air temperature: mean |d| of t_skin (C) and e_skin (W/m2), mean d of t_core (C) ==")
for ta in (18, 24, 30, 36):
    sub = [r for r in rows if r[0] == ta]
    P(f"ta {ta} C: |d t_skin| {np.mean([abs(r[4]['tsk']) for r in sub]):.2f}  |d e_skin| {np.mean([abs(r[4]['evap']) for r in sub]):.2f}"
      f"  d t_core {np.mean([r[4]['tcr'] for r in sub]):+.3f}")

P("\n== C. largest single discrepancies ==")
for name, key, unit in FIELDS[1:2] + FIELDS[3:4]:
    worst = max(rows, key=lambda r: abs(r[4][key]))
    P(f"{name}: ours - ref = {worst[4][key]:+.2f} {unit} at ta {worst[0]} C, rh {worst[1]}%, {worst[2]} met, {worst[3]} clo (ref {worst[5][key]:.2f})")

P("\n== D. does the run length matter? mean |d| of t_core and t_skin (C) for 30, 60, 120 min ==")
for m in (30, 60, 120):
    rr = run(m)
    P(f"{m:3d} min: |d t_core| {np.mean([abs(r[4]['tcr']) for r in rr]):.3f}  |d t_skin| {np.mean([abs(r[4]['tsk']) for r in rr]):.3f}")

P("\n== E. is the sign of a change preserved? clo 0.3 -> 1.0 and rh 30 -> 80, change in t_skin (C), ours vs reference ==")
agree = n = 0
for ta, met in itertools.product((18, 24, 30, 36), (1.0, 1.5, 2.0)):
    for key_pair in (("clo", 0.3, 1.0), ("rh", 30, 80)):
        res = []
        for lo_hi in key_pair[1:]:
            clo = lo_hi if key_pair[0] == "clo" else 0.7
            rh = lo_hi if key_pair[0] == "rh" else 50
            r = two_nodes_gagge(tdb=ta, tr=ta, v=0.1, rh=rh, met=met, clo=clo, round_output=False)
            o = two_node(met, Fabric(clo=clo, im=IM), Env(ta, ta, 0.1, rh), minutes=60)
            res.append((o["tsk"], float(r.t_skin)))
        do, dr = res[1][0] - res[0][0], res[1][1] - res[0][1]
        n += 1; agree += (do > 0) == (dr > 0)
P(f"sign of the t_skin change agrees in {agree} of {n} cases")

with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(out) + "\n")
