"""Milestone 5d: are SPMe's solver stops and outright failures numerical (a solver setting removes them) or structural
(SPMe's linearised electrolyte leaves its domain, c_e < 0, and no setting can help)?

    python experiments/solver/run.py census    # the SPMe runs that failed or stopped early on every committed bench -> census.json
    python experiments/solver/run.py diag      # 1-cycle SPMe diagnostic per census design (first-discharge min c_e, charge step) -> diag.jsonl
    python experiments/solver/run.py bench     # every census design x 5 solver variants, 100 cycles, plus the control designs (resumable) -> bench.jsonl
    python experiments/solver/run.py report    # results.txt, summary.json (stdlib only)

Hypotheses H38 to H41 and every rule below are fixed in ../../LOG.md (milestone 5d plan) before the bench. The design
mapping, protocol, areal current density and copied degradation keys are milestone 5b's (../transfer/run.py); only the
solver and mesh change.
"""
import importlib.util
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
WORKERS = int(os.environ.get("WORKERS", "3"))

# bench file -> parameter set (None: the row's own "set" field); OKane2022 benches predate the field
BENCHES = (("cycles/bench.jsonl", "OKane2022"), ("fresh/bench.jsonl", "OKane2022"),
           ("transfer/bench.jsonl", None), ("calibrate/bench.jsonl", None))
VARIANTS = ("V0", "V1", "V2", "V3", "V4")
DESCR = {
    "V0": "IDAKLU defaults (rtol 1e-4, atol 1e-6), default mesh: the committed runs",
    "V1": "IDAKLU rtol 1e-6, atol 1e-8",
    "V2": "IDAKLU defaults, robust nonlinear solve (max_nonlinear_iterations 200, max_convergence_failures 1000, "
          "max_error_test_failures 100)",
    "V3": "CasadiSolver mode 'safe', rtol 1e-6, atol 1e-8",
    "V4": "IDAKLU defaults, every mesh dimension doubled",
}
N_CONTROL = 8                     # completing SPMe designs per set re-run under every variant (first N by index)
CONTROL_SETS = ("Mohtat2020", "NCA_Kim2011", "OKane2022")
GAP = 0.25


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


TR = _mod("transfer_run", EXP / "transfer" / "run.py")
CR = TR.CR


# ---------- pure helpers (stdlib; tested) ----------

def kind(run, cycles=100):
    """'fail' (no cycle returned), 'stop' (returned fewer than cycles), or 'ok'."""
    if not run.get("ok") or not run.get("ok_cycles"):
        return "fail"
    return "stop" if run["ok_cycles"] < cycles else "ok"


def rel_gap(spme, dfn):
    """(DFN - SPMe) / DFN; 1.0 when SPMe scored 0."""
    if spme <= 0:
        return 1.0
    return (dfn - spme) / dfn if dfn > 0 else 0.0


def rescued(rows, design, variants=VARIANTS[1:]):
    """Variants (other than V0) under which design reached 100 cycles; rows: {(design, variant): run}."""
    return [v for v in variants if kind(rows.get((design, v), {})) == "ok"]


def structural(diag_row):
    """The plan's structural sign: SPMe's first discharge drives the electrolyte concentration below zero."""
    return diag_row.get("ce1_min_ratio") is not None and diag_row["ce1_min_ratio"] < 0


# ---------- inputs ----------

def _rows(rel, pset):
    for line in (EXP / rel).read_text().splitlines():
        r = json.loads(line)
        yield (r.get("set") or pset), r


