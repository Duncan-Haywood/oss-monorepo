"""Milestone 7g (a fourth fresh pool): 7f's triage rules, with a margin chosen by nested leave-one-pool-out, met
the held-out tail target in 9 (absolute drift threshold) and 10 (flag fraction) of 12 folds at 40 DFN cycles per
design against 50. Every one of those folds reused the three pools 5zk, 5zy and 5zz. Here 8 new designs per set
(none of 5z's, 5zy's or 5zz's picks) are simulated to cycle 100 with 5zk's x-resolved bench, unchanged, and scored
by rules that never saw them.

    WORKERS=3 python experiments/fresh7g/run.py bench   # DFN to cycle 100, x-resolved (pybamm; resumable)
    python experiments/fresh7g/run.py rows              # 7b's e at every window and 7c's drift inputs (stdlib, 4 cores)
    python experiments/fresh7g/run.py report            # H281 to H284 -> results.txt, summary.json

    S_C on the fresh pool: 7c's correction (the observable with the largest |Spearman| with m, and its least-squares
        line) fitted on the set's 104 earlier designs only, so no fresh design informs any fresh design's score
    frozen: each of 7f's 12 nested-margin policies (set, held-out pool), applied unchanged to the fresh pool of its set
    refit:  each rule picked on all three earlier pools of a set, its margin the most permissive grid value whose three
        inner folds (pick on two pools, score on the third) all meet; applied to the fresh pool (4 folds)
    target: 1.25 x the fresh pool's own all-50 q75 of the cycle-99 lithium-loss error (cell 000), as 7e and 7f
Plan in ../../LOG.md (7g plan).
"""
import importlib.util
import json
import os
import random
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


M7 = _mod("margin7f_run", EXP / "margin7f" / "run.py")
F7 = M7.F7
SETS, POOLS, KS, T0, quant, EPS = M7.SETS, M7.POOLS, M7.KS, M7.T0, M7.quant, M7.EPS
RULES, PICK, GRID, apply, target, lab_s = M7.RULES, M7.PICK, M7.GRID, M7.apply, M7.target, M7.lab_s
NEW = "7g"
N_FRESH = 8
SEED = 5281          # fixed in the plan
WORKERS = int(os.environ.get("WORKERS", "3"))
CELL = "000"


def _deps():
    """The bench and per-design modules (imported lazily: report needs none of them)."""
    RL = _mod("rangeline_run", EXP / "rangeline" / "run.py")
    DC = _mod("drift7c_run", EXP / "drift7c" / "run.py")
    return RL, DC


# ---------- pure helpers (stdlib; tested) ----------

def third_picks(avail, k_used, fn, rl, n=N_FRESH, seed=SEED):
    """n designs from avail, excluding 5z's, 5zy's and 5zz's picks, by a fixed seed."""
    used = set(fn.used_picks(k_used)) | set(fn.fresh_picks(avail, k_used)) | set(rl.second_picks(avail, k_used))
    cand = sorted(j for j in avail if j not in used)
    return sorted(random.Random(seed).sample(cand, n))


def fit_apply(ms, obs, new, obs_names, spearman, lstsq):
    """7c's correction fitted on (ms, obs) only, applied to the new design's observables: (pick, m_hat)."""
    best = max(obs_names, key=lambda o: abs(spearman([r[o] for r in obs], ms)))
    c0, c1 = lstsq([[1.0, r[best]] for r in obs], ms)
    return best, c0 + c1 * new[best]


def choose_margin3(tr_pools, rule):
    """Most permissive grid value whose inner folds (pick on all pools but one, score on it) all meet."""
    def ok(m):
        for i, te in enumerate(tr_pools):
            tr = [r for j, p in enumerate(tr_pools) if j != i for r in p]
            q, _ = apply(te, PICK[rule](tr, m))
            if q > target(te) + EPS:
                return False
        return True
    for m in GRID[rule]:
        if ok(m):
            return m, True
    return GRID[rule][-1], False


def score(te, lab):
    q, c = apply(te, lab)
    tg = target(te)
    return dict(policy=lab, q75=q, target=tg, met=q <= tg + EPS, cycles=c)


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def verdicts(S):
    th, Fr = S["frozen"]["theta"], S["frozen"]["F"]
    rf = S["refit"]["theta"]
    return dict(
        H281=verdict(th["met"] >= 9, th["met"] <= 6),
        H282=verdict(rf["met"] >= 3 and rf["cycles"] <= 40 + 1e-9, rf["met"] <= 1 or rf["cycles"] > 45 + 1e-9),
        H283=verdict(th["met"] >= Fr["met"], th["met"] < Fr["met"]),
        H284=verdict(th["cycles"] <= 40 + 1e-9, th["cycles"] > 45 + 1e-9))


