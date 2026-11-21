"""Milestone 7x: a nested, out-of-fold gate for 7c's corrected ten-cycle forecast inside 7h's threshold rule.

    python experiments/gate7x/run.py report     # H344 to H348 -> results.txt, summary.json (4 processes, ~2 min)

7w found the corrected forecast hurts on the four committed sets (thetaC 16 of 20 folds) and 7v found it saves 30
DFN cycles per design on the two plating cells at f = 30. 7w's in-sample gate did not recover the lost folds, and
the inner-margin choice saw corrected errors fitted on the pools it was scored on. Here every corrected E10 that a
decision is scored on comes from a correction fitted without that row's pool: the margin's inner folds, the final
pick on the training pools, and the gate. No new simulation. Plan in ../../LOG.md (7x plan).
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
BASE = ("theta", "U")
NEW = ("thetaH", "UH", "thetaN", "UN")
RULES = BASE + ("thetaC",) + NEW
POST = ("thetaQ",)      # post hoc: thetaH where gate75 is on, else theta


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _w():
    return _mod("rule7w_run", EXP / "rule7w" / "run.py")


def _v():
    return _mod("rule7v_run", EXP / "rule7v" / "run.py")


def _h():
    return _mod("fresh7h_run", EXP / "fresh7h" / "run.py")


# ---------- pure helpers (tested) ----------

def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def judge(met_n, d_theta, d_u30, met_h, boot6):
    """H344 to H348. met_n, met_h: thetaN's and thetaH's met folds of 20; d_theta: thetaN - theta (four sets);
    d_u30: thetaN - U at f = 30; boot6: six-set interval of thetaN - theta. Pure; tested."""
    return dict(
        H344=verdict(met_n >= 18, met_n <= 16),
        H345=verdict(d_theta <= 1e-12, d_theta >= 1.38 - 1e-12),
        H346=verdict(d_u30 <= -25 + 1e-12, d_u30 > -10),
        H347=verdict(met_h >= 18, met_h <= 16),
        H348=verdict(boot6[1] < 0, boot6[0] > 0))


class Corrector:
    """Corrected E10 of every row of one set, from 7c's correction fitted on a given set of pools (cached).
    ident=True returns the straight E10 (m_hat = 1), the control."""

    def __init__(self, rows, inp, err, fit_c, predict, ident=False):
        self.rows, self.inp, self.err, self.fit_c, self.predict, self.ident = rows, inp, err, fit_c, predict, ident
        self.cache, self.picks = {}, {}

    def e10(self, pools):
        pools = frozenset(pools)
        if pools not in self.cache:
            if self.ident:
                self.cache[pools] = {r["k"]: r["E"][10] for r in self.rows}
            else:
                best, beta = self.fit_c([self.inp[r["k"]] for r in self.rows if r["pool"] in pools])
                self.picks[pools] = best
                self.cache[pools] = {r["k"]: self.err(self.inp[r["k"]], self.predict(beta, [self.inp[r["k"]][best]]))
                                     for r in self.rows}
        return self.cache[pools]


def swap(rs, e10):
    out = []
    for r in rs:
        E = dict(r["E"])
        E[10] = e10[r["k"]]
        out.append(dict(r, E=E))
    return out


def oof(rs, train_pools, cor):
    """Rows of train_pools with E10 from a correction fitted on the other train_pools (out of fold)."""
    tp = set(train_pools)
    return [swap([r], cor.e10(tp - {r["pool"]}))[0] for r in rs if r["pool"] in tp]


def nested_refit(rs, p, pools, rule, cor, H):
    """7h's refit with honest corrected errors: inner fold q scores q's rows corrected on the other three training
    pools and picks on rows each corrected without their own pool and q; the final pick sees out-of-fold errors;
    the held-out pool is corrected on all four training pools."""
    T = [q for q in pools if q != p]
    inner = {}
    for q in T:
        rest = [x for x in T if x != q]
        te = swap([r for r in rs if r["pool"] == q], cor.e10(rest))
        inner[q] = (oof(rs, rest, cor), te)
    m_ok, ok = H.TT[-1], False
    for m in H.TT:
        if all(H.apply(te, H.PICK[rule](tr, m))[0] <= H.target(te) + H.EPS for tr, te in inner.values()):
            m_ok, ok = m, True
            break
    tr = oof(rs, T, cor)
    held = swap([r for r in rs if r["pool"] == p], cor.e10(T))
    return dict(H.score(held, H.PICK[rule](tr, m_ok)), margin=m_ok, inner_ok=ok)


def gate75(rs, p, pools, cor, quant):
    """POST HOC (not in the plan): the same gate on the training rows' 75th percentile, the statistic the target uses."""
    T = [q for q in pools if q != p]
    tr = [r for r in rs if r["pool"] in T]
    return quant([r["E"][10] for r in oof(rs, T, cor)]) < quant([r["E"][10] for r in tr])


