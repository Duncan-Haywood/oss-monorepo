"""Milestone 7zb: an SEI-only drift ladder. Does large, one-directional drift without plating make 7v's correction pay?

    WORKERS=3 OMP_NUM_THREADS=1 python experiments/sei7zb/run.py control  # wrapper at g = 1, plating as shipped, vs 7p's probe
    WORKERS=3 OMP_NUM_THREADS=1 python experiments/sei7zb/run.py probe    # plating off, 7 SEI multipliers x 4 designs x 20 cycles
    python experiments/sei7zb/run.py choose                              # the SEI probe rule -> choose.json (stdlib)
    WORKERS=3 OMP_NUM_THREADS=1 python experiments/sei7zb/run.py bench    # the kept condition, 56 designs to cycle 100
    python experiments/sei7zb/run.py rows                                # 7p's rows code via 7r (4 cores)
    python experiments/sei7zb/run.py report                              # 7r's report, 7za's rules, then H362 to H366

7y read 7v's corrected ten-cycle forecast as paying where drift is large and one-directional, and 7za's out-of-sample
cell (Marquis2019 with OKane2022's plating at 30x) agreed. But all three cells where it paid lose 99% of their lithium to
plating, so "large one-directional drift" and "plating-dominated" have never been separated: 7y's plating-share gate
(gP) and drift-size gate (gD) made the same decision on every tuned cell. This step builds a cell that drifts without
plating: Marquis2019@2x (its own SEI parameters, solvent-diffusion limited) with the plating exchange-current density set
to zero and the SEI solvent diffusivity scaled by a fixed ladder g, the smallest g that makes the probe designs fade like
the committed sets kept. Everything downstream is 7r's code (rows, theta/theta50/U lopo5) and 7za's (thetaC, thetaH,
thetaN, thetaP, thetaD, oracle), pointed at this directory. Plan in ../../LOG.md (7zb plan).
"""
import importlib.util
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
CELLS = ("Marquis2019@2x",)
COND = CELLS[0]
SEI_KEY = "SEI solvent diffusivity [m2.s-1]"
PL_KEY = "Exchange-current density for plating [A.m-2]"
MULTS = (1.0, 10.0, 100.0, 1e3, 1e4, 1e5, 1e6)   # fixed in the plan; g = 1 is reported (plating off, SEI as shipped)
LADDER = MULTS[1:]                               # the multipliers the choice may keep
CONTROL = -1.0                                   # job multiplier meaning "nothing changed" (7p's protocol)
PL_SHARE_MAX = 0.01                              # "no plating": plated / lost lithium at cycle 20 on every probe design
D_MIN = 0.10                                     # 7y's drift-size threshold (H363)
SET_TAG = "-SEI"                                 # suffix for this cell's set name in the eight-set pooling


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


R = _mod("plating7r_run", EXP / "plating7r" / "run.py")


# ---------- pure helpers (tested) ----------

def sei_passes(n_ok, plates, f, n=4):
    """7r's probe rule with its plating clause inverted: all n finish, no plating, median fade in [3%, 20%]."""
    return n_ok == n and not plates and f is not None and R.FADE_MIN <= f <= R.FADE_MAX


def probe_res(rows, n_li, cycles=20):
    """(finished, plates, median fade): 7r's arithmetic, with 'plates' = some design's plated share of lost lithium at
    cycle `cycles` above PL_SHARE_MAX."""
    ok = [r for r in rows if r.get("ok") and r.get("ok_cycles", 0) >= cycles]
    if not ok:
        return 0, False, None
    plates = any(r["lost_mol"][cycles - 1] > 0 and r["pl_mol"][cycles - 1] / r["lost_mol"][cycles - 1] > PL_SHARE_MAX
                 for r in ok)
    f = statistics.median((r["lost_mol"][cycles - 1] - r["lost_mol"][1]) / n_li[r["j"]] for r in ok)
    return len(ok), plates, f


def choose(res):
    """Smallest multiplier on LADDER that passes. res: {mult: (n_ok, plates, fade)}."""
    for g in LADDER:
        if g in res and sei_passes(*res[g]):
            return g
    return None


