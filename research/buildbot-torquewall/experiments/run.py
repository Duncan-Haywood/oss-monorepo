"""buildbot-torquewall: fastest feasible carry step when one group of joint torque limits is scaled.
Flat floor, the carry pose of buildbot-carryphase. Deterministic; run time stated in the README. Writes results.json, results.txt."""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[1] / "buildbot-payload" / "src"), str(HERE.parents[1] / "buildbot-carryphase" / "src"),
                str(HERE.parent / "src")]
from buildbot_payload import fetch, model as P  # noqa: E402
from buildbot_carryphase import model as C  # noqa: E402
from buildbot_torquewall import model as M  # noqa: E402

HAND = (0.3, 0.6)
PAYLOADS = {"g1": [0, 4, 6, 8, 10], "h1": [0, 14, 18, 23, 30]}
CONFIGS = [("all", 1.0)] + [(g, f) for g in M.GROUPS for f in (2.0, 4.0)]
LS = [0.1, 0.2, 0.3]
TS = [0.6, 1.0, 1.5]
_cache = {}


def setup(name):
    if name not in _cache:
        r = P.load(name)
        _cache[name] = C.Setup(r, P.standing(r))
    return _cache[name]


def job(a):
    name, mass, group, f, L, T = a
    s, _ = M.score(setup(name), L, T, mass, group, f, hand=HAND)
    return dict(robot=name, mass=mass, group=group, f=f, L=L, T=T, ok=bool(s.ok), ik=s.ik_res, ratio=s.ratio,
                worst=s.worst, zmp=s.zmp_margin, mu=s.mu, fz=s.fz_min)


def best(rows):
    ok = [r for r in rows if r["ok"]]
    return max(ok, key=lambda r: (r["L"] / r["T"], -r["ratio"])) if ok else None


def main():
    jobs = [(n, float(m), g, f, L, T) for n, ms in PAYLOADS.items() for m in ms for g, f in CONFIGS
            for L in LS for T in TS]
    print(len(jobs), "cases", file=sys.stderr, flush=True)
    with Pool(4) as pool:
        rows = pool.map(job, jobs, chunksize=4)
    out = {"menagerie_commit": fetch.COMMIT, "hand": HAND, "payloads": PAYLOADS, "configs": CONFIGS, "LS": LS, "TS": TS,
           "rows": rows}
    (HERE / "results.json").write_text(json.dumps(out, indent=1, default=float))
    write_txt(out)


def write_txt(o):
    rows = o["rows"]
    L = [f"Menagerie commit {o['menagerie_commit']}; hands at {o['hand']} m (reach, height); step grid L={o['LS']} T={o['TS']}", ""]
    for n, ms in o["payloads"].items():
        L.append(f"{n.upper()}: fastest feasible step (m/s; - = none) by payload and scaled joint group")
        L.append("  payload  " + "  ".join(f"{g}x{f:g}".rjust(10) for g, f in o["configs"]))
        for m in ms:
            cells = []
            for g, f in o["configs"]:
                b = best([r for r in rows if r["robot"] == n and r["mass"] == m and r["group"] == g and r["f"] == f])
                cells.append(("-" if b is None else f"{b['L'] / b['T']:.2f}").rjust(10))
            L.append(f"  {m:>4g} kg  " + "  ".join(cells))
        L.append("")
    L.append("Joint that exceeds its limit first (worst) in the cases that fail only on torque, unscaled, by payload:")
    for n, ms in o["payloads"].items():
        for m in ms:
            rs = [r for r in rows if r["robot"] == n and r["mass"] == m and r["group"] == "all" and r["f"] == 1.0
                  and r["ik"] < 5e-3 and r["ratio"] > 1.0]
            cnt = {}
            for r in rs:
                cnt[r["worst"]] = cnt.get(r["worst"], 0) + 1
            L.append(f"  {n} {m:>4g} kg: " + (", ".join(f"{k} {v}" for k, v in sorted(cnt.items(), key=lambda kv: -kv[1])) or "none"))
    (HERE / "results.txt").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
