"""Milestone 7k: does a cycle-10 DFN run resume to cycle 50 at the price 7j assumed?

    WORKERS=3 python experiments/resume7k/run.py bench   # per design A, B1, B2, C (pybamm; resumable)
    python experiments/resume7k/run.py report            # H290 to H292 (stdlib) -> results.txt, summary.json

7j priced the triage saving in wall time and found it holds (17.1%) only if a flagged design's cycle-10 run is
continued to cycle 50 rather than restarted (-4.3%), but never resumed a run. Per design this bench times
A, a fresh run to cycle 50; B1, a fresh run to cycle 10, saved to disk; B2, a new process that loads B1's solution
and solves cycles 11 to 50 with `starting_solution`; C, cycles 1 to 10 then 11 to 50 in one process. Same model,
parameters and experiment as 5zk's child (experiments/depth), with a lean per-cycle recorder. Plan in ../../LOG.md.
"""
import importlib.util
import json
import math
import os
import random
import statistics
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
CELL = Path(__file__).resolve().parents[2]

K0, K1 = 10, 50
N_PER_SET = 4
SEED = 5301                  # fixed in the plan
WORKERS = int(os.environ.get("WORKERS", "3"))
SETS = ("Ai2020", "Chen2020", "OKane2022", "NCA_Kim2011")
_COST = json.loads((CELL / "paper" / "cost.json").read_text())
C_FIXED = _COST["fixed_cost_cycles"]["median"]       # 7j's median fresh fixed cost, cycles (5.66)
CYCLES_POOLED = _COST["pooled_fresh"]["cycles"]      # 7j's pooled fresh-pool rate, 40.47 DFN cycles per design
FLAG_POOLED = _COST["pooled_fresh"]["flag_share"]    # flagged share 0.762


def _load(path):
    with open(path) as fh:
        return [json.loads(l) for l in fh if l.strip()]


# ---------- pure helpers (stdlib; tested) ----------

def picks(rows, n=N_PER_SET, seed=SEED):
    """n designs per set from the 7h bench's ok rows, in a fixed order."""
    rng = random.Random(seed)
    out = []
    for s in SETS:
        js = sorted(r["j"] for r in rows if r.get("ok") and r["cond"].split("@")[0] == s)
        out += [(next(r["cond"] for r in rows if r["cond"].split("@")[0] == s), j) for j in sorted(rng.sample(js, n))]
    return out


def costs(tA, tB1, tB2):
    """Per-cycle cost b, fresh fixed cost a and resume fixed cost a', the last two in cycle equivalents."""
    b = (tA - tB1) / (K1 - K0)
    if b <= 0:
        return None
    a = tB1 - K0 * b
    a_res = tB2 - (K1 - K0) * b
    return {"b": b, "a_cyc": a / b, "a_res_cyc": a_res / b}


def saving(a_res, c=C_FIXED, cycles=CYCLES_POOLED, f=FLAG_POOLED):
    """Triage wall-time saving against U50 when each flagged design pays a resume cost a_res (cycles)."""
    return 1 - (c + cycles + f * a_res) / (c + K1)


def breakeven(c=C_FIXED, cycles=CYCLES_POOLED, f=FLAG_POOLED):
    return (K1 - cycles) / f


def rel(a, b):
    return abs(a - b) / abs(b) if b else float("nan")


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def quart(v):
    v = sorted(v)
    q = statistics.quantiles(v, n=4, method="inclusive") if len(v) > 1 else [v[0]] * 3
    return q[0], q[1], q[2]


# ---------- pybamm ----------

def _setup(c, x):
    sys.path.insert(0, str(EXP / "depth"))
    D = _mod("depth_run", EXP / "depth" / "run.py")
    B = D.B
    fc = B._fc()
    from energy_cell import cell
    s, rate = fc.G._parse(c)
    x = cell.clip(x)
    S, TR = fc.P._sand(), fc.G.TR
    _, _, _, _, cur = S.geometry(x, s, rate)
    pv, _, _ = TR.params(x, s)
    return B, pv, cur


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _record(sol):
    lost, cap = [], []
    for cy in sol.cycles:
        lost.append(float(cy["Total lithium lost [mol]"].entries[-1]))
        cap.append(float(cy.steps[0]["Discharge capacity [A.h]"].entries[-1] - cy.steps[0]["Discharge capacity [A.h]"].entries[0]))
    return lost, cap


