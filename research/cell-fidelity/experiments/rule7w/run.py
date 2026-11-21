"""Milestone 7w: the corrected ten-cycle forecast inside 7h's threshold rule on the four committed parameter sets.

    python experiments/rule7w/run.py report     # H340 to H343 -> results.txt, summary.json (4 processes, ~1 min)

7v put 7c's corrected forecast in place of the straight line in E[10] on the two tuned f = 30 cells and found that
the corrected forecast alone meets the accuracy target there (thetaC stops every design at ten DFN cycles, -30 vs U).
Here the same swap runs on 7h's 200 rows (Ai2020, Chen2020, OKane2022, NCA_Kim2011; pools 5zk, 5zy, 5zz, 7g, 7h),
where the paper's 13 to 19% saving was measured and the correction is weaker. Per-design forecast inputs come from
each pool's bench.jsonl through 7c's `_job`, unchanged. Plan in ../../LOG.md (7w plan).
"""
import importlib.util
import json
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
CELL = "000"
BENCH = (("5zk", "depth"), ("5zy", "freshnode"), ("5zz", "rangeline"), ("7g", "fresh7g"), ("7h", "fresh7h"))
BASE = ("theta", "theta50", "R50", "U")
RULES = BASE + tuple(r + "C" for r in BASE)
GATED = ("thetaG", "UG")       # post hoc (not in the plan): the corrected E10 only where it beat the straight one
OBS = ("O1", "O2", "O3")
PAIRS = (("thetaC", "U"), ("thetaC", "theta"), ("thetaC", "UC"), ("R50C", "U"), ("R50C", "R50"), ("UC", "U"),
         ("theta", "U"))


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _v():
    return _mod("rule7v_run", EXP / "rule7v" / "run.py")


def _h():
    return _mod("fresh7h_run", EXP / "fresh7h" / "run.py")


def _dc():
    return _mod("drift7c_run", EXP / "drift7c" / "run.py")


# ---------- pure helpers (tested) ----------

def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def judge(d_u, met, n, boot6, d_uc):
    """H340 to H343 from the four-set means, thetaC's met count of n folds and the six-set interval. Pure; tested."""
    return dict(
        H340=verdict(d_u < 0, d_u > 0),
        H341=verdict(met >= 15, met <= 11),
        H342=verdict(boot6[1] < 0, boot6[0] > 0),
        H343=verdict(d_uc < 0, d_uc > 0))


def fold_e10(mine, p, inputs, err, fit_c, predict):
    """E10c for every row of one set when pool p is held out: 7c's correction fitted on the other pools only."""
    tr = [dict(inputs[r["key"]], m=inputs[r["key"]]["m"]) for r in mine if r["pool"] != p]
    best, beta = fit_c(tr)
    return best, {r["key"]: err(inputs[r["key"]], predict(beta, [inputs[r["key"]][best]])) for r in mine}


def gate(mine, p, e10):
    """Post hoc: use the corrected E10 for the set in this fold only if its median over the four training pools is
    below the straight-line median there (training pools only; the held-out pool is not looked at)."""
    tr = [r for r in mine if r["pool"] != p]
    md = lambda v: sorted(v)[len(v) // 2]
    return md([e10[r["key"]] for r in tr]) < md([r["E"][10] for r in tr])


def with_e10(rows, e10):
    out = []
    for r in rows:
        E = dict(r["E"])
        E[10] = e10[r["key"]]
        out.append(dict(r, E=E))
    return out


# ---------- data ----------

def _load(path):
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()]


def _job(a):
    pool, r = a
    c = _dc()._job((pool, r))
    k = c["cells"][CELL]
    return dict(key=(r["cond"], r["j"], pool), a=k["a"], s=k["s"], m=k["m"], ls=k["ls"], rs=k["rs"], lt=k["lt"],
                eL=k["eL"], O1=c["O1"], O2=c["O2"], O3=c["O3"])


