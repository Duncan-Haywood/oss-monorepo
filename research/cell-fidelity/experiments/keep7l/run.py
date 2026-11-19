"""Milestone 7l: does a DFN runner that keeps the built model alive make the cycle-10 triage look free?

    WORKERS=3 python experiments/keep7l/run.py bench   # per design A, D, E (pybamm; resumable)
    python experiments/keep7l/run.py report            # H293 to H296 (stdlib) -> results.txt, summary.json

7k found that resuming a cycle-10 DFN run through PyBaMM's public `starting_solution` path rebuilds the model and
pays the fixed cost again (13.4 cycle equivalents against 11.8 fresh), which wipes out the triage rule's wall-time
saving. This bench keeps one `Simulation` alive and extends it in place. Per design, each in its own process:
A, a fresh 50-cycle experiment (as 7k's A); D, a 10-cycle experiment solved once (the triage look), then the same
`Simulation` solved four more times from its own last solution (cycles 11 to 50); E, a 1-cycle experiment solved 50
times in a chain (a runner that can stop after any cycle). Same 16 designs, model, parameters and lean recorder as
7k. Plan in ../../LOG.md.
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


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


R7K = _mod("resume7k_run", EXP / "resume7k" / "run.py")
K0, K1 = R7K.K0, R7K.K1
SETS = R7K.SETS
WORKERS = int(os.environ.get("WORKERS", "3"))
saving, breakeven, rel, verdict, quart = R7K.saving, R7K.breakeven, R7K.rel, R7K.verdict, R7K.quart


def _load(path):
    with open(path) as fh:
        return [json.loads(l) for l in fh if l.strip()]


# ---------- pure helpers (stdlib; tested) ----------

def costs(tA, tX10, tX):
    """Per-cycle cost b, fresh fixed cost a, and the extra cost of extending in place, x = (tX - tA) / b, in cycles.

    tX10 is the runner's time to the end of cycle 10 (model built and solved once), tX its time to cycle 50."""
    b = (tA - tX10) / (K1 - K0)
    if b <= 0:
        return None
    return {"b": b, "a_cyc": (tX10 - K0 * b) / b, "x_cyc": (tX - tA) / b}


def own_saving(x, a):
    """Triage wall-time saving against U50 in this bench's own units: fixed cost c = a, resume cost x."""
    return saving(x, c=a)


# ---------- pybamm ----------

def child(mode, c, x):
    """One stage in its own process. mode: A (1-50 fresh), D (10 then 4 x 10 in place), E (50 x 1 in place)."""
    t_proc = time.perf_counter()
    import pybamm
    pybamm.set_logging_level("ERROR")
    B, pv, cur = R7K._setup(c, x)
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
        else:
            chunk = K0 if mode == "D" else 1
            s = sim(chunk)
            sol = s.solve(initial_soc=1.0)
            calls = [time.perf_counter() - t0]
            while len(sol.cycles) < K1:
                sol = s.solve(starting_solution=sol)
                calls.append(time.perf_counter() - t0)
            out["t10"] = calls[K0 // chunk - 1]
            out["calls"] = calls
        out["seconds"] = time.perf_counter() - t0
        out["lost_mol"], out["cap_Ah"] = R7K._record(sol)
        out["ok_cycles"] = len(sol.cycles)
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}", seconds=time.perf_counter() - t0)
    out["proc_s"] = time.perf_counter() - t_proc
    return out


def _run(mode, c, x):
    t = time.perf_counter()
    p = subprocess.run([sys.executable, __file__, "child", mode, json.dumps([c, x])], capture_output=True, text=True,
                       timeout=2400)
    wall = time.perf_counter() - t
    if p.returncode == 0 and p.stdout.strip():
        r = json.loads(p.stdout.strip().splitlines()[-1])
    else:
        r = dict(mode=mode, ok=False, error=f"exit {p.returncode}: {p.stderr.strip()[-160:]}")
    r["wall_s"] = wall
    return r


def order(i):
    """Stage order, rotated by design so no stage always runs first on a busy container."""
    base = ["A", "D", "E"]
    return base[i % 3:] + base[:i % 3]