def diag(rows, n_li, cycles=20):
    """Why a condition fades as it does (reported): medians of the share of n_Li lost by cycle 1 and by `cycles`, the
    log-log growth slope of lithium lost from cycle 2 to `cycles` (1 = linear, 0.5 = sqrt t, 0 = self-limited), and the
    charge time at `cycles` over cycle 2's (below 1 = the charge step ends early at the voltage cut-off)."""
    import math
    ok = [r for r in rows if r.get("ok") and r.get("ok_cycles", 0) >= cycles and r["lost_mol"][1] > 0]
    if not ok:
        return None
    med = statistics.median
    return dict(n=len(ok), lost_c1=med(r["lost_mol"][0] / n_li[r["j"]] for r in ok),
                lost_cN=med(r["lost_mol"][cycles - 1] / n_li[r["j"]] for r in ok),
                slope=med(math.log(r["lost_mol"][cycles - 1] / r["lost_mol"][1]) / math.log(cycles / 2) for r in ok),
                t_ch_ratio=med(r["t_ch"][cycles - 1] / r["t_ch"][1] for r in ok))


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def judge(kept, drift, d_cu, met_h, pick):
    """H362 to H366. kept: the kept g or None; drift: (median |m - 1|, |median m - 1|) of the kept cell; d_cu: thetaC - U
    (5-fold mean); met_h: thetaH's met folds of 5; pick: 7y's post hoc oracle pick ('thetaH' or 'theta')."""
    V = dict(H362=verdict(kept is not None, kept is None))
    if kept is None or drift is None:
        V.update({h: "not run (no kept cell)" for h in ("H363", "H364", "H365", "H366")})
        return V
    D, d = drift
    V.update(H363=verdict(D >= D_MIN and d >= D_MIN, D < 0.05),
             H364=verdict(d_cu < 0, d_cu > 0),
             H365=verdict(met_h >= 4, met_h <= 2),
             H366=verdict(pick == "thetaH", pick == "theta"))
    return V


# ---------- pybamm child: depth's (5zk's) simulate with plating off and the SEI solvent diffusivity scaled ----------

def child(job, cycles):
    c, j, x, g = job
    D = _mod("depth_run", EXP / "depth" / "run.py")
    D.CYCLES = cycles
    fc = D.B._fc()
    TR = fc.G.TR
    orig = TR.params

    def params(xx, s, _o=orig):
        pv, copied, cur = _o(xx, s)
        if g != CONTROL:
            v = pv[PL_KEY]
            pv.update({PL_KEY: (lambda c_e, c_Li, T, _v=v: 0.0 * _v(c_e, c_Li, T)) if callable(v) else 0.0})
            pv.update({SEI_KEY: g * float(pv[SEI_KEY])})
        return pv, copied, cur

    TR.params = params
    D.B._fc = lambda: fc
    out = D.simulate((c, j, x))
    out["mult"] = g
    return out


def _point_here():
    R.HERE = HERE
    R.CELLS = CELLS
    R.MULTS = MULTS


def _res():
    bal = R._bal()
    n_li = {j: bal[(COND, j)]["n_li"] for j in range(R.N_PROBE)}
    rs = R._load(HERE / "probe.jsonl")
    return {g: probe_res([r for r in rs if r["mult"] == g], n_li) for g in MULTS}


# ---------- commands ----------

def control():
    """g = CONTROL (nothing changed) on probe designs 0 to 3 against 7p's committed probe rows."""
    _point_here()
    bal = R._bal()
    p7 = {(r["cond"], r["j"]): r for r in R._load(EXP / "sets7p" / "probe.jsonl")}
    from concurrent.futures import ThreadPoolExecutor
    jobs = [(COND, j, bal[(COND, j)]["x"], CONTROL) for j in range(R.N_PROBE)]
    with ThreadPoolExecutor(R.WORKERS) as ex:
        res = list(ex.map(lambda jb: R._spawn(jb, R.PROBE_CYCLES), jobs))
    out = [dict(cond=r["cond"], j=r["j"], ok=r["ok"],
                max_rel=max(abs(a - b) / max(abs(b), 1e-30) for a, b in zip(r["lost_mol"], p7[(r["cond"], r["j"])]["lost_mol"]))
                if r["ok"] else None) for r in res]
    (HERE / "control.json").write_text(json.dumps(out, indent=1) + "\n")
    print(out)


