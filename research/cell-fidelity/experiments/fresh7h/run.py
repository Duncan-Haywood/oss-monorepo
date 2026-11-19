"""Milestone 7h (a fifth fresh pool and a scale-free threshold): 7g found 7f's frozen triage rules met the tail
target in 9 of 12 policies on 32 never-simulated designs, but the absolute drift threshold flagged more fresh
designs than it was set to where the fresh pool's S_C ran higher (Ai2020, Chen2020), and two misses came from a
40-cycle extension. Here 16 new designs per set (none of 5z's, 5zy's, 5zz's or 7g's picks) are simulated to cycle
100 with 5zk's x-resolved bench, unchanged, and scored by rules fixed before the bench ran.

    WORKERS=3 python experiments/fresh7h/run.py bench   # DFN to cycle 100, x-resolved (pybamm; resumable)
    python experiments/fresh7h/run.py rows              # 7b's e at every window and 7c's drift inputs (stdlib, 4 cores)
    python experiments/fresh7h/run.py report            # H285 to H289 -> results.txt, summary.json

    S_C on the fresh pool: 7c's correction fitted on the set's 104 earlier designs only (as 7g)
    rules, each picked on all four earlier pools of a set (5zk, 5zy, 5zz, 7g), margin from four inner folds:
      theta    7f's absolute threshold on S_C, K1 free in {15, 20, 30, 40, 50}
      theta50  the same with K1 = 50 only
      R50      (new, primary) K1 = 50; flag S_C >= rho x median S_C of the batch being triaged (scale-free)
      F, U     7f's flag fraction and uniform run length
    frozen: 7f's 12 nested theta-tight policies and 7g's 4 refit theta-tight policies, unchanged
    lopo5: every set's five pools (5zk, 5zy, 5zz, 7g, 7h) in turn held out, margin from the other four (20 folds)
    target: 1.25 x the scored pool's own all-50 q75 of the cycle-99 lithium-loss error (cell 000)
Plan in ../../LOG.md (7h plan).
"""
import importlib.util
import json
import os
import random
import statistics
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


G7 = _mod("fresh7g_run", EXP / "fresh7g" / "run.py")
M7, F7 = G7.M7, G7.F7
SETS, KS, T0, quant, EPS, target, lab_s = M7.SETS, M7.KS, M7.T0, M7.quant, M7.EPS, M7.target, M7.lab_s
TT = M7.TT
NEW = "7h"
N_FRESH = 16
SEED = 5291          # fixed in the plan
WORKERS = int(os.environ.get("WORKERS", "3"))
CELL = "000"
TRAIN_POOLS = ("5zk", "5zy", "5zz", "7g")
ALL_POOLS = TRAIN_POOLS + (NEW,)
RULES = ("R50", "theta50", "theta", "F", "U")
NAMES = dict(R50="R50 (relative, K1=50)", theta50="theta50 (absolute, K1=50)", theta="theta-tight (K1 free)",
             F="F-tight (fraction)", U="U-tight (uniform)")
sc = M7.sc


# ---------- pure helpers (stdlib; tested) ----------

def fourth_picks(avail, k_used, fn, rl, g7, n=N_FRESH, seed=SEED):
    """n designs from avail, excluding 5z's, 5zy's, 5zz's and 7g's picks, by a fixed seed."""
    used = (set(fn.used_picks(k_used)) | set(fn.fresh_picks(avail, k_used)) | set(rl.second_picks(avail, k_used))
            | set(g7.third_picks(avail, k_used, fn, rl)))
    cand = sorted(j for j in avail if j not in used)
    return sorted(random.Random(seed).sample(cand, n))


def rel_scores(rs):
    """S_C / median S_C of the design's own pool (the batch it was triaged in)."""
    med = {}
    for p in {r["pool"] for r in rs}:
        med[p] = statistics.median([sc(r) for r in rs if r["pool"] == p])
    return [sc(r) / med[r["pool"]] if med[r["pool"]] > 0 else float("inf") for r in rs]


def thr_policies(tr, K1s, rel):
    """[(train cost, (tag, K1, threshold), train q75)]; flag score >= threshold, extend to K1."""
    s = rel_scores(tr) if rel else [sc(r) for r in tr]
    n = len(tr)
    out = []
    for K1 in K1s:
        for th in sorted(set(s)) + [float("inf")]:
            fl = [v >= th for v in s]
            q = quant([r["E"][K1] if f else r["E"][10] for r, f in zip(tr, fl)])
            out.append((10 + (K1 - 10) * sum(fl) / n, ("R" if rel else "TH", K1, th), q))
    return out


