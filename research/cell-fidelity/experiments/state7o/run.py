"""Milestone 7o: refit the triage policy on state-read observables, on all 200 designs of the five pools.

    WORKERS=3 OMP_NUM_THREADS=1 python experiments/state7o/run.py bench   # per design: a 10-cycle DFN look (pybamm)
    python experiments/state7o/run.py report                              # H305 to H308 -> results.txt, summary.json
    python experiments/state7o/run.py policy                              # policy.json for the runner (stdlib)

7n's lean runner reads a cycle's node plating as the change in the dead-lithium state (the solver's exact integral of
the plating current), but its policy's lines and thresholds were fitted on observables integrated with the trapezoid
rule on output points. The lean score is therefore a slightly different scorer from the one the policy was tuned on
(0.2% on one design, no decision changed in 7n). This step re-runs the first ten cycles of every design the policy
and its evaluation ever used (the 104 earlier designs of 5zk, 5zy and 5zz, 7g's 32 and 7h's 64), reads O1, O2, O3 both
ways from the same solution, and refits everything downstream of the observables on the state read: 7c's correction
(leave-one-out on the 104, fitted on the 104 for 7g and 7h), 7h's theta50 rule with its nested margin, and lopo5.
The cycle-10 and cycle-50 errors (E) are unchanged: they come from the 100-cycle runs, not from the observables.
Plan in ../../LOG.md (7o plan).
"""
import importlib.util
import json
import os
import statistics
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
WORKERS = int(os.environ.get("WORKERS", "3"))
CELL = "000"
SRC = (("5zk", "depth"), ("5zy", "freshnode"), ("5zz", "rangeline"), ("7g", "fresh7g"), ("7h", "fresh7h"))
OLD = ("5zk", "5zy", "5zz")
VARIANTS = ("trap", "state")
BAND = 0.01


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


N = _mod("lean7n_triage", EXP / "lean7n" / "triage.py")
M = N.M
SETS = ("Ai2020", "Chen2020", "OKane2022", "NCA_Kim2011")


def _load(path):
    with open(path) as fh:
        return [json.loads(l) for l in fh if l.strip()]


def rel(a, b):
    """Relative difference |a - b| / |b| (0 when both are 0)."""
    if a == b:
        return 0.0
    return abs(a - b) / abs(b) if b else float("inf")


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


# ---------- designs ----------

def designs():
    """(pool, cond, j, x) for every design the policy and its evaluation used, in a fixed order."""
    old = {(o["pool"], o["cond"], o["j"]) for o in json.loads((EXP / "drift7c" / "rows.json").read_text())}
    new = {(o["pool"], o["cond"], o["j"]) for d in ("fresh7g", "fresh7h")
           for o in json.loads((EXP / d / "rows.json").read_text())}
    want = old | new
    out = []
    for pool, d in SRC:
        for r in _load(EXP / d / "bench.jsonl"):
            k = (pool, r["cond"], r["j"])
            if r.get("ok") and k in want:
                out.append((pool, r["cond"], r["j"], r["x"]))
                want.discard(k)
    assert not want, f"designs without a bench row: {sorted(want)[:5]}"
    return out


# ---------- bench (pybamm) ----------

def look(cond, x):
    """The first ten cycles of one design; O1, O2, O3 read from the state and with 7m's trapezoid, same solution."""
    import pybamm
    pybamm.set_logging_level("ERROR")
    B, pv, cur = M._setup(cond, x)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V",
                              f"Charge at {cur:.6g} A until {vhi} V")] * M.LOOK)
    t0 = time.perf_counter()
    sim = pybamm.Simulation(pybamm.lithium_ion.DFN(B.VARIANTS["both"]), parameter_values=pv, experiment=exp)
    sol = sim.solve(initial_soc=1.0)
    t_look = time.perf_counter() - t0
    L_n = float(pv["Negative electrode thickness [m]"])
    xs = [float(v) for v in sim.mesh["negative electrode"].nodes]
    lost = [float(cy["Total lithium lost [mol]"].entries[-1]) for cy in sol.cycles]
    st = {k: N.cycle_plating(sol.cycles[k - 1]) for k in (2, M.LOOK)}
    state = M.observables(st[2], st[M.LOOK], xs, L_n, lost)
    t1 = time.perf_counter()
    xn = sol.cycles[0].steps[0]["x_n [m]"].entries
    xn = xn[:, 0] if xn.ndim == 2 else xn
    trap = M.observables(M.node_plating(sol.cycles[1], len(xn)), M.node_plating(sol.cycles[M.LOOK - 1], len(xn)),
                         [float(v) for v in xn], L_n, lost)
    return dict(cycles=len(sol.cycles), lost_mol=lost, state=state, trap=trap, t_look=t_look,
                t_trap=time.perf_counter() - t1)