def census():
    """Every SPMe run on a committed bench that failed or stopped before cycle 100, with its DFN@100 score."""
    out, ctrl = [], {s: [] for s in CONTROL_SETS}
    for rel, pset in BENCHES:
        by = {}
        for s, r in _rows(rel, pset):
            by.setdefault((s, r["j"]), {})[r["model"]] = r
        for (s, j), m in sorted(by.items()):
            sp, d = m.get("SPMe"), m.get("DFN")
            if not sp or not d:
                continue
            k = kind(sp)
            dfn = CR.score_at(d, 100, d["mass_kg"]) if d.get("mass_kg") else 0.0
            row = dict(bench=rel, set=s, j=j, x=sp["x"] if "x" in sp else d.get("x"), kind=k,
                       ok_cycles=sp.get("ok_cycles", 0), error=sp.get("error"), r_min=sp.get("r_min"), dfn100=dfn)
            if k != "ok":
                out.append(row)
            elif s in ctrl and len(ctrl[s]) < N_CONTROL and rel != "fresh/bench.jsonl":
                row["spme100"] = CR.score_at(sp, 100, sp["mass_kg"])
                ctrl[s].append(row)
    res = dict(failing=out, control=[r for s in CONTROL_SETS for r in ctrl[s]])
    (HERE / "census.json").write_text(json.dumps(res, indent=1) + "\n")
    print(len(out), "failing or stopped;", len(res["control"]), "controls")
    return res


# ---------- simulation (pybamm, one child process per run) ----------

def _solver(variant):
    import pybamm
    if variant == "V1":
        return pybamm.IDAKLUSolver(rtol=1e-6, atol=1e-8)
    if variant == "V2":
        return pybamm.IDAKLUSolver(options=dict(max_nonlinear_iterations=200, max_convergence_failures=1000,
                                                max_error_test_failures=100))
    if variant == "V3":
        return pybamm.CasadiSolver(mode="safe", rtol=1e-6, atol=1e-8)
    return None


def _var_pts(model, variant):
    if variant != "V4":
        return None
    return {k: 2 * v for k, v in model.default_var_pts.items()}


def simulate(x, pset, cycles, variant):
    """Milestone 5b's SPMe run with the variant's solver and mesh; per-cycle Wh and r as before."""
    import numpy as np
    import pybamm
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    x = cell.clip(x)
    pv, _, cur = TR.params(x, pset)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    out = dict(ok=True, error=None, mass_kg=float(TR.stack_mass(x, pv)), current_A=cur)
    model = pybamm.lithium_ion.SPMe(TR.OPTS)
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")] * cycles)
    kw = {}
    if _solver(variant) is not None:
        kw["solver"] = _solver(variant)
    if _var_pts(model, variant) is not None:
        kw["var_pts"] = _var_pts(model, variant)
    c0 = pv["Initial concentration in electrolyte [mol.m-3]"]
    t0 = time.perf_counter()
    try:
        sol = pybamm.Simulation(model, parameter_values=pv, experiment=exp, **kw).solve(initial_soc=1.0)
        wh, rc = [], []
        for c in sol.cycles:
            d = c.steps[0]
            v, i, t = d["Terminal voltage [V]"].entries, d["Current [A]"].entries, d["Time [s]"].entries
            wh.append(float(np.trapezoid(v * i, t)) / 3600.0)
            rc.append(float(np.min(c["Electrolyte concentration [mol.m-3]"].entries)) / c0)
        out.update(cycle_wh=wh, r_cycle=rc, ok_cycles=len(sol.cycles), r_min=min(rc) if rc else 0.0)
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}", cycle_wh=[], r_cycle=[], ok_cycles=0, r_min=0.0)
    out["seconds"] = time.perf_counter() - t0
    return out


