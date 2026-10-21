"""buildbot-carryphase: single-support inverse dynamics of a G1 / H1 carrying a load, over payload, step length,
step time, slope and a step-up. Deterministic; about 10 minutes on 4 CPUs (Pool(4)). Writes results.json and results.txt."""
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE.parents[1] / "buildbot-payload" / "src"), str(HERE.parent / "src")]
from buildbot_payload import fetch, model as P  # noqa: E402
from buildbot_carryphase import model as C, rate  # noqa: E402

HAND = (0.3, 0.6)                       # hands 0.3 m ahead of the stance sole, 0.6 m up: buildbot-payload's carry pose
PAYLOADS = {"g1": [0, 1, 2, 3, 4, 5], "h1": [0, 5, 10, 14, 18, 23]}
LS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4]   # step length (m)
TS = [0.4, 0.5, 0.6, 0.8, 1.0, 1.5]     # single-support time (s)
SLOPES = {"flat": 0.0, "ramp 1:12 (4.8 deg)": 4.76, "ramp 1:8 (7.1 deg)": 7.13}
RISES = [0.0, 0.05, 0.10, 0.15, 0.20]   # swing foot lands this much higher (m)

_cache = {}


def setup(name):
    if name not in _cache:
        r = P.load(name)
        _cache[name] = C.Setup(r, P.standing(r))
    return _cache[name]


def job(a):
    name, mass, L, T, slope, rise = a
    s, _ = C.score(setup(name), L, T, mass, slope_deg=slope, rise=rise, hand=HAND)
    return dict(robot=name, mass=mass, L=L, T=T, slope=slope, rise=rise, ok=bool(s.ok), ik=s.ik_res, fit=s.fit_err,
                ratio=s.ratio, worst=s.worst, zmp=s.zmp_margin, mu=s.mu, work=s.work, fz=s.fz_min, zc=s.zc)


def best(rows):
    """Fastest feasible step (L / T) among rows, or None."""
    ok = [r for r in rows if r["ok"]]
    return max(ok, key=lambda r: (r["L"] / r["T"], -r["ratio"])) if ok else None


def main():
    out = {"menagerie_commit": fetch.COMMIT, "hand": HAND, "payloads": PAYLOADS, "LS": LS, "TS": TS}
    jobs = []
    for name, ms in PAYLOADS.items():
        for m in ms:
            for L in LS:
                for T in TS:
                    jobs.append((name, float(m), L, T, 0.0, 0.0))
    # ramps and step-up: a coarser grid at three payloads per robot
    for name, ms in PAYLOADS.items():
        for m in (ms[0], ms[2], ms[3]):
            for sl in (4.76, 7.13):
                for L in (0.1, 0.2, 0.3):
                    for T in (0.6, 1.0, 1.5):
                        jobs.append((name, float(m), L, T, sl, 0.0))
            for rise in RISES[1:]:
                for L in (0.1, 0.2):
                    for T in (1.0, 1.5):
                        jobs.append((name, float(m), L, T, 0.0, rise))
    print(len(jobs), "cases", file=sys.stderr, flush=True)
    with Pool(4) as pool:
        rows = pool.map(job, jobs, chunksize=4)
    out["rows"] = rows

    # standing payload at the carry pose, for reference (buildbot-payload)
    out["standing"] = {}
    for name in PAYLOADS:
        r = P.load(name)
        mp, worst = P.max_payload(r, P.standing(r), HAND)
        out["standing"][name] = {"max_kg": mp, "worst": worst}
    (HERE / "results.json").write_text(json.dumps(out, indent=1, default=float))
    write_txt(out)


