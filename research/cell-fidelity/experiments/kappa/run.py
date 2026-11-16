"""Milestone 5zf: is 5zd's remaining Ai2020 error, and the compensation 5ze found on LG M50, in the plating law's kinetic
exponent kappa? Every milestone since 5zb has taken kappa = alpha F / RT = 25.3 per volt from OKane2022's plating
transfer coefficient on every parameter set. Here kappa is estimated per design from that design's own cycles 2..10.

    python experiments/kappa/run.py dev              # seen: the 512 committed designs (5zb to 5ze), every form tried
    python experiments/kappa/run.py tables           # balance tables of the fresh designs (pybamm, no simulation)
    WORKERS=3 python experiments/kappa/run.py bench  # DFN (SEI + plating) to cycle 100 (5zc's simulate; resumable)
    python experiments/kappa/run.py report           # H167 to H171 (stdlib) -> results.txt, summary.json

The law is 5zd's: R_kappa(L) = int_0^L exp(kappa dU_eta(l)) Q_eta(0)/Q_eta(l) dl is a line in the cycle number, with eta
5zc's symmetric effective overpotential from the charge Ah of cycles 2..10 and dU_eta the rise of the negative OCP at the
top of the eta-shortened window. For a given design dU_eta(l) and Q_eta(l) do not depend on kappa, so they are tabulated
once and R_kappa is cheap for any kappa. Two ten-cycle estimators of kappa:
    fit:   the kappa in [0, KMAX] that makes R_kappa(L_n), n = 2..10, most nearly a line in n (least 1 - r^2);
    slope: the least-squares slope of -[ln dL_n + ln(Q_eta(0)/Q_eta(L_n))] on dU_eta(L_n), n = 3..10, dL_n = L_n - L_(n-1)
           (the per-cycle plating slows by exp(-kappa dU) as the lever rises); clamped to [0, KMAX].
And one diagnostic that is not a forecast: the oracle kappa*, the kappa whose forecast of L(99) is exact.
Plan in ../../LOG.md.
"""
import importlib.util
import json
import math
import os
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


AS = _mod("asym_run", EXP / "asym" / "run.py")
CN, LD, SF, D, FL, S, B = AS.CN, AS.LD, AS.SF, AS.D, AS.FL, AS.S, AS.B
K, TO, KAPPA, NGRID = AS.K, AS.TO, AS.KAPPA, AS.NGRID
spearman, line_fit, log_err = AS.spearman, AS.line_fit, AS.log_err

WORKERS = int(os.environ.get("WORKERS", "3"))
SOBOL_SEED = 24        # used by no milestone (5ze used 23)
N_LOG2 = 5             # 32 designs per pool
KMAX = 100.0           # per volt; four times alpha F / RT
KSTEP = 0.25
# fixed before any run: one current per set that no milestone has used, inside each set's dev range
CONDITIONS = ("Ai2020@0.5875x", "NCA_Kim2011@0.71875x", "Chen2020@1.34375x", "OKane2022@1.40625x")
CONTROLS, LGM50 = CONDITIONS[:2], CONDITIONS[2:]


# ---------- pure helpers (stdlib; tested) ----------

def tab(lost, b, eta, k=K, n=NGRID):
    """kappa-free tables on l in [0, l_max]: (ls, du, qr) with du = dU_eta(l) and qr = Q_eta(0)/Q_eta(l)."""
    l_max = min(0.95 * b["n_li"], 30 * lost[k - 1])
    ls = [l_max * i / n for i in range(n + 1)]
    q0 = LD.cap_eta(b["n_li"], b, eta)
    du, qr = [], []
    for l in ls:
        q = LD.cap_eta(b["n_li"] - l, b, eta)
        du.append(CN.du_eta(l, b, eta))
        qr.append(q0 / q if q > 0 else 1e9)
    return ls, du, qr


def r_of(t, kappa):
    """(ls, R) with R(L) = int exp(kappa du) qr dl by the trapezium rule (exponent clamped at +-50, as 5zb)."""
    ls, du, qr = t
    gs = [math.exp(max(-50.0, min(50.0, kappa * u))) * q for u, q in zip(du, qr)]
    rs = [0.0]
    for i in range(1, len(ls)):
        rs.append(rs[-1] + 0.5 * (gs[i] + gs[i - 1]) * (ls[i] - ls[i - 1]))
    return ls, rs


def forecast(t, lost, kappa, k=K, to=TO):
    """5zd's L(to-1) at a given kappa: a line through R at cycles 2..k, read at to-1, inverted."""
    ls, rs = r_of(t, kappa)
    ns = list(range(2, k + 1))
    a, s = line_fit(ns, [B.interp(ls, rs, lost[m - 1]) for m in ns])
    try:
        return D.l_of_r((ls, rs), a + s * (to - 1))
    except ZeroDivisionError:
        return None


