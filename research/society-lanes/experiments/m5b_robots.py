"""Milestone 5b: robots in the two crowd families outside JuPedSim, ORCA and the power law.

Predictions B1 to B8 are in LOG.md, written before this script's full run.

Milestone 5a's protocol unchanged (experiments/m5_robots.py, reused: same runs, shares, policies,
robot speeds, seeds, measures and bootstrap), with the families of milestones 4c and 4d at their
fitted side bias: ORCA (orca.py, RVO2 port with UMANS parameters, beta = 1.0) and the anticipatory
power law (plaw.py, UMANS parameters, beta = 0.35). Walker counts are those milestones 4c and 4d
calibrated to the observed speed of each run (bo-360-090-090: ORCA 30, power law 40;
bo-360-160-160: ORCA 60, power law 130). Under ORCA the robots are ORCA agents too, so robot and
crowd share one planner, as a fleet that runs ORCA would. Writes m5b_robots_results.txt and
m5b_robots_runs.csv, then the H5 preview across all five families (reading m5_robots_runs.csv for
the three JuPedSim ones) into m5b_h5_results.txt.

Needs numpy (numba for speed): PY=$(python3 platform/ci/pyenv.py numpy numba), then
  "$PY" experiments/m5b_robots.py   (about 15 min on 4 cores; cached in data_cache/m5b_cache.json)
"""
from __future__ import annotations

import csv
import itertools
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import m5_robots as M5  # noqa: E402

FAMILIES = {"orca": 1.0, "pl": 0.35}
NAMES = {"orca": "ORCA", "pl": "power law"}
RUNS = [("bo-360-090-090", 0.9, {"orca": 30, "pl": 40}),
        ("bo-360-160-160", 1.6, {"orca": 60, "pl": 130})]
PASSED_HELD_OUT = ["sf", "cfsm", "orca"]   # yielding bias within 0.10 of people (milestones 4b, 4d)


def _sim(job):
    import numpy as np_
    k, fam, run, ent, n, beta, nr, pol, v, seed = job
    if fam == "orca":
        import orca as mod
    else:
        import plaw as mod
    r = mod.simulate(n, M5.WIDTH, M5.LENGTH, ent, beta, seed, duration=M5.DURATION, warmup=M5.WARMUP,
                     robots=nr, policy=pol, robot_speed=v, passes=True)
    r.pop("flags")
    return k, {a: (float(b) if isinstance(b, (int, float, np_.floating, np_.integer)) else b) for a, b in r.items()}


def pooled_from_csv(paths):
    """(family, policy, share, speed) -> pooled lane, rp_close, delay_per_pass, delay over the two runs."""
    rows = []
    for p in paths:
        with open(p) as f:
            rows += list(csv.DictReader(f))
    groups = {}
    for r in rows:
        groups.setdefault((r["family"], r["policy"], float(r["share"]), float(r["robot_speed"])), []).append(r)
    out = {}
    for k, rs in groups.items():
        w = [float(r["rp_passes"]) for r in rs]
        def pw(field):
            vals = [(float(r[field]), x) for r, x in zip(rs, w) if float(r[field]) == float(r[field])]
            tot = sum(x for _, x in vals)
            return sum(v * x for v, x in vals) / tot if tot else float("nan")
        out[k] = dict(lane=sum(float(r["lane"]) for r in rs) / len(rs), rp_close=pw("rp_close"),
                      delay_per_pass=pw("delay_per_pass"),
                      delay=sum(float(r["delay"]) for r in rs) / len(rs))
    return out


def h5():
    pool = pooled_from_csv([os.path.join(HERE, "m5_robots_runs.csv"), os.path.join(HERE, "m5b_robots_runs.csv")])
    fams = ["sf", "avm", "cfsm", "orca", "pl"]
    out = ["H5 preview over five families (pooled over the two runs; robot speed 1.2 m/s; rank 1 = lowest human cost)",
           "families that passed the held-out share test with the yielding bias: " + ", ".join(PASSED_HELD_OUT), ""]
    metrics = [("delay_per_pass", +1), ("rp_close", +1), ("lane", -1)]
    taus = {}
    for sh in M5.SHARES:
        for m, sign in metrics:
            sc = {f: [sign * pool[(f, p, sh, M5.SPEED)][m] for p in M5.POLICIES] for f in fams}
            rk = {f: " < ".join(p for _, p in sorted(zip(sc[f], M5.POLICIES))) for f in fams}
            out.append(f"share {sh:.2f} {m}:")
            for f in fams:
                out.append(f"    {f:5s} {rk[f]}   (" + ", ".join(f"{p} {sign * v:+.3f}" for p, v in zip(M5.POLICIES, sc[f])) + ")")
            for a, b in itertools.combinations(fams, 2):
                taus[(sh, m, a, b)] = M5.kendall(sc[a], sc[b])
            out.append("    tau " + "  ".join(f"{a}-{b} {taus[(sh, m, a, b)]:+.2f}" for a, b in itertools.combinations(fams, 2)))
    out.append("")
    for m, _ in metrics:
        trio = [taus[(sh, m, a, b)] for sh in M5.SHARES for a, b in itertools.combinations(PASSED_HELD_OUT, 2)]
        allp = [taus[(sh, m, a, b)] for sh in M5.SHARES for a, b in itertools.combinations(fams, 2)]
        out.append(f"{m}: tau among {'/'.join(PASSED_HELD_OUT)} min {min(trio):+.2f} max {max(trio):+.2f} "
                   f"({sum(t >= 0.8 for t in trio)} of {len(trio)} >= 0.8); all five min {min(allp):+.2f}, "
                   f"{sum(t >= 0.8 for t in allp)} of {len(allp)} >= 0.8")
    return out, taus, pool