def bench():
    path = HERE / "bench.jsonl"
    done = {(r["cond"], r["j"]) for r in _load(path) if r.get("ok")} if path.exists() else set()
    todo = [jb for jb in R7K.jobs() if (jb[1], jb[2]) not in done]
    print(f"{len(todo)} designs to go", flush=True)

    def one(job):
        i, c, j, x = job
        st = {m: _run(m, c, x) for m in order(i)}
        return dict(cond=c, j=j, x=x, order=order(i), ok=all(s["ok"] for s in st.values()), stages=st)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], "ok" if r["ok"] else [s.get("error") for s in r["stages"].values()],
                  {m: round(s.get("seconds") or -1, 2) for m, s in r["stages"].items()}, flush=True)


# ---------- report (stdlib) ----------

def design_row(r, ref=None):
    st = r["stages"]
    A, D, E = st["A"], st["D"], st["E"]
    row = dict(cond=r["cond"], j=r["j"], set=r["cond"].split("@")[0],
               lost_rel_D=rel(D["lost_mol"][K1 - 1], A["lost_mol"][K1 - 1]),
               lost_rel_E=rel(E["lost_mol"][K1 - 1], A["lost_mol"][K1 - 1]),
               cap_rel_D=rel(D["cap_Ah"][K1 - 1], A["cap_Ah"][K1 - 1]),
               tA=A["seconds"], tD=D["seconds"], tD10=D["t10"], tE=E["seconds"], tE10=E["t10"],
               pA=A["proc_s"], pD=D["proc_s"], pE=E["proc_s"])
    if ref is not None:
        row["lost_rel_7k"] = rel(A["lost_mol"][K1 - 1], ref["stages"]["A"]["lost_mol"][K1 - 1])
        row["tA_7k"] = ref["stages"]["A"]["seconds"]
    k = costs(row["tA"], row["tD10"], row["tD"])
    row.update({"b": k["b"], "a_cyc": k["a_cyc"], "xD_cyc": k["x_cyc"]} if k else {"b": None, "a_cyc": None, "xD_cyc": None})
    if k:
        row["xE_cyc"] = (row["tE"] - row["tA"]) / k["b"]
        row["xE_per_call"] = row["xE_cyc"] / (K1 - 1)
        row["ratio_D"] = row["tD"] / row["tA"]
        row["ratio_E"] = row["tE"] / row["tA"]
    return row


def verdicts(R):
    ld = [r["lost_rel_D"] for r in R] + [r["lost_rel_E"] for r in R]
    med, mx = statistics.median(ld), max(ld)
    ok = [r for r in R if r["b"]]
    a = statistics.median(r["a_cyc"] for r in ok)
    xd = statistics.median(r["xD_cyc"] for r in ok)
    xe = statistics.median(r["xE_cyc"] for r in ok)
    sv = own_saving(max(xd, 0.0), a)
    return {
        "H293": dict(median_rel=med, max_rel=mx, verdict=verdict(med <= 0.01 and mx <= 0.05, not (med <= 0.01 and mx <= 0.05))),
        "H294": dict(median_a_cyc=a, median_xD_cyc=xd, verdict=verdict(xd <= 0.5 * a, xd >= a)),
        "H295": dict(a_cyc=a, xD_cyc=xd, saving=sv, ceiling=own_saving(0.0, a), verdict=verdict(sv >= 0.12, sv < 0.08)),
        "H296": dict(median_xE_cyc=xe, median_a_cyc=a, verdict=verdict(xe <= a, xe > a)),
    }


