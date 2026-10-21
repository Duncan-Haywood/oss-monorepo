"""Sweeps for energy-mix-sourced. Writes experiments/results.json and results.txt (about 15-40 min on 4 cores)."""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from energy_mix_sourced.model import run  # noqa: E402

CAPS = [1.0, 0.5, 0.2, 0.1, 0.05, 0.0]
JOBS = []
for basis in ("head_2030", "v092_2030", "v092_2050"):
    for h2 in ("tank", "cavern"):
        for c in CAPS:
            JOBS.append(("A", f"{basis}_{h2}_cap{c}", dict(basis=basis, h2=h2, co2_frac=c)))
for h2 in ("tank", "cavern"):  # storage options at zero emissions on the reference basis
    JOBS.append(("B", f"head_2030_{h2}_no_batt", dict(basis="head_2030", h2=h2, co2_frac=0.0, allow_batt=False)))
JOBS.append(("B", "head_2030_no_h2", dict(basis="head_2030", co2_frac=0.0, allow_h2=False)))
JOBS.append(("B", "head_2030_neither", dict(basis="head_2030", co2_frac=0.0, allow_h2=False, allow_batt=False)))
for r in (0.03, 0.10):  # the one input not in the cost table
    JOBS.append(("C", f"head_2030_tank_rate{r}_cap0.0", dict(basis="head_2030", h2="tank", co2_frac=0.0, rate=r)))


def work(job):
    grp, name, kw = job
    try:
        return grp, name, kw, run(**kw)[2]
    except Exception as e:  # infeasible or solver failure is a result
        return grp, name, kw, {"error": str(e)[:80]}


if __name__ == "__main__":
    with Pool(int(sys.argv[1]) if len(sys.argv) > 1 else 4) as p:
        res = p.map(work, JOBS, chunksize=1)
    (HERE / "results.json").write_text(json.dumps(res, indent=1))
    lines = []
    for grp, name, kw, s in res:
        lines.append(f"{grp} {name}: ERROR {s['error']}" if "error" in s
                     else f"{grp} {name}: " + " ".join(f"{k}={v:.3f}" for k, v in s.items()))
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