def write_txt(out):
    rows = out["rows"]
    L = []
    w = L.append
    w(f"Menagerie commit {out['menagerie_commit']}; hands at {out['hand']} m (reach, height); step grid L={out['LS']} T={out['TS']}")
    w("")
    w("A. Standing payload at the carry pose (buildbot-payload, both feet down):")
    for n, v in out["standing"].items():
        w(f"  {n}: {v['max_kg']:.1f} kg ({v['worst']})")
    w("")
    w("B. Flat floor: fastest feasible step per payload (speed = L / T, no double support: an upper bound)")
    for name, ms in out["payloads"].items():
        for m in ms:
            sub = [r for r in rows if r["robot"] == name and r["mass"] == m and r["slope"] == 0 and r["rise"] == 0]
            b = best(sub)
            nok = sum(r["ok"] for r in sub)
            if b:
                w(f"  {name} {m:>4.0f} kg: {b['L'] / b['T']:.2f} m/s (L {b['L']} m, T {b['T']} s), torque ratio {b['ratio']:.2f} {b['worst']}, "
                  f"cop margin {b['zmp'] * 1000:.0f} mm, mu {b['mu']:.2f}, work {b['work']:.0f} J/step; {nok}/{len(sub)} feasible")
            else:
                near = min(sub, key=lambda r: (max(r['ratio'], 1.0 + max(0.0, -r['zmp']) * 10), r['L'] / r['T']))
                w(f"  {name} {m:>4.0f} kg: none feasible (0/{len(sub)}); gentlest case L {near['L']} T {near['T']}: ratio {near['ratio']:.2f} {near['worst']}, "
                  f"cop margin {near['zmp'] * 1000:.0f} mm, ik residual {near['ik']:.3f}")
    w("")
    w("C. Ramps (fastest feasible step on the coarse grid L 0.1-0.3, T 0.6-1.5)")
    for name, ms in out["payloads"].items():
        for m in (ms[0], ms[2], ms[3]):
            cells = []
            for sl in (0.0, 4.76, 7.13):
                sub = [r for r in rows if r["robot"] == name and r["mass"] == m and r["slope"] == sl and r["rise"] == 0
                       and r["L"] in (0.1, 0.2, 0.3) and r["T"] in (0.6, 1.0, 1.5)]
                b = best(sub)
                cells.append(f"{sl:.1f} deg: " + (f"{b['L'] / b['T']:.2f} m/s" if b else "none"))
            w(f"  {name} {m:>4.0f} kg: " + "; ".join(cells))
    w("")
    w("D. Step-up (swing foot lands higher; L 0.1-0.2 m, T 1.0-1.5 s; feasible cells of 4)")
    for name, ms in out["payloads"].items():
        for m in (ms[0], ms[2], ms[3]):
            cells = []
            for rise in RISES:
                sub = [r for r in rows if r["robot"] == name and r["mass"] == m and r["slope"] == 0 and r["rise"] == rise
                       and r["L"] in (0.1, 0.2) and r["T"] in (1.0, 1.5)]
                cells.append(f"{rise * 100:.0f} cm: {sum(r['ok'] for r in sub)}/{len(sub)}")
            w(f"  {name} {m:>4.0f} kg: " + "; ".join(cells))
    w("")
    w("E. Why cases fail (flat floor, all payloads): worst joint at the peak, and which limit binds")
    for name in out["payloads"]:
        sub = [r for r in rows if r["robot"] == name and r["slope"] == 0 and r["rise"] == 0]
        n = len(sub)
        ik = sum(r["ik"] >= 5e-3 for r in sub)
        tq = sum(r["ratio"] > 1 for r in sub)
        zm = sum(r["zmp"] < 0 for r in sub)
        w(f"  {name}: {n} cases; IK cannot reach {ik}; torque over the limit {tq}; centre of pressure off the sole {zm}; feasible {sum(r['ok'] for r in sub)}")
    w("")
    w("F. Carry rate against one labourer (taskbook framing piece, pieces per hour; see src/buildbot_carryphase/rate.py)")
    for line in rate.table(out):
        w(line)
    w("")
    w("G. Break-even: the walking speed (loaded and empty alike) at which one piece per trip matches a person at 1.2 m/s")
    w("   (the vendor's quoted top speed for the G1 is about 2 m/s, from reseller pages, unverified)")
    for line in rate.breakeven_lines():
        w(line)
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if "--rewrite" in sys.argv:   # redo results.txt from results.json
        write_txt(json.loads((HERE / "results.json").read_text()))
    else:
        main()
