"""Solve the sourced German system at several emission caps and store types; write results.json (long: background)."""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
for p in ("src", "../energy-mix-sourced/src"):
    sys.path.insert(0, str((HERE.parent / p).resolve()))
from energy_lcos_realised.realised import run  # noqa: E402

JOBS = [(f"{h2}_cap{c}", dict(h2=h2, co2_frac=c)) for h2 in ("cavern", "tank") for c in (1.0, 0.5, 0.2, 0.1, 0.05, 0.0)]


def work(job):
    name, kw = job
    try:
        return name, kw, run(**kw)
    except Exception as e:
        return name, kw, {"error": str(e)[:100]}


if __name__ == "__main__":
    with Pool(int(sys.argv[1]) if len(sys.argv) > 1 else 4) as p:
        res = p.map(work, JOBS, chunksize=1)
    (HERE / "results.json").write_text(json.dumps(res, indent=1))
    print("done")