def child(cond, x):
    try:
        return dict(ok=True, error=None, **look(cond, x))
    except Exception as ex:
        return dict(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}")


def _run(job):
    pool, c, j, x = job
    t = time.perf_counter()
    p = subprocess.run([sys.executable, __file__, "child", json.dumps([c, x])], capture_output=True, text=True,
                       timeout=1800)
    if p.returncode == 0 and p.stdout.strip():
        r = json.loads(p.stdout.strip().splitlines()[-1])
    else:
        r = dict(ok=False, error=f"exit {p.returncode}: {p.stderr.strip()[-160:]}")
    return dict(pool=pool, cond=c, j=j, x=x, wall_s=time.perf_counter() - t, **r)


def bench():
    path = HERE / "bench.jsonl"
    done = {(r["pool"], r["cond"], r["j"]) for r in _load(path) if r.get("ok")} if path.exists() else set()
    todo = [d for d in designs() if (d[0], d[1], d[2]) not in done]
    print(f"{len(todo)} designs to go", flush=True)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(_run, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["pool"], r["cond"], r["j"], "ok" if r["ok"] else r["error"], round(r.get("t_look") or -1, 2),
                  flush=True)


# ---------- rows (stdlib) ----------

def _deps():
    H = _mod("fresh7h_run", EXP / "fresh7h" / "run.py")
    DC = H.G7._deps()[1]
    return H, DC


def reference():
    """{(pool, cond, j): committed row} with O1..O3, m (cell 000), mC and E, from the programme's own rows."""
    H, _ = _deps()
    KS = H.KS
    lf = {(r["pool"], r["cond"], r["j"]): r for r in json.loads((EXP / "lawfloor" / "rows.json").read_text())}
    t7d = {(r["pool"], r["cond"], r["j"]): r for r in json.loads((EXP / "triage7d" / "rows.json").read_text())}
    out = {}
    for o in json.loads((EXP / "drift7c" / "rows.json").read_text()):
        k = (o["pool"], o["cond"], o["j"])
        eL = lf[k]["cells"][CELL]["eL"]
        out[k] = dict(set=o["set"], pool=o["pool"], cond=o["cond"], j=o["j"], O={q: o[q] for q in ("O1", "O2", "O3")},
                      m=o["cells"][CELL]["m"], mC=t7d[k]["cells"][CELL]["mC"], E={n: eL[str(n)] for n in KS})
    for d in ("fresh7g", "fresh7h"):
        for o in json.loads((EXP / d / "rows.json").read_text()):
            c = o["cells"][CELL]
            out[(o["pool"], o["cond"], o["j"])] = dict(set=o["set"], pool=o["pool"], cond=o["cond"], j=o["j"],
                                                       O={q: o[q] for q in ("O1", "O2", "O3")}, m=c["m"], mC=c["mC"],
                                                       E={n: c["eL"][str(n)] for n in KS})
    return out


def corrected(base, obs, DC):
    """Rows with mC recomputed from the observables `obs` {(pool, cond, j): {O1, O2, O3}}: 7c's leave-one-out fit on
    a set's 104-design share for 5zk/5zy/5zz, the same fit on all of that share for 7g and 7h (as 7g did).
    Returns (rows, {set: (pick, c0, c1)} of the full fit)."""
    rows, lines = [], {}
    for st in SETS:
        old = [k for k, r in base.items() if r["set"] == st and r["pool"] in OLD]
        old.sort(key=lambda k: (k[0], k[1], k[2]))
        ms = [base[k]["m"] for k in old]
        ob = [obs[k] for k in old]
        for i, k in enumerate(old):
            _, mC = DC.loo_fit(ms, ob, i)
            rows.append(dict(base[k], O=obs[k], mC=mC))
        best = max(DC.OBS, key=lambda o: abs(DC.spearman([v[o] for v in ob], ms)))
        c0, c1 = DC.lstsq([[1.0, v[best]] for v in ob], ms)
        lines[st] = (best, c0, c1)
        for k, r in base.items():
            if r["set"] == st and r["pool"] not in OLD:
                rows.append(dict(r, O=obs[k], mC=c0 + c1 * obs[k][best]))
    return rows, lines