def _pick_thr(tr, m, K1s, rel):
    tgt = target(tr, m)
    ok = [p for p in thr_policies(tr, K1s, rel) if p[2] <= tgt + EPS]
    if not ok:
        return None
    return min(ok, key=lambda p: (round(p[0], 12), -p[1][2], p[1][1]))[1]


PICK = dict(R50=lambda tr, m: _pick_thr(tr, m, (50,), True),
            theta50=lambda tr, m: _pick_thr(tr, m, (50,), False),
            theta=lambda tr, m: _pick_thr(tr, m, M7.K1S, False),
            F=M7.pick_F, U=M7.pick_U)


def apply(te, lab):
    """Held-out q75 and realised DFN cycles per design; R thresholds use te's own median S_C."""
    if lab is not None and lab[0] == "R":
        _, K1, rho = lab
        med = statistics.median([sc(r) for r in te])
        fl = [(sc(r) / med if med > 0 else float("inf")) >= rho for r in te]
        n = len(te)
        return quant([r["E"][K1] if f else r["E"][10] for r, f in zip(te, fl)]), 10 + (K1 - 10) * sum(fl) / n
    return M7.apply(te, lab)


def flag_share(rs, lab):
    """Share of rs a threshold policy flags (each pool against its own median for R)."""
    if lab is None:
        return 1.0
    if lab[0] == "R":
        return sum(v >= lab[2] for v in rel_scores(rs)) / len(rs)
    if lab[0] == "TH":
        return sum(sc(r) >= lab[2] for r in rs) / len(rs)
    return None


def choose_margin(tr_pools, rule):
    """Most permissive t' whose inner folds (pick on all pools but one, score on it) all meet; else most conservative."""
    def ok(m):
        for i, te in enumerate(tr_pools):
            tr = [r for j, p in enumerate(tr_pools) if j != i for r in p]
            q, _ = apply(te, PICK[rule](tr, m))
            if q > target(te) + EPS:
                return False
        return True
    for m in TT:
        if ok(m):
            return m, True
    return TT[-1], False


def score(te, lab):
    q, c = apply(te, lab)
    tg = target(te)
    return dict(policy=lab, q75=q, target=tg, met=q <= tg + EPS, cycles=c)


def refit(tp, te, rule):
    m, ok = choose_margin(tp, rule)
    tr = [r for p in tp for r in p]
    lab = PICK[rule](tr, m)
    return dict(score(te, lab), margin=m, inner_ok=ok, share_train=flag_share(tr, lab),
                share_test=flag_share(te, lab), n_test=len(te))


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def verdicts(S):
    fz, R, th50, th = S["frozen7f"], S["refit"]["R50"], S["refit"]["theta50"], S["refit"]["theta"]
    lo = S["lopo5"]["R50"]
    return dict(
        H285=verdict(fz["met"] >= 9, fz["met"] <= 6),
        H286=verdict(R["met"] >= 3 and R["cycles"] <= 40 + 1e-9, R["met"] <= 1 or R["cycles"] > 45 + 1e-9),
        H287=verdict(S["drift"]["R50"] < S["drift"]["theta50"] - 1e-12,
                     S["drift"]["R50"] > S["drift"]["theta50"] + 1e-12),
        H288=verdict(th50["met"] >= th["met"], th50["met"] < th["met"]),
        H289=verdict(lo["met"] >= 15, lo["met"] <= 11))


# ---------- bench (pybamm, via 5zk's child; same code path as 7g) ----------

def jobs():
    RL, _ = G7._deps()
    FN, B = RL.FN, RL.B
    J = []
    for d, c, k in RL.POOLS:
        src = {r["j"]: r for r in B._load(EXP / d / "bench.jsonl") if r["cond"] == c and r.get("ok")}
        bal = {r["j"] for r in B._load(EXP / d / "balance.jsonl") if r["cond"] == c}
        for j in fourth_picks([j for j in src if j in bal], k, FN, RL, G7):
            J.append((c, j, src[j]["x"]))
    return J


def bench():
    G7.HERE, G7.jobs = HERE, jobs     # 7g's runner, pointed at this directory and these picks
    G7.WORKERS = WORKERS
    G7.bench()


