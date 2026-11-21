"""Milestone 7v: does the corrected ten-cycle forecast turn the threshold rule's extra cycles into a saving? Stdlib only.

    python experiments/rule7v/run.py report     # H336 to H339 -> results.txt, summary.json

7s: at f = 30 the threshold rule (theta) costs +5.50 DFN cycles per design more than a uniform run length (U) on the two
tuned cells. 7u: 7c's correction cuts those cells' ten-cycle forecast error by 64 to 71%, but the rule scores an
unflagged design by the straight-line error E10. Here, in each lopo5 fold, 7c's correction is fitted on the four
training pools and the forecast R(99) = a + 10 s + 89 s m_hat replaces the straight line in E[10] only; 7h's `refit`
is then rerun (theta, theta50, U on the original rows as a replay; thetaC, theta50C, UC on the corrected rows).
Plan in ../../LOG.md (7v plan).
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SOURCES = (("plating7r", "f10"), ("plating7s", "f30"))
BASE = ("theta", "theta50", "U")
RULES = BASE + tuple(r + "C" for r in BASE)
OBS = ("O1", "O2", "O3")


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _u():
    return _mod("bend7u_run", EXP / "bend7u" / "run.py")


# ---------- pure helpers (tested) ----------

def fit_c(train):
    """7c's correction on training rows (dicts with m, O1..O3): (pick, beta) by largest |Spearman|, then OLS."""
    U = _u()
    y = [t["m"] for t in train]
    best = max(OBS, key=lambda o: abs(U.spearman([t[o] for t in train], y)))
    return best, U.ols([[t[best]] for t in train], y)


def with_e10(rows, e10):
    """Copies of rows with E[10] replaced by e10[(set, j)]; every other window untouched."""
    out = []
    for r in rows:
        E = dict(r["E"])
        E[10] = e10[(r["set"], r["j"])]
        out.append(dict(r, E=E))
    return out


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def judge(P, per):
    """H336 to H339 from P[(a, b)] = f = 30 paired summary (mean) and per[set][rule] = {met, n}. Pure; tested."""
    d_u, d_t, d_uc = P[("thetaC", "U")]["mean"], P[("thetaC", "theta")]["mean"], P[("thetaC", "UC")]["mean"]
    mets = [per[s]["thetaC"]["met"] for s in per]
    return dict(
        H336=verdict(d_u < 0, d_u > 0),
        H337=verdict(d_t <= -5, d_t > -1),
        H338=verdict(all(m >= 4 for m in mets), any(m <= 2 for m in mets)),
        H339=verdict(d_uc < 0, d_uc > 0))


# ---------- data ----------

def _rows(src):
    """7r's report's row preparation (its pools and 7c's mC per set), on one source's rows.json."""
    S = _u()._s7p()
    spearman, lstsq = S._stats()
    raw = json.loads((EXP / src / "rows.json").read_text())
    out = []
    for cond in dict.fromkeys(o["cond"] for o in raw):
        mine = [o for o in raw if o["cond"] == cond]
        pools = S.split_pools([o["j"] for o in mine])
        pool_of = {j: p for p, js in pools.items() for j in js}
        rs = [dict(o, pool=pool_of[o["j"]], E={int(k): v for k, v in o["E"].items()}) for o in mine if o["j"] in pool_of]
        rs, _ = S.correct(rs, spearman, lstsq)
        out += rs
    return out


