"""Milestone 7c (the per-design drift): 7b found that on LG M50, with every input measured (cell 111), the law's
R(L) grows at a constant rate per cycle at the set median, but each design's rate drifts a few per cent either way
over 99 cycles, and that drift is the ten-cycle floor. Does a ten-cycle observable predict each design's drift, and
does a correction built on it close the floor? All 104 x-resolved designs (5zk 40, 5zy 32, 5zz 32). No new simulation.

    python experiments/drift7c/run.py rows      # per design: m (drift multiplier), O1..O3, the forecasts' inputs
    python experiments/drift7c/run.py report    # H265 to H268 -> results.txt, summary.json
    python experiments/drift7c/run.py posthoc   # after the report: where the correction pays (tails, pools) -> posthoc.txt

    ten-cycle line R(n) = a + s n through R(L_n), n = 2..10 (7b's L); m defined by R(99) = a + 10 s + 89 s m
    O1 plating-weighted depth of cycle 2's node plating (1 = separator); O2 its change from cycle 2 to 10;
    O3 ln((L10 - L6) / (L6 - L2)), the bend of lithium loss itself over the first ten cycles
    C  m_hat from a least-squares line of m on the observable with the largest |rho| on the other designs of the set
    M  m_hat = median m of the other designs of the set (a constant drift; the control)
Plan in ../../LOG.md (7c plan).
"""
import importlib.util
import json
import math
import random
import sys
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


LF = _mod("lawfloor_run", EXP / "lawfloor" / "run.py")
B, KP, SK, WL, DP = LF.B, LF.KP, LF.SK, LF.WL, LF.DP
K, TO, KAPPA, SETS, POOLS = LF.K, LF.TO, LF.KAPPA, LF.SETS, LF.POOLS
CELLS2, LM50, INF = LF.CELLS2, LF.LM50, LF.INF
med, err_of, lstsq, verdict = LF.med, LF.err_of, LF.lstsq, LF.verdict
OBS = ("O1", "O2", "O3")
NPERM, SEED = 10000, 73


# ---------- pure helpers (stdlib; tested) ----------