def rows():
    """7h's 200 rows with (cond, j) kept, in 7h's load_all order (checked against it)."""
    H = _h()
    out = []
    for d in json.loads((EXP / "triage7d" / "rows.json").read_text()):
        out.append(dict(set=d["set"], pool=d["pool"], key=(d["cond"], d["j"], d["pool"]), mC=d["cells"][CELL]["mC"]))
    lf = {(r["cond"], r["j"], r["pool"]): r["cells"][CELL]["eL"]
          for r in json.loads((EXP / "lawfloor" / "rows.json").read_text())}
    for r in out:
        r["E"] = {k: lf[r["key"]][str(k)] for k in H.KS}
    for d, pool in (("fresh7g", "7g"), ("fresh7h", "7h")):
        for o in json.loads((EXP / d / "rows.json").read_text()):
            out.append(dict(set=o["set"], pool=pool, key=(o["cond"], o["j"], pool), mC=o["cells"][CELL]["mC"],
                            E={k: o["cells"][CELL]["eL"][str(k)] for k in H.KS}))
    ref = H.load_all()
    assert len(ref) == len(out) == 200
    for a, b in zip(out, ref):
        assert a["set"] == b["set"] and a["pool"] == b["pool"] and a["mC"] == b["mC"] and a["E"] == b["E"]
    return out


def inputs(rs):
    want = {r["key"] for r in rs}
    jobs = []
    for pool, d in BENCH:
        for b in _load(EXP / d / "bench.jsonl"):
            if (b["cond"], b["j"], pool) in want and b.get("ok"):
                jobs.append((pool, b))
    with Pool(4) as p:
        got = {d["key"]: d for d in p.map(_job, jobs)}
    assert set(got) == want, sorted(want - set(got))[:5]
    return got


