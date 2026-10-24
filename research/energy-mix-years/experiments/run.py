"""Five weather years x {tank, cavern} x {zero emissions, 95% cut} on the 2025-euro 2030 costs.
Writes experiments/results.json and results.txt (10 to 40 min on 4 cores)."""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from energy_mix_years.model import YEARS, run  # noqa: E402

JOBS = [(f"{y}_{h2}_cap{c}", dict(year=y, h2=h2, co2_frac=c))
        for y in YEARS for h2 in ("tank", "cavern") for c in (0.0, 0.05)]


def work(job):
    name, kw = job
    try:
        return name, run(**kw)[2]
    except Exception as e:
        return name, {"error": str(e)[:80]}


if __name__ == "__main__":
    with Pool(int(sys.argv[1]) if len(sys.argv) > 1 else 4) as p:
        res = p.map(work, JOBS, chunksize=1)
    (HERE / "results.json").write_text(json.dumps(res, indent=1))
    lines = [f"{n}: ERROR {s['error']}" if "error" in s else f"{n}: " + " ".join(f"{k}={v:.3f}" for k, v in s.items())
             for n, s in res]
    (HERE / "results.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
