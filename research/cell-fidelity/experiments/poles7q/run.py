"""Milestone 7q: the Ramadass2004 cathode OCP has poles, and the forecast law crossed one.

    python experiments/poles7q/run.py scan      # poles and turns of every OCP table the programme has used (stdlib)
    python experiments/poles7q/run.py rows      # 7p's 45 Ramadass2004 designs through the law on the envelope table
    python experiments/poles7q/run.py report    # H313 to H316 -> results.txt, summary.json (stdlib)

7p benched Ramadass2004@1x (45 designs to cycle 100) and found the ten-cycle forecast law broken on it (cycle-10
error q75 12.6, against 0.06 to 0.12 on the four committed sets), with a post hoc reading that the cell's positive OCP
table "changes direction 7 times". While writing this step's plan the table was matched to PyBaMM 26.10.1.1's
`lico2_ocp_Ramadass2004` (a degree-10 rational fit in sto with stretch = 1.13, max error 5e-8 on the 401-point grid):
its denominator has three zeros in 0 < y < 1, at y = 0.2453, 0.3740 and 0.8888 (in the fit's own variable 1.13 y
they sit at 0.277, 0.423 and 1.004, so the stretch is what moves the last pole inside the range).

This step tests the consequence, with no new simulation:
  * the DFN runs charge from the discharged end until the terminal voltage reaches 4.2 V, which on this OCP happens
    just above the pole at 0.8888, so the cell cycles a narrow band of y (H313);
  * the law's balance code (window, capacity, eta) solves on the whole tabulated grid and so can land beyond the pole.
    The repair is the table a charge from the discharged end can actually see: Up replaced by its running maximum
    from y = 1 downward (monotone, equal to Up wherever Up is above all its values nearer y = 1). Every other input,
    the code path and the designs are 7p's (H314, H315);
  * with the repaired rows as a fifth set, 7p's report code gives the across-chemistry interval again (H316).
Plan in ../../LOG.md (7q plan).
"""
import importlib.util
import json
import statistics
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
SRC = EXP / "sets7p"
F = 96485.33212
SET, COND = "Ramadass2004", "Ramadass2004@1x"
# PyBaMM 26.10.1.1, pybamm/input/parameters/lithium_ion/Ramadass2004.py, lico2_ocp_Ramadass2004
STRETCH = 1.13
NUM = (-4.656, 88.669, -401.119, 342.909, -462.471, 433.434)      # coefficients of t^0, t^2, ..., t^10
DEN = (-1.0, 18.933, -79.532, 37.311, -73.083, 95.96)
POLE_BAND = 0.03          # H313: end-of-charge y within (pole, pole + POLE_BAND]


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _load(path):
    with open(path) as fh:
        return [json.loads(l) for l in fh if l.strip()]


S7 = _mod("sets7p_run", SRC / "run.py")


# ---------- pure helpers (stdlib; tested) ----------

def even_poly(c, t):
    return sum(a * t ** (2 * k) for k, a in enumerate(c))


def u_ramadass(y, stretch=STRETCH):
    t = stretch * y
    return even_poly(NUM, t) / even_poly(DEN, t)


def zeros(f, a, b, n=20000, it=80):
    """Sign changes of f on [a, b], refined by bisection (a pole shows up as a sign change of the denominator)."""
    out, xp, vp = [], a, f(a)
    for k in range(1, n + 1):
        x = a + (b - a) * k / n
        v = f(x)
        if (vp < 0) != (v < 0):
            lo, hi = xp, x
            for _ in range(it):
                m = 0.5 * (lo + hi)
                if (f(lo) < 0) != (f(m) < 0):
                    hi = m
                else:
                    lo = m
            out.append(0.5 * (lo + hi))
        xp, vp = x, v
    return out


def envelope_from_top(up):
    """Running maximum of a positive-OCP table taken from the last grid point (y = 1) downward: the highest voltage a
    charge that starts at the discharged end has met by stoichiometry y. Monotone non-increasing in y."""
    out, m = [0.0] * len(up), -float("inf")
    for i in range(len(up) - 1, -1, -1):
        m = max(m, up[i])
        out[i] = m
    return out


def turns(v, tol=1e-3):
    d = [b - a for a, b in zip(v, v[1:]) if abs(b - a) >= tol]
    return sum(1 for a, b in zip(d, d[1:]) if (a > 0) != (b > 0))


