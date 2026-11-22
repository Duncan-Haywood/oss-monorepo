"""Milestone 69: does a second calibration pose raise the weakest pose's bias rating?

Milestone 68 found the gate Y_k + B ||J_k||_table <= 0.03 mm exact against the direct-aimed bias, with every refusal
set by the table term alone, so a pose's bias rating 0.03 / max_k ||J_k|| decides coverage. The compensated residual
is the nose bias at the press pose minus the nose bias at the reference pose (``compensate.compensated``), so the
no-flip sensitivity should re-reference by subtraction: with S_p the press-pose sensitivity, J_k(p | r) = S_p - S_r =
J_k(p | r0) - J_k(r | r0). If that holds, milestone 67's table of full J matrices (4 rows x 3 axes, reference
r0 = (1.0, 0.0)) gives every pose's rating under any reference, and under any set of references with each pose
compensated against its best one, without another run.

Planned offline, before this run, from milestone 67's results.json alone (``plan``): the two-pose reference set per
robot that maximises the weakest rating over all pairs of table poses, each pose assigned the reference that
minimises its max_k ||J_k(p) - J_k(r)||. G1: (0.6, 0.0) for poses at 0.4 to 0.8 m, (1.0, 0.15) above; H1:
(0.8, 0.0) for poses at 0.4 to 1.0 m, (1.4, 0.0) above. Predicted weakest rating 0.530 N (G1) and 0.564 N (H1),
against 0.213 and 0.279 N with r0 alone.

Two arms per press, on held-out section P (8 Latin-hypercube loads, seed 69): 'one', the reference r0 as in
milestones 30 to 68, and 'two', the assigned reference of the set (calibrated at that pose, slack hose, under the
same bias). Per arm and press: a fresh J from four chain runs (planner sized to 0.2 N), then the direct-aimed bias
u = J_k*/||J_k*|| of that arm at B = 0.3, 0.4, 0.6, 1.0 N, both signs, planner sized to B (milestone 65's chain),
and the gate on that arm's frozen table (r0: milestone 67's row norms; two: the row norms of J(p) - J(r(p))).
Hypotheses H266-H270 (LOG.md, registered before the run). Finished tasks go to ``partial.jsonl`` so a stopped run
resumes. M69_PROCS sets the pool (default 4); M69_N the loads.
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import itertools
import json
import math
import os
import platform
import sys
import time

N = int(os.environ.get("M69_N", "8"))
os.environ["M68_N"] = str(N)
HERE = os.path.dirname(os.path.abspath(__file__))
import numpy as np  # noqa: E402

spec = importlib.util.spec_from_file_location("m68", os.path.join(HERE, "..", "m68_jgate", "run.py"))
E68 = importlib.util.module_from_spec(spec)
sys.modules["m68"] = E68
spec.loader.exec_module(E68)                     # milestone 68's gate and table loader (and D switched off)

T0 = time.time()
E67, E66, E65, E63, E61, E54, E51, E55, M1, C = (E68.E67, E68.E66, E68.E65, E68.E63, E68.E61, E68.E54, E68.E51,
                                                  E68.E55, E68.M1, E68.C)
SPEC, AX, gate = E68.SPEC, E68.AX, E68.gate
SEED = 69
E61.SEED = SEED
E65.SEED = SEED
LOADS = E54.lhs(N, SEED)
BS = (0.3, 0.4, 0.6, 1.0)
ARMS = ("one", "two")
H_STEP = E67.H_STEP
UNIT = np.eye(3)
M67 = os.path.join(HERE, "..", "m67_aimeddirect", "results.json")


def load_full(path=M67):
    """Per robot and pose, milestone 67's full J (4 x 3, mm/N, reference r0), first load seen."""
    D = json.load(open(path))
    tab = {"g1": {}, "h1": {}}
    for x in D["runs"]:
        for rec in x["rows"]:
            a = rec["adv"]
            if a["src"] == "direct":
                tab[x["robot"]].setdefault(tuple(rec["pose"]), np.array(a["J"], float))
    return tab


