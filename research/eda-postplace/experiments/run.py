"""Map the 40 MAC-engine designs of eda-harness at two shared ABC targets, place each with OpenROAD (4 processes).
Run: OPENROAD_PYTHON=<python with `pip install openroad`> PYTHONPATH=src:../eda-harness/src:../chip-accel/src python experiments/run.py
Needs yosys, numpy; fetches the PDK (SKY130 HD platform files) to $PDK_DIR (default /tmp/pdk/p)."""
import json, os, subprocess, tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from eda_postplace import flow as F
from eda_harness import harness as H

D = Path(__file__).resolve().parent
PDK = Path(os.environ.get("PDK_DIR", "/tmp/pdk/p"))
if not (PDK / "orfs").exists():
    subprocess.run(["sh", str(D.parents[1] / "eda-flowtune" / "fetch_pdk.sh"), str(PDK)], check=True)
PLAT = PDK / "orfs/flow/platforms/sky130hd"
ORPY = os.environ.get("OPENROAD_PYTHON", "python3")
WORK = Path(tempfile.mkdtemp())
LIB = WORK / "sky130.lib"
F.S.F.base.filtered_liberty(PDK / F.S.F.base.LIB_REL, LIB)
TARGETS = [5000, 8000]
prob = H.Problem(n_vec=24)


def one(job):
    p, wb, per = job
    net = WORK / f"p{p}w{wb}_{per}.v"
    r = {"p": p, "wb": wb, "period": per, **{"abc_" + k: v for k, v in F.netlist(prob.verilog({"p": p, "wb": wb}), "accel", LIB, per, net).items()}}
    r.update(F.place(net, "accel", per / 1000, LIB, PLAT, ORPY))
    return r


if __name__ == "__main__":
    log = [json.loads(l) for l in open(D.parents[1] / "eda-harness/experiments/eval_log.jsonl")]
    gen = {}
    for r in log:
        gen.setdefault((r["cand"]["p"], r["cand"]["wb"]), r)
    jobs = [(p, wb, per) for (p, wb) in sorted(gen) for per in TARGETS]
    with ProcessPoolExecutor(4) as ex:
        rows = list(ex.map(one, jobs))
    for r in rows:
        g = gen[(r["p"], r["wb"])]
        r.update(gen_cells=g["cells"], gen_depth=g["depth"], cycles=g["cycles"])
    yv = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
    ov = subprocess.run([ORPY, "-c", "import openroad; print(openroad.openroad_version())"], capture_output=True, text=True).stdout.strip()
    commit = subprocess.run(["git", "-C", str(PDK / "orfs"), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    json.dump({"yosys": yv, "openroad": ov, "pdk_commit": commit, "targets": TARGETS, "rows": rows}, open(D / "placed.json", "w"), indent=1)
    print(len(rows), "placements")