def y_end_charge(b, q_ah, lost_before, n_li):
    """Positive stoichiometry at the end of a charge that started fully discharged at y0 = min(1, n_li_now / Qp):
    the charge moves q_ah * 3600 / F mol out of the positive electrode."""
    nl = n_li - lost_before
    y0 = min(1.0, nl / b["Qp"])
    return y0 - q_ah * 3600.0 / F / b["Qp"]


# ---------- scan ----------

def _tables():
    tabs = {}
    for d in ("crossset", "calmap", "sets7p"):
        o = json.loads((EXP / d / "ocp.json").read_text())
        for s, v in o["sets"].items():
            tabs[s] = (o["grid"], v)
    return tabs


def scan():
    g, v = _tables()[SET]
    fit = max(abs(u_ramadass(y) - u) for y, u in zip(g, v["Up"]))
    poles = zeros(lambda y: even_poly(DEN, STRETCH * y), 0.0, 1.0)
    roots = zeros(lambda y: even_poly(NUM, STRETCH * y), 0.0, 1.0)
    poles_t = zeros(lambda t: even_poly(DEN, t), 0.0, 1.2)
    rows = {}
    for s, (gg, vv) in sorted(_tables().items()):
        rows[s] = dict(un_turns=turns(vv["Un"]), up_turns=turns(vv["Up"]), un_range=[min(vv["Un"]), max(vv["Un"])],
                       up_range=[min(vv["Up"]), max(vv["Up"])], up_env_changed=sum(
                           1 for a, b in zip(vv["Up"], envelope_from_top(vv["Up"])) if abs(a - b) > 1e-9))
    out = dict(fit_max_err=fit, poles_y=poles, numerator_zeros_y=roots, poles_t=poles_t, tables=rows)
    (HERE / "scan.json").write_text(json.dumps(out, indent=1) + "\n")
    print(f"table vs PyBaMM fit: max |err| {fit:.2e} V; poles in y: {[round(p, 4) for p in poles]}; "
          f"numerator zeros: {[round(p, 4) for p in roots]}; poles in t = 1.13 y: {[round(p, 4) for p in poles_t]}")
    for s, r in rows.items():
        print(f"{s:14s} Un turns {r['un_turns']:2d}  Up turns {r['up_turns']:2d}  Up {r['up_range'][0]:8.2f} to "
              f"{r['up_range'][1]:7.2f}  envelope changes {r['up_env_changed']:3d} of 401 points")


# ---------- rows ----------

def _deps():
    DC = S7._mod("drift7c_run", EXP / "drift7c" / "run.py")
    SF = DC.LF.WL.SF
    if not getattr(SF, "_poles7q", False):
        orig = SF._bal

        def bal(_d):
            b, o = orig(SRC)
            o = dict(grid=o["grid"], sets={s: dict(v) for s, v in o["sets"].items()})
            o["sets"][SET]["Up"] = envelope_from_top(o["sets"][SET]["Up"])
            return b, o
        SF._bal = bal
        SF._poles7q = True
    return DC


def _job(r):
    DC = _deps()
    return DC.LF._job(("7q", r)), DC._job(("7q", r))


def rows():
    fin = [r for r in _load(SRC / "bench.jsonl") if r["cond"] == COND and r.get("ok") and r.get("ok_cycles", 0) >= 100]
    with Pool(4) as p:
        res = p.map(_job, fin)
    out = []
    for lf, dr in res:
        c = dr["cells"][S7.CELL]
        out.append(dict(cond=dr["cond"], set=dr["set"], j=dr["j"], O1=dr["O1"], O2=dr["O2"], O3=dr["O3"], m=c["m"],
                        E={k: v for k, v in lf["cells"][S7.CELL]["eL"].items()}))
    out.sort(key=lambda o: o["j"])
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs")


# ---------- report ----------