def evaluate(rows, H):
    """7h's theta50 rule, refit on the four training pools and scored on 7h (the policy 7m's runner replays), and
    lopo5 (each of the five pools held out in turn); plus the 7h decisions under the refit policy."""
    by = lambda st, p: [r for r in rows if r["set"] == st and r["pool"] == p]
    refit, dec = [], {}
    for st in SETS:
        tp = [by(st, p) for p in H.TRAIN_POOLS]
        f = H.refit(tp, by(st, H.NEW), "theta50")
        refit.append(dict(f, set=st))
        th = f["policy"][2] if f["policy"] else float("inf")
        for r in by(st, H.NEW):
            dec[(r["cond"], r["j"])] = dict(extend=abs(r["mC"] - 1) >= th, score=abs(r["mC"] - 1), theta=th)
    lopo = [dict(H.refit([by(st, q) for q in H.ALL_POOLS if q != p], by(st, p), "theta50"), set=st, pool=p)
            for st in SETS for p in H.ALL_POOLS]
    agg = lambda fs: dict(met=sum(f["met"] for f in fs), n=len(fs), cycles=sum(f["cycles"] for f in fs) / len(fs))
    return dict(refit=refit, refit_agg=agg(refit), lopo=lopo, lopo_agg=agg(lopo), decisions=dec)


