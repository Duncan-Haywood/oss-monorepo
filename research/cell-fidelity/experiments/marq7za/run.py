"""Milestone 7za: the corrected ten-cycle forecast and its gates (7v to 7y) on 7z's new plating cell, out of sample.

    python experiments/marq7za/run.py report     # H358 to H361 -> results.txt, summary.json (4 processes, ~1 min)

7z added `Marquis2019@2x` at f = 30 (OKane2022's plating copied in and scaled by 30) as a seventh set-condition. Its
drift multiplier runs above 1 (median m 1.293; every earlier tuned cell ran at or below 1) and the threshold rule
(theta) met its tail target on 2 of 5 held-out pools there. 7v's correction saved 30 DFN cycles per design on the two
earlier f = 30 cells; 7y read that saving as belonging to cells whose drift is large and one-directional. This cell
is a fresh test of both, with every rule, gate and threshold fixed by 7v to 7y before the cell existed:

    thetaC  7v: theta refit on rows whose E10 is corrected by 7c's correction fitted on the four training pools
    thetaH  7x: the same with honest, out-of-fold corrected errors and a nested margin
    thetaN  7x: thetaH where the training pools' out-of-fold corrected median E10 beats the straight, else theta
    thetaP  7y: thetaH where the training rows' median phi10 >= 0.9, else theta
    thetaD  7y: thetaH where the training rows' median |m - 1| >= 0.10, else theta

No new simulation: 7z's rows.json and bench.jsonl. Plan in ../../LOG.md (7za plan).
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SRC = "plating7z"
RULES = ("theta", "U", "thetaC", "thetaH", "thetaN", "thetaP", "thetaD")


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _y():
    return _mod("gate7y_run", EXP / "gate7y" / "run.py")


# ---------- pure helpers (tested) ----------

def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def judge(d_cu, met_h, d_pu, boot7):
    """H358 to H361. d_cu: thetaC - U (5-fold mean, new cell); met_h: thetaH's met folds of 5; d_pu: thetaP - U;
    boot7: seven-set (four committed + two f = 30 cells + this one) set-bootstrap interval of thetaP - theta."""
    return dict(
        H358=verdict(d_cu < 0, d_cu > 0),
        H359=verdict(met_h >= 4, met_h <= 2),
        H360=verdict(d_pu <= -25 + 1e-12, d_pu > -10),
        H361=verdict(boot7[1] < 0, boot7[0] > 0))


def oracle_pick(a, b):
    """7y's post hoc per-set oracle: thetaH (a) over theta (b) only if it has more met folds, or as many and fewer
    cycles."""
    return "thetaH" if (a["met"], -a["cycles"]) > (b["met"], -b["cycles"]) else "theta"


# ---------- data ----------

def rows_inputs():
    """7v's row preparation and 7u's per-design inputs on 7z's bench, keyed (set, j), with phi10 attached."""
    Y = _y()
    X = Y._x()
    V = X._v()
    U = V._u()
    rs = V._rows(SRC)
    want = {(o["cond"], o["j"]) for o in json.loads((EXP / SRC / "rows.json").read_text())}
    bench = [b for b in Y._load(EXP / SRC / "bench.jsonl") if (b["cond"], b["j"]) in want]
    from multiprocessing import Pool
    with Pool(4) as p:
        per = {(d["cond"], d["j"]): d for d in p.map(U._job, bench)}
    phi = {(b["cond"], b["j"]): Y.phi10(b["pl_mol"], b["lost_mol"]) for b in bench if b.get("ok")}
    inp = {}
    for r in rs:
        r["k"] = (r["set"], r["j"])
        d = per[(r["cond"], r["j"])]
        inp[r["k"]] = dict(d, m=r["m"], phi10=phi[(r["cond"], r["j"])], **{o: r[o] for o in V.OBS})
    return rs, inp