def charge_band():
    """Per finished design: cycle-2 charge as a share of Qp and the end-of-charge y, for the new cell and, as a
    reference, every finished design of 7h's pool on the four committed sets."""
    bal7p = {(r["cond"], r["j"]): r for r in _load(SRC / "balance.jsonl")}
    out = {}
    fin = [r for r in _load(SRC / "bench.jsonl") if r["cond"] == COND and r.get("ok") and r.get("ok_cycles", 0) >= 100]
    out[SET] = [_band(bal7p[(r["cond"], r["j"])], r) for r in fin]
    DC = _deps()
    WL = DC.LF.WL
    bals = {d: {k: v for k, v in WL.SF._bal(EXP / d)[0].items()} for d in ("crossset", "calmap")}
    for r in _load(EXP / "fresh7h" / "bench.jsonl"):
        b = bals[WL.SRC.get(r["cond"], "crossset")].get((r["cond"], r["j"]))
        if r.get("ok") and r.get("ok_cycles", 0) >= 100 and b:
            out.setdefault(b["pset"], []).append(_band(b, r))
    return out


def _band(b, r):
    q = r["current_A"] * r["t_ch"][1] / 3600.0
    return dict(j=r["j"], share=q * 3600.0 / F / b["Qp"], y_end=y_end_charge(b, q, r["lost_mol"][0], b["n_li"]))


