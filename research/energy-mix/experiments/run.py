"""Sweeps for energy-mix. Writes experiments/results.json and results.txt. About 15-30 minutes."""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from energy_mix.model import run  # noqa: E402

CAPS = [1.0, 0.5, 0.2, 0.1, 0.05, 0.0]
JOBS = [("A", f"cap{c}", dict(co2_frac=c)) for c in CAPS]
for c in (0.0, 0.1):
    for m in (0.25, 4.0):
        JOBS.append(("B", f"cap{c}_h2store_x{m}", dict(co2_frac=c, h2store_mult=m)))
        JOBS.append(("B", f"cap{c}_batt_x{m}", dict(co2_frac=c, batt_mult=m)))
    JOBS.append(("B", f"cap{c}_no_h2", dict(co2_frac=c, allow_h2=False)))
    JOBS.append(("B", f"cap{c}_no_batt", dict(co2_frac=c, allow_batt=False)))
    JOBS.append(("B", f"cap{c}_neither", dict(co2_frac=c, allow_h2=False, allow_batt=False)))


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
        if "error" in s:
            lines.append(f"{grp} {name}: ERROR {s['error']}")
        else:
            lines.append(f"{grp} {name}: " + " ".join(f"{k}={v:.3f}" for k, v in s.items()))
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