def run(rs, inp, err, fit_c, predict, H, X, Y, pools):
    folds = {r: [] for r in RULES}
    gates = {g: [] for g in ("N", "P", "D")}
    ctrl = []
    picks, med = [], dict(phi10=[], D=[], dir=[])
    st = rs[0]["set"]
    cor = X.Corrector(rs, inp, err, fit_c, predict)
    idc = X.Corrector(rs, inp, err, fit_c, predict, ident=True)
    for p in pools:
        T = [q for q in pools if q != p]
        by = lambda q, rr=rs: [r for r in rr if r["pool"] == q]
        tr = [r for r in rs if r["pool"] != p]
        res = {b: H.refit([by(q) for q in T], by(p), b) for b in ("theta", "U")}
        cm = X.swap(rs, cor.e10(T))
        res["thetaC"] = H.refit([by(q, cm) for q in T], by(p, cm), "theta")
        res["thetaH"] = X.nested_refit(rs, p, pools, "theta", cor, H)
        ci = X.nested_refit(rs, p, pools, "theta", idc, H)
        ctrl.append(abs(ci["cycles"] - res["theta"]["cycles"]) + (bool(ci["met"]) != bool(res["theta"]["met"])))
        picks.append(cor.picks[frozenset(T)])
        ph = [inp[r["k"]]["phi10"] for r in tr]
        dd = [abs(inp[r["k"]]["m"] - 1) for r in tr]
        import statistics
        med["phi10"].append(statistics.median(ph))
        med["D"].append(statistics.median(dd))
        med["dir"].append(abs(statistics.median(inp[r["k"]]["m"] for r in tr) - 1))
        g = dict(N=X.gate(rs, p, pools, cor), P=Y.gate_on(ph, Y.PHI_MIN), D=Y.gate_on(dd, Y.D_MIN))
        for name, on in g.items():
            gates[name].append(on)
            res["theta" + name] = res["thetaH"] if on else res["theta"]
        for rule, f in res.items():
            folds[rule].append(dict(set=st, pool=p, cycles=float(f["cycles"]), met=bool(f["met"]),
                                    policy=H.lab_r(f["policy"]), q75=f["q75"], target=f["target"]))
    return dict(folds=folds, gates=gates, picks=picks, med=med, ctrl_ident=max(ctrl))