def ranks(xs):
    """Average ranks (ties share the mean rank), 1-based."""
    o = sorted(range(len(xs)), key=lambda i: xs[i])
    r = [0.0] * len(xs)
    i = 0
    while i < len(o):
        j = i
        while j + 1 < len(o) and xs[o[j + 1]] == xs[o[i]]:
            j += 1
        for k in range(i, j + 1):
            r[o[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def pearson(x, y):
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    return sxy / math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else 0.0


def spearman(x, y):
    return pearson(ranks(x), ranks(y))


def perm_p(x, y, n=NPERM, seed=SEED):
    """Two-sided permutation p for Spearman's rho, (count + 1) / (n + 1)."""
    rx, ry = ranks(x), ranks(y)
    r0 = abs(pearson(rx, ry))
    rng = random.Random(seed)
    ys = list(ry)
    hit = 0
    for _ in range(n):
        rng.shuffle(ys)
        hit += abs(pearson(rx, ys)) >= r0 - 1e-12
    return (hit + 1) / (n + 1)


def holm(ps):
    """Holm-adjusted p values, same order as given."""
    o = sorted(range(len(ps)), key=lambda i: ps[i])
    adj = [0.0] * len(ps)
    run = 0.0
    for k, i in enumerate(o):
        run = max(run, min(1.0, (len(ps) - k) * ps[i]))
        adj[i] = run
    return adj


def line10(R):
    """(a, s) of the line through R(L_n), n = 2..10 (R[0] is n = 2)."""
    return lstsq([[1.0, n] for n in range(2, K + 1)], R[:K - 1])


def m_of(R):
    a, s = line10(R)
    return (R[TO - 3] - (a + K * s)) / ((TO - 1 - K) * s)


def r_at(a, s, m):
    return a + K * s + (TO - 1 - K) * s * m


def o3(lost):
    return math.log((lost[9] - lost[5]) / (lost[5] - lost[1]))


def loo_fit(ms, obs, i):
    """Fold i left out: the observable with the largest |rho| with m on the others, its line, and m_hat for i."""
    idx = [j for j in range(len(ms)) if j != i]
    y = [ms[j] for j in idx]
    best = max(OBS, key=lambda o: abs(spearman([obs[j][o] for j in idx], y)))
    x = [obs[j][best] for j in idx]
    c0, c1 = lstsq([[1.0, v] for v in x], y)
    return best, c0 + c1 * obs[i][best]


# ---------- per design ----------

def _job(a):
    pool, r = a
    bals = {s: WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    tb = LF.tables(r, *bals[WL.SRC.get(r["cond"], "crossset")])
    lost, lt = tb["lost"], tb["lt"]
    xs, Ln = r["x_n"], r["L_n"]
    c2 = DP.centroid(DP.weights(r["pl_node"][1]), xs, Ln)
    c10 = DP.centroid(DP.weights(r["pl_node"][K - 1]), xs, Ln)
    out = dict(cond=r["cond"], set=SK.pset(r["cond"]), j=r["j"], pool=pool, O1=c2, O2=c10 - c2, O3=o3(lost), cells={})
    for cell in CELLS2:
        ls, rs = KP.r_of(tb["T"][cell], KAPPA)
        R = [B.interp(ls, rs, lost[n - 1]) for n in range(2, TO)]
        a_, s_ = line10(R)
        m = m_of(R)
        out["cells"][cell] = dict(a=a_, s=s_, m=m, eL=err_of((ls, rs), r_at(a_, s_, 1.0), lt),
                                  e_m=err_of((ls, rs), r_at(a_, s_, m), lt), ls=ls, rs=rs, lt=lt)
    return out


def rows():
    jobs = []
    for pool, d in POOLS:
        for r in B._load(EXP / d / "bench.jsonl"):
            if r.get("ok") and r.get("ok_cycles", 0) >= 100:
                jobs.append((pool, r))
    with Pool(4) as p:
        out = p.map(_job, jobs)
    for st in SETS:
        idx = [i for i, o in enumerate(out) if o["set"] == st]
        obs = [out[i] for i in idx]
        for cell in CELLS2:
            ms = [out[i]["cells"][cell]["m"] for i in idx]
            for k, i in enumerate(idx):
                c = out[i]["cells"][cell]
                best, mC = loo_fit(ms, obs, k)
                mM = med(v for j, v in enumerate(ms) if j != k)
                c.update(pick=best, mC=mC, mM=mM, e_C=err_of((c["ls"], c["rs"]), r_at(c["a"], c["s"], mC), c["lt"]),
                         e_M=err_of((c["ls"], c["rs"]), r_at(c["a"], c["s"], mM), c["lt"]))
    for o in out:
        for c in o["cells"].values():
            for key in ("ls", "rs", "lt"):
                c.pop(key)
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs")


# ---------- report ----------

def summarise(t):
    S = dict(n=len(t), rho={}, p={}, p_holm={}, e={}, m={}, picks={}, wins={})
    m111 = [r["cells"]["111"]["m"] for r in t]
    ps = []
    for o in OBS:
        x = [r[o] for r in t]
        S["rho"][o] = spearman(x, m111)
        S["p"][o] = perm_p(x, m111)
        ps.append(S["p"][o])
    S["p_holm"] = dict(zip(OBS, holm(ps)))
    for cell in CELLS2:
        cs = [r["cells"][cell] for r in t]
        S["e"][cell] = {v: med(c[k] for c in cs) for v, k in (("L", "eL"), ("M", "e_M"), ("C", "e_C"), ("own m", "e_m"))}
        ms = sorted(c["m"] for c in cs)
        S["m"][cell] = dict(med=med(ms), q25=ms[int(0.25 * len(ms))], q75=ms[min(len(ms) - 1, int(0.75 * len(ms)))])
        S["picks"][cell] = {o: sum(c["pick"] == o for c in cs) for o in OBS}
        S["wins"][cell] = dict(C_L=sum(c["e_C"] < c["eL"] for c in cs), C_M=sum(c["e_C"] < c["e_M"] for c in cs))
    return S


def _by_set(rs):
    return {st: summarise([r for r in rs if r["set"] == st]) for st in SETS if any(r["set"] == st for r in rs)}


def verdicts(S):
    lm = [s for s in LM50 if s in S]
    strong = [any(abs(S[s]["rho"][o]) >= 0.5 and S[s]["p_holm"][o] < 0.05 for o in OBS) for s in lm]
    weak = [all(abs(S[s]["rho"][o]) < 0.3 for o in OBS) for s in lm]
    e = lambda s, c, v: S[s]["e"][c][v]
    r266 = [e(s, "111", "C") / e(s, "111", "L") for s in lm]
    n268 = sum(e(s, "000", "C") < e(s, "000", "L") for s in S)
    return dict(H265=verdict(len(lm) == 2 and all(strong), len(lm) == 2 and all(weak)),
                H266=verdict(len(lm) == 2 and all(x <= 0.75 for x in r266), len(lm) == 2 and all(x > 1 for x in r266)),
                H267=verdict(len(lm) == 2 and all(e(s, "111", "C") < e(s, "111", "M") for s in lm),
                             len(lm) == 2 and all(e(s, "111", "C") > e(s, "111", "M") for s in lm)),
                H268=verdict(n268 >= 3, n268 <= 1), counts=dict(r266=r266, n268=n268))


def report():
    rs = json.loads((HERE / "rows.json").read_text())
    S = _by_set(rs)
    V = verdicts(S)
    f = lambda x: f"{x:8.3f}" if x is not None and x != INF else "     inf"
    L = ["cell-fidelity milestone 7c: does a ten-cycle observable predict each design's law drift m, and does a",
         "correction built on it close the LG M50 floor? 104 designs, per set.", "",
         "Spearman rho of m (cell 111) with each ten-cycle observable; permutation p (10,000), Holm over the three:",
         f"{'set':12s}{'n':>3s}" + "".join(f"{o + ' rho':>9s}{'p':>8s}{'p_holm':>8s}" for o in OBS)]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f"{d['rho'][o]:9.3f}{d['p'][o]:8.4f}{d['p_holm'][o]:8.4f}" for o in OBS))
    for cell in CELLS2:
        L += ["", f"cell {cell}: set-median error at cycle 99 by ten-cycle forecast, and the drift m",
              f"{'set':12s}" + "".join(f"{v:>8s}" for v in ("L", "M", "C", "own m")) + f"{'C<L':>7s}{'C<M':>7s}"
              + f"{'m_med':>8s}{'m_q25':>8s}{'m_q75':>8s}  picks O1/O2/O3"]
        for st, d in S.items():
            w, m, pk = d["wins"][cell], d["m"][cell], d["picks"][cell]
            L.append(f"{st:12s}" + "".join(f(d['e'][cell][v]) for v in ("L", "M", "C", "own m"))
                     + f"{w['C_L']:>4d}/{d['n']:<2d}{w['C_M']:>4d}/{d['n']:<2d}"
                     + "".join(f"{m[k]:8.3f}" for k in ("med", "q25", "q75")) + f"  {pk['O1']}/{pk['O2']}/{pk['O3']}")
    for p, _ in POOLS:
        Sp = {st: [r for r in rs if r["pool"] == p and r["set"] == st] for st in SETS}
        L += ["", f"Pool {p} only (corrections fitted on the whole set): e_111 L, M, C",
              f"{'set':12s}{'n':>3s}{'L':>8s}{'M':>8s}{'C':>8s}"]
        for st, t in Sp.items():
            if t:
                cs = [r["cells"]["111"] for r in t]
                L.append(f"{st:12s}{len(t):3d}" + f(med(c['eL'] for c in cs)) + f(med(c['e_M'] for c in cs))
                         + f(med(c['e_C'] for c in cs)))
    c = V["counts"]
    L += ["", "(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3. L = 7b's ten-cycle line (m = 1); M = the other designs'",
          " median m; C = m from a line on the observable with the largest |rho| on the other designs (chosen per fold);",
          " own m = the design's true m (a check: ~0). m: R(99) = a + 10 s + 89 s m, line (a, s) through cycles 2..10.",
          " O1 = cycle-2 plating depth (1 = separator), O2 = its change to cycle 10, O3 = ln((L10-L6)/(L6-L2)))", "",
          f"H265 (|rho| >= 0.5, Holm p < 0.05, both LG M50 sets): {V['H265']}",
          f"H266 (C <= 0.75 L on both LG M50 sets, e_111): {V['H266']} (C/L {', '.join(f'{x:.2f}' for x in c['r266'])})",
          f"H267 (C below M on both LG M50 sets, e_111): {V['H267']}",
          f"H268 (C below L on >= 3 of 4 sets, e_000): {V['H268']} ({c['n268']}/4)"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1, default=str) + "\n")
    print("\n".join(L))