def report():
    runs = [r for r in _load(HERE / "bench.jsonl") if r.get("ok")]
    ref = {(r["cond"], r["j"]): r for r in _load(EXP / "resume7k" / "bench.jsonl") if r.get("ok")}
    R = [design_row(r, ref.get((r["cond"], r["j"]))) for r in runs]
    R.sort(key=lambda r: (SETS.index(r["set"]), r["j"]))
    V = verdicts(R)
    ok = [r for r in R if r["b"]]

    def q(key, rows=ok):
        return quart([r[key] for r in rows if r.get(key) is not None])
    L = ["cell-fidelity milestone 7l: keep the built DFN model alive between the cycle-10 look and the extension",
         "(16 designs, 7k's picks from the 7h bench; PyBaMM 26.10.1.1, 3 workers on a shared cloud container;",
         "times from Simulation construction to end of the last solve).",
         "",
         f"{'set':<12}{'j':>4}{'tA':>7}{'tD10':>7}{'tD':>7}{'tE':>7}{'a/b':>7}{'xD/b':>7}{'xE/b':>7}{'D/A':>7}{'E/A':>7}"
         f"{'dLi D':>10}{'dLi E':>10}"]
    for r in R:
        L.append(f"{r['set']:<12}{r['j']:>4}{r['tA']:>7.2f}{r['tD10']:>7.2f}{r['tD']:>7.2f}{r['tE']:>7.2f}"
                 + (f"{r['a_cyc']:>7.2f}{r['xD_cyc']:>7.2f}{r['xE_cyc']:>7.2f}{r['ratio_D']:>7.3f}{r['ratio_E']:>7.3f}"
                    if r["b"] else f"{'-':>7}" * 5)
                 + f"{r['lost_rel_D']:>10.2e}{r['lost_rel_E']:>10.2e}")
    L += ["(xD, xE: extra cost of reaching cycle 50 through the in-place runner rather than one 50-cycle experiment,",
          " in cycles of b = (tA - tD10) / 40; dLi: |cycle-50 total lithium lost - A's| / A's)", ""]
    a, xd, xe, xc = q("a_cyc"), q("xD_cyc"), q("xE_cyc"), q("xE_per_call")
    L.append(f"fresh fixed cost a/b: median {a[1]:.2f} (IQR {a[0]:.2f} to {a[2]:.2f}); 7k 11.79, 7j 5.66")
    L.append(f"extend in place, 10-cycle chunks (D): extra cost median {xd[1]:.2f} cycles (IQR {xd[0]:.2f} to {xd[2]:.2f})")
    L.append(f"extend in place, 1-cycle chunks (E): extra cost median {xe[1]:.2f} cycles (IQR {xe[0]:.2f} to {xe[2]:.2f}), "
             f"{xc[1]:.3f} per extra solve call")
    rd, re_ = q("ratio_D"), q("ratio_E")
    L.append(f"D / A: median {rd[1]:.3f} (IQR {rd[0]:.3f} to {rd[2]:.3f}); E / A: median {re_[1]:.3f} "
             f"(IQR {re_[0]:.3f} to {re_[2]:.3f}); 7k's restart-from-file (B1 + B2) / A was 1.221")
    if all("lost_rel_7k" in r for r in R):
        L.append(f"A against 7k's A, cycle-50 lithium lost: max rel diff {max(r['lost_rel_7k'] for r in R):.2e}; "
                 f"tA / tA(7k) median {statistics.median(r['tA'] / r['tA_7k'] for r in R):.3f}")
    L.append(f"cycle-50 discharge capacity, D against A: max rel diff {max(r['cap_rel_D'] for r in R):.2e}")
    L.append(f"designs with b <= 0 (timing noise): {len(R) - len(ok)}")
    L.append("")
    h = V["H293"]
    L.append(f"H293 (state carries over in place, D and E): median {h['median_rel']:.2e}, max {h['max_rel']:.2e} -> {h['verdict']}")
    h = V["H294"]
    L.append(f"H294 (no second fixed cost): median xD/b {h['median_xD_cyc']:.2f} against median a/b {h['median_a_cyc']:.2f}"
             f" -> {h['verdict']}")
    h = V["H295"]
    L.append(f"H295 (continued saving, own units): c = {h['a_cyc']:.2f}, x = {h['xD_cyc']:.2f} (floored at 0) -> "
             f"{100 * h['saving']:.1f}% of U50's wall time (ceiling at x = 0: {100 * h['ceiling']:.1f}%) -> {h['verdict']}")
    h = V["H296"]
    L.append(f"H296 (cycle-by-cycle runner cheaper than one restart): median xE/b {h['median_xE_cyc']:.2f} against a/b "
             f"{h['median_a_cyc']:.2f} -> {h['verdict']}")
    s7j = saving(max(xd[1], 0.0) * R7K.C_FIXED / a[1])
    V["H295"]["saving_scaled_to_7j"] = s7j
    L.append(f"  descriptive: with x scaled to 7j's runner (c = 5.66) the saving is {100 * s7j:.1f}% (7j's continue column 17.1%)")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps({"verdicts": V, "rows": R}, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "child":
        c, x = json.loads(sys.argv[3])
        print(json.dumps(child(sys.argv[2], c, x)))
    else:
        {"bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "bench"]()