# ---------- rows ----------

def _job(r):
    _, DC = G7._deps()
    return DC.LF._job((NEW, r)), DC._job((NEW, r))


def rows():
    G7.HERE, G7.NEW, G7._job = HERE, NEW, _job
    G7.rows()


def load_pool(d, pool):
    return [dict(set=o["set"], pool=pool, mC=o["cells"][CELL]["mC"],
                 E={k: o["cells"][CELL]["eL"][str(k)] for k in KS})
            for o in json.loads((EXP / d / "rows.json").read_text())]


def load_all():
    return F7.load() + load_pool("fresh7g", "7g") + load_pool("fresh7h", NEW)


# ---------- report ----------

def report():
    rs = load_all()
    by = lambda st, p: [r for r in rs if r["set"] == st and r["pool"] == p]
    agg = lambda fs: dict(met=sum(f["met"] for f in fs), n=len(fs), cycles=sum(f["cycles"] for f in fs) / len(fs))
    fz7f, fz7g = [], []
    old = F7.load()
    for st in SETS:
        te = by(st, NEW)
        for p in M7.POOLS:
            f = M7.fold(old, st, p, "theta", nested=True)
            fz7f.append(dict(score(te, f["policy"]), set=st, src=p, margin=f["margin"]))
        tp3 = [by(st, p) for p in M7.POOLS]
        m, _ = G7.choose_margin3(tp3, "theta")
        fz7g.append(dict(score(te, M7.PICK["theta"]([r for p in tp3 for r in p], m)), set=st, src="all", margin=m))
    rf = {rule: [dict(refit([by(st, p) for p in TRAIN_POOLS], by(st, NEW), rule), set=st) for st in SETS]
          for rule in RULES}
    lo = {rule: [dict(refit([by(st, q) for q in ALL_POOLS if q != p], by(st, p), rule), set=st, pool=p)
                 for st in SETS for p in ALL_POOLS] for rule in RULES}
    drift = {rule: sum(abs(f["share_test"] - f["share_train"]) for f in rf[rule]) / len(SETS)
             for rule in ("R50", "theta50", "theta")}
    S = dict(frozen7f=agg(fz7f), frozen7g=agg(fz7g), refit={r: agg(rf[r]) for r in RULES},
             lopo5={r: agg(lo[r]) for r in RULES}, drift=drift,
             pool={st: dict(n=len(by(st, NEW)), q75_50=quant([r["E"][50] for r in by(st, NEW)]),
                            q75_10=quant([r["E"][10] for r in by(st, NEW)]),
                            med_sc={p: statistics.median([sc(r) for r in by(st, p)]) for p in ALL_POOLS})
                   for st in SETS})
    V = verdicts(S)
    L = ["cell-fidelity milestone 7h: a fifth fresh DFN pool (16 designs per set, none simulated before; S_C fitted",
         "on the 104 earlier designs only) and a scale-free drift threshold. Target = 1.25 x the scored pool's",
         "all-50 q75 of the cycle-99 lithium-loss error (cell 000).", "",
         f"{'set':12s}{'n':>3s}{'q75 U10':>9s}{'q75 U50':>9s}{'target':>8s}   median S_C by pool "
         + " ".join(f"{p:>6s}" for p in ALL_POOLS)]
    for st in SETS:
        p = S["pool"][st]
        L.append(f"{st:12s}{p['n']:3d}{p['q75_10']:9.3f}{p['q75_50']:9.3f}{T0 * p['q75_50']:8.3f}"
                 f"{'':21s}" + " ".join(f"{p['med_sc'][q]:6.3f}" for q in ALL_POOLS))
    L += ["", f"{'rule':28s}{'how':>9s}{'met':>8s}{'cycles':>8s}{'saved vs U50':>14s}"]
    row = lambda name, how, d: (f"{name:28s}{how:>9s}{d['met']:>5d}/{d['n']:<2d}{d['cycles']:8.1f}"
                                f"{100 * (1 - d['cycles'] / 50):13.0f}%")
    L.append(row("theta-tight, 7f policies", "frozen", S["frozen7f"]))
    L.append(row("theta-tight, 7g refit", "frozen", S["frozen7g"]))
    for rule in RULES:
        L.append(row(NAMES[rule], "refit4", S["refit"][rule]))
    for rule in RULES:
        L.append(row(NAMES[rule], "lopo5", S["lopo5"][rule]))
    L.append(f"{'U50':28s}{'-':>9s}{'all':>8s}{50.0:8.1f}{0:13.0f}%")
    L += ["", "frozen 7f theta-tight policies on the 7h pool:",
          f"{'set':12s}{'from':>5s}{'margin':>8s}{'policy':>13s}{'q75':>7s}{'target':>8s}{'met':>5s}{'cycles':>8s}"]
    for f in fz7f + fz7g:
        L.append(f"{f['set']:12s}{f['src']:>5s}{f['margin']:8.2f}{lab_s(f['policy']):>13s}{f['q75']:7.3f}"
                 f"{f['target']:8.3f}{'yes' if f['met'] else 'no':>5s}{f['cycles']:8.1f}")
    for rule in RULES:
        L += ["", f"{NAMES[rule]}, refit on four pools, scored on 7h:",
              f"{'set':12s}{'margin':>8s}{'inner':>6s}{'policy':>13s}{'q75':>7s}{'target':>8s}{'met':>5s}{'cycles':>8s}"
              f"{'flag tr':>8s}{'flag 7h':>8s}"]
        for f in rf[rule]:
            sh = lambda v: f"{v:8.2f}" if v is not None else f"{'-':>8s}"
            L.append(f"{f['set']:12s}{f['margin']:8.2f}{'ok' if f['inner_ok'] else 'no':>6s}"
                     f"{lab_r(f['policy']):>13s}{f['q75']:7.3f}{f['target']:8.3f}{'yes' if f['met'] else 'no':>5s}"
                     f"{f['cycles']:8.1f}{sh(f['share_train'])}{sh(f['share_test'])}")
    L += ["", "lopo5 per held-out pool (met / 4 sets, mean cycles):",
          f"{'rule':28s}" + "".join(f"{p:>12s}" for p in ALL_POOLS)]
    for rule in RULES:
        cells = []
        for p in ALL_POOLS:
            fs = [f for f in lo[rule] if f["pool"] == p]
            cells.append(f"{sum(f['met'] for f in fs):>4d}/4 {sum(f['cycles'] for f in fs) / 4:5.1f}")
        L.append(f"{NAMES[rule]:28s}" + "".join(f"{c:>12s}" for c in cells))
    fz, R, t50, th, lR = S["frozen7f"], S["refit"]["R50"], S["refit"]["theta50"], S["refit"]["theta"], S["lopo5"]["R50"]
    L += ["", "(refit4: picked on 5zk, 5zy, 5zz and 7g; margin t' the most permissive whose four inner folds all meet,",
          " else 1.00 (inner 'no'). R policies print as K1>=rho x median. flag tr / flag 7h: share flagged on the",
          " training pools and on 7h. lopo5: each of the 5 pools held out, margin from the other 4; 20 folds.)", "",
          f"H285 (frozen 7f theta-tight meets >= 9 of 12 on 7h): {V['H285']} ({fz['met']}/12)",
          f"H286 (R50 refit meets >= 3 of 4 at <= 40 cycles): {V['H286']} ({R['met']}/4, {R['cycles']:.1f})",
          f"H287 (R50's flagged share moves less from training to 7h than theta50's): {V['H287']} "
          f"(mean |change| {drift['R50']:.3f} vs {drift['theta50']:.3f})",
          f"H288 (theta50 meets at least as many sets as theta-tight): {V['H288']} ({t50['met']} vs {th['met']})",
          f"H289 (R50 meets >= 15 of 20 lopo5 folds): {V['H289']} ({lR['met']}/20, {lR['cycles']:.1f} cycles)"]
    js = lambda fs: [dict(f, policy=lab_r(f["policy"])) for f in fs]
    out = dict(summary=S, verdicts=V, frozen7f=js(fz7f), frozen7g=js(fz7g), refit={r: js(v) for r, v in rf.items()},
               lopo5={r: js(v) for r, v in lo.items()})
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(out, indent=1, default=str) + "\n")
    print("\n".join(L))


def lab_r(l):
    if l is not None and l[0] == "R":
        return f"{l[1]}>={l[2]:.2f}xmed" if l[2] != float("inf") else f"{l[1]}>=inf"
    return lab_s(l)


if __name__ == "__main__":
    {"bench": bench, "rows": rows, "report": report}[sys.argv[1]]()