# ---------- bench (pybamm, via 5zk's child) ----------

def jobs():
    RL, _ = _deps()
    FN, B = RL.FN, RL.B
    J = []
    for d, c, k in RL.POOLS:
        src = {r["j"]: r for r in B._load(EXP / d / "bench.jsonl") if r["cond"] == c and r.get("ok")}
        bal = {r["j"] for r in B._load(EXP / d / "balance.jsonl") if r["cond"] == c}
        for j in third_picks([j for j in src if j in bal], k, FN, RL):
            J.append((c, j, src[j]["x"]))
    return J


def bench():
    RL, _ = _deps()
    path = HERE / "bench.jsonl"
    done = {(r["cond"], r["j"]) for r in RL.B._load(path) if r.get("ok")} if path.exists() else set()
    todo = [(c, j, x) for c, j, x in jobs() if (c, j) not in done]
    print(f"{len(todo)} runs to go", flush=True)

    def one(job):
        c, j, x = job
        try:
            p = subprocess.run([sys.executable, str(RL.DEPTH), "child", json.dumps([c, j, x])], capture_output=True,
                               text=True, timeout=2400)
            if p.returncode == 0 and p.stdout.strip():
                return json.loads(p.stdout.strip().splitlines()[-1])
            err = f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
        except subprocess.TimeoutExpired:
            err = "timeout 2400s"
        return dict(cond=c, j=j, x=x, ok=False, error=err, seconds=None)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], "ok" if r["ok"] else r["error"], r.get("seconds"), flush=True)


# ---------- rows ----------

def _job(r):
    _, DC = _deps()
    return DC.LF._job((NEW, r)), DC._job((NEW, r))


def rows():
    RL, DC = _deps()
    fresh = [r for r in RL.B._load(HERE / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= 100]
    with Pool(4) as p:
        res = p.map(_job, fresh)
    old = json.loads((EXP / "drift7c" / "rows.json").read_text())
    out = []
    for lf, dr in res:
        st = dr["set"]
        tr = [o for o in old if o["set"] == st]
        o = dict(cond=dr["cond"], set=st, j=dr["j"], pool=NEW, O1=dr["O1"], O2=dr["O2"], O3=dr["O3"], cells={})
        for cell in DC.CELLS2:
            c = dr["cells"][cell]
            pick, mC = fit_apply([t["cells"][cell]["m"] for t in tr], tr, dr, DC.OBS, DC.spearman, DC.lstsq)
            o["cells"][cell] = dict(m=c["m"], mC=mC, pick=pick, eL=lf["cells"][cell]["eL"],
                                    e_C=DC.err_of((c["ls"], c["rs"]), DC.r_at(c["a"], c["s"], mC), c["lt"]),
                                    e_7c_L=c["eL"])
            assert abs(c["eL"] - lf["cells"][cell]["eL"]["10"]) < 1e-12
        out.append(o)
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "fresh designs;", {s: sum(o["set"] == s for o in out) for s in SETS})


def load_fresh():
    return [dict(set=o["set"], pool=NEW, mC=o["cells"][CELL]["mC"], E={k: o["cells"][CELL]["eL"][str(k)] for k in KS})
            for o in json.loads((HERE / "rows.json").read_text())]


# ---------- report ----------

