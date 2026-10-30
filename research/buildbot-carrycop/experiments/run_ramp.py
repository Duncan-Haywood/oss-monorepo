"""buildbot-carrycop, time-varying CoP: fastest feasible carry step when the planned centre of pressure travels
linearly along the sole during single support (heel to toe and the reverse). Same grid and scoring as run.py.
Deterministic; about 30 minutes on 4 CPUs. Writes results_ramp.json, results_ramp.txt."""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE)]
import run as R  # noqa: E402  (sets up sys.path for the model packages)
from buildbot_carrycop import model as M  # noqa: E402

PAYLOADS = {"g1": [0, 3, 4], "h1": [0, 10]}
RAMPS = [(0.0, 0.0), (-0.03, 0.03), (-0.06, 0.06), (-0.06, 0.0), (0.0, 0.06), (-0.06, 0.03), (0.03, -0.03), (0.06, -0.06)]


def job(a):
    name, mass, c0, c1, L, T = a
    s, _ = M.score_ramp(R.setup(name), L, T, mass, c0, c1, hand=R.HAND)
    return dict(robot=name, mass=mass, c0=c0, c1=c1, L=L, T=T, ok=bool(s.ok), ik=s.ik_res, ratio=s.ratio,
                worst=s.worst, zmp=s.zmp_margin)


def main():
    jobs = [(n, float(m), c0, c1, L, T) for n, ms in PAYLOADS.items() for m in ms for c0, c1 in RAMPS
            for L in R.LS for T in R.TS]
    print(len(jobs), "cases", file=sys.stderr, flush=True)
    with Pool(4) as pool:
        rows = pool.map(job, jobs, chunksize=4)
    out = {"payloads": PAYLOADS, "ramps": RAMPS, "LS": R.LS, "TS": R.TS, "rows": rows}
    (HERE / "results_ramp.json").write_text(json.dumps(out, indent=1, default=float))
    w = []
    for n, ms in PAYLOADS.items():
        w.append(f"{n}: fastest feasible step (m/s) by payload (kg) x CoP ramp c0->c1 (cm); '-' none; [passing of {len(R.LS)*len(R.TS)}]")
        w.append("  kg  " + " ".join(f"{c0*100:>3.0f}>{c1*100:<3.0f}" for c0, c1 in RAMPS))
        for m in ms:
            line = []
            for c0, c1 in RAMPS:
                rs = [r for r in rows if r["robot"] == n and r["mass"] == m and r["c0"] == c0 and r["c1"] == c1]
                b = R.best(rs)
                line.append(f"{b['L']/b['T']:>4.2f}[{sum(r['ok'] for r in rs):>2}]" if b else f"  - [{sum(r['ok'] for r in rs):>2}]")
            w.append(f"  {m:>3} " + " ".join(line))
        w.append("")
    (HERE / "results_ramp.txt").write_text("\n".join(w))
    print("\n".join(w))


if __name__ == "__main__":
    main()