def report():
    H, DC = _deps()
    base = reference()
    runs = {(r["pool"], r["cond"], r["j"]): r for r in _load(HERE / "bench.jsonl") if r.get("ok")}
    assert set(runs) == set(base), f"{len(set(base) - set(runs))} designs missing from the bench"
    keys = sorted(base, key=lambda k: (SRC_ORDER[k[0]], k[1], k[2]))
    # H305: this bench's trapezoid observables against the committed rows (the design and solver reproduce)
    rep = {q: [rel(runs[k]["trap"][q], base[k]["O"][q]) for k in keys] for q in ("O1", "O2", "O3")}
    # state against trapezoid, same solution
    sd = {q: [rel(runs[k]["state"][q], runs[k]["trap"][q]) for k in keys] for q in ("O1", "O2", "O3")}
    # control: the committed observables through this code reproduce the committed mC and 7h's numbers
    ctrl_rows, ctrl_lines = corrected(base, {k: base[k]["O"] for k in keys}, DC)
    ctrl_mc = max(abs(r["mC"] - base[(r["pool"], r["cond"], r["j"])]["mC"]) for r in ctrl_rows)
    var = {"trap": corrected(base, {k: runs[k]["trap"] for k in keys}, DC),
           "state": corrected(base, {k: runs[k]["state"] for k in keys}, DC)}
    ev = {"committed": evaluate(ctrl_rows, H), **{v: evaluate(var[v][0], H) for v in VARIANTS}}
    lines = {"committed": ctrl_lines, **{v: var[v][1] for v in VARIANTS}}
    mc_shift = {}
    sk = {(r["pool"], r["cond"], r["j"]): r["mC"] for r in var["state"][0]}
    tk = {(r["pool"], r["cond"], r["j"]): r["mC"] for r in var["trap"][0]}
    for st in SETS:
        mc_shift[st] = [abs(sk[k] - tk[k]) for k in keys if base[k]["set"] == st]
    # 7h decisions: state-refit policy on state scores against the replay7h policy on trapezoid scores
    dT, dS = ev["trap"]["decisions"], ev["state"]["decisions"]
    near = {k: abs(dT[k]["score"] - dT[k]["theta"]) <= BAND * dT[k]["theta"] for k in dT}
    far = [k for k in dT if not near[k]]
    agree_far = sum(dS[k]["extend"] == dT[k]["extend"] for k in far)
    agree_all = sum(dS[k]["extend"] == dT[k]["extend"] for k in dT)
    met = {v: [f["set"] for f in ev[v]["refit"] if f["met"]] for v in ev}
    picks_same = sum(lines["state"][st][0] == lines["trap"][st][0] for st in SETS)
    allshift = [v for st in SETS for v in mc_shift[st]]
    V = {
        "H305": dict(median={q: statistics.median(v) for q, v in rep.items()},
                     max={q: max(v) for q, v in rep.items()},
                     verdict=verdict(all(statistics.median(rep[q]) <= 1e-3 and max(rep[q]) <= 1e-3 for q in ("O1", "O3"))
                                     and statistics.median(rep["O2"]) <= 1e-2,
                                     any(max(rep[q]) > 1e-2 for q in ("O1", "O3")))),
        "H306": dict(picks_same=picks_same, mc_shift_median=statistics.median(allshift), mc_shift_max=max(allshift),
                     verdict=verdict(picks_same == 4 and statistics.median(allshift) <= 1e-3, picks_same <= 2)),
        "H307": dict(agree_far=agree_far, n_far=len(far), agree_all=agree_all, n=len(dT), met_state=met["state"],
                     met_trap=met["trap"],
                     verdict=verdict(agree_all >= 62 and agree_far == len(far) and met["state"] == met["trap"],
                                     len(met["state"]) != len(met["trap"]))),
        "H308": dict(state=ev["state"]["lopo_agg"], trap=ev["trap"]["lopo_agg"],
                     verdict=verdict(abs(ev["state"]["lopo_agg"]["met"] - ev["trap"]["lopo_agg"]["met"]) <= 1
                                     and abs(ev["state"]["lopo_agg"]["cycles"] - ev["trap"]["lopo_agg"]["cycles"]) <= 1,
                                     abs(ev["state"]["lopo_agg"]["met"] - ev["trap"]["lopo_agg"]["met"]) >= 3
                                     or abs(ev["state"]["lopo_agg"]["cycles"] - ev["trap"]["lopo_agg"]["cycles"]) > 3)),
    }
    s7h = json.loads((EXP / "fresh7h" / "summary.json").read_text())
    L = ["cell-fidelity milestone 7o: the triage policy refit on state-read observables. 200 designs (5zk 40, 5zy 32,",
         "5zz 32, 7g 32, 7h 64), each re-run for its first ten DFN cycles; O1..O3 read from the dead-lithium state and,",
         "from the same solution, with 7m's trapezoid rule. Cell 000; theta50 rule; PyBaMM 26.10.1.1.", "",
         f"{'observable':<12}{'trap vs rows: med':>18}{'max':>10}{'state vs trap: med':>20}{'max':>10}"]
    for q in ("O1", "O2", "O3"):
        L.append(f"{q:<12}{statistics.median(rep[q]):>18.1e}{max(rep[q]):>10.1e}{statistics.median(sd[q]):>20.1e}"
                 f"{max(sd[q]):>10.1e}")
    L += ["", "control: committed observables through this code, mC against the committed mC: max |diff| "
          f"{ctrl_mc:.1e}; refit {ev['committed']['refit_agg']['met']}/4 at {ev['committed']['refit_agg']['cycles']:.1f}"
          f" cycles, lopo5 {ev['committed']['lopo_agg']['met']}/20 at {ev['committed']['lopo_agg']['cycles']:.2f} (7h: "
          f"{s7h['summary']['refit']['theta50']['met']}/4 at {s7h['summary']['refit']['theta50']['cycles']:.1f}, "
          f"{s7h['summary']['lopo5']['theta50']['met']}/20 at {s7h['summary']['lopo5']['theta50']['cycles']:.2f})", "",
          f"{'set':<12}{'pick trap':>10}{'pick state':>11}{'theta trap':>11}{'theta state':>12}{'met trap':>9}"
          f"{'met state':>10}{'|dmC| med':>11}{'max':>9}"]
    fr = {v: {f["set"]: f for f in ev[v]["refit"]} for v in VARIANTS}
    th = lambda f: f["policy"][2] if f["policy"] else float("inf")
    for st in SETS:
        L.append(f"{st:<12}{lines['trap'][st][0]:>10}{lines['state'][st][0]:>11}{th(fr['trap'][st]):>11.5f}"
                 f"{th(fr['state'][st]):>12.5f}{'y' if fr['trap'][st]['met'] else 'n':>9}"
                 f"{'y' if fr['state'][st]['met'] else 'n':>10}{statistics.median(mc_shift[st]):>11.1e}"
                 f"{max(mc_shift[st]):>9.1e}")
    L += ["(theta: the theta50 threshold refit on 5zk, 5zy, 5zz and 7g with its nested margin, the replay7h policy;",
          " met: its q75 on 7h within 1.25 x 7h's all-50 q75; |dmC|: state against trapezoid drift estimate, all pools)", ""]
    for v in VARIANTS:
        a, b = ev[v]["refit_agg"], ev[v]["lopo_agg"]
        L.append(f"{v:<6} refit on four pools, scored on 7h: {a['met']}/4 met, {a['cycles']:.1f} cycles "
                 f"({100 * (1 - a['cycles'] / 50):.1f}% saved); lopo5: {b['met']}/20 met, {b['cycles']:.2f} cycles "
                 f"({100 * (1 - b['cycles'] / 50):.1f}% saved)")
    flips = [k for k in dT if dS[k]["extend"] != dT[k]["extend"]]
    L += ["", f"7h decisions, state-refit policy on state scores against replay7h on trapezoid scores: agree on "
          f"{agree_all} of {len(dT)} ({agree_far} of {len(far)} more than 1% from theta)"]
    for k in flips:
        L.append(f"  flip {k[0]} j={k[1]}: trap S {dT[k]['score']:.5f} vs {dT[k]['theta']:.5f} -> "
                 f"{'y' if dT[k]['extend'] else 'n'}; state S {dS[k]['score']:.5f} vs {dS[k]['theta']:.5f} -> "
                 f"{'y' if dS[k]['extend'] else 'n'}")
    t = [r["t_look"] for r in runs.values()]
    L += ["", f"10-cycle look: median {statistics.median(t):.2f} s, total {sum(t):.0f} s over {len(t)} designs", ""]
    h = V["H305"]
    L.append(f"H305 (the looks reproduce the committed observables): max rel diff O1 {h['max']['O1']:.1e}, O2 "
             f"{h['max']['O2']:.1e}, O3 {h['max']['O3']:.1e} -> {h['verdict']}")
    h = V["H306"]
    L.append(f"H306 (the correction barely moves): picks unchanged on {h['picks_same']} of 4 sets; |dmC| median "
             f"{h['mc_shift_median']:.1e}, max {h['mc_shift_max']:.1e} -> {h['verdict']}")
    h = V["H307"]
    L.append(f"H307 (the refit policy keeps the held-out triage): decisions agree on {h['agree_all']} of {h['n']} "
             f"({h['agree_far']} of {h['n_far']} away from theta); met sets state {h['met_state']} vs trapezoid "
             f"{h['met_trap']} -> {h['verdict']}")
    h = V["H308"]
    L.append(f"H308 (the headline holds): lopo5 state {h['state']['met']}/20 at {h['state']['cycles']:.2f} cycles, "
             f"trapezoid {h['trap']['met']}/20 at {h['trap']['cycles']:.2f} -> {h['verdict']}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    js = lambda e: dict(refit=e["refit"], refit_agg=e["refit_agg"], lopo=e["lopo"], lopo_agg=e["lopo_agg"])
    (HERE / "summary.json").write_text(json.dumps(dict(
        verdicts=V, control=dict(mc_max_diff=ctrl_mc, **js(ev["committed"])), trap=js(ev["trap"]),
        state=js(ev["state"]), lines={v: {st: list(lines[v][st]) for st in SETS} for v in lines},
        flips=[list(k) for k in flips]), indent=1, default=str) + "\n")
    print("\n".join(L))


SRC_ORDER = {p: i for i, (p, _) in enumerate(SRC)}


# ---------- policy for the runner (stdlib) ----------

def policy():
    """policy.json in 7m's format, every line and threshold fitted on state-read observables from this bench:
    replay7h_state (thresholds picked on 5zk, 5zy, 5zz and 7g, never 7h) and deploy_state (all five pools)."""
    H, DC = _deps()
    base = reference()
    runs = {(r["pool"], r["cond"], r["j"]): r for r in _load(HERE / "bench.jsonl") if r.get("ok")}
    rows, lines = corrected(base, {k: runs[k]["state"] for k in base}, DC)
    by = lambda st, p: [r for r in rows if r["set"] == st and r["pool"] == p]
    out = {}
    for name, pools in (("replay7h_state", H.TRAIN_POOLS), ("deploy_state", H.ALL_POOLS)):
        sets = {}
        for st in SETS:
            obs, c0, c1 = lines[st]
            tp = [by(st, p) for p in pools]
            m, inner_ok = H.choose_margin(tp, "theta50")
            lab = H.PICK["theta50"]([r for p in tp for r in p], m)
            sets[st] = dict(obs=obs, c0=c0, c1=c1, theta=lab[2], K1=lab[1], margin=m, inner_ok=inner_ok,
                            pools=list(pools), read="state")
        out[name] = dict(rule="theta50 on state-read observables: extend to cycle 50 when |c0 + c1 O - 1| >= theta "
                              "(cell 000)", sets=sets)
    (HERE / "policy.json").write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps({n: {s: (v["obs"], round(v["theta"], 5)) for s, v in p["sets"].items()} for n, p in out.items()}))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "child":
        c, x = json.loads(sys.argv[2])
        print(json.dumps(child(c, x)))
    else:
        {"bench": bench, "report": report, "policy": policy}[sys.argv[1] if len(sys.argv) > 1 else "bench"]()
