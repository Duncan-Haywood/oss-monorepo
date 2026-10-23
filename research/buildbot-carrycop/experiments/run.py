"""buildbot-carrycop: fastest feasible carry step as the planned centre of pressure moves along the sole.
Flat floor, the carry pose of buildbot-carryphase. Deterministic; about 40 minutes on 4 CPUs. Writes results.json, results.txt."""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[1] / "buildbot-payload" / "src"), str(HERE.parents[1] / "buildbot-carryphase" / "src"),
                str(HERE.parent / "src")]
from buildbot_payload import model as P  # noqa: E402
from buildbot_carryphase import model as C  # noqa: E402
from buildbot_carrycop import model as M  # noqa: E402

HAND = (0.3, 0.6)
PAYLOADS = {"g1": [0, 2, 3, 4, 5], "h1": [0, 10, 14, 18]}
CS = [-0.06, -0.03, 0.0, 0.03, 0.06, 0.09]    # planned CoP offset from the sole point (m); + is toward the toe
LS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4]
TS = [0.4, 0.5, 0.6, 0.8, 1.0, 1.5]
_cache = {}


def setup(name):
    if name not in _cache:
        r = P.load(name)
        _cache[name] = C.Setup(r, P.standing(r))
    return _cache[name]


def job(a):
    name, mass, c, L, T = a
    s, _ = M.score(setup(name), L, T, mass, c, hand=HAND)
    return dict(robot=name, mass=mass, c=c, L=L, T=T, ok=bool(s.ok), ik=s.ik_res, ratio=s.ratio, worst=s.worst,
                zmp=s.zmp_margin, mu=s.mu, fz=s.fz_min)


def best(rows):
    ok = [r for r in rows if r["ok"]]
    return max(ok, key=lambda r: (r["L"] / r["T"], -r["ratio"])) if ok else None


def main():
    jobs = [(n, float(m), c, L, T) for n, ms in PAYLOADS.items() for m in ms for c in CS for L in LS for T in TS]
    print(len(jobs), "cases", file=sys.stderr, flush=True)
    with Pool(4) as pool:
        rows = pool.map(job, jobs, chunksize=4)
    out = {"hand": HAND, "payloads": PAYLOADS, "CS": CS, "LS": LS, "TS": TS,
           "box": {n: [float(v) for v in setup(n).box] for n in PAYLOADS}, "rows": rows}
    (HERE / "results.json").write_text(json.dumps(out, indent=1, default=float))
    write_txt(out)


def write_txt(out):
    rows = out["rows"]
    w = []
    for n, ms in out["payloads"].items():
        x0, x1, _, _ = out["box"][n]
        w.append(f"{n}: sole spans x = {x0*100:.1f} to {x1*100:.1f} cm from the sole point")
        w.append("  fastest feasible step (m/s) by payload (kg) x planned CoP offset (cm); '-' none")
        w.append("  kg   " + " ".join(f"{c*100:>6.0f}" for c in out["CS"]) + "   best c")
        for m in ms:
            line, bs = [], []
            for c in out["CS"]:
                b = best([r for r in rows if r["robot"] == n and r["mass"] == m and r["c"] == c])
                line.append(f"{b['L']/b['T']:>6.2f}" if b else f"{'-':>6}")
                bs.append((b["L"] / b["T"] if b else 0.0, c))
            top = max(bs)
            w.append(f"  {m:>3} " + " ".join(line) + (f"   {top[1]*100:.0f} cm" if top[0] else ""))
        w.append("")
    (HERE / "results.txt").write_text("\n".join(w))
    print("\n".join(w))


if __name__ == "__main__":
    main()