def gate(rs, p, pools, cor):
    """Use the correction in outer fold p if the training rows' out-of-fold corrected median E10 beats the straight."""
    T = [q for q in pools if q != p]
    tr = [r for r in rs if r["pool"] in T]
    return statistics.median(r["E"][10] for r in oof(rs, T, cor)) < statistics.median(r["E"][10] for r in tr)


# ---------- data ----------

def committed():
    """7w's 200 rows and inputs on the four committed sets."""
    W = _w()
    rs = W.rows()
    inp = W.inputs(rs)
    for r in rs:
        r["k"] = r["key"]
    return dict(rows=rs, inp=inp, pools=_h().ALL_POOLS, old=json.loads((EXP / "rule7w" / "summary.json").read_text())
                ["folds"], old_h=json.loads((EXP / "fresh7h" / "summary.json").read_text())["lopo5"])


def tuned():
    """7v's rows and inputs on the two tuned cells, per rate."""
    V = _v()
    U = V._u()
    S = U._s7p()
    D = U.designs()
    old = json.loads((EXP / "rule7v" / "summary.json").read_text())
    out = {}
    for src, tag in V.SOURCES:
        rs = V._rows(src)
        dd = {(d["set"], d["j"]): d for d in D if d["tag"] == tag}
        inp = {}
        for r in rs:
            r["k"] = (r["set"], r["j"])
            inp[r["k"]] = dict(dd[r["k"]], m=r["m"], **{o: dd[r["k"]][o] for o in V.OBS})
        out[tag] = dict(rows=rs, inp=inp, pools=S.POOLS, old=old[tag]["folds"])
    return out


def run_cond(c, err, fit_c, predict, H):
    rs = c["rows"]
    folds = {r: [] for r in RULES + POST}
    gates75 = {}
    ctrl = {b + "H": [] for b in BASE}
    gates, picks = {}, {}
    for st in dict.fromkeys(r["set"] for r in rs):
        mine = [r for r in rs if r["set"] == st]
        cor = Corrector(mine, c["inp"], err, fit_c, predict)
        idc = Corrector(mine, c["inp"], err, fit_c, predict, ident=True)
        for p in c["pools"]:
            T = [q for q in c["pools"] if q != p]
            by = lambda q, rr=mine: [r for r in rr if r["pool"] == q]
            res = {b: H.refit([by(q) for q in T], by(p), b) for b in BASE}
            cm = swap(mine, cor.e10(T))
            res["thetaC"] = H.refit([by(q, cm) for q in T], by(p, cm), "theta")
            g = gate(mine, p, c["pools"], cor)
            gates.setdefault(st, []).append(g)
            picks.setdefault(st, []).append(cor.picks[frozenset(T)])
            for b in BASE:
                res[b + "H"] = nested_refit(mine, p, c["pools"], b, cor, H)
                res[b + "N"] = res[b + "H"] if g else res[b]
                ci = nested_refit(mine, p, c["pools"], b, idc, H)
                ctrl[b + "H"].append(abs(ci["cycles"] - res[b]["cycles"]) + (bool(ci["met"]) != bool(res[b]["met"])))
            g75 = gate75(mine, p, c["pools"], cor, H.quant)
            gates75.setdefault(st, []).append(g75)
            res["thetaQ"] = res["thetaH"] if g75 else res["theta"]
            for rule, f in res.items():
                folds[rule].append(dict(set=st, pool=p, cycles=float(f["cycles"]), met=bool(f["met"]),
                                        policy=H.lab_r(f["policy"]), q75=f["q75"], target=f["target"]))
    key = lambda f: (f["set"], f["pool"])
    replay = max(abs(a["cycles"] - float(b["cycles"])) + (a["met"] != bool(b["met"]))
                 for rule in BASE + ("thetaC",) for a, b in zip(sorted(folds[rule], key=key),
                                                                sorted(c["old"][rule], key=key)))
    return dict(folds=folds, gates=gates, gates75=gates75, picks=picks,
                control=dict(replay=replay, ident=max(max(v) for v in ctrl.values())))