def report():
    Y = _y()
    X = Y._x()
    W, V, H = X._w(), X._v(), X._h()
    U = V._u()
    S = U._s7p()
    DC = W._dc()
    LF = DC.LF
    err = lambda d, mh: LF.err_of((d["ls"], d["rs"]), DC.r_at(d["a"], d["s"], mh), d["lt"])
    rs, inp = rows_inputs()
    R = run(rs, inp, err, V.fit_c, U.predict, H, X, Y, S.POOLS)
    old = json.loads((EXP / SRC / "summary.json").read_text())["lopo5"]
    key = lambda f: (f["set"], f["pool"])
    replay = max(abs(a["cycles"] - float(b["cycles"])) + (a["met"] != bool(b["met"]))
                 for rule in ("theta", "U") for a, b in zip(sorted(R["folds"][rule], key=key),
                                                            sorted([f for f in old[rule] if f["set"] == rs[0]["set"]],
                                                                   key=key)))
    e10_ident = max(abs(err(inp[r["k"]], 1.0) - r["E"][10]) for r in rs)
    agg = lambda fs: dict(met=sum(f["met"] for f in fs), n=len(fs), cycles=sum(f["cycles"] for f in fs) / len(fs))

    def pair(fa, fb):
        pr = S.paired(fa, fb)
        pos, neg, sp = S.sign_test([r["d"] for r in pr])
        return dict(mean=sum(r["d"] for r in pr) / len(pr), boot=S.set_boot(pr), cheaper=neg, dearer=pos, sign_p=sp)

    PAIRS = (("thetaC", "U"), ("thetaH", "U"), ("thetaP", "U"), ("thetaP", "theta"), ("thetaD", "theta"),
             ("thetaN", "theta"), ("theta", "U"))
    P = {f"{a}-{b}": pair(R["folds"][a], R["folds"][b]) for a, b in PAIRS}
    tot = {r: agg(R["folds"][r]) for r in RULES}
    y7 = json.loads((EXP / "gate7y" / "summary.json").read_text())
    Y7 = ("theta", "U", "thetaH", "thetaN", "thetaP", "thetaD")
    seven = {r: y7["four"]["folds"][r] + y7["f30"]["folds"][r] + R["folds"][r] for r in Y7}
    P7 = {f"{a}-{b}": pair(seven[a], seven[b]) for a, b in (("thetaP", "theta"), ("thetaD", "theta"),
                                                            ("thetaN", "theta"), ("thetaH", "theta"), ("thetaP", "U"))}
    six = {r: y7["four"]["folds"][r] + y7["f30"]["folds"][r] for r in Y7}
    P6 = {f"{a}-{b}": pair(six[a], six[b]) for a, b in (("thetaP", "theta"),)}
    tuned = {r: y7["f30"]["folds"][r] + R["folds"][r] for r in Y7}
    PT = {f"{a}-{b}": pair(tuned[a], tuned[b]) for a, b in (("thetaP", "U"), ("thetaP", "theta"), ("thetaH", "theta"))}
    sens10 = {r: y7["four"]["folds"][r] + y7["f10"]["folds"][r] + R["folds"][r] for r in Y7}
    PS = pair(sens10["thetaP"], sens10["theta"])
    orc = oracle_pick(tot["thetaH"], tot["theta"])
    Vd = judge(P["thetaC-U"]["mean"], tot["thetaH"]["met"], P["thetaP-U"]["mean"], P7["thetaP-theta"]["boot"])
    yn = lambda gs: "".join("y" if g else "n" for g in gs)
    st = rs[0]["set"]
    L = ["cell-fidelity milestone 7za: 7v to 7y's corrected ten-cycle forecast and gates on 7z's new plating cell",
         "(Marquis2019@2x with OKane2022's plating at 30x), every rule and threshold fixed before the cell existed.",
         "7p's pools, lopo5 (five folds). Cycles are DFN cycles per design; negative = first rule cheaper. No new simulation.",
         "",
         f"control: max |E10(m_hat = 1) - rows.json E10| = {e10_ident:.2e}; replay of theta/U vs 7z's lopo5 (cycles + met "
         f"mismatches) = {replay:.2e}; nested thetaH with m_hat = 1 vs theta = {R['ctrl_ident']:.2e}",
         "",
         f"{st}: gates N {yn(R['gates']['N'])}  P {yn(R['gates']['P'])}  D {yn(R['gates']['D'])};  C picks "
         + "/".join(R["picks"]),
         "training medians per fold, phi10 / |m-1| / |median m - 1|: "
         + "  ".join(f"{a:.3f}/{b:.3f}/{c:.3f}" for a, b, c in zip(R["med"]["phi10"], R["med"]["D"], R["med"]["dir"])),
         "  " + "  ".join(f"{r} {tot[r]['met']}/5 {tot[r]['cycles']:.1f}" for r in RULES),
         f"{'pair':16s}{'mean':>8s}{'cheaper':>9s}{'dearer':>8s}{'sign p':>8s}"]
    for k, v in P.items():
        L.append(f"{k:16s}{v['mean']:+8.2f}{v['cheaper']:9d}{v['dearer']:8d}{v['sign_p']:8.3f}")
    for rule in ("thetaC", "thetaH"):
        L.append(f"{rule} policies: " + "; ".join(f"{f['pool']} {f['policy']} {f['q75']:.3f}/{f['target']:.3f}"
                                                  f"{'' if f['met'] else ' MISS'}" for f in R["folds"][rule]))
    L.append(f"post hoc per-set oracle (7y's): picks {orc} ({tot[orc]['met']}/5 {tot[orc]['cycles']:.1f})")
    L += ["", f"{'pooling':38s}{'mean':>8s}{'set boot 95%':>20s}{'cheaper':>9s}{'dearer':>8s}{'sign p':>8s}"]
    rows_out = [(f"seven (four + f30 x2 + new) {k}", v) for k, v in P7.items()]
    rows_out += [(f"six (7y, four + f30 x2) {k}", v) for k, v in P6.items()]
    rows_out += [(f"three f = 30 cells {k}", v) for k, v in PT.items()]
    rows_out += [("seven, f10 cells instead thetaP-theta", PS)]
    for name, v in rows_out:
        L.append(f"{name:38s}{v['mean']:+8.2f}{v['boot'][0]:+9.2f} to {v['boot'][1]:+.2f}{v['cheaper']:9d}"
                 f"{v['dearer']:8d}{v['sign_p']:8.3f}")
    L.append("  seven-set totals: " + "  ".join(f"{r} {agg(seven[r])['met']}/35 {agg(seven[r])['cycles']:.1f}"
                                                for r in Y7))
    L.append("")
    for h, t in (("H358", "new cell, 5-fold mean of thetaC - U < 0"),
                 ("H359", "thetaH meets >= 4 of 5 folds on the new cell"),
                 ("H360", "new cell, 5-fold mean of thetaP - U <= -25"),
                 ("H361", "seven-set bootstrap 95% interval of thetaP - theta below zero")):
        L.append(f"{h} ({t}): {Vd[h]}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    out = dict(verdicts=Vd, total=tot, pair=P, seven=dict(pair=P7, total={r: agg(seven[r]) for r in Y7}),
               six=P6, tuned=PT, sens_f10=PS, oracle=orc, gates=R["gates"], picks=R["picks"], med=R["med"],
               control=dict(e10_ident=e10_ident, replay=replay, nested_ident=R["ctrl_ident"]), folds=R["folds"])
    (HERE / "summary.json").write_text(json.dumps(out, indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"report": report}[sys.argv[1]]()