def report():
    H = S7._mod("fresh7h_run", EXP / "fresh7h" / "run.py")
    scan_d = json.loads((HERE / "scan.json").read_text())
    pole = max(scan_d["poles_y"])
    band = charge_band()
    nb = band[SET]
    in_band = sum(1 for d in nb if pole < d["y_end"] <= pole + POLE_BAND)
    spearman, lstsq = S7._stats()
    raw = json.loads((HERE / "rows.json").read_text())
    old = {o["j"]: o for o in json.loads((SRC / "rows.json").read_text()) if o["cond"] == COND}
    pools = S7.split_pools([o["j"] for o in raw])
    pool_of = {j: p for p, js in pools.items() for j in js}
    rs = [dict(o, pool=pool_of[o["j"]], E={int(k): v for k, v in o["E"].items()}) for o in raw if o["j"] in pool_of]
    rs, line = S7.correct(rs, spearman, lstsq)
    by = lambda p: [r for r in rs if r["pool"] == p]
    lopo = {rule: [dict(H.refit([by(q) for q in S7.POOLS if q != p], by(p), rule), set=SET, pool=p)
                   for p in S7.POOLS] for rule in ("theta", "theta50", "U")}
    h7 = json.loads((EXP / "fresh7h" / "summary.json").read_text())["lopo5"]
    old4 = {rule: [dict(set=f["set"], pool=f["pool"], cycles=float(f["cycles"]), met=bool(f["met"])) for f in h7[rule]]
            for rule in ("theta", "theta50", "U")}
    pair = {}
    for a in ("theta", "theta50"):
        p4, pn = S7.paired(old4[a], old4["U"]), S7.paired(lopo[a], lopo["U"])
        pair[a] = {}
        for name, pr in (("four", p4), ("new", pn), ("five", p4 + pn)):
            pos, neg, p = S7.sign_test([r["d"] for r in pr])
            pair[a][name] = dict(n=len(pr), mean=sum(r["d"] for r in pr) / len(pr),
                                 boot=S7.set_boot(pr) if len({r["set"] for r in pr}) > 1 else None,
                                 cheaper=neg, dearer=pos, sign_p=p, met_a=sum(r["met_a"] for r in pr),
                                 met_b=sum(r["met_b"] for r in pr),
                                 per_set={s: statistics.mean(r["d"] for r in pr if r["set"] == s)
                                          for s in sorted({r["set"] for r in pr})})
    old_rows = [r for r in rs if r["pool"] in S7.POOLS[:S7.N_OLD]]
    rho = {o: spearman([r[o] for r in old_rows], [r["m"] for r in old_rows]) for o in ("O1", "O2", "O3")}
    q10 = H.quant([r["E"][10] for r in rs])
    q10_old = H.quant([old[r["j"]]["E"]["10"] for r in rs])
    met = {rule: sum(f["met"] for f in lopo[rule]) for rule in lopo}
    cyc = {rule: statistics.mean(f["cycles"] for f in lopo[rule]) for rule in lopo}
    five = pair["theta"]["five"]
    V = dict(
        H313=S7.verdict(in_band == len(nb), in_band < len(nb) / 2),
        H314=S7.verdict(q10 <= 0.5, q10 > 2.0),
        H315=S7.verdict(max(abs(v) for v in rho.values()) >= 0.4, max(abs(v) for v in rho.values()) < 0.2),
        H316=S7.verdict(five["boot"][1] < 0, five["mean"] >= 0))
    shares = {s: statistics.median(d["share"] for d in v) for s, v in band.items()}
    L = ["cell-fidelity milestone 7q: the Ramadass2004 cathode OCP's poles, and the forecast law on its envelope. "
         "No new simulation: 7p's 45 finished", f"{COND} designs, 7p's code path, Up replaced by its running maximum "
         "from y = 1 down. Cell 000; PyBaMM 26.10.1.1.", "",
         f"OCP table against PyBaMM's lico2_ocp_Ramadass2004 (stretch {STRETCH}): max |err| {scan_d['fit_max_err']:.1e} V",
         "denominator zeros in 0 < y < 1: " + ", ".join(f"{p:.4f}" for p in scan_d["poles_y"])
         + "; in the fit's own variable t = 1.13 y: " + ", ".join(f"{p:.4f}" for p in scan_d["poles_t"]),
         "numerator zeros: " + ", ".join(f"{p:.4f}" for p in scan_d["numerator_zeros_y"]), "",
         "cycle-2 charge as a share of the positive electrode's capacity Qp (median), and end-of-charge y:"]
    for s in sorted(band, key=lambda k: (k != SET, k)):
        ys = sorted(d["y_end"] for d in band[s])
        L.append(f"  {s:14s} n {len(band[s]):3d}  share {shares[s]:.3f}  y_end median {statistics.median(ys):.4f} "
                 f"range {ys[0]:.4f} to {ys[-1]:.4f}")
    L += [f"  {SET}: {in_band} of {len(nb)} end the charge within (pole {pole:.4f}, +{POLE_BAND}]", "",
          f"cycle-10 forecast error q75: 7p table {q10_old:.3f}, envelope table {q10:.3f} "
          "(committed sets 0.06 to 0.12)",
          "rho(O1, O2, O3 ; m) on pools 1-3: " + "  ".join(f"{rho[o]:+.2f}" for o in ("O1", "O2", "O3"))
          + f"; pick {line[0]}; median |m_C - 1| {statistics.median(abs(r['mC'] - 1) for r in rs):.3g}",
          "lopo5 on the repaired set: " + ", ".join(f"{k} {met[k]}/5 at {cyc[k]:.1f} cycles" for k in ("theta", "theta50", "U")),
          "", "paired lopo5 folds, threshold rule minus uniform (DFN cycles per design; negative = threshold cheaper):",
          f"{'rule':9s}{'sets':>6s}{'folds':>6s}{'mean':>8s}{'set bootstrap 95%':>22s}{'cheaper':>9s}{'dearer':>8s}"
          f"{'sign p':>8s}{'met a/b':>9s}"]
    for a in ("theta", "theta50"):
        for name in ("four", "new", "five"):
            d = pair[a][name]
            bt = f"{d['boot'][0]:+.2f} to {d['boot'][1]:+.2f}" if d["boot"] else "-"
            L.append(f"{a:9s}{name:>6s}{d['n']:6d}{d['mean']:+8.2f}{bt:>22s}{d['cheaper']:9d}{d['dearer']:8d}"
                     f"{d['sign_p']:8.3f}{d['met_a']:>5d}/{d['met_b']}")
    L += ["", "per-set mean difference, theta minus U: " + ", ".join(
        f"{s} {v:+.2f}" for s, v in pair["theta"]["five"]["per_set"].items()), "",
          f"H313 (every design ends its charge just above the pole): {V['H313']}",
          f"H314 (the envelope table repairs the forecast, q75 E10 <= 0.5): {V['H314']}",
          f"H315 (7c's drift observables track m on the repaired set, max |rho| >= 0.4): {V['H315']}",
          f"H316 (five-set bootstrap interval of theta - U lies below zero): {V['H316']}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(
        verdicts=V, pole=pole, in_band=in_band, n=len(nb), shares=shares, band=band, q75_E10=q10,
        q75_E10_7p=q10_old, rho=rho, line=list(line), met=met, cycles=cyc, paired=pair, lopo5=lopo),
        indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"scan": scan, "rows": rows, "report": report}[sys.argv[1]]()