def probe():
    _point_here()
    bal = R._bal()
    R._run([(COND, j, bal[(COND, j)]["x"], g) for g in MULTS for j in range(R.N_PROBE)], HERE / "probe.jsonl",
           R.PROBE_CYCLES)


def choose_cmd():
    res = _res()
    g = choose(res)
    (HERE / "choose.json").write_text(json.dumps(dict(
        results={f"{COND}*{m:g}": dict(finished=v[0], plates=v[1], fade=v[2]) for m, v in res.items()},
        kept={COND: g} if g is not None else {}), indent=1) + "\n")
    for m, v in res.items():
        print(f"{COND} g={m:<8g} finished {v[0]}/4 plates {v[1]!s:5s} fade {v[2] if v[2] is None else round(v[2], 4)}"
              f"  {'pass' if sei_passes(*v) else 'fail'}{'' if m in LADDER else ' (reported)'}")
    print("kept:", g)


def bench():
    _point_here()
    R.bench()


def rows():
    _point_here()
    R.rows()


def _folds(path, key, rules):
    s = json.loads(path.read_text())
    for k in key:
        s = s[k]
    return {r: s[r] for r in rules}


def report():
    _point_here()
    res = _res()
    R.passes = lambda n, pl, f, n_=4: sei_passes(n, pl, f, n_)     # 7r's report prints 'pass' by this step's rule
    R.MULTS = LADDER
    R.BASE_FADE = {COND: res[1.0][2]}                              # the g = 1 row (plating off) stands in for 7p's f = 1
    R.report()                                                     # 7r's results.txt / summary.json, on this cell
    s = json.loads((HERE / "summary.json").read_text())
    kept = s["kept"].get(COND)
    L = ["", "---- 7zb: the lines above are 7r's report replayed on the SEI-only cell (its H317 to H321 labels are 7r's; "
         "'plates' must be False here, mult is the SEI solvent-diffusivity multiplier g, plating exchange current 0) ----"]
    drift = d_cu = met_h = pick = None
    extra = {}
    if kept is not None and "lopo5" in s:
        Z = _mod("marq7za_run", EXP / "marq7za" / "run.py")
        Z.SRC = HERE.name
        Z.HERE = HERE / "rules"
        Z.HERE.mkdir(exist_ok=True)
        Z.report()                                                 # 7za's rules on this cell -> rules/results.txt
        z = json.loads((Z.HERE / "summary.json").read_text())
        rows_ = Z._y()._x()._v()._rows(HERE.name)
        ms = [r["m"] for r in rows_]
        drift = (statistics.median(abs(m - 1) for m in ms), abs(statistics.median(ms) - 1))
        tot = z["total"]
        d_cu, met_h, pick = z["pair"]["thetaC-U"]["mean"], tot["thetaH"]["met"], z["oracle"]
        fin = [r for r in R._load(HERE / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= 100 and r["mult"] == kept]
        Y = Z._y()
        phis = [v for v in (Y.phi10(r["pl_mol"], r["lost_mol"]) for r in fin) if v is not None]
        extra = dict(drift=dict(med_abs=drift[0], dir=drift[1], med_m=statistics.median(ms)),
                     phi10=dict(median=statistics.median(phis) if phis else None, max=max(phis) if phis else None,
                                n=len(phis)),
                     gates=z["gates"], total=tot, oracle=pick)
        # eight set-conditions (reported): 7za's seven plus this cell
        S = R._s7p()
        y7 = json.loads((EXP / "gate7y" / "summary.json").read_text())
        za = json.loads((EXP / "marq7za" / "summary.json").read_text())["folds"]
        Y7 = ("theta", "U", "thetaH", "thetaN", "thetaP", "thetaD")
        # this cell's folds carry set "Marquis2019", as 7za's do; paired() keys by (set, pool), so relabel them or
        # they overwrite 7za's (found in 7zc, the first run to reach this line)
        mine = {r: [dict(q, set=q["set"] + SET_TAG) for q in z["folds"][r]] for r in Y7}
        eight = {r: y7["four"]["folds"][r] + y7["f30"]["folds"][r] + za[r] + mine[r] for r in Y7}
        for a, b in (("thetaP", "theta"), ("thetaD", "theta"), ("thetaH", "theta"), ("thetaD", "U"), ("thetaP", "U")):
            pr = S.paired(eight[a], eight[b])
            pos, neg, sp = S.sign_test([q["d"] for q in pr])
            extra[f"eight {a}-{b}"] = dict(mean=sum(q["d"] for q in pr) / len(pr), boot=list(S.set_boot(pr)),
                                           cheaper=neg, dearer=pos, sign_p=sp,
                                           met_a=sum(q["met_a"] for q in pr), met_b=sum(q["met_b"] for q in pr))
        yn = lambda gs: "".join("y" if v else "n" for v in gs)
        L += [f"kept g = {kept:g}; bench finished to cycle 100: {len(fin)}/{R.N_RUN}",
              f"drift multiplier m: median {extra['drift']['med_m']:.3f}, median |m - 1| {drift[0]:.3f}, "
              f"|median m - 1| {drift[1]:.3f}",
              f"early plating share phi10: median {extra['phi10']['median']}, max {extra['phi10']['max']} over {len(phis)}",
              f"gates per fold: N {yn(z['gates']['N'])}  P {yn(z['gates']['P'])}  D {yn(z['gates']['D'])}",
              "totals (met of 5, DFN cycles per design): " + "  ".join(f"{r} {v['met']}/5 {v['cycles']:.1f}"
                                                                     for r, v in tot.items()),
              "pairs on this cell: " + "  ".join(f"{k} {v['mean']:+.2f} ({v['cheaper']}c/{v['dearer']}d)"
                                                 for k, v in z["pair"].items()),
              f"post hoc oracle (7y's): {pick}", "",
              f"{'eight set-conditions (reported)':34s}{'mean':>8s}{'set boot 95%':>20s}{'cheaper':>9s}{'dearer':>8s}"
              f"{'sign p':>8s}{'met a/b':>9s}"]
        for k, v in extra.items():
            if k.startswith("eight"):
                L.append(f"{k:34s}{v['mean']:+8.2f}{v['boot'][0]:+9.2f} to {v['boot'][1]:+.2f}{v['cheaper']:9d}"
                         f"{v['dearer']:8d}{v['sign_p']:8.3f}{v['met_a']:>5d}/{v['met_b']}")
    bal = R._bal()
    n_li = {j: bal[(COND, j)]["n_li"] for j in range(R.N_PROBE)}
    pr = R._load(HERE / "probe.jsonl")
    dg = {g: diag([r for r in pr if r["mult"] == g], n_li) for g in MULTS}
    extra["diag"] = {f"{g:g}": v for g, v in dg.items()}
    L += ["", "why the probe fades as it does (medians over finished probe designs; reported):",
          f"{'g':>8s}{'n':>3s}{'lost by c1':>12s}{'lost by c20':>13s}{'slope c2-20':>13s}{'t_ch c20/c2':>13s}"]
    for g, v in dg.items():
        if v:
            L.append(f"{g:8g}{v['n']:3d}{v['lost_c1']:12.4f}{v['lost_cN']:13.4f}{v['slope']:13.2f}{v['t_ch_ratio']:13.3f}")
    V = judge(kept, drift, d_cu, met_h, pick)
    L.append("")
    for h, t in (("H362", f"some g in {list(LADDER)} makes the plating-free cell pass the probe rule"),
                 ("H363", "the kept cell's drift is large and one-directional: median |m - 1| >= 0.10 and |median m - 1| >= 0.10"),
                 ("H364", "7v's correction pays without plating: 5-fold mean of thetaC - U < 0"),
                 ("H365", "thetaH meets >= 4 of 5 folds"),
                 ("H366", "drift size, not plating, decides: 7y's oracle picks thetaH over theta")):
        L.append(f"{h} ({t}): {V[h]}")
    with (HERE / "results.txt").open("a") as fh:
        fh.write("\n".join(L) + "\n")
    s["verdicts_7zb"] = V
    s["extra_7zb"] = extra
    (HERE / "summary.json").write_text(json.dumps(s, indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if sys.argv[1] == "child":
        _point_here()
        print(json.dumps(child(json.loads(sys.argv[2]), int(sys.argv[3]))))
    else:
        {"control": control, "probe": probe, "choose": choose_cmd, "bench": bench, "rows": rows,
         "report": report}[sys.argv[1]]()
