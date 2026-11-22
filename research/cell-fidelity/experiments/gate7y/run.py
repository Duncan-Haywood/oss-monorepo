"""Milestone 7y: a mechanism gate and a drift-size gate for 7c's corrected ten-cycle forecast inside 7h's rule.

    python experiments/gate7y/run.py report     # H349 to H353 -> results.txt, summary.json (4 processes, ~2 min)

7x found that a gate on the training pools' out-of-fold corrected errors cannot tell the committed sets, where the
correction fails on one held-out pool, from the tuned plating cells, where it saves 30 DFN cycles per design. Its
Next (a) asked for a mechanism gate fixed in advance: correct only where plating dominates the early lithium loss.
Two gates, both read from the four training pools only:

    gP  on if median phi10 >= 0.9,  phi10 = (P10 - P2) / (L10 - L2)  (cumulative plated / lost lithium, bench)
    gD  on if median |m - 1| >= 0.10, m = a training design's drift multiplier from its own 100-cycle run

thetaP / thetaD = 7x's thetaH (honest, out-of-fold corrected errors) where the gate is on, 7h's theta where it is off.
No new simulation. Plan in ../../LOG.md (7y plan).
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
PHI_MIN = 0.9
D_MIN = 0.10
D_SENS = (0.05, 0.15)
RULES = ("theta", "U", "thetaH", "thetaN", "thetaP", "thetaD")
SENS = tuple(f"thetaD{t:.2f}" for t in D_SENS)
TUNED_SRC = {"f10": "plating7r", "f30": "plating7s"}


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _x():
    return _mod("gate7x_run", EXP / "gate7x" / "run.py")


# ---------- pure helpers (tested) ----------

def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def phi10(P, L):
    """Plating share of the lithium lost over cycles 2 to 10 (cumulative series, index n-1 = end of cycle n)."""
    d = L[9] - L[1]
    return (P[9] - P[1]) / d if d > 0 else float("nan")


def gate_on(values, thr):
    """A gate is on when the median of the training rows' signal is at least thr (NaN rows dropped)."""
    v = [x for x in values if x == x]
    return bool(v) and statistics.median(v) >= thr


def judge(all_on_p, met_d, d_theta, d_u30, boot6):
    """H349 to H353. all_on_p: committed sets with gP on in every fold; met_d: thetaD's met folds of 20;
    d_theta: thetaD - theta (four sets); d_u30: thetaD - U at f = 30; boot6: six-set interval of thetaD - theta."""
    return dict(
        H349=verdict(all_on_p >= 3, all_on_p <= 1),
        H350=verdict(met_d >= 18, met_d <= 16),
        H351=verdict(d_theta <= 1e-12, d_theta >= 1.38 - 1e-12),
        H352=verdict(d_u30 <= -25 + 1e-12, d_u30 > -10),
        H353=verdict(boot6[1] < 0, boot6[0] > 0))


# ---------- data ----------

def _load(path):
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()]


def attach_phi(conds):
    """phi10 on every row's input, from the bench that produced it (7w's BENCH dirs; 7r / 7s for the tuned cells)."""
    W = _x()._w()
    pl = {}
    for pool, d in W.BENCH:
        for b in _load(EXP / d / "bench.jsonl"):
            if b.get("ok"):
                pl[("four", b["cond"], b["j"], pool)] = phi10(b["pl_mol"], b["lost_mol"])
    for tag, src in TUNED_SRC.items():
        for b in _load(EXP / src / "bench.jsonl"):
            if b.get("ok"):
                pl[(tag, b["cond"], b["j"])] = phi10(b["pl_mol"], b["lost_mol"])
    for tag, c in conds.items():
        for r in c["rows"]:
            k = ("four",) + tuple(r["key"]) if tag == "four" else (tag, r["cond"], r["j"])
            c["inp"][r["k"]]["phi10"] = pl[k]