def nonlin(t, lost, kappa, k=K):
    """1 - r^2 of R_kappa(L_n) against n over cycles 2..k (scale-free, so kappa values compare)."""
    ls, rs = r_of(t, kappa)
    ns = list(range(2, k + 1))
    ys = [B.interp(ls, rs, lost[m - 1]) for m in ns]
    a, s = line_fit(ns, ys)
    my = statistics.mean(ys)
    sst = sum((y - my) ** 2 for y in ys)
    sse = sum((y - a - s * x) ** 2 for x, y in zip(ns, ys))
    return sse / sst if sst > 0 else 1.0


def kappa_fit(t, lost, k=K, kmax=KMAX, step=KSTEP):
    """The kappa on a grid over [0, kmax] with the least 1 - r^2, refined by golden-section in the bracketing cells."""
    grid = [step * i for i in range(int(kmax / step) + 1)]
    vals = [nonlin(t, lost, x, k) for x in grid]
    i = min(range(len(grid)), key=vals.__getitem__)
    lo, hi = grid[max(0, i - 1)], grid[min(len(grid) - 1, i + 1)]
    g = (math.sqrt(5) - 1) / 2
    for _ in range(30):
        a, c = hi - g * (hi - lo), lo + g * (hi - lo)
        if nonlin(t, lost, a, k) < nonlin(t, lost, c, k):
            hi = c
        else:
            lo = a
    return 0.5 * (lo + hi)


def kappa_slope(t, lost, k=K, kmax=KMAX):
    """Least-squares slope of -[ln dL_n + ln qr(L_n)] on du(L_n), n = 3..k; clamped to [0, kmax]."""
    ls, du, qr = t
    xs, ys = [], []
    for m in range(3, k + 1):
        d = lost[m - 1] - lost[m - 2]
        if d <= 0:
            continue
        xs.append(B.interp(ls, du, lost[m - 1]))
        ys.append(-(math.log(d) + math.log(B.interp(ls, qr, lost[m - 1]))))
    if len(xs) < 3 or max(xs) - min(xs) <= 0:
        return None
    return max(0.0, min(kmax, line_fit(xs, ys)[1]))


def kappa_oracle(t, lost, l_true, k=K, kmax=KMAX):
    """kappa* in [0, kmax] with forecast(kappa*) = l_true (bisection; the forecast falls as kappa rises, checked on every
    seen design). Not a forecast: it uses the cycle-99 loss. Returns an end of the bracket when no root is inside."""
    f = lambda x: (forecast(t, lost, x, k) or 0.0) - l_true
    lo, hi = 0.0, kmax
    if f(lo) <= 0:
        return lo
    if f(hi) >= 0:
        return hi
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if f(mid) > 0 else (lo, mid)
    return 0.5 * (lo + hi)


def row(b, f, short=None, k=K):
    """One design: 5zd (kappa 25.3), the two ten-cycle kappa estimates and their forecasts, and the oracle kappa*."""
    s = short or f
    lost = f["lost_mol"]
    eta = LD.eta_of(s["q_ch"], s["lost_mol"], b, k)
    t = tab(lost, b, eta, k)
    kf, ks = kappa_fit(t, lost, k), kappa_slope(t, lost, k)
    lt = lost[TO - 2]
    du10 = B.interp(t[0], t[1], lost[k - 1]) - B.interp(t[0], t[1], lost[1])
    du99 = B.interp(t[0], t[1], lt) - B.interp(t[0], t[1], lost[1]) if lt <= t[0][-1] else None
    return dict(l_true=lt, eta=eta, k_fit=kf, k_slope=ks, k_star=kappa_oracle(t, lost, lt, k),
                du10_mV=1000 * du10, du99_mV=None if du99 is None else 1000 * du99,
                l_eta=forecast(t, lost, KAPPA, k), l_fit=forecast(t, lost, kf, k),
                l_slope=forecast(t, lost, ks, k) if ks is not None else None,
                l_zero=forecast(t, lost, 0.0, k))


def summarise(rows):
    ok = [r for r in rows if r["l_eta"] and r["l_fit"]]
    med = lambda key: statistics.median(abs(log_err(r[key], r["l_true"])) for r in ok if r[key])
    sgn = lambda key: statistics.median(log_err(r[key], r["l_true"]) for r in ok if r[key])
    q = lambda v, p: sorted(v)[min(len(v) - 1, int(p * len(v)))]
    kf = [r["k_fit"] for r in ok]
    ks = [r["k_star"] for r in ok]
    return dict(n=len(ok), lerr_eta=med("l_eta"), lerr_fit=med("l_fit"), lerr_slope=med("l_slope"),
                lerr_zero=med("l_zero"), sgn_eta=sgn("l_eta"), sgn_fit=sgn("l_fit"),
                wins=sum(abs(log_err(r["l_fit"], r["l_true"])) < abs(log_err(r["l_eta"], r["l_true"])) for r in ok),
                k_fit=statistics.median(kf), k_fit_q25=q(kf, 0.25), k_fit_q75=q(kf, 0.75),
                k_slope=statistics.median(r["k_slope"] for r in ok if r["k_slope"] is not None),
                k_star=statistics.median(ks), k_star_q25=q(ks, 0.25), k_star_q75=q(ks, 0.75),
                k_star_at_edge=sum(x <= 0.0 or x >= KMAX for x in ks),
                rho_k=spearman(kf, ks), du10_mV=statistics.median(r["du10_mV"] for r in ok),
                rhoL_eta=spearman([r["l_eta"] for r in ok], [r["l_true"] for r in ok]),
                rhoL_fit=spearman([r["l_fit"] for r in ok], [r["l_true"] for r in ok]))


