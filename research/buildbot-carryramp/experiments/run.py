"""buildbot-carryramp: fastest feasible carry step as the planned CoP is swept heel-to-toe during single support.
Flat floor, the carry pose of buildbot-carryphase. Deterministic. Writes results.json, results.txt."""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[1] / "buildbot-payload" / "src"), str(HERE.parents[1] / "buildbot-carryphase" / "src"),
                str(HERE.parent / "src")]
from buildbot_payload import model as P  # noqa: E402
from buildbot_carryphase import model as C  # noqa: E402
from buildbot_carryramp import model as M  # noqa: E402

HAND = (0.3, 0.6)
PAYLOADS = {"g1": [0, 3, 4, 5], "h1": [0, 10, 14]}
# (c0, c1) in m from the sole point; + is toward the toe. (0, 0) reproduces carryphase; (-.06, -.06) is carrycop's best G1 case.
RAMPS = [(0.0, 0.0), (-0.06, -0.06), (-0.06, 0.0), (-0.06, 0.03), (-0.06, 0.06), (-0.03, 0.03), (0.0, 0.03), (0.03, -0.03)]
LS = [0.1, 0.15, 0.2, 0.25, 0.3]
TS = [0.4, 0.5, 0.6, 0.8, 1.0, 1.5]
_cache = {}


def setup(name):
    if name not in _cache:
        r = P.load(name)
        _cache[name] = C.Setup(r, P.standing(r))
    return _cache[name]


def job(a):
    name, mass, ramp, L, T = a
    s, _ = M.score(setup(name), L, T, mass, ramp[0], ramp[1], hand=HAND)
    return dict(robot=name, mass=mass, ramp=list(ramp), L=L, T=T, ok=bool(s.ok), ik=s.ik_res, ratio=s.ratio,
                worst=s.worst, zmp=s.zmp_margin)


def best(rows):
    ok = [r for r in rows if r["ok"]]
    return max(ok, key=lambda r: (r["L"] / r["T"], -r["ratio"])) if ok else None


def main():
    jobs = [(n, float(m), r, L, T) for n, ms in PAYLOADS.items() for m in ms for r in RAMPS for L in LS for T in TS]
    print(len(jobs), "cases", file=sys.stderr, flush=True)
    with Pool(4) as pool:
        rows = pool.map(job, jobs, chunksize=4)
    out = {"hand": HAND, "payloads": PAYLOADS, "RAMPS": RAMPS, "LS": LS, "TS": TS, "rows": rows}
    (HERE / "results.json").write_text(json.dumps(out, indent=1, default=float))
    write_txt(out)


def write_txt(out):
    rows = out["rows"]
    w = ["fastest feasible step (m/s) by payload (kg) x CoP sweep c0->c1 (cm from sole point, + toward toe); '-' none", ""]
    hdr = " ".join(f"{r[0]*100:>4.0f}>{r[1]*100:<3.0f}" for r in out["RAMPS"])
    for n, ms in out["payloads"].items():
        w.append(f"{n}:  kg  {hdr}")
        for m in ms:
            line = []
            for r in out["RAMPS"]:
                b = best([x for x in rows if x["robot"] == n and x["mass"] == m and x["ramp"] == list(r)])
                line.append(f"{b['L']/b['T']:>8.2f}" if b else f"{'-':>8}")
            w.append(f"     {m:>3}  " + " ".join(line))
        npass = [sum(1 for x in rows if x["robot"] == n and x["ramp"] == list(r) and x["ok"]) for r in out["RAMPS"]]
        w.append("  cases passing per sweep: " + ", ".join(map(str, npass)))
        w.append("")
    (HERE / "results.txt").write_text("\n".join(w))
    print("\n".join(w))


if __name__ == "__main__":
    main()
