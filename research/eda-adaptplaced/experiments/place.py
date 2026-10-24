"""Map all 133 designs of dataset.jsonl with Yosys + ABC on SKY130 HD, place each with the OpenROAD wheel, write placed.jsonl.
Run: OPENROAD_PYTHON=/tmp/orv/bin/python python experiments/place.py   (needs yosys, the openroad wheel, network for the PDK; ~10 min on 4 cores)"""
import json, os, subprocess, sys, tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

D = Path(__file__).resolve().parent
R = D.parents[1]
sys.path[:0] = [str(R / "eda-postplace/src"), str(R / "eda-surrogate/src")]
from eda_postplace import flow as F  # noqa: E402
from eda_surrogate import gen  # noqa: E402

PDK = Path(os.environ.get("PDK_DIR", "/tmp/pdk/p"))
if not (PDK / "orfs").exists():
    subprocess.run(["sh", str(R / "eda-flowtune/fetch_pdk.sh"), str(PDK)], check=True)
PLAT = PDK / "orfs/flow/platforms/sky130hd"
ORPY = os.environ.get("OPENROAD_PYTHON", "python3")
PERIOD_PS = 8000
WORK = Path(tempfile.mkdtemp())
LIB = WORK / "sky130.lib"
F.S.F.base.filtered_liberty(PDK / F.S.F.base.LIB_REL, LIB)


def one(job):
    fam, params, v = job
    tag = fam + "_" + "_".join(f"{k}{x}" for k, x in params.items())
    net = WORK / f"{tag}.v"
    r = {"family": fam, "params": params}
    try:
        r.update({"abc_" + k: x for k, x in F.netlist(v, "top", LIB, PERIOD_PS, net).items()})
        r.update(F.place(net, "top", PERIOD_PS / 1000, LIB, PLAT, ORPY))
    except Exception as e:  # recorded, not hidden
        r["error"] = str(e)[:300]
    return r


if __name__ == "__main__":
    jobs = [(f, p, v) for f, items in gen.spaces().items() for p, v, _ in items]
    with ProcessPoolExecutor(4) as ex:
        rows = list(ex.map(one, jobs))
    meta = {"yosys": subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip(),
            "openroad": subprocess.run([ORPY, "-c", "import openroad; print(openroad.openroad_version())"], capture_output=True, text=True).stdout.strip(),
            "pdk_commit": subprocess.run(["git", "-C", str(PDK / "orfs"), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip(),
            "period_ps": PERIOD_PS}
    with open(D / "placed.jsonl", "w") as f:
        f.write(json.dumps({"meta": meta}) + "\n")
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(len(rows), "designs,", sum("error" in r for r in rows), "errors")