def gmax(Jp, Jr):
    return float(np.linalg.norm(Jp - Jr, axis=1).max())


def plan(full, m=2):
    """Exhaustive: the m table poses whose best-of assignment minimises the largest max_k ||J(p) - J(r)||."""
    out = {}
    for n, t in full.items():
        ps = sorted(t)
        best = None
        for S in itertools.combinations(ps, m):
            w = max(min(gmax(t[p], t[r]) for r in S) for p in ps)
            if best is None or w < best[0] - 1e-15:
                best = (w, S)
        refs = best[1]
        assign = {p: min(refs, key=lambda r: gmax(t[p], t[r])) for p in ps}
        tab2 = {p: np.linalg.norm(t[p] - t[assign[p]], axis=1).tolist() for p in ps}
        r0 = E51.ref_key(n)[1:]
        tab1 = {p: np.linalg.norm(t[p] - t[r0], axis=1).tolist() for p in ps}
        out[n] = {"refs": [list(r) for r in refs], "assign": {p: assign[p] for p in ps}, "two": tab2, "one": tab1,
                  "worst_two": best[0], "worst_one": max(max(v) for v in tab1.values())}
    return out


FULL = load_full()
PLAN = plan(FULL)


def task(args):
    n, j, lim = args
    H, phd = LOADS[j]
    phi = math.radians(phd)
    C.setup(n)
    keys = sorted(k for k in M1.KEYS if k[0] == n)
    r0 = E51.ref_key(n)
    cal = {}

    def er(ref, b, e):
        t = (ref, b) + tuple(np.round(e, 12))
        if t not in cal:
            cal[t] = E55.robust_rule(ref, M1.hose_f(ref, 0.0, 0.0), np.asarray(e, float))[2]
        return cal[t]
    rows = []
    for k in keys:
        lk = lim[str(list(k))]
        f = np.asarray(M1.hose_f(k, H, phi), float)
        rec = {"pose": list(k[1:]), "J": {}, "cases": {}}
        for arm in ARMS:
            a = PLAN[n]["assign"].get(tuple(k[1:]))
            ref = r0 if arm == "one" or a is None else (n,) + tuple(a)
            lr = lim[str(list(ref))]
            rec.setdefault("ref", {})[arm] = list(ref[1:])
            E65.set_bound(H_STEP)
            pts = [np.zeros(3)] + [H_STEP * UNIT[c] for c in range(3)]
            P = [E66.planned_rec(E63.run_case(k, ref, f, e, er(ref, H_STEP, e), lk, lr, H)) for e in pts]
            if all(p is not None for p in P):
                R0 = np.array(P[0]["s0"])
                J = np.stack([(np.array(P[c + 1]["s0"]) - R0) / H_STEP for c in range(3)], axis=1)
                gn = np.linalg.norm(J, axis=1)
                ks = int(np.argmax(gn))
                ud = J[ks] / gn[ks] if gn[ks] > 1e-12 else None
                rec["J"][arm] = {"J": J.tolist(), "gn": gn.tolist(), "row": AX[ks]}
            else:
                ud = None
                rec["J"][arm] = None
            for b in BS:
                E65.set_bound(b)
                u = ud
                if u is None:
                    u, *_ = E63.worst_dir(k, f)
                for sgn, sc in ((1, "+"), (-1, "-")):
                    e = sgn * b * np.asarray(u, float)
                    rec["cases"][f"{arm}{b:g}{sc}"] = E63.run_case(k, ref, f, e, er(ref, b, e), lk, lr, H)
                rec.setdefault("src", {})[f"{arm}{b:g}"] = "direct" if ud is not None else "m63"
        E65.set_bound(E65.B0)
        rows.append(rec)
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows}