def report():
    U = _u()
    S = U._s7p()
    H = _mod("fresh7h_run", EXP / "fresh7h" / "run.py")
    D = U.designs()                                     # a, s, table, true L per design (7p's per-design code)
    LF, DC = S._deps().LF, sys.modules["drift7c_run"]
    err = lambda d, mh: LF.err_of((d["ls"], d["rs"]), DC.r_at(d["a"], d["s"], mh), d["lt"])
    out, ctrl, picks = {}, {}, {}
    for src, tag in SOURCES:
        rows = _rows(src)
        dd = {(d["set"], d["j"]): d for d in D if d["tag"] == tag}
        ctrl[tag] = dict(e10=max(abs(err(dd[(r["set"], r["j"])], 1.0) - r["E"][10]) for r in rows))
        sets = list(dict.fromkeys(r["set"] for r in rows))
        sens = {(r["set"], r["j"]): err(dd[(r["set"], r["j"])], r["mC"]) for r in rows}
        folds, sfolds = {rule: [] for rule in RULES}, {rule: [] for rule in RULES[3:]}
        for st in sets:
            for p in S.POOLS:
                mine = [r for r in rows if r["set"] == st]
                tr = [r for r in mine if r["pool"] != p]
                best, beta = fit_c([dict(r, **{o: dd[(st, r["j"])][o] for o in OBS}) for r in tr])
                picks.setdefault(tag, {}).setdefault(st, []).append(best)
                e10 = {(st, r["j"]): err(dd[(st, r["j"])], U.predict(beta, [r[best]])) for r in mine}
                for rows_, tgt in ((mine, folds), (with_e10(mine, e10), folds), (with_e10(mine, sens), sfolds)):
                    pick = BASE if rows_ is mine else tuple(r + "C" for r in BASE)
                    by = lambda q: [r for r in rows_ if r["pool"] == q]
                    for b, rule in zip(BASE, pick):
                        f = H.refit([by(q) for q in S.POOLS if q != p], by(p), b)
                        tgt[rule].append(dict(set=st, pool=p, cycles=float(f["cycles"]), met=bool(f["met"]),
                                              policy=f["policy"], q75=f["q75"], target=f["target"]))
        old = json.loads((EXP / src / "summary.json").read_text())["lopo5"]
        ctrl[tag]["replay"] = max(abs(a["cycles"] - float(b["cycles"])) + (a["met"] != bool(b["met"]))
                                  for rule in BASE for a, b in zip(
                                      sorted(folds[rule], key=lambda f: (f["set"], f["pool"])),
                                      sorted(old[rule], key=lambda f: (f["set"], f["pool"]))))
        pair = {}
        for a, b in (("thetaC", "U"), ("thetaC", "theta"), ("thetaC", "UC"), ("theta50C", "U"), ("UC", "U"),
                     ("theta", "U")):
            pr = S.paired(folds[a], folds[b])
            pos, neg, sp = S.sign_test([r["d"] for r in pr])
            pair[(a, b)] = dict(mean=sum(r["d"] for r in pr) / len(pr), boot=S.set_boot(pr), cheaper=neg, dearer=pos,
                                sign_p=sp, per_set={s: sum(r["d"] for r in pr if r["set"] == s) / 5 for s in sets})
        spair = S.paired(sfolds["thetaC"], folds["U"])
        agg = lambda fs: dict(met=sum(f["met"] for f in fs), n=len(fs), cycles=sum(f["cycles"] for f in fs) / len(fs))
        per = {st: {rule: agg([f for f in folds[rule] if f["set"] == st]) for rule in RULES} for st in sets}
        sper = {st: {rule: agg([f for f in sfolds[rule] if f["set"] == st]) for rule in sfolds} for st in sets}
        out[tag] = dict(folds=folds, pair=pair, per=per, sens=dict(per=sper, thetaC_U=sum(r["d"] for r in spair) / 10),
                        e10=dict(N={s: _q(H, [r["E"][10] for r in rows if r["set"] == s]) for s in sets}))
    V = judge(out["f30"]["pair"], out["f30"]["per"])
    L = ["cell-fidelity milestone 7v: 7c's corrected ten-cycle forecast in place of the straight line inside 7h's",
         "threshold rule. No new simulation: plating7r (f = 10) and plating7s (f = 30) rows; cell 000; 7p's pools, lopo5",
         "(five folds per set-condition), 7c's correction fitted per fold on the four training pools; only E[10] changes.",
         "Cycles are DFN cycles per design; negative differences mean the first rule is cheaper.", ""]
    for tag in ("f30", "f10"):
        L.append(f"control {tag}: max |E10(m_hat = 1) - rows.json E10| = {ctrl[tag]['e10']:.2e}; "
                 f"replay of theta/theta50/U vs the source's lopo5 (cycles + met mismatches) = {ctrl[tag]['replay']:.2e}")
    L.append("")
    for tag in ("f30", "f10"):
        o = out[tag]
        L.append(f"---- {tag} ----")
        L.append(f"{'set':12s}" + "".join(f"{r:>16s}" for r in RULES) + "   C picks (5 folds)")
        for st, pr in o["per"].items():
            L.append(f"{st:12s}" + "".join(f"{pr[r]['met']}/5 {pr[r]['cycles']:6.1f} cyc".rjust(16) for r in RULES)
                     + "   " + "/".join(picks[tag][st]))
        L.append(f"{'pair':18s}{'mean':>8s}{'set boot 95%':>20s}{'cheaper':>9s}{'dearer':>8s}{'sign p':>8s}   per set")
        for (a, b), v in o["pair"].items():
            bt = f"{v['boot'][0]:+.2f} to {v['boot'][1]:+.2f}" if v["boot"] else "-"
            L.append(f"{a + ' - ' + b:18s}{v['mean']:+8.2f}{bt:>20s}{v['cheaper']:9d}{v['dearer']:8d}{v['sign_p']:8.3f}   "
                     + ", ".join(f"{s} {d:+.2f}" for s, d in v["per_set"].items()))
        L.append(f"sensitivity (E10c from the flag's own mC): thetaC - U mean {o['sens']['thetaC_U']:+.2f}; "
                 + "; ".join(f"{s} " + " ".join(f"{r} {v['met']}/5 {v['cycles']:.1f}" for r, v in pr.items())
                             for s, pr in o["sens"]["per"].items()))
        L.append("thetaC policies per fold: " + "; ".join(
            f"{f['set'][:6]} {f['pool']} {_lab(f['policy'])} q75 {f['q75']:.3f}/{f['target']:.3f}"
            for f in o["folds"]["thetaC"]))
        L.append("")
    for h, t in (("H336", "f = 30, 10-fold mean of thetaC - U < 0"),
                 ("H337", "f = 30, 10-fold mean of thetaC - theta <= -5"),
                 ("H338", "thetaC meets >= 4 of 5 folds on each f = 30 cell"),
                 ("H339", "f = 30, 10-fold mean of thetaC - UC < 0")):
        L.append(f"{h} ({t}): {V[h]}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    S_ = dict(verdicts=V, control=ctrl, picks=picks,
              **{tag: dict(per=o["per"], sens=o["sens"],
                           pair={f"{a}-{b}": v for (a, b), v in o["pair"].items()},
                           folds={r: [dict(f, policy=list(f["policy"]) if f["policy"] else None) for f in fs]
                                  for r, fs in o["folds"].items()}) for tag, o in out.items()})
    (HERE / "summary.json").write_text(json.dumps(S_, indent=1, default=str) + "\n")
    print("\n".join(L))


def _q(H, v):
    return H.quant(v)


def _lab(p):
    if p is None:
        return "all-50"
    if p[0] == "U":
        return f"U{p[1]}"
    return f"{p[0]} K1={p[1]} th={p[2]:.3g}"


if __name__ == "__main__":
    {"report": report}[sys.argv[1]]()