def child(mode, c, x, path):
    """One stage in its own process. mode: A (1-50), B1 (1-10, save), B2 (load, 11-50), C (1-10 then 11-50)."""
    t_proc = time.perf_counter()
    import pybamm
    pybamm.set_logging_level("ERROR")
    B, pv, cur = _setup(c, x)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]

    def exp(n):
        return pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")] * n)

    def sim(n):
        return pybamm.Simulation(pybamm.lithium_ion.DFN(B.VARIANTS["both"]), parameter_values=pv, experiment=exp(n))
    out = dict(mode=mode, ok=True, error=None)
    t0 = time.perf_counter()
    try:
        if mode == "A":
            sol = sim(K1).solve(initial_soc=1.0)
        elif mode == "B1":
            sol = sim(K0).solve(initial_soc=1.0)
            t1 = time.perf_counter()
            sol.save(path)
            out["save_s"] = time.perf_counter() - t1
            out["file_mb"] = os.path.getsize(path) / 1e6
        elif mode == "B2":
            start = pybamm.load(path)
            out["load_s"] = time.perf_counter() - t0
            sol = sim(K1 - K0).solve(starting_solution=start)
        elif mode == "C":
            s10 = sim(K0).solve(initial_soc=1.0)
            out["t10"] = time.perf_counter() - t0
            sol = sim(K1 - K0).solve(starting_solution=s10)
        out["seconds"] = time.perf_counter() - t0
        out["lost_mol"], out["cap_Ah"] = _record(sol)
        out["ok_cycles"] = len(sol.cycles)
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}", seconds=time.perf_counter() - t0)
    out["proc_s"] = time.perf_counter() - t_proc
    return out


def _run(mode, c, x, path):
    t = time.perf_counter()
    p = subprocess.run([sys.executable, __file__, "child", mode, json.dumps([c, x]), path], capture_output=True, text=True,
                       timeout=2400)
    wall = time.perf_counter() - t
    if p.returncode == 0 and p.stdout.strip():
        r = json.loads(p.stdout.strip().splitlines()[-1])
    else:
        r = dict(mode=mode, ok=False, error=f"exit {p.returncode}: {p.stderr.strip()[-160:]}")
    r["wall_s"] = wall
    return r


def jobs():
    rows = _load(EXP / "fresh7h" / "bench.jsonl")
    xs = {(r["cond"], r["j"]): r["x"] for r in rows if r.get("ok")}
    return [(i, c, j, xs[(c, j)]) for i, (c, j) in enumerate(picks(rows))]


def bench():
    path = HERE / "bench.jsonl"
    done = {(r["cond"], r["j"]) for r in _load(path) if r.get("ok")} if path.exists() else set()
    todo = [jb for jb in jobs() if (jb[1], jb[2]) not in done]
    print(f"{len(todo)} designs to go", flush=True)

    def one(job):
        i, c, j, x = job
        with tempfile.TemporaryDirectory() as td:
            f = os.path.join(td, "sol10.pkl")
            order = ["A", "B1", "B2", "C"] if i % 2 == 0 else ["B1", "B2", "A", "C"]
            st = {m: _run(m, c, x, f) for m in order}
        return dict(cond=c, j=j, x=x, order=order, ok=all(s["ok"] for s in st.values()), stages=st)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], "ok" if r["ok"] else [s.get("error") for s in r["stages"].values()],
                  {m: round(s.get("seconds") or -1, 2) for m, s in r["stages"].items()}, flush=True)


# ---------- report (stdlib) ----------