def run_cond(c, err, fit_c, predict, H, X):
    rs = c["rows"]
    folds = {r: [] for r in RULES + SENS}
    gates = {g: {} for g in ("N", "P", "D") + SENS}
    med = {}
    for st in dict.fromkeys(r["set"] for r in rs):
        mine = [r for r in rs if r["set"] == st]
        cor = X.Corrector(mine, c["inp"], err, fit_c, predict)
        phis, ds = [], []
        for p in c["pools"]:
            T = [q for q in c["pools"] if q != p]
            by = lambda q, rr=mine: [r for r in rr if r["pool"] == q]
            tr = [r for r in mine if r["pool"] != p]
            res = {b: H.refit([by(q) for q in T], by(p), b) for b in ("theta", "U")}
            res["thetaH"] = X.nested_refit(mine, p, c["pools"], "theta", cor, H)
            ph = [c["inp"][r["k"]]["phi10"] for r in tr]
            dd = [abs(c["inp"][r["k"]]["m"] - 1) for r in tr]
            phis.append(statistics.median(ph))
            ds.append(statistics.median(dd))
            g = dict(N=X.gate(mine, p, c["pools"], cor), P=gate_on(ph, PHI_MIN), D=gate_on(dd, D_MIN))
            for t, name in zip(D_SENS, SENS):
                g[name] = gate_on(dd, t)
            for name, on in g.items():
                gates[name].setdefault(st, []).append(on)
                res[name if name in SENS else "theta" + name] = res["thetaH"] if on else res["theta"]
            for rule, f in res.items():
                folds[rule].append(dict(set=st, pool=p, cycles=float(f["cycles"]), met=bool(f["met"]),
                                        policy=H.lab_r(f["policy"]), q75=f["q75"], target=f["target"]))
        allp = [c["inp"][r["k"]]["phi10"] for r in mine]
        dirs = [abs(statistics.median(c["inp"][r["k"]]["m"] for r in mine if r["pool"] != p) - 1) for p in c["pools"]]
        med[st] = dict(phi10_train=phis, D_train=ds, dir_train=dirs, phi10_all=statistics.median(x for x in allp if x == x),
                       phi10_min=min(allp), D_all=statistics.median(abs(c["inp"][r["k"]]["m"] - 1) for r in mine))
    key = lambda f: (f["set"], f["pool"])
    replay = max(abs(a["cycles"] - float(b["cycles"])) + (a["met"] != bool(b["met"]))
                 for rule in ("theta", "U", "thetaH", "thetaN")
                 for a, b in zip(sorted(folds[rule], key=key), sorted(c["old7x"][rule], key=key)))
    return dict(folds=folds, gates=gates, med=med, control=dict(replay7x=replay))