def quant(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))]


def posthoc():
    """Post hoc (after the report, not in the plan): the error's quantiles by forecast, the drift's spread
    explained, and the O1 correlation within each pool."""
    rs = json.loads((HERE / "rows.json").read_text())
    rmse = lambda xs: math.sqrt(sum(v * v for v in xs) / len(xs))
    L = ["Post hoc, descriptive (after the 7c report, not hypothesised). Cell 111 (every input measured).", "",
         "e_111 quantiles over the set's designs by forecast (L line, M constant drift, C observable correction):",
         f"{'set':12s}" + "".join(f"{v + ' ' + q:>9s}" for v in ("L", "M", "C") for q in ("q50", "q75", "q90", "max"))]
    for st in SETS:
        c = [r["cells"]["111"] for r in rs if r["set"] == st]
        L.append(f"{st:12s}" + "".join(f"{(quant([x[k] for x in c], p) if p < 1 else max(x[k] for x in c)):9.3f}"
                                         for k in ("eL", "e_M", "e_C") for p in (0.5, 0.75, 0.9, 1.0)))
    L += ["", "the drift m: spread, leave-one-out RMSE of M and C, median |m_hat - m|; Pearson r of m with O1;",
          "Spearman rho of m with O1 within each pool (n = 8 to 12):",
          f"{'set':12s}{'sd m':>8s}{'rmse M':>8s}{'rmse C':>8s}{'mad M':>8s}{'mad C':>8s}{'r O1':>8s}"
          + "".join(f"{'rho ' + p:>9s}" for p, _ in POOLS)]
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        c = [r["cells"]["111"] for r in t]
        m = [x["m"] for x in c]
        mu = sum(m) / len(m)
        sd = math.sqrt(sum((v - mu) ** 2 for v in m) / (len(m) - 1))
        line = (f"{st:12s}{sd:8.3f}{rmse([x['mM'] - x['m'] for x in c]):8.3f}{rmse([x['mC'] - x['m'] for x in c]):8.3f}"
                f"{med(abs(x['mM'] - x['m']) for x in c):8.3f}{med(abs(x['mC'] - x['m']) for x in c):8.3f}"
                f"{pearson([r['O1'] for r in t], m):8.3f}")
        for p, _ in POOLS:
            tp = [r for r in t if r["pool"] == p]
            line += f"{spearman([r['O1'] for r in tp], [r['cells']['111']['m'] for r in tp]):9.2f}"
        L.append(line)
    (HERE / "posthoc.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report, "posthoc": posthoc}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