def design_row(r, ref=None):
    st = r["stages"]
    A, B1, B2, C = st["A"], st["B1"], st["B2"], st["C"]
    row = dict(cond=r["cond"], j=r["j"], set=r["cond"].split("@")[0],
               lost_rel_B=rel(B2["lost_mol"][K1 - 1], A["lost_mol"][K1 - 1]),
               lost_rel_C=rel(C["lost_mol"][K1 - 1], A["lost_mol"][K1 - 1]),
               cap_rel_B=rel(B2["cap_Ah"][K1 - 1], A["cap_Ah"][K1 - 1]),
               lost10_rel=rel(B1["lost_mol"][K0 - 1], A["lost_mol"][K0 - 1]),
               tA=A["seconds"], tB1=B1["seconds"], tB2=B2["seconds"], tC=C["seconds"], tC10=C["t10"],
               load_s=B2.get("load_s"), save_s=B1.get("save_s"), file_mb=B1.get("file_mb"),
               pA=A["proc_s"], pB1=B1["proc_s"], pB2=B2["proc_s"])
    if ref is not None:
        row["lost_rel_7h"] = rel(A["lost_mol"][K1 - 1], ref["lost_mol"][K1 - 1])
    k = costs(row["tA"], row["tB1"], row["tB2"])
    row.update(k or {"b": None, "a_cyc": None, "a_res_cyc": None})
    if k:
        row["a_resC_cyc"] = (row["tC"] - row["tC10"] - (K1 - K0) * k["b"]) / k["b"]
        row["ratio_B"] = (row["tB1"] + row["tB2"]) / row["tA"]
        row["ratio_C"] = row["tC"] / row["tA"]
        kp = costs(row["pA"], row["pB1"], row["pB2"])
        row["a_res_proc_cyc"] = kp["a_res_cyc"] if kp else None
        row["a_proc_cyc"] = kp["a_cyc"] if kp else None
    return row


def verdicts(R):
    lb = [r["lost_rel_B"] for r in R]
    med_lb, max_lb = statistics.median(lb), max(lb)
    ok = [r for r in R if r["b"]]
    a = statistics.median(r["a_cyc"] for r in ok)
    ar = statistics.median(r["a_res_cyc"] for r in ok)
    sv = saving(ar)
    return {
        "H290": dict(median_rel=med_lb, max_rel=max_lb,
                     verdict=verdict(med_lb <= 0.01 and max_lb <= 0.05, not (med_lb <= 0.01 and max_lb <= 0.05))),
        "H291": dict(median_a_cyc=a, median_a_res_cyc=ar, verdict=verdict(ar <= 0.5 * a, ar >= a)),
        "H292": dict(a_res_cyc=ar, saving=sv, breakeven_a_res=breakeven(), verdict=verdict(sv >= 0.15, sv < 0.10)),
    }