def report():
    X = _x()
    W, V, H = X._w(), X._v(), X._h()
    U = V._u()
    S = U._s7p()
    DC = W._dc()
    LF = DC.LF
    err = lambda d, mh: LF.err_of((d["ls"], d["rs"]), DC.r_at(d["a"], d["s"], mh), d["lt"])
    conds = dict(four=X.committed(), **X.tuned())
    attach_phi(conds)
    old = json.loads((EXP / "gate7x" / "summary.json").read_text())
    for tag, c in conds.items():
        c["old7x"] = old[tag]["folds"]
    R = {tag: run_cond(c, err, V.fit_c, U.predict, H, X) for tag, c in conds.items()}
    agg = lambda fs: dict(met=sum(f["met"] for f in fs), n=len(fs), cycles=sum(f["cycles"] for f in fs) / len(fs))

    def pair(fa, fb):
        pr = S.paired(fa, fb)
        pos, neg, sp = S.sign_test([r["d"] for r in pr])
        return dict(mean=sum(r["d"] for r in pr) / len(pr), boot=S.set_boot(pr), cheaper=neg, dearer=pos, sign_p=sp)

    PAIRS = (("thetaD", "theta"), ("thetaD", "U"), ("thetaD", "thetaN"), ("thetaP", "theta"), ("thetaP", "U"),
             ("theta", "U"))
    ALL = RULES + SENS
    P = {tag: {f"{a}-{b}": pair(R[tag]["folds"][a], R[tag]["folds"][b]) for a, b in PAIRS} for tag in R}
    six = {r: R["four"]["folds"][r] + R["f30"]["folds"][r] for r in ALL}
    P6 = {f"{a}-{b}": pair(six[a], six[b]) for a, b in PAIRS}
    tot = {tag: {r: agg(R[tag]["folds"][r]) for r in ALL} for tag in R}
    per = {tag: {st: {r: agg([f for f in R[tag]["folds"][r] if f["set"] == st]) for r in ALL}
                 for st in R[tag]["med"]} for tag in R}
    all_on_p = sum(all(v) for v in R["four"]["gates"]["P"].values())
    Vd = judge(all_on_p, tot["four"]["thetaD"]["met"], P["four"]["thetaD-theta"]["mean"],
               P["f30"]["thetaD-U"]["mean"], P6["thetaD-theta"]["boot"])
    yn = lambda gs: "".join("y" if g else "n" for g in gs)
    L = ["cell-fidelity milestone 7y: a plating-share gate (gP) and a drift-size gate (gD) for 7c's corrected forecast.",
         f"gP: median phi10 of the training rows >= {PHI_MIN}; gD: median |m - 1| of the training rows >= {D_MIN}.",
         "thetaX = 7x's thetaH (out-of-fold corrected E10, nested margin) where gate X is on, 7h's theta where off.",
         "four = committed sets (lopo5 over 5zk 5zy 5zz 7g 7h); f30 / f10 = tuned plating cells (7p's pools).",
         "Cycles are DFN cycles per design; negative differences mean the first rule is cheaper. No new simulation.", ""]
    for tag in R:
        L.append(f"control {tag}: theta/U/thetaH/thetaN vs 7x's folds (cycles + met mismatches) = "
                 f"{R[tag]['control']['replay7x']:.2e}")
    for tag in R:
        L += ["", f"---- {tag} ----",
              f"{'set':13s}{'phi10 all':>10s}{'min':>7s}{'|m-1| all':>10s}  gates N P D (per fold)  "
              f"phi10 / |m-1| training medians per fold"]
        for st, md in R[tag]["med"].items():
            gs = R[tag]["gates"]
            L.append(f"{st:13s}{md['phi10_all']:10.3f}{md['phi10_min']:7.3f}{md['D_all']:10.3f}  "
                     f"{yn(gs['N'][st])} {yn(gs['P'][st])} {yn(gs['D'][st])}  "
                     + " ".join(f"{a:.3f}/{b:.3f}" for a, b in zip(md["phi10_train"], md["D_train"])))
        L.append(f"{'set':13s}" + "".join(f"{r:>13s}" for r in RULES))
        for st, pr in per[tag].items():
            L.append(f"{st:13s}" + "".join(f"{pr[r]['met']}/{pr[r]['n']} {pr[r]['cycles']:5.1f}".rjust(13) for r in RULES))
        L.append(f"{'all':13s}" + "".join(f"{tot[tag][r]['met']}/{tot[tag][r]['n']} {tot[tag][r]['cycles']:5.1f}".rjust(13)
                                         for r in RULES))
        L.append(f"{'pair':16s}{'mean':>8s}{'set boot 95%':>20s}{'cheaper':>9s}{'dearer':>8s}{'sign p':>8s}")
        for k, v in P[tag].items():
            L.append(f"{k:16s}{v['mean']:+8.2f}{v['boot'][0]:+9.2f} to {v['boot'][1]:+.2f}{v['cheaper']:9d}"
                     f"{v['dearer']:8d}{v['sign_p']:8.3f}")
        L.append("sensitivity of gD's threshold: " + "; ".join(
            f"{s} {tot[tag][s]['met']}/{tot[tag][s]['n']} {tot[tag][s]['cycles']:.1f} gates "
            + ",".join(f"{st[:6]} {yn(g)}" for st, g in R[tag]["gates"][s].items()) for s in SENS))
        L.append("thetaD policies: " + "; ".join(f"{f['set'][:7]} {f['pool']} {f['policy']} "
                                                f"{f['q75']:.3f}/{f['target']:.3f}{'' if f['met'] else ' MISS'}"
                                                for f in R[tag]["folds"]["thetaD"]))
    L += ["", "---- six set-conditions (four + f30, 30 folds) ----",
          "  " + "  ".join(f"{r} {agg(six[r])['met']}/30 {agg(six[r])['cycles']:.1f}" for r in ALL)]
    for k, v in P6.items():
        L.append(f"{k:16s}{v['mean']:+8.2f}{v['boot'][0]:+9.2f} to {v['boot'][1]:+.2f}{v['cheaper']:9d}"
                 f"{v['dearer']:8d}{v['sign_p']:8.3f}")
    L += ["", "POST HOC (not in the plan): directional drift |median(m) - 1| of the training rows per fold, and a per-set",
          "oracle that picks thetaH or theta for the whole set by its held-out outcome (fewer misses, then fewer cycles)."]
    orc = {}
    for tag in R:
        for st, md in R[tag]["med"].items():
            a, b = per[tag][st]["thetaH"], per[tag][st]["theta"]
            pick = "thetaH" if (a["met"], -a["cycles"]) > (b["met"], -b["cycles"]) else "theta"
            orc.setdefault(tag, {})[st] = pick
            L.append(f"  {tag:5s}{st:13s}dir " + " ".join(f"{x:.3f}" for x in md["dir_train"])
                     + f"   oracle picks {pick} ({per[tag][st][pick]['met']}/{per[tag][st][pick]['n']} "
                     f"{per[tag][st][pick]['cycles']:.1f})")
    for tag in R:
        fs = [f for st, pk in orc[tag].items() for f in R[tag]["folds"][pk] if f["set"] == st]
        L.append(f"  oracle {tag}: {agg(fs)['met']}/{agg(fs)['n']} {agg(fs)['cycles']:.1f} cycles per design")
    L.append("")
    for h, t in (("H349", "gP on in every fold of >= 3 of the 4 committed sets"),
                 ("H350", "thetaD meets >= 18 of 20 folds on the four sets"),
                 ("H351", "four sets, 20-fold mean of thetaD - theta <= 0"),
                 ("H352", "f = 30, 10-fold mean of thetaD - U <= -25"),
                 ("H353", "six-set bootstrap 95% interval of thetaD - theta below zero")):
        L.append(f"{h} ({t}): {Vd[h]}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    out = dict(verdicts=Vd, total=tot, per=per, pair=P, six=dict(pair=P6, total={r: agg(six[r]) for r in ALL}),
               oracle=orc, **{tag: dict(control=R[tag]["control"], gates=R[tag]["gates"], med=R[tag]["med"],
                            folds=R[tag]["folds"]) for tag in R})
    (HERE / "summary.json").write_text(json.dumps(out, indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"report": report}[sys.argv[1]]()