def report():
    H, V = _h(), _v()
    S = V._u()._s7p()
    U = V._u()
    DC = _dc()
    LF = DC.LF
    err = lambda d, mh: LF.err_of((d["ls"], d["rs"]), DC.r_at(d["a"], d["s"], mh), d["lt"])
    rs = rows()
    inp = inputs(rs)
    ctrl = dict(e10=max(abs(err(inp[r["key"]], 1.0) - r["E"][10]) for r in rs))
    sens = {r["key"]: err(inp[r["key"]], r["mC"]) for r in rs}
    folds = {rule: [] for rule in RULES}
    sfolds = {rule: [] for rule in RULES[4:]}
    gfolds, gates = {rule: [] for rule in GATED}, {}
    picks, med = {}, {}
    for st in H.SETS:
        mine = [r for r in rs if r["set"] == st]
        for p in H.ALL_POOLS:
            best, e10 = fold_e10(mine, p, inp, err, V.fit_c, U.predict)
            picks.setdefault(st, []).append(best)
            held = [r for r in mine if r["pool"] == p]
            med.setdefault(st, []).append((sorted(r["E"][10] for r in held)[len(held) // 2],
                                           sorted(e10[r["key"]] for r in held)[len(held) // 2]))
            g = gate(mine, p, e10)
            gates.setdefault(st, []).append(g)
            grows = with_e10(mine, e10) if g else mine
            gby = lambda q: [r for r in grows if r["pool"] == q]
            for b, rule in (("theta", "thetaG"), ("U", "UG")):
                f = H.refit([gby(q) for q in H.ALL_POOLS if q != p], gby(p), b)
                gfolds[rule].append(dict(set=st, pool=p, cycles=float(f["cycles"]), met=bool(f["met"]),
                                         policy=H.lab_r(f["policy"]), q75=f["q75"], target=f["target"]))
            for rows_, tgt, names in ((mine, folds, BASE), (with_e10(mine, e10), folds, RULES[4:]),
                                      (with_e10(mine, sens), sfolds, RULES[4:])):
                by = lambda q: [r for r in rows_ if r["pool"] == q]
                for b, rule in zip(BASE, names):
                    f = H.refit([by(q) for q in H.ALL_POOLS if q != p], by(p), b)
                    tgt[rule].append(dict(set=st, pool=p, cycles=float(f["cycles"]), met=bool(f["met"]),
                                          policy=H.lab_r(f["policy"]), q75=f["q75"], target=f["target"]))
    old = json.loads((EXP / "fresh7h" / "summary.json").read_text())["lopo5"]
    ctrl["replay"] = max(abs(a["cycles"] - float(b["cycles"])) + (a["met"] != bool(b["met"]))
                         for rule in BASE for a, b in zip(sorted(folds[rule], key=lambda f: (f["set"], f["pool"])),
                                                          sorted(old[rule], key=lambda f: (f["set"], f["pool"]))))
    pair = {}
    for a, b in PAIRS:
        pr = S.paired(folds[a], folds[b])
        pos, neg, sp = S.sign_test([r["d"] for r in pr])
        pair[(a, b)] = dict(mean=sum(r["d"] for r in pr) / len(pr), boot=S.set_boot(pr), cheaper=neg, dearer=pos,
                            sign_p=sp, per_set={s: sum(r["d"] for r in pr if r["set"] == s) / 5 for s in H.SETS})
    v7 = json.loads((EXP / "rule7v" / "summary.json").read_text())["f30"]["folds"]
    six = S.paired(folds["thetaC"], folds["U"]) + [dict(r, set=r["set"] + "@f30") for r in
                                                   S.paired(v7["thetaC"], v7["U"])]
    pos6, neg6, sp6 = S.sign_test([r["d"] for r in six])
    six_s = dict(mean=sum(r["d"] for r in six) / len(six), boot=S.set_boot(six), cheaper=neg6, dearer=pos6, sign_p=sp6,
                 n=len(six))
    spair = S.paired(sfolds["thetaC"], folds["U"])
    agg = lambda fs: dict(met=sum(f["met"] for f in fs), n=len(fs), cycles=sum(f["cycles"] for f in fs) / len(fs))
    per = {st: {rule: agg([f for f in folds[rule] if f["set"] == st]) for rule in RULES} for st in H.SETS}
    tot = {rule: agg(folds[rule]) for rule in RULES}
    stot = {rule: agg(sfolds[rule]) for rule in sfolds}
    Vd = judge(pair[("thetaC", "U")]["mean"], tot["thetaC"]["met"], tot["thetaC"]["n"], six_s["boot"],
               pair[("thetaC", "UC")]["mean"])
    L = ["cell-fidelity milestone 7w: 7c's corrected ten-cycle forecast in place of the straight line inside 7h's",
         "rules on the four committed sets (7h's 200 rows, 50 per set, cell 000; lopo5 over pools 5zk, 5zy, 5zz, 7g, 7h).",
         "Correction fitted per fold on the four training pools; only E[10] changes. No new simulation.",
         "Cycles are DFN cycles per design; negative differences mean the first rule is cheaper.", "",
         f"control: max |E10(m_hat = 1) - rows E10| = {ctrl['e10']:.2e}; replay of theta/theta50/R50/U vs 7h's lopo5 "
         f"(cycles + met mismatches) = {ctrl['replay']:.2e}", "",
         "held-out median E10 straight -> corrected, per fold (5zk 5zy 5zz 7g 7h), and the correction's pick:"]
    for st in H.SETS:
        L.append(f"  {st:12s}" + "  ".join(f"{a:.3f}->{b:.3f}" for a, b in med[st]) + "   " + "/".join(picks[st]))
    L += ["", f"{'set':12s}" + "".join(f"{r:>15s}" for r in RULES)]
    for st, pr in per.items():
        L.append(f"{st:12s}" + "".join(f"{pr[r]['met']}/5 {pr[r]['cycles']:5.1f}".rjust(15) for r in RULES))
    L.append(f"{'all 20':12s}" + "".join(f"{tot[r]['met']}/20 {tot[r]['cycles']:5.1f}".rjust(15) for r in RULES))
    L += ["", f"{'pair':18s}{'mean':>8s}{'set boot 95%':>20s}{'cheaper':>9s}{'dearer':>8s}{'sign p':>8s}   per set"]
    for (a, b), v in pair.items():
        L.append(f"{a + ' - ' + b:18s}{v['mean']:+8.2f}{v['boot'][0]:+9.2f} to {v['boot'][1]:+.2f}"
                 f"{v['cheaper']:9d}{v['dearer']:8d}{v['sign_p']:8.3f}   "
                 + ", ".join(f"{s} {d:+.2f}" for s, d in v["per_set"].items()))
    L.append(f"{'six sets thetaC-U':18s}{six_s['mean']:+8.2f}{six_s['boot'][0]:+9.2f} to {six_s['boot'][1]:+.2f}"
             f"{neg6:9d}{pos6:8d}{sp6:8.3f}   (the 20 folds here + 7v's 10 f = 30 folds)")
    L.append(f"sensitivity (E10c from 7h's own mC): thetaC - U mean {sum(r['d'] for r in spair) / len(spair):+.2f}; "
             + "  ".join(f"{r} {v['met']}/20 {v['cycles']:.1f}" for r, v in stot.items()))
    L += ["", "thetaC and UC policies per fold (set, held-out pool, policy, q75 / target, met):"]
    for f, g in zip(folds["thetaC"], folds["UC"]):
        L.append(f"  {f['set']:12s}{f['pool']:>4s}  thetaC {str(f['policy']):>14s} {f['q75']:.3f}/{f['target']:.3f} "
                 f"{'y' if f['met'] else 'n'}   UC {str(g['policy']):>8s} {g['q75']:.3f} {'y' if g['met'] else 'n'}")
    gt = {rule: agg(gfolds[rule]) for rule in GATED}
    gp = {}
    for a, b in (("thetaG", "theta"), ("thetaG", "U")):
        pr = S.paired(gfolds[a], folds[b] if b in folds else gfolds[b])
        pos, neg, sp = S.sign_test([r["d"] for r in pr])
        gp[f"{a}-{b}"] = dict(mean=sum(r["d"] for r in pr) / len(pr), cheaper=neg, dearer=pos, sign_p=sp)
    L += ["", "POST HOC (not in the plan): gate the correction per set and fold on the training pools' medians",
          "  correction used (5zk 5zy 5zz 7g 7h): " + "; ".join(
              f"{st} " + "".join("y" if g else "n" for g in gates[st]) for st in H.SETS),
          "  " + "  ".join(f"{r} {v['met']}/20 {v['cycles']:.1f}" for r, v in gt.items()),
          "  " + "  ".join(f"{k} {v['mean']:+.2f} ({v['cheaper']} cheaper, {v['dearer']} dearer, sign p {v['sign_p']:.3f})"
                           for k, v in gp.items())]
    L.append("")
    for h, t in (("H340", "four sets, 20-fold mean of thetaC - U < 0"),
                 ("H341", "thetaC meets the target on >= 15 of 20 folds"),
                 ("H342", "six-set bootstrap 95% interval of thetaC - U below zero"),
                 ("H343", "four sets, 20-fold mean of thetaC - UC < 0")):
        L.append(f"{h} ({t}): {Vd[h]}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    out = dict(verdicts=Vd, control=ctrl, picks=picks, medians=med, per=per, total=tot, sens=dict(total=stot),
               six=six_s, posthoc=dict(gates=gates, total=gt, pair=gp, folds=gfolds), pair={f"{a}-{b}": v for (a, b), v in pair.items()}, folds=folds)
    (HERE / "summary.json").write_text(json.dumps(out, indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"report": report}[sys.argv[1]]()