def diagnose(x, pset):
    """One SPMe cycle, default solver: the first discharge's unclipped min c_e / c_e0, its Wh and termination, and
    whether the charge step returned anything (PyBaMM keeps a 1-cycle run whose charge step is empty)."""
    import numpy as np
    import pybamm
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    x = cell.clip(x)
    pv, _, cur = TR.params(x, pset)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    c0 = pv["Initial concentration in electrolyte [mol.m-3]"]
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")])
    out = dict(ok=True, error=None)
    try:
        sol = pybamm.Simulation(pybamm.lithium_ion.SPMe(TR.OPTS), parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
        d = sol.cycles[0].steps[0]
        v, i, t = d["Terminal voltage [V]"].entries, d["Current [A]"].entries, d["Time [s]"].entries
        ce = d["Electrolyte concentration [mol.m-3]"].entries
        steps = sol.cycles[0].steps
        ch = steps[1] if len(steps) > 1 else None
        empty = ch is None or type(ch).__name__ == "EmptySolution"
        out.update(ce1_min_ratio=float(np.min(ce)) / c0, wh1=float(np.trapezoid(v * i, t)) / 3600.0,
                   v_end=float(v[-1]), t_discharge=float(t[-1] - t[0]), termination=str(d.termination),
                   charge_empty=bool(empty), charge_s=None if empty else float(ch["Time [s]"].entries[-1] - ch["Time [s]"].entries[0]))
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}", ce1_min_ratio=None)
    return out


def _spawn(args, timeout=1800):
    try:
        p = subprocess.run([sys.executable, __file__, "child", json.dumps(args)], capture_output=True, text=True, timeout=timeout)
        if p.stdout.strip():
            return json.loads(p.stdout.strip().splitlines()[-1])
        err = f"process exit {p.returncode}: {p.stderr[-160:]}"
    except subprocess.TimeoutExpired:
        err = f"timeout {timeout} s"
    return dict(ok=False, error=err, cycle_wh=[], r_cycle=[], ok_cycles=0, r_min=0.0, seconds=None)


def _child(args):
    if args["what"] == "diag":
        return diagnose(args["x"], args["set"])
    return simulate(args["x"], args["set"], 100, args["variant"])


def _key(r):
    return (r["set"], r["j"], r.get("variant"))


def _run_jobs(path, jobs, tag):
    done = {_key(r) for r in map(json.loads, path.read_text().splitlines())} if path.exists() else set()
    jobs = [a for a in jobs if (a["set"], a["j"], a.get("variant")) not in done]

    def go(a):
        r = _spawn(a)
        return dict(set=a["set"], j=a["j"], variant=a.get("variant"), role=a.get("role"), **r)

    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as f:
        for r in ex.map(go, jobs):
            if "exit -9" in (r.get("error") or ""):
                print(tag, r["set"], r["j"], r.get("variant"), "killed (-9), not recorded", flush=True)
                continue
            f.write(json.dumps(r) + "\n")
            f.flush()
            print(tag, r["set"], r["j"], r.get("variant"), r["ok"], r.get("ok_cycles"), r.get("ce1_min_ratio"),
                  r.get("seconds") and round(r["seconds"], 1), flush=True)


def diag():
    c = json.loads((HERE / "census.json").read_text())
    jobs = [dict(what="diag", set=r["set"], j=r["j"], x=r["x"], role="failing") for r in c["failing"]]
    _run_jobs(HERE / "diag.jsonl", jobs, "diag")


def bench():
    c = json.loads((HERE / "census.json").read_text())
    jobs = [dict(what="run", set=r["set"], j=r["j"], x=r["x"], variant=v, role=role)
            for role in ("failing", "control") for r in c[role] for v in VARIANTS]
    _run_jobs(HERE / "bench.jsonl", jobs, "bench")


# ---------- report ----------

def _f(v, d=3):
    return "n/a" if v is None else f"{v:.{d}f}"


