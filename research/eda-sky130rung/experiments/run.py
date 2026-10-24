"""Map the 40 MAC-engine designs of eda-harness to SKY130 HD and compare with the generic-gate rung.
Run: PYTHONPATH=src:../eda-harness/src:../chip-accel/src python experiments/run.py   (needs yosys, numpy; fetches the PDK)"""
import json, os, subprocess, sys, tempfile
from pathlib import Path
from eda_sky130rung import flow as F, rank as R
from eda_harness import harness as H

D = Path(__file__).resolve().parent
PDK = Path(os.environ.get("PDK_DIR", "/tmp/pdk/p"))
if not (PDK / "orfs").exists():
    subprocess.run(["sh", str(D.parents[1] / "eda-flowtune" / "fetch_pdk.sh"), str(PDK)], check=True)
commit = subprocess.run(["git", "-C", str(PDK / "orfs"), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
lib = tempfile.mkdtemp() + "/sky130.lib"
F.base.filtered_liberty(PDK / F.base.LIB_REL, lib)

log = [json.loads(l) for l in open(D.parent.parent / "eda-harness/experiments/eval_log.jsonl")]
generic = {}
for r in log:
    generic.setdefault((r["cand"]["p"], r["cand"]["wb"]), r)
prob = H.Problem(n_vec=24)
rows = []
for (p, wb), g in sorted(generic.items()):
    m = F.map_full(prob.verilog({"p": p, "wb": wb}), "accel", lib)
    rows.append({"p": p, "wb": wb, "gen_cells": g["cells"], "gen_ff": g["ff"], "gen_depth": g["depth"], "cycles": g["cycles"], **m})
    print(rows[-1], flush=True)
yv = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
json.dump({"yosys": yv, "pdk_commit": commit, "script": F.SCRIPT, "rows": rows}, open(D / "mapped.json", "w"), indent=1)