def main():
    M5.FAMILIES, M5.NAMES, M5.RUNS = FAMILIES, NAMES, RUNS
    M5.TAG, M5.CACHE_NAME = "m5b_robots", "m5b_cache.json"
    M5.TITLE = "Milestone 5b: robots in the ORCA and power-law crowds (free choice), four policies x three shares"
    M5._sim = _sim
    M5.main()
    out, taus, pool = h5()
    P = out.append
    P("")
    P("Predictions (LOG.md, milestone 5b):")
    worst = lambda f, sh, m, sign: max(M5.POLICIES, key=lambda p: sign * pool[(f, p, sh, M5.SPEED)][m])  # noqa: E731
    new = list(FAMILIES)
    b1 = [(f, sh, worst(f, sh, "rp_close", 1)) for f in new for sh in M5.SHARES]
    P(f"B1 (opposite has the highest close-pass rate, ORCA and power law, every share): "
      f"{'held' if all(w == 'opposite' for *_, w in b1) else 'refuted'} ("
      + "; ".join(f"{f} {sh:.2f}: {w}" for f, sh, w in b1) + ")")
    b2 = [(f, sh, worst(f, sh, "lane", -1)) for f in new for sh in M5.SHARES]
    P(f"B2 (opposite gives the lowest lane order, ORCA and power law, every share): "
      f"{'held' if all(w == 'opposite' for *_, w in b2) else 'refuted'} ("
      + "; ".join(f"{f} {sh:.2f}: {w}" for f, sh, w in b2) + ")")
    dl = pool[("orca", "opposite", 0.20, M5.SPEED)]["lane"] - pool[("orca", "none", 0.0, M5.SPEED)]["lane"]
    P(f"B3 (ORCA, opposite at 20% lowers lane order by at least 0.10): {'held' if dl <= -0.10 else 'refuted'} ({dl:+.3f})")
    rows = list(csv.DictReader(open(os.path.join(HERE, "m5b_robots_runs.csv"))))
    base = {(r["family"], r["run"]): float(r["share_right"]) for r in rows if r["policy"] == "none"}
    b4 = [float(r["share_right"]) - base[(r["family"], r["run"])] for r in rows
          if r["policy"] == "crowd" and float(r["robot_speed"]) == M5.SPEED]
    P(f"B4 (crowd: share on own right within 0.05 of the 0% crowd, both families, every share and run): "
      f"{'held' if max(abs(x) for x in b4) <= 0.05 else 'refuted'} (largest change {max(b4, key=abs):+.3f})")
    b5 = [(f, pool[(f, "opposite", 0.20, M5.SPEED)]["delay"], pool[(f, "crowd", 0.20, M5.SPEED)]["delay"]) for f in new]
    P(f"B5 (at 20% opposite delays people more per transit than crowd, both families): "
      f"{'held' if all(o > c for _, o, c in b5) else 'refuted'} (" + "; ".join(f"{f}: {o:+.2f} vs {c:+.2f} s" for f, o, c in b5) + ")")
    b6 = [taus[(sh, "rp_close", a, b)] for sh in M5.SHARES for a, b in (("sf", "orca"), ("cfsm", "orca"))]
    P(f"B6 (H5 on close-pass rate: tau(ORCA, social force) and tau(ORCA, collision-free speed) >= 0.8 at every share): "
      f"{'held' if min(b6) >= 0.8 else 'refuted'} (" + ", ".join(f"{t:+.2f}" for t in b6) + ")")
    b7 = [taus[(sh, "delay_per_pass", a, b)] for sh in M5.SHARES for a, b in itertools.combinations(PASSED_HELD_OUT, 2)]
    P(f"B7 (H5 on delay per pass: tau >= 0.8 for every pair of sf, cfsm, orca at every share): "
      f"{'held' if min(b7) >= 0.8 else 'refuted'} (" + ", ".join(f"{t:+.2f}" for t in b7) + ")")
    g = pool[("pl", "goal", 0.20, M5.SPEED)]["delay"] - pool[("pl", "crowd", 0.20, M5.SPEED)]["delay"]
    P(f"B8 (power law: lateral-goal robots at 20% delay people within 0.5 s per transit of crowd robots): "
      f"{'held' if abs(g) <= 0.5 else 'refuted'} ({g:+.2f} s)")
    text = "\n".join(out) + "\n"
    print(text)
    with open(os.path.join(HERE, "m5b_h5_results.txt"), "w") as f:
        f.write(text)


if __name__ == "__main__":
    main()