def report():
    c = json.loads((HERE / "census.json").read_text())
    dg = {(r["set"], r["j"]): r for r in map(json.loads, (HERE / "diag.jsonl").read_text().splitlines())}
    rows = {}
    for r in map(json.loads, (HERE / "bench.jsonl").read_text().splitlines()):
        rows[((r["set"], r["j"]), r["variant"])] = r
    fail = [r for r in c["failing"] if r["kind"] == "fail"]
    stop = [r for r in c["failing"] if r["kind"] == "stop"]
    L = ["cell-fidelity milestone 5d: SPMe's failures and early stops under five solver and mesh variants", ""]
    for v in VARIANTS:
        L.append(f"  {v}: {DESCR[v]}")
    L.append("")
    summ = dict(n_fail=len(fail), n_stop=len(stop), variants=DESCR, groups={})

    def group(name, items):
        g = dict(n=len(items), by_set={}, variants={})
        for r in items:
            g["by_set"][r["set"]] = g["by_set"].get(r["set"], 0) + 1
        L.append(f"{name}: {len(items)} designs {g['by_set']}")
        for v in VARIANTS:
            ks = [kind(rows.get(((r['set'], r['j']), v), {})) for r in items]
            ran = sum(1 for r in items if ((r["set"], r["j"]), v) in rows)
            cyc = [rows[((r['set'], r['j']), v)].get("ok_cycles", 0) for r in items if ((r["set"], r["j"]), v) in rows]
            g["variants"][v] = dict(ran=ran, ok=ks.count("ok"), stop=ks.count("stop"), fail=ks.count("fail"),
                                    median_cycles=sorted(cyc)[len(cyc) // 2] if cyc else None)
            L.append(f"  {v}: ran {ran}, reached 100 cycles {ks.count('ok')}, stopped {ks.count('stop')}, "
                     f"failed {ks.count('fail')}, median cycles {g['variants'][v]['median_cycles']}")
        any_ok = [r for r in items if rescued(rows, (r["set"], r["j"]))]
        g["rescued_by_any"] = len(any_ok)
        L.append(f"  rescued by any of V1 to V4: {len(any_ok)} of {len(items)}")
        res = []
        for r in any_ok:
            vs = rescued(rows, (r["set"], r["j"]))
            run = rows[((r["set"], r["j"]), vs[0])]
            sc = CR.score_at(run, 100, run["mass_kg"])
            gp = rel_gap(sc, r["dfn100"])
            res.append(dict(set=r["set"], j=r["j"], variants=vs, spme100=sc, dfn100=r["dfn100"], gap=gp,
                            untrusted=gp > GAP, r_min=run.get("r_min")))
            L.append(f"    {r['set']} {r['j']}: by {','.join(vs)}; SPMe@100 {sc:.1f} vs DFN@100 {r['dfn100']:.1f} Wh/kg, "
                     f"gap {gp:+.3f}, r_min {_f(run.get('r_min'))}")
        g["rescued"] = res
        L.append("")
        return g

    summ["groups"]["stop"] = group("Early stops (returned fewer than 100 cycles)", stop)
    summ["groups"]["fail"] = group("Outright failures (no cycle returned)", fail)

    # diagnostic: structural sign on every failing design
    L.append("1-cycle diagnostic (default solver): first-discharge unclipped min c_e / c_e0")
    dsum = {}
    for name, items in (("stop", stop), ("fail", fail)):
        d = [dg.get((r["set"], r["j"]), {}) for r in items]
        neg = sum(1 for x in d if structural(x))
        empty = sum(1 for x in d if x.get("charge_empty"))
        vals = sorted(x["ce1_min_ratio"] for x in d if x.get("ce1_min_ratio") is not None)
        dsum[name] = dict(n=len(items), diag_ok=len(vals), negative=neg, charge_empty=empty,
                          ce1_min=vals[0] if vals else None, ce1_median=vals[len(vals) // 2] if vals else None,
                          ce1_max=vals[-1] if vals else None)
        L.append(f"  {name}: {len(vals)} of {len(items)} diagnosed; c_e < 0 in {neg}; charge step empty in {empty}; "
                 f"min/median/max {_f(dsum[name]['ce1_min'])} / {_f(dsum[name]['ce1_median'])} / {_f(dsum[name]['ce1_max'])}")
    summ["diag"] = dsum
    # per set, diagnosed fail designs: first-discharge Wh against DFN's cycle 1 (salvage, reported only)
    L.append("")

    # controls: does a variant move the score of a design that already completes?
    L.append("Controls (SPMe completed at V0): largest |score(variant) / score(V0) - 1| per variant")
    ctl = {}
    for v in VARIANTS[1:]:
        dev, broke = [], 0
        for r in c["control"]:
            a, b = rows.get(((r["set"], r["j"]), "V0")), rows.get(((r["set"], r["j"]), v))
            if not a or not b:
                continue
            sa, sb = CR.score_at(a, 100, a["mass_kg"]), CR.score_at(b, 100, b["mass_kg"])
            if kind(b) != "ok":
                broke += 1
            elif sa > 0:
                dev.append(abs(sb / sa - 1))
        ctl[v] = dict(n=len(dev), broke=broke, max_dev=max(dev) if dev else None)
        L.append(f"  {v}: {len(dev)} compared, max deviation {_f(ctl[v]['max_dev'], 4)}, broke {broke}")
    # V0 reproduces the committed run?
    rep = []
    for r in c["control"] + c["failing"]:
        a = rows.get(((r["set"], r["j"]), "V0"))
        if a:
            rep.append(a.get("ok_cycles", 0) == r["ok_cycles"] if r["kind"] != "fail" or a.get("ok_cycles") else kind(a) == "fail")
    summ["controls"] = ctl
    summ["v0_reproduces"] = dict(n=len(rep), same=sum(rep))
    L.append(f"  V0 reproduces the committed cycle count on {sum(rep)} of {len(rep)} designs")
    L.append("")

    # verdicts (LOG.md, milestone 5d plan)
    st, fl = summ["groups"]["stop"], summ["groups"]["fail"]
    best_stop = max(st["variants"][v]["ok"] for v in VARIANTS[1:]) if stop else 0
    h38 = "supported" if best_stop >= 4 else ("refuted" if best_stop <= 1 else "mixed")
    nut = sum(1 for x in st["rescued"] if x["untrusted"])
    h39 = "n/a (nothing rescued)" if not st["rescued"] else ("supported" if nut == 0 else "refuted" if nut > 1 else "mixed")
    best_fail = max(fl["variants"][v]["ok"] for v in VARIANTS[1:]) if fail else 0
    neg_share = dsum["fail"]["negative"] / len(fail) if fail else float("nan")
    h40 = "supported" if best_fail <= 0.1 * len(fail) and neg_share >= 0.9 else "refuted"
    pos_share = (len(stop) - dsum["stop"]["negative"]) / len(stop) if stop else float("nan")
    h41 = "supported" if pos_share >= 0.9 else "refuted"
    summ["verdicts"] = dict(H38=h38, H39=h39, H40=h40, H41=h41, best_stop_rescue=best_stop, best_fail_rescue=best_fail,
                            fail_negative_share=neg_share, stop_positive_share=pos_share, rescued_untrusted=nut)
    L.append(f"H38 (stops are numerical): best variant brings {best_stop} of {len(stop)} early stops to 100 cycles -> {h38}")
    L.append(f"H39 (rescued stops are sound): {nut} of {len(st['rescued'])} rescued designs untrusted -> {h39}")
    L.append(f"H40 (failures are structural): best variant rescues {best_fail} of {len(fail)}; c_e < 0 in "
             f"{dsum['fail']['negative']} of {len(fail)} -> {h40}")
    L.append(f"H41 (stops are not structural): c_e >= 0 in {len(stop) - dsum['stop']['negative']} of {len(stop)} -> {h41}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if sys.argv[1:2] == ["child"]:
        print(json.dumps(_child(json.loads(sys.argv[2]))))
    elif sys.argv[1:2] == ["census"]:
        census()
    elif sys.argv[1:2] == ["diag"]:
        diag()
    elif sys.argv[1:2] == ["bench"]:
        bench()
    elif sys.argv[1:2] == ["report"]:
        report()
    else:
        print(__doc__)
