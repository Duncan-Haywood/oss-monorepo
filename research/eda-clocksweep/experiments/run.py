"""Map the 40 MAC-engine designs of eda-harness to SKY130 HD at several ABC target periods (4 processes).
Run: PYTHONPATH=src:../eda-harness/src:../chip-accel/src python experiments/run.py   (needs yosys, numpy; fetches the PDK)"""
import json, os, subprocess, tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from eda_clocksweep import sweep as S
from eda_harness import harness as H

D = Path(__file__).resolve().parent
PDK = Path(os.environ.get("PDK_DIR", "/tmp/pdk/p"))
if not (PDK / "orfs").exists():
    subprocess.run(["sh", str(D.parents[1] / "eda-flowtune" / "fetch_pdk.sh"), str(PDK)], check=True)
commit = subprocess.run(["git", "-C", str(PDK / "orfs"), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
LIB = tempfile.mkdtemp() + "/sky130.lib"
S.F.base.filtered_liberty(PDK / S.F.base.LIB_REL, LIB)
PERIODS = [None, 3000, 4000, 5000, 6000, 8000, 10000]
prob = H.Problem(n_vec=24)


def one(job):
    p, wb, per = job
    return {"p": p, "wb": wb, "period": per, **S.F.map_full(prob.verilog({"p": p, "wb": wb}), "accel", LIB, S.script(per))}


if __name__ == "__main__":
    log = [json.loads(l) for l in open(D.parents[1] / "eda-harness/experiments/eval_log.jsonl")]
    gen = {}
    for r in log:
        gen.setdefault((r["cand"]["p"], r["cand"]["wb"]), r)
    jobs = [(p, wb, per) for (p, wb) in sorted(gen) for per in PERIODS]
    with ProcessPoolExecutor(4) as ex:
        rows = list(ex.map(one, jobs))
    for r in rows:
        g = gen[(r["p"], r["wb"])]
        r.update(gen_cells=g["cells"], gen_depth=g["depth"], cycles=g["cycles"])
    yv = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
    json.dump({"yosys": yv, "pdk_commit": commit, "periods": PERIODS, "rows": rows}, open(D / "swept.json", "w"), indent=1)
    print(len(rows), "mappings")