def report():
    runs = [r for r in _load(HERE / "bench.jsonl") if r.get("ok")]
    ref = {(r["cond"], r["j"]): r for r in _load(EXP / "fresh7h" / "bench.jsonl") if r.get("ok")}
    R = [design_row(r, ref.get((r["cond"], r["j"]))) for r in runs]
    R.sort(key=lambda r: (SETS.index(r["set"]), r["j"]))
    V = verdicts(R)
    ok = [r for r in R if r["b"]]

    def q(key, rows=ok):
        return quart([r[key] for r in rows if r.get(key) is not None])
    L = ["cell-fidelity milestone 7k: resume a cycle-10 DFN run to cycle 50 (16 designs from the 7h bench,",
         "PyBaMM 26.10.1.1, 3 workers on a shared cloud container; times from Simulation construction to end of solve).",
         "",
         f"{'set':<12}{'j':>4}{'tA':>7}{'tB1':>7}{'tB2':>7}{'tC':>7}{'a/b':>7}{'a_res/b':>9}{'(B1+B2)/A':>11}{'C/A':>6}"
         f"{'dLi B':>10}{'dLi C':>10}"]
    for r in R:
        L.append(f"{r['set']:<12}{r['j']:>4}{r['tA']:>7.2f}{r['tB1']:>7.2f}{r['tB2']:>7.2f}{r['tC']:>7.2f}"
                 + (f"{r['a_cyc']:>7.2f}{r['a_res_cyc']:>9.2f}{r['ratio_B']:>11.3f}{r['ratio_C']:>6.3f}" if r["b"]
                    else f"{'-':>7}{'-':>9}{'-':>11}{'-':>6}")
                 + f"{r['lost_rel_B']:>10.2e}{r['lost_rel_C']:>10.2e}")
    L += ["(dLi: |cycle-50 total lithium lost, resumed - uninterrupted| / uninterrupted; B across processes, C in one)", ""]
    a, ar, arc = q("a_cyc"), q("a_res_cyc"), q("a_resC_cyc")
    L.append(f"fresh fixed cost a/b: median {a[1]:.2f} (IQR {a[0]:.2f} to {a[2]:.2f}); 7j's estimate 5.66")
    L.append(f"resume fixed cost a'/b across processes (load + build + solve): median {ar[1]:.2f} (IQR {ar[0]:.2f} to {ar[2]:.2f})")
    L.append(f"resume fixed cost in one process: median {arc[1]:.2f} (IQR {arc[0]:.2f} to {arc[2]:.2f})")
    pa, pr = q("a_proc_cyc"), q("a_res_proc_cyc")
    L.append(f"with interpreter start and imports (whole process): a/b {pa[1]:.2f}, a'/b {pr[1]:.2f}")
    rb, rc = q("ratio_B"), q("ratio_C")
    L.append(f"(B1 + B2) / A: median {rb[1]:.3f} (IQR {rb[0]:.3f} to {rb[2]:.3f}); C / A: median {rc[1]:.3f}")
    L.append(f"saved cycle-10 solution: median {statistics.median(r['file_mb'] for r in R):.0f} MB, load "
             f"{statistics.median(r['load_s'] for r in R):.2f} s, save {statistics.median(r['save_s'] for r in R):.2f} s")
    if all("lost_rel_7h" in r for r in R):
        L.append(f"A against the 7h bench's x-resolved run, cycle-50 lithium lost: max rel diff "
                 f"{max(r['lost_rel_7h'] for r in R):.2e}")
    L.append(f"cycle-50 discharge capacity, B against A: max rel diff {max(r['cap_rel_B'] for r in R):.2e}")
    L.append(f"designs with b <= 0 (A no slower than B1; timing noise): {len(R) - len(ok)}")
    L.append("")
    h = V["H290"]
    L.append(f"H290 (state carries over): median {h['median_rel']:.2e}, max {h['max_rel']:.2e} -> {h['verdict']}")
    h = V["H291"]
    L.append(f"H291 (no second fixed cost): median a'/b {h['median_a_res_cyc']:.2f} against median a/b "
             f"{h['median_a_cyc']:.2f} -> {h['verdict']}")
    h = V["H292"]
    L.append(f"H292 (continued saving survives): with a'/b = {h['a_res_cyc']:.2f}, triage saves {100 * h['saving']:.1f}% "
             f"of U50's wall time (7j assumed 17.1%; break-even a'/b {h['breakeven_a_res']:.1f}) -> {h['verdict']}")
    own = saving(ar[1], c=a[1])
    scaled = saving(C_FIXED * ar[1] / a[1])
    V["H292"].update(saving_own_units=own, saving_scaled_to_7j=scaled)
    L.append(f"  units check (descriptive, not pre-registered): H292 mixes this bench's per-cycle cost (lean recorder) with 7j's")
    L.append(f"  fixed cost (x-resolved recorder). In this bench's own units (c = {a[1]:.2f}, a' = {ar[1]:.2f}) the saving is "
             f"{100 * own:.1f}%; with a' scaled to 7j's runner (a' = 5.66 x {ar[1] / a[1]:.2f}) it is {100 * scaled:.1f}%")
    sens = [(x, saving(x)) for x in (0, ar[0], ar[1], ar[2], C_FIXED)]
    L.append("saving against a'/b: " + ", ".join(f"{x:.2f} -> {100 * v:.1f}%" for x, v in sens))
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps({"verdicts": V, "rows": R}, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "child":
        c, x = json.loads(sys.argv[3])
        print(json.dumps(child(sys.argv[2], c, x, sys.argv[4])))
    else:
        {"bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "bench"]()