# ---------- dev (seen: 5zb's to 5ze's pools) ----------

def _seen():
    """(milestone dir, record, short record) for every committed design with 100 cycles and ten cycles of charge Ah."""
    yield from AS._seen()
    last = {}
    for f in B._load(EXP / "asym" / "bench.jsonl"):
        last[(f["cond"], f["j"])] = f
    for _, f in sorted(last.items()):
        if AS._full(f) and len(f.get("q_ch", [])) >= K:
            yield "asym", f, f


def dev():
    bals = {d: SF._bal(EXP / d) for d in ("kinetic", "loaded", "consistent", "asym")}
    pools = {}
    for d, f, s in _seen():
        bal, ocp = bals[d]
        r = row(CN._b(bal, ocp, (f["cond"], f["j"])), f, s)
        pools.setdefault(f"{d}/{f['cond']}", []).append(r)
        print(d, f["cond"], f["j"], f"kfit {r['k_fit']:.1f} k* {r['k_star']:.1f}", flush=True)
    L = ["cell-fidelity milestone 5zf dev (seen): the 512 committed designs of 5zb to 5ze. 5zd's eta-window law with",
         f"kappa = {KAPPA:.1f} /V (eta), kappa = 0 (zero), and two ten-cycle estimates of kappa per design: fit (R_kappa most",
         "nearly a line in n over cycles 2..10) and slope (log per-cycle plating against the lever, cycles 3..10).",
         "Median |ln(L_pred(99) / L_DFN(99))|; kappa medians in /V with [q25, q75]; k* = oracle kappa that makes the",
         "cycle-99 forecast exact (not a forecast); edge = k* designs at 0 or KMAX; rho = Spearman(k_fit, k*);",
         "du10 = median rise of the lever over cycles 2..10 in mV.", "",
         f"{'pool':34s}{'n':>4s}{'eta':>7s}{'zero':>7s}{'fit':>7s}{'slope':>7s}{'wins':>5s}{'k_fit':>7s}{'[q25':>6s}"
         f"{'q75]':>6s}{'k_slope':>8s}{'k*':>7s}{'[q25':>6s}{'q75]':>6s}{'edge':>5s}{'rho':>7s}{'du10':>6s}"]
    out = {}
    for p in sorted(pools):
        c = out[p] = summarise(pools[p])
        L.append(f"{p:34s}{c['n']:4d}{c['lerr_eta']:7.3f}{c['lerr_zero']:7.3f}{c['lerr_fit']:7.3f}{c['lerr_slope']:7.3f}"
                 f"{c['wins']:5d}{c['k_fit']:7.1f}{c['k_fit_q25']:6.1f}{c['k_fit_q75']:6.1f}{c['k_slope']:8.1f}"
                 f"{c['k_star']:7.1f}{c['k_star_q25']:6.1f}{c['k_star_q75']:6.1f}{c['k_star_at_edge']:5d}"
                 f"{c['rho_k']:7.3f}{c['du10_mV']:6.1f}")
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(out, indent=1) + "\n")
    print("\n".join(L))


# ---------- fresh bench ----------

def tables():
    FL.HERE, FL.SOBOL_SEED, FL.CONDITIONS, FL.N_LOG2 = HERE, SOBOL_SEED, CONDITIONS, N_LOG2
    FL.tables()


def bench():
    LD.WORKERS = WORKERS
    path = HERE / "bench.jsonl"
    LD._run(LD._todo(path, B._load(HERE / "balance.jsonl")), path, TO)


def verdicts(C):
    raise NotImplementedError("fixed in the plan, written after dev")


def report():
    bal, ocp = SF._bal(HERE)
    last = {}
    for f in B._load(HERE / "bench.jsonl"):   # readers keep the last record per design (memory kills are retried)
        last[(f["cond"], f["j"])] = f
    C, R, dropped = {}, {}, {}
    for c in CONDITIONS:
        rs = []
        for (cc, j), f in sorted(last.items()):
            if cc != c:
                continue
            if not AS._full(f) or len(f.get("q_ch", [])) < K:
                dropped[c] = dropped.get(c, 0) + 1
                continue
            rs.append(row(CN._b(bal, ocp, (c, j)), f) | dict(j=j))
        if rs:
            C[c], R[c] = summarise(rs) | dict(dropped=dropped.get(c, 0)), rs
    V = verdicts(C)
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=R), indent=1) + "\n")


if __name__ == "__main__":
    {"dev": dev, "tables": tables, "bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
