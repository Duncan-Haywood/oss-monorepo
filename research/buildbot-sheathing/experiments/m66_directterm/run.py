"""Milestone 66: does pricing the bias's direct term beside the flips restore the 0.03 mm guarantee at 0.4 to 1.0 N?

Milestone 65 sized milestone 61's chain to the bias bound B and found the spec broken from 0.4 N by presses with no
flip: the bias's direct effect through the compliance and the joint-error model, which the four-row flip budget
Y_k never priced. Here the chain is milestone 65's, unchanged, with one gate after it. For the plan the chain chose
(whatever path planned it), the planner computes the no-flip compensated residual v0_k of each row (nose y, z;
depth point y, z) when the robot runs that plan under the measured load f_m and under f_m - B u_c (c = x, y, z):
  D_k = |v0_k(f_m)| + B ||(v0_k(f_m - B u_c) - v0_k(f_m)) / B||_c        (chord step B, as for the settle gradients)
and accepts the press only if Y_k + D_k <= SPEC in every row; otherwise it is refused (no new search). The planner
uses only f_m, B, the plan and the reference calibration it measured; the true load f = f_m - e is used only to score.

The gate is wired in by wrapping milestone 59's ``rule_all`` (to know f_m) and ``resid`` (to add D and the true
rows), and milestone 61's ``brief`` (to keep Y and D): every path of the chain goes through those three.

Section M is held out: 12 Latin-hypercube loads (seed 66). B_plan = 0.4, 0.6, 1.0 N; the true bias is B_plan along
milestone 63's adversary at that B_plan, both signs (milestone 65's ``task``). Finished tasks are appended to
``partial.jsonl`` so a stopped run resumes. Hypotheses H253-H256 (LOG.md, registered before the run).
M66_PROCS sets the pool (default 4); M66_N the loads.
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import json
import math
import os
import platform
import sys
import time

N = int(os.environ.get("M66_N", "12"))
os.environ["M65_N"] = str(N)
HERE = os.path.dirname(os.path.abspath(__file__))
import numpy as np  # noqa: E402

spec = importlib.util.spec_from_file_location("m65", os.path.join(HERE, "..", "m65_resized", "run.py"))
E65 = importlib.util.module_from_spec(spec)
sys.modules["m65"] = E65
spec.loader.exec_module(E65)                     # milestone 65's re-sized chain (and 63's adversary, 61's, ... 38's)

T0 = time.time()
E63, E61, M1, E54 = E65.E63, E65.E61, E65.M1, E65.E54
E59, E56 = E63.E59, E63.E61.E59.E56
SPEC, AX = E65.SPEC, E65.AX
SEED = 66
E61.SEED = SEED
E65.SEED = SEED
E65.LOADS = E54.lhs(N, SEED)
E65.BPLANS = (0.4, 0.6, 1.0)
UNIT = np.eye(3)
CUR = {}
_rule_all, _resid, _brief = E59.rule_all, E59.resid, E61.brief


def v0(key, ref, rp, f, er_r):
    """No-flip compensated residual per row (mm, signed) when the robot runs plan rp under load f."""
    _, enf, _ = E56.robot_err(key, f, rp)
    c = M1.C.compensated(M1.POSE[key].rows[:2], M1.POSE[ref].rows[:2], enf, er_r, M1.L0)
    return np.array([c["y"][0], c["z"][0], c["y"][1], c["z"][1]]) / M1.MM


def direct(key, ref, rp, fm, er_r, b):
    """D_k (mm) for the four rows, from the measured load only."""
    fm = np.asarray(fm, float)
    v = v0(key, ref, rp, fm, er_r)
    g = np.stack([(v0(key, ref, rp, fm - b * UNIT[c], er_r) - v) / b for c in range(3)], axis=1)
    return np.abs(v) + b * np.linalg.norm(g, axis=1)


def rule_all(key, ref, f, e, er_r):
    CUR["fm"] = np.asarray(f, float) + np.asarray(e, float)
    return _rule_all(key, ref, f, e, er_r)


def resid(key, ref, rp, f, er_r):
    o = _resid(key, ref, rp, f, er_r)
    o["D"] = [float(x) for x in direct(key, ref, rp, CUR["fm"], er_r, float(E59.B))]
    return o


def brief(o):
    r = _brief(o)
    if r is not None:
        r |= {"Y": [float(x) for x in o["Y"]], "D": o["D"]}
    return r


E59.rule_all, E59.resid, E61.brief = rule_all, resid, brief


def planned_rec(r):
    """The record of the planned press (out, leg raise or squeeze) or None."""
    if "out" not in r:
        return None
    if r["out"].get("y") is not None:
        return r["out"]
    e = r.get("esc", {})
    if e.get("Mu") is not None and e.get("u"):
        return e["u"]
    if e.get("S") is not None and e.get("s"):
        return e["s"]
    return None


def gate(p):
    return all(y + d <= SPEC + 1e-12 for y, d in zip(p["Y"], p["D"]))


if __name__ == "__main__":
    procs = int(os.environ.get("M66_PROCS", "4"))
    E65.set_bound(0.7)
    chk = E65.bound_now()
    assert chk and all(v == 0.7 for _, v in chk), chk
    E65.set_bound(E65.B0)
    LOADS, BPLANS = E65.LOADS, E65.BPLANS
    allkeys = sorted(set(k for k in M1.KEYS) | {E65.E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    phis = [p for _, p in LOADS]
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "seed": SEED, "loads": LOADS,
           "bplans": BPLANS, "bound_globals": [m for m, _ in chk]}

    def tl(args):
        key, ph = args
        E65.C.setup(key[0])
        return key, [E54.limit(key, math.radians(p)) for p in ph]
    with ctx.Pool(procs) as pool:
        L = pool.map(tl, [(k, phis) for k in allkeys], chunksize=1)
        lims = {str(list(k)): v for k, v in L}
        jobs = [(n, j, {kk: v[j] for kk, v in lims.items()}) for n in ("g1", "h1") for j in range(N)]
        part = os.path.join(HERE, "partial.jsonl")
        done = {}
        if os.path.exists(part):
            for line in open(part):
                x = json.loads(line)
                if x.get("N") == N:
                    done[(x["robot"], x["j"])] = x
        todo = [jb for jb in jobs if (jb[0], jb[1]) not in done]
        print(f"resuming: {len(done)} tasks from partial.jsonl, {len(todo)} to run", file=sys.stderr)
        with open(part, "a") as fp:
            for x in pool.imap_unordered(E65.task, todo, chunksize=1):
                x["N"] = N
                fp.write(json.dumps(x, separators=(",", ":"), default=float) + "\n")
                fp.flush()
                done[(x["robot"], x["j"])] = x
                print(f"  done {x['robot']} load {x['j']} at {time.time() - T0:.0f} s", file=sys.stderr)
        res = [done[(jb[0], jb[1])] for jb in jobs]
    out["limits"], out["runs"] = lims, res
    print(f"# Milestone 66: the bias's direct term priced beside the flips, held-out section M ({N} loads, seed "
          f"{SEED}; milestone 65's re-sized chain, then the gate Y_k + D_k <= {SPEC} mm per row; true bias B_plan "
          f"along milestone 63's adversary at that B_plan)")
    print(f"modules whose bound was set: {len(chk)} ({', '.join(m for m, _ in chk)})")
    print("\n## A. By robot and B_plan: robot | B_plan N | balance-envelope cases | chain planned | chain over spec | "
          "gate passed | gate coverage % | gate passed over spec | worst gate-passed row mm | bound exceedances "
          "(rows) | worst |r|-(Y+D) mm")
    S, EXC, REF = {}, [], {}
    for n in ("g1", "h1"):
        for b in BPLANS:
            names = [f"B{b:g}+", f"B{b:g}-"]
            cs = [(x, rec, c, rec["cases"][c]) for x in res if x["robot"] == n for rec in x["rows"] for c in names]
            nin = sum(r["in51"] for *_, r in cs)
            pl = ov = gp = gov = nexc = 0
            wg, wc, wex = 0.0, 0.0, -math.inf
            why = {a: 0 for a in AX}
            dmax = {a: [] for a in AX}
            for x, rec, c, r in cs:
                p = planned_rec(r)
                if p is None:
                    continue
                pl += 1
                w = max(p[a] for a in AX)
                ov += w > SPEC + 1e-12
                wc = max(wc, w)
                for i, a in enumerate(AX):
                    gap = p[a] - (p["Y"][i] + p["D"][i])
                    wex = max(wex, gap)
                    dmax[a].append(p["D"][i])
                    if gap > 1e-6:
                        nexc += 1
                        EXC.append({"robot": n, "B": b, "case": c, "pose": rec["pose"], "row": a, "r": p[a],
                                    "Y": p["Y"][i], "D": p["D"][i], "flips": p["flips"], "how": p["how"]})
                if gate(p):
                    gp += 1
                    wg = max(wg, w)
                    gov += w > SPEC + 1e-12
                else:
                    for i, a in enumerate(AX):
                        why[a] += p["Y"][i] + p["D"][i] > SPEC + 1e-12
            s = {"in51": nin, "planned": pl, "over": ov, "gate": gp, "gcov": 100.0 * gp / max(nin, 1),
                 "ccov": 100.0 * pl / max(nin, 1), "cworst": wc, "gover": gov, "gworst": wg, "nexc": nexc, "wexc": wex,
                 "why": why, "Dmed": {a: float(np.median(v)) if v else None for a, v in dmax.items()}}
            S[f"{n} {b:g}"] = s
            print(f"  {n} | {b:.1f} | {nin} | {pl} ({s['ccov']:.2f}%) | {ov} | {gp} | {s['gcov']:.2f} | {gov} | "
                  f"{wg:.4f} | {nexc} | {wex:.4f}")
    print("\n## B. Why the gate refuses, by robot and B_plan: rows over SPEC in Y+D among refused presses "
          "(a press can fail several) | median D per row mm (planned presses)")
    for n in ("g1", "h1"):
        for b in BPLANS:
            s = S[f"{n} {b:g}"]
            print(f"  {n} | {b:.1f} | " + ", ".join(f"{a} {s['why'][a]}" for a in AX) + " | "
                  + ", ".join(f"{a} {s['Dmed'][a]:.4f}" for a in AX if s["Dmed"][a] is not None))
    print("\n## C. Bound exceedances, |r_k| > Y_k + D_k (first 30): robot | B_plan | case | pose | row | |r| | Y | D | "
          "flips | how")
    for o in sorted(EXC, key=lambda d: -(d["r"] - d["Y"] - d["D"]))[:30]:
        print(f"  {o['robot']} | {o['B']:.1f} | {o['case']} | {o['pose']} | {o['row']} | {o['r']:.4f} | "
              f"{o['Y']:.4f} | {o['D']:.4f} | {o['flips']} | {o['how']}")
    print(f"  (total: {len(EXC)})")
    print("\n## D. Hypotheses (registered in LOG.md before this run)")
    D = {}
    g = {b: sum(S[f"{n} {b:g}"]["gover"] for n in ("g1", "h1")) for b in BPLANS}
    D["H253"] = all(v == 0 for v in g.values())
    print("H253 (every gate-passed press inside the spec at 0.4, 0.6, 1.0 N, both robots): over spec "
          + ", ".join(f"{b:.1f} N {v}" for b, v in g.items()) + f" -> {'held' if D['H253'] else 'refuted'}")
    D["H254"] = len(EXC) == 0
    print(f"H254 (|r_k| <= Y_k + D_k on every planned press and row): {len(EXC)} exceedances -> "
          f"{'held' if D['H254'] else 'refuted'}")
    D["H255"] = all(S[f"{n} 0.4"]["gcov"] >= 90.0 for n in ("g1", "h1"))
    print(f"H255 (gate coverage at 0.4 N at least 90% on both robots): G1 {S['g1 0.4']['gcov']:.2f}%, H1 "
          f"{S['h1 0.4']['gcov']:.2f}% -> {'held' if D['H255'] else 'refuted'}")
    D["H256"] = any(S[f"{n} 1"]["gcov"] < 50.0 for n in ("g1", "h1"))
    print(f"H256 (gate coverage at 1.0 N under 50% on at least one robot): G1 {S['g1 1']['gcov']:.2f}%, H1 "
          f"{S['h1 1']['gcov']:.2f}% -> {'held' if D['H256'] else 'refuted'}")
    out["S"], out["EXC"], out["D"] = S, EXC, D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    os.remove(os.path.join(HERE, "partial.jsonl"))
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