def report():
    W, V, H = _w(), _v(), _h()
    U = V._u()
    S = U._s7p()
    DC = _w()._dc()
    LF = DC.LF
    err = lambda d, mh: LF.err_of((d["ls"], d["rs"]), DC.r_at(d["a"], d["s"], mh), d["lt"])
    conds = dict(four=committed(), **tuned())
    R = {tag: run_cond(c, err, V.fit_c, U.predict, H) for tag, c in conds.items()}
    agg = lambda fs: dict(met=sum(f["met"] for f in fs), n=len(fs), cycles=sum(f["cycles"] for f in fs) / len(fs))

    def pair(fa, fb):
        pr = S.paired(fa, fb)
        pos, neg, sp = S.sign_test([r["d"] for r in pr])
        return dict(mean=sum(r["d"] for r in pr) / len(pr), boot=S.set_boot(pr), cheaper=neg, dearer=pos, sign_p=sp)

    PAIRS = (("thetaN", "theta"), ("thetaN", "U"), ("thetaH", "theta"), ("thetaH", "thetaC"), ("thetaN", "thetaC"),
             ("theta", "U"))
    P = {tag: {f"{a}-{b}": pair(R[tag]["folds"][a], R[tag]["folds"][b]) for a, b in PAIRS} for tag in R}
    six = {r: R["four"]["folds"][r] + R["f30"]["folds"][r] for r in RULES + POST}
    P6 = {f"{a}-{b}": pair(six[a], six[b]) for a, b in PAIRS}
    tot = {tag: {r: agg(R[tag]["folds"][r]) for r in RULES} for tag in R}
    per = {tag: {st: {r: agg([f for f in R[tag]["folds"][r] if f["set"] == st]) for r in RULES}
                 for st in R[tag]["gates"]} for tag in R}
    Vd = judge(tot["four"]["thetaN"]["met"], P["four"]["thetaN-theta"]["mean"], P["f30"]["thetaN-U"]["mean"],
               tot["four"]["thetaH"]["met"], P6["thetaN-theta"]["boot"])
    L = ["cell-fidelity milestone 7x: a nested, out-of-fold gate for 7c's corrected ten-cycle forecast inside 7h's rule.",
         "Every corrected E10 a decision is scored on comes from a correction fitted without that row's pool.",
         "four = 7w's committed sets (lopo5 over 5zk 5zy 5zz 7g 7h); f30 / f10 = 7v's tuned plating cells (7p's pools).",
         "Cycles are DFN cycles per design; negative differences mean the first rule is cheaper. No new simulation.", ""]
    for tag in R:
        c = R[tag]["control"]
        L.append(f"control {tag}: replay of theta/U/thetaC vs the source's folds (cycles + met mismatches) = "
                 f"{c['replay']:.2e}; nested rules with m_hat = 1 vs theta/U = {c['ident']:.2e}")
    for tag in R:
        L += ["", f"---- {tag} ----", f"{'set':16s}" + "".join(f"{r:>13s}" for r in RULES) + "   gate (per fold)"]
        for st, pr in per[tag].items():
            L.append(f"{st:16s}" + "".join(f"{pr[r]['met']}/{pr[r]['n']} {pr[r]['cycles']:5.1f}".rjust(13) for r in RULES)
                     + "   " + "".join("y" if g else "n" for g in R[tag]["gates"][st])
                     + "  picks " + "/".join(R[tag]["picks"][st]))
        L.append(f"{'all':16s}" + "".join(f"{tot[tag][r]['met']}/{tot[tag][r]['n']} {tot[tag][r]['cycles']:5.1f}".rjust(13)
                                          for r in RULES))
        L.append(f"{'pair':16s}{'mean':>8s}{'set boot 95%':>20s}{'cheaper':>9s}{'dearer':>8s}{'sign p':>8s}")
        for k, v in P[tag].items():
            L.append(f"{k:16s}{v['mean']:+8.2f}{v['boot'][0]:+9.2f} to {v['boot'][1]:+.2f}{v['cheaper']:9d}"
                     f"{v['dearer']:8d}{v['sign_p']:8.3f}")
        L.append("thetaN policies: " + "; ".join(f"{f['set'][:7]} {f['pool']} {f['policy']} "
                                                f"{f['q75']:.3f}/{f['target']:.3f}{'' if f['met'] else ' MISS'}"
                                                for f in R[tag]["folds"]["thetaN"]))
    L += ["", "---- six set-conditions (four + f30, 30 folds) ----",
          "  " + "  ".join(f"{r} {agg(six[r])['met']}/30 {agg(six[r])['cycles']:.1f}" for r in RULES)]
    for k, v in P6.items():
        L.append(f"{k:16s}{v['mean']:+8.2f}{v['boot'][0]:+9.2f} to {v['boot'][1]:+.2f}{v['cheaper']:9d}"
                 f"{v['dearer']:8d}{v['sign_p']:8.3f}")
    L += ["", "POST HOC (not in the plan): gate on the training rows' out-of-fold q75 instead of the median (thetaQ)"]
    for tag in R:
        fq = R[tag]["folds"]["thetaQ"]
        pq, pt = pair(fq, R[tag]["folds"]["theta"]), pair(fq, R[tag]["folds"]["U"])
        L.append(f"  {tag}: thetaQ {agg(fq)['met']}/{len(fq)} {agg(fq)['cycles']:.1f}; gate75 "
                 + "; ".join(f"{st} " + "".join("y" if g else "n" for g in gs) for st, gs in R[tag]["gates75"].items())
                 + f"; thetaQ-theta {pq['mean']:+.2f} ({pq['cheaper']} cheaper, {pq['dearer']} dearer); "
                 f"thetaQ-U {pt['mean']:+.2f}")
    q6 = pair(six["thetaQ"], six["theta"])
    L.append(f"  six: thetaQ {agg(six['thetaQ'])['met']}/30 {agg(six['thetaQ'])['cycles']:.1f}; thetaQ-theta "
             f"{q6['mean']:+.2f} ({q6['boot'][0]:+.2f} to {q6['boot'][1]:+.2f}), {q6['cheaper']} cheaper, {q6['dearer']} dearer")
    L.append("")
    for h, t in (("H344", "thetaN meets >= 18 of 20 folds on the four sets"),
                 ("H345", "four sets, 20-fold mean of thetaN - theta <= 0"),
                 ("H346", "f = 30, 10-fold mean of thetaN - U <= -25"),
                 ("H347", "thetaH meets >= 18 of 20 folds on the four sets"),
                 ("H348", "six-set bootstrap 95% interval of thetaN - theta below zero")):
        L.append(f"{h} ({t}): {Vd[h]}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    out = dict(verdicts=Vd, total=tot, per=per, pair=P, six=dict(pair=P6, total={r: agg(six[r]) for r in RULES}),
               **{tag: dict(control=R[tag]["control"], gates=R[tag]["gates"], gates75=R[tag]["gates75"], picks=R[tag]["picks"],
                            folds=R[tag]["folds"]) for tag in R})
    (HERE / "summary.json").write_text(json.dumps(out, indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"report": report}[sys.argv[1]]()