def report():
    rs, fr = F7.load(), load_fresh()
    names = dict(theta="theta-tight", U="U-tight", F="F-tight", FD="F+D")
    frozen, refit, zero = {}, {}, {}
    for rule in RULES:
        frozen[rule] = []
        for st in SETS:
            te = [r for r in fr if r["set"] == st]
            for p in POOLS:
                f = M7.fold(rs, st, p, rule, nested=True)
                frozen[rule].append(dict(score(te, f["policy"]), set=st, from_pool=p, margin=f["margin"],
                                         held_met_7f=f["met"], n_test=len(te)))
        refit[rule], zero[rule] = [], []
        for st in SETS:
            te = [r for r in fr if r["set"] == st]
            tp = [[r for r in rs if r["set"] == st and r["pool"] == p] for p in POOLS]
            m, ok = choose_margin3(tp, rule)
            allp = [r for p in tp for r in p]
            refit[rule].append(dict(score(te, PICK[rule](allp, m)), set=st, margin=m, inner_ok=ok, n_test=len(te)))
            zero[rule].append(dict(score(te, PICK[rule](allp, GRID[rule][0])), set=st, n_test=len(te)))
    agg = lambda fs: dict(met=sum(f["met"] for f in fs), n=len(fs), cycles=sum(f["cycles"] for f in fs) / len(fs))
    S = dict(frozen={r: agg(frozen[r]) for r in RULES}, refit={r: agg(refit[r]) for r in RULES},
             zero={r: agg(zero[r]) for r in RULES},
             pool={st: dict(n=sum(r["set"] == st for r in fr), q75_50=quant([r["E"][50] for r in fr if r["set"] == st]),
                            q75_10=quant([r["E"][10] for r in fr if r["set"] == st])) for st in SETS})
    V = verdicts(S)
    L = ["cell-fidelity milestone 7g: 7f's triage rules on a fourth fresh DFN pool (8 designs per set, none simulated",
         "before; S_C fitted on the 104 earlier designs only). Target = 1.25 x the fresh pool's all-50 q75 of the",
         "cycle-99 lithium-loss error (cell 000).", "",
         f"{'set':12s}{'n':>3s}{'q75 U10':>9s}{'q75 U50':>9s}{'target':>8s}"]
    for st in SETS:
        p = S["pool"][st]
        L.append(f"{st:12s}{p['n']:3d}{p['q75_10']:9.3f}{p['q75_50']:9.3f}{T0 * p['q75_50']:8.3f}")
    L += ["", f"{'rule':14s}{'how':>8s}{'met':>8s}{'cycles':>8s}{'saved vs U50':>14s}"]
    for how, D in (("frozen", S["frozen"]), ("refit", S["refit"]), ("zero", S["zero"])):
        for rule in RULES:
            d = D[rule]
            L.append(f"{names[rule]:14s}{how:>8s}{d['met']:>5d}/{d['n']:<2d}{d['cycles']:8.1f}"
                     f"{100 * (1 - d['cycles'] / 50):13.0f}%")
    L.append(f"{'U50':14s}{'-':>8s}{'all':>8s}{50.0:8.1f}{0:13.0f}%")
    for rule in RULES:
        L += ["", f"{names[rule]}, frozen 7f policies on the fresh pool:",
              f"{'set':12s}{'from':>5s}{'margin':>8s}{'7f met':>7s}{'policy':>13s}{'q75':>7s}{'target':>8s}{'met':>5s}"
              f"{'cycles':>8s}"]
        for f in frozen[rule]:
            L.append(f"{f['set']:12s}{f['from_pool']:>5s}{f['margin']:8.2f}{'yes' if f['held_met_7f'] else 'no':>7s}"
                     f"{lab_s(f['policy']):>13s}{f['q75']:7.3f}{f['target']:8.3f}{'yes' if f['met'] else 'no':>5s}"
                     f"{f['cycles']:8.1f}")
        L += [f"{names[rule]}, refit on three pools:"]
        for f in refit[rule]:
            L.append(f"{f['set']:12s}{'all':>5s}{f['margin']:8.2f}{'ok' if f['inner_ok'] else 'no':>7s}"
                     f"{lab_s(f['policy']):>13s}{f['q75']:7.3f}{f['target']:8.3f}{'yes' if f['met'] else 'no':>5s}"
                     f"{f['cycles']:8.1f}")
    th, rf, Fr = S["frozen"]["theta"], S["refit"]["theta"], S["frozen"]["F"]
    L += ["", "(frozen: 7f's nested-margin policy from fold (set, held-out pool), unchanged; '7f met' = it met 7f's",
          " held-out pool. refit: picked on all three earlier pools, margin from three inner folds; inner 'no' = none",
          " met all three, most conservative used. zero: refit at margin 1.25 (F+D: D = 0). U50* = fall back to 50.)", "",
          f"H281 (frozen theta-tight meets >= 9 of 12 on the fresh pools): {V['H281']} ({th['met']}/12)",
          f"H282 (refit theta-tight meets >= 3 of 4 at <= 40 cycles): {V['H282']} ({rf['met']}/4, {rf['cycles']:.1f})",
          f"H283 (frozen theta-tight meets at least as many as frozen F-tight): {V['H283']} ({th['met']} vs {Fr['met']})",
          f"H284 (frozen theta-tight costs <= 40 cycles per design on the fresh pools): {V['H284']} ({th['cycles']:.1f})"]
    js = lambda fs: [dict(f, policy=lab_s(f["policy"])) for f in fs]
    out = dict(summary=S, verdicts=V, frozen={r: js(v) for r, v in frozen.items()},
               refit={r: js(v) for r, v in refit.items()}, zero={r: js(v) for r, v in zero.items()})
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(out, indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"bench": bench, "rows": rows, "report": report}[sys.argv[1]]()