if __name__ == "__main__":
    procs = int(os.environ.get("M69_PROCS", "4"))
    E65.set_bound(0.7)
    chk = E65.bound_now()
    assert chk and all(v == 0.7 for _, v in chk), chk
    E65.set_bound(E65.B0)
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    phis = [p for _, p in LOADS]
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "seed": SEED, "loads": LOADS,
           "bs": BS, "h": H_STEP, "bound_globals": [m for m, _ in chk],
           "plan": {n: {"refs": p["refs"], "assign": {str(list(k)): list(v) for k, v in p["assign"].items()},
                        "one": {str(list(k)): v for k, v in p["one"].items()},
                        "two": {str(list(k)): v for k, v in p["two"].items()},
                        "worst_one": p["worst_one"], "worst_two": p["worst_two"]} for n, p in PLAN.items()}}

    def tl(args):
        key, ph = args
        C.setup(key[0])
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
            for x in pool.imap_unordered(task, todo, chunksize=1):
                x["N"] = N
                fp.write(json.dumps(x, separators=(",", ":"), default=float) + "\n")
                fp.flush()
                done[(x["robot"], x["j"])] = x
                print(f"  done {x['robot']} load {x['j']} at {time.time() - T0:.0f} s", file=sys.stderr)
        res = [done[(jb[0], jb[1])] for jb in jobs]
    out["limits"], out["runs"] = lims, res
    print(f"# Milestone 69: one calibration pose against two, held-out section P ({N} loads, seed {SEED}; milestone "
          f"65's chain sized to B; direct-aimed bias of each arm, both signs; gate on each arm's frozen table; spec "
          f"{SPEC} mm per row)")
    print("\n## A. The plan (from milestone 67's table alone, before the run): robot | reference set | weakest "
          "rating, r0 alone N | weakest rating, two poses N")
    for n in ("g1", "h1"):
        p = PLAN[n]
        print(f"  {n} | {p['refs']} | {SPEC / p['worst_one']:.3f} | {SPEC / p['worst_two']:.3f}")
    print("\n## B. Does re-referencing subtract? robot | arm | presses with a fresh J | max |J_fresh - (J67(p) - "
          "J67(r))| mm/N | weakest rating from the fresh J N | poses rated (fresh)")
    A = {}
    for n in ("g1", "h1"):
        for arm in ARMS:
            dif, worst, poses = [], 0.0, set()
            for x in res:
                if x["robot"] != n:
                    continue
                for rec in x["rows"]:
                    jj = rec["J"][arm]
                    if jj is None:
                        continue
                    p, r = tuple(rec["pose"]), tuple(rec["ref"][arm])
                    poses.add(p)
                    worst = max(worst, max(jj["gn"]))
                    if p in FULL[n] and r in FULL[n]:
                        dif.append(float(np.abs(np.array(jj["J"]) - (FULL[n][p] - FULL[n][r])).max()))
            A[f"{n} {arm}"] = {"fresh": len(dif), "dmax": max(dif) if dif else None, "worst": worst,
                               "rating": SPEC / worst if worst > 0 else None, "poses": len(poses)}
            a = A[f"{n} {arm}"]
            print(f"  {n} | {arm} | {a['fresh']} | {a['dmax']:.2e} | {a['rating']:.3f} | {a['poses']}")
    print("\n## C. By robot, B and arm: robot | B N | arm | balance-envelope cases | chain planned | chain over spec | "
          "chain worst mm | gate passed | gate coverage % | gate passed over spec | worst gate-passed row mm | "
          "fallback to m63 direction")
    S, OV = {}, []
    for n in ("g1", "h1"):
        for b in BS:
            for arm in ARMS:
                tab = PLAN[n][arm]
                nin = pl = ov = gp = gov = fb = 0
                wc = wg = 0.0
                for x in res:
                    if x["robot"] != n:
                        continue
                    for rec in x["rows"]:
                        gn = tab.get(tuple(rec["pose"]))
                        fb += rec["src"][f"{arm}{b:g}"] != "direct"
                        for sc in ("+", "-"):
                            r = rec["cases"][f"{arm}{b:g}{sc}"]
                            nin += r["in51"]
                            p = E66.planned_rec(r)
                            if p is None:
                                continue
                            pl += 1
                            w = max(p[k] for k in AX)
                            wc = max(wc, w)
                            ov += w > SPEC + 1e-12
                            if gate(p, b, gn):
                                gp += 1
                                wg = max(wg, w)
                                if w > SPEC + 1e-12:
                                    gov += 1
                                    OV.append({"robot": n, "B": b, "arm": arm, "sign": sc, "pose": rec["pose"],
                                               "H": x["H"], "phi": x["phi"], "worst": w, "flips": p["flips"],
                                               "Y": p["Y"], "gn": gn})
                s = {"in51": nin, "planned": pl, "ccov": 100.0 * pl / max(nin, 1), "over": ov, "cworst": wc,
                     "gate": gp, "gcov": 100.0 * gp / max(nin, 1), "gover": gov, "gworst": wg, "fallback": fb}
                S[f"{n} {b:g} {arm}"] = s
                print(f"  {n} | {b:.1f} | {arm} | {nin} | {pl} ({s['ccov']:.2f}%) | {ov} | {wc:.4f} | {gp} | "
                      f"{s['gcov']:.2f} | {gov} | {wg:.4f} | {fb}")
    print("\n## D. Gate-passed presses over spec (first 30, worst first): robot | B | arm | sign | pose | H N | phi deg "
          "| worst mm | flips")
    for o in sorted(OV, key=lambda d: -d["worst"])[:30]:
        print(f"  {o['robot']} | {o['B']:.1f} | {o['arm']} | {o['sign']} | {o['pose']} | {o['H']:.1f} | "
              f"{o['phi']:.1f} | {o['worst']:.4f} | {o['flips']}")
    print(f"  (total: {len(OV)})")
    print("\n## E. Hypotheses (registered in LOG.md before this run)")
    Dh = {}
    dm = max(A[f"{n} {arm}"]["dmax"] for n in ("g1", "h1") for arm in ARMS)
    Dh["H266"] = dm <= 1e-6
    print(f"H266 (re-referencing subtracts: every fresh J equals J67(p) - J67(r) to 1e-6 mm/N, both arms, both "
          f"robots): largest difference {dm:.2e} -> {'held' if Dh['H266'] else 'refuted'}")
    g2 = sum(S[f"{n} {b:g} two"]["gover"] for n in ("g1", "h1") for b in BS)
    Dh["H267"] = g2 == 0
    print(f"H267 (the gate on the two-pose table keeps every passed press inside the spec, every B, both robots): "
          f"{g2} over spec -> {'held' if Dh['H267'] else 'refuted'}")
    rt = {n: A[f"{n} two"]["rating"] for n in ("g1", "h1")}
    Dh["H268"] = all(v is not None and v >= 0.5 for v in rt.values())
    print(f"H268 (the weakest rating from the fresh two-pose J is at least 0.5 N on both robots): G1 {rt['g1']:.3f}, "
          f"H1 {rt['h1']:.3f} -> {'held' if Dh['H268'] else 'refuted'}")
    c6 = {n: (S[f"{n} 0.6 one"]["gcov"], S[f"{n} 0.6 two"]["gcov"]) for n in ("g1", "h1")}
    Dh["H269"] = c6["g1"][1] >= 2 * c6["g1"][0] and c6["h1"][1] >= 1.5 * c6["h1"][0]
    print(f"H269 (gate coverage at 0.6 N: two poses at least double r0's on the G1 and at least 1.5 times on the H1): "
          f"G1 {c6['g1'][0]:.2f}% -> {c6['g1'][1]:.2f}%, H1 {c6['h1'][0]:.2f}% -> {c6['h1'][1]:.2f}% -> "
          f"{'held' if Dh['H269'] else 'refuted'}")
    c4 = {n: S[f"{n} 0.4 two"]["gcov"] for n in ("g1", "h1")}
    Dh["H270"] = all(v >= 90.0 for v in c4.values())
    print(f"H270 (gate coverage at 0.4 N with two poses at least 90% on both robots): G1 {c4['g1']:.2f}%, H1 "
          f"{c4['h1']:.2f}% -> {'held' if Dh['H270'] else 'refuted'}")
    out["A"], out["S"], out["OV"], out["D"] = A, S, OV, Dh
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    os.remove(os.path.join(HERE, "partial.jsonl"))
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
