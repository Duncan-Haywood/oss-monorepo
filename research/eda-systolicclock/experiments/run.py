"""Map chip-systolic's 24 designs (R=4 batch; 4x{1,2,4,8} systolic and P={1,2,4,8} MAC lanes at WB 4/6/8) to SKY130 HD at shared ABC targets.
Run: PYTHONPATH=src:../chip-systolic/src python experiments/run.py   (needs yosys, numpy; fetches the PDK; 4 processes)"""
import json, os, subprocess, sys, tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from eda_systolicclock import clock as K
from chip_systolic import baseline_gen, gen, model

S = K.S
D = Path(__file__).resolve().parent
PDK = Path(os.environ.get("PDK_DIR", "/tmp/pdk/p"))
if not (PDK / "orfs").exists():
    subprocess.run(["sh", str(D.parents[1] / "eda-flowtune" / "fetch_pdk.sh"), str(PDK)], check=True)
commit = subprocess.run(["git", "-C", str(PDK / "orfs"), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
LIB = tempfile.mkdtemp() + "/sky130.lib"
S.F.base.filtered_liberty(PDK / S.F.base.LIB_REL, LIB)
PERIODS = [None, 3000, 4000, 5000, 6000, 8000, 10000]
R = 4
xtr, ytr = model.make_data(0, 400)
Q = {wb: model.quantise(model.train_float(xtr, ytr), xtr, wb) for wb in (4, 6, 8)}


def one(job):
    kind, c, wb, per = job
    src = gen.verilog(Q[wb], c, R) if kind == "systolic" else baseline_gen.verilog(Q[wb], c)
    cy = gen.cycles(c, R) if kind == "systolic" else R * baseline_gen.cycles(c)
    return {"kind": kind, "c": c, "wb": wb, "period": per, "cycles": cy, **S.F.map_full(src, "accel", LIB, S.script(per))}


if __name__ == "__main__":
    jobs = [(k, c, wb, per) for wb in (4, 6, 8) for k in ("systolic", "lane") for c in (1, 2, 4, 8) for per in PERIODS]
    with ProcessPoolExecutor(4) as ex:
        rows = list(ex.map(one, jobs))
    yv = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
    json.dump({"yosys": yv, "pdk_commit": commit, "periods": PERIODS, "batch": R, "rows": rows}, open(D / "swept.json", "w"), indent=1)
    print(len(rows), "mappings")
