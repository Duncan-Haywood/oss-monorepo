"""Milestone 5zj: where does Ai2020's unbooked lithium loss go? A lithium ledger of PyBaMM's DFN over ten cycles.

    WORKERS=3 python experiments/ledger/run.py bench    # DFN runs with the full lithium ledger (pybamm; resumable)
    python experiments/ledger/run.py report             # H187 to H190 (stdlib) -> results.txt, summary.json

5z found that on Ai2020 only about 3% of PyBaMM's "Total lithium lost [mol]" by cycle 99 is booked to plating or SEI,
while on Chen2020, OKane2022 and NCA_Kim2011 the booked side reactions are 98.7 to 100% of it; 5zi then found that
Ai2020 is the one set where the separator-surface lever cannot explain the exponent the loss law needs. Every Ai2020
result from 5u on fits that unbooked quantity. This bench re-runs 5z's designs for ten cycles and records, per cycle,
every term of the ledger PyBaMM keeps (lithium in each electrode's particles and in the electrolyte, the booked losses to
SEI, SEI on cracks, plating and loss of active material) next to the charge the side reactions actually pass,
integrated from their volumetric interfacial current densities, so the gap can be placed: in the booking variables,
in a side reaction, or in the numerics. Plan in ../../LOG.md (5zj plan).
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
F_CONST = 96485.33212


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


M = _mod("mechanism_run", EXP / "mechanism" / "run.py")
B = M.B

CYCLES = 10
WORKERS = int(os.environ.get("WORKERS", "3"))
VARIANTS = {"both": {"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"},
            "sei": {"SEI": "solvent-diffusion limited"},
            "plating": {"lithium plating": "irreversible"}}
AI = "Ai2020@0.45x"
CONTROLS = ("Chen2020@1.5x", "OKane2022@1.5x", "NCA_Kim2011@0.875x")
N_CONTROL = 2                       # first two of 5z's picks per control pool
REFINE = 2                          # first two Ai2020 picks re-run on a doubled mesh with tight tolerances
FINE_PTS = {"x_n": 40, "x_s": 40, "x_p": 40, "r_n": 60, "r_p": 60}   # PyBaMM 26.10 defaults are 20, 20, 20, 20, 20
FINE_TOL = 1e-8                     # rtol and atol of the IDAKLU solver (defaults 1e-4 and 1e-6)


# ---------- pure helpers (stdlib; tested) ----------

def rel(a, b):
    """|a - b| / |b|, or None when b is zero."""
    return abs(a - b) / abs(b) if b else None


def ledger_row(r, n=CYCLES):
    """The cycle-n ledger of one run: what left the particles, what the side reactions booked and passed, and the gap."""
    k = n - 1
    lost_p = r["lost_particles"][k]
    booked = r["lost_side"][k]
    passed = r["passed_side"][k]
    return dict(cond=r["cond"], j=r["j"], variant=r["variant"], fine=r.get("fine", False),
                lost_total=r["lost_total"][k], lost_particles=lost_p, lost_electrolyte=r["lost_electrolyte"][k],
                booked=booked, passed=passed, sei=r["sei_mol"][k], sei_cr=r["sei_cr_mol"][k], pl=r["pl_mol"][k],
                lam=r["lam_n_mol"][k] + r["lam_p_mol"][k],
                d_neg=r["neg_mol"][k] - r["neg0"], d_pos=r["pos_mol"][k] - r["pos0"],
                passed_vs_particles=rel(passed, lost_p), passed_vs_booked=rel(passed, booked) if booked else None,
                booked_share=booked / lost_p if lost_p else None,
                neg_share=(r["neg0"] - r["neg_mol"][k]) / lost_p if lost_p else None)


def verdict(ok, bad):
    return "supported" if ok else ("refuted" if bad else "mixed")


def verdicts(rows):
    """rows: ledger_row dicts (cycle 10). Returns the H187 to H190 verdicts and the numbers they rest on."""
    ai = {r["j"]: r for r in rows if r["cond"] == AI and r["variant"] == "both" and not r["fine"]}
    sei = {r["j"]: r for r in rows if r["cond"] == AI and r["variant"] == "sei" and not r["fine"]}
    fine = {r["j"]: r for r in rows if r["cond"] == AI and r["fine"]}
    ctl = [r for r in rows if r["cond"] in CONTROLS and r["variant"] == "both"]
    pv = [ai[j]["passed_vs_particles"] for j in ai]
    pb = [ai[j]["passed_vs_booked"] for j in ai]
    h187 = verdict(bool(pv) and all(x is not None and x <= 0.10 for x in pv),
                   bool(pb) and sum(x is not None and x <= 0.10 for x in pb) * 2 >= len(pb))
    sh = [sei[j]["lost_particles"] / ai[j]["lost_particles"] for j in sei if j in ai and ai[j]["lost_particles"]]
    h188 = verdict(bool(sh) and all(x >= 0.80 for x in sh), any(x < 0.50 for x in sh))
    fc = [rel(fine[j]["lost_particles"], ai[j]["lost_particles"]) for j in fine if j in ai]
    h189 = verdict(bool(fc) and all(x < 0.05 for x in fc), any(x > 0.20 for x in fc))
    cg = [abs(1 - r["booked_share"]) for r in ctl if r["booked_share"] is not None]
    h190 = verdict(bool(cg) and all(x <= 0.05 for x in cg), any(x > 0.20 for x in cg))
    return dict(H187=h187, H188=h188, H189=h189, H190=h190), dict(passed_vs_particles=pv, passed_vs_booked=pb,
                                                                  sei_share=sh, fine_change=fc, control_gap=cg)


# ---------- pybamm ----------

def simulate(job):
    import numpy as np
    import pybamm
    fc = B._fc()
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    c, j, x, variant, fine = job
    s, rate = fc.G._parse(c)
    x = cell.clip(x)
    S, TR = fc.P._sand(), fc.G.TR
    _, _, _, _, cur = S.geometry(x, s, rate)
    pv, _, _ = TR.params(x, s)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    area = TR.area_parallel(pv)
    L_n = pv["Negative electrode thickness [m]"]
    out = dict(cond=c, j=j, x=list(map(float, x)), variant=variant, fine=fine, current_A=cur, ok=True, error=None)
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")] * CYCLES)
    model = pybamm.lithium_ion.DFN(VARIANTS[variant])
    kw = dict(parameter_values=pv, experiment=exp)
    if fine:
        kw.update(var_pts=FINE_PTS, solver=pybamm.IDAKLUSolver(rtol=FINE_TOL, atol=FINE_TOL))
    t0 = time.perf_counter()
    side_keys = ("X-averaged negative electrode SEI volumetric interfacial current density [A.m-3]",
                 "X-averaged negative electrode SEI on cracks volumetric interfacial current density [A.m-3]",
                 "X-averaged negative electrode lithium plating volumetric interfacial current density [A.m-3]")
    try:
        sol = pybamm.Simulation(model, **kw).solve(initial_soc=1.0)
        first = sol.cycles[0].steps[0]
        out["neg0"] = float(first["Total lithium in negative electrode [mol]"].entries[0])
        out["pos0"] = float(first["Total lithium in positive electrode [mol]"].entries[0])
        out["elyte0"] = float(first["Total lithium in electrolyte [mol]"].entries[0])
        rec = {k: [] for k in ("lost_total", "lost_particles", "lost_electrolyte", "lost_side", "sei_mol", "sei_cr_mol",
                               "pl_mol", "lam_n_mol", "lam_p_mol", "neg_mol", "pos_mol", "elyte_mol", "passed_side",
                               "passed_sei", "passed_pl")}
        q_sei = q_pl = 0.0
        for cy in sol.cycles:
            for st in cy.steps:
                t = st["Time [s]"].entries
                sei_i = st[side_keys[0]].entries + st[side_keys[1]].entries
                pl_i = st[side_keys[2]].entries
                # volumetric current [A m-3] * thickness * area / F = mol s-1 of lithium; cathodic (negative) = consumed
                q_sei += -float(np.trapezoid(sei_i, t)) * L_n * area / F_CONST
                q_pl += -float(np.trapezoid(pl_i, t)) * L_n * area / F_CONST
            g = lambda key: float(cy[key].entries[-1])
            rec["lost_total"].append(g("Total lithium lost [mol]"))
            rec["lost_particles"].append(g("Total lithium lost from particles [mol]"))
            rec["lost_electrolyte"].append(g("Total lithium lost from electrolyte [mol]"))
            rec["lost_side"].append(g("Total lithium lost to side reactions [mol]"))
            rec["sei_mol"].append(g("Loss of lithium to negative SEI [mol]"))
            rec["sei_cr_mol"].append(g("Loss of lithium to negative SEI on cracks [mol]"))
            rec["pl_mol"].append(g("Loss of lithium to negative lithium plating [mol]"))
            rec["lam_n_mol"].append(g("Loss of lithium due to loss of active material in negative electrode [mol]"))
            rec["lam_p_mol"].append(g("Loss of lithium due to loss of active material in positive electrode [mol]"))
            rec["neg_mol"].append(g("Total lithium in negative electrode [mol]"))
            rec["pos_mol"].append(g("Total lithium in positive electrode [mol]"))
            rec["elyte_mol"].append(g("Total lithium in electrolyte [mol]"))
            rec["passed_sei"].append(q_sei)
            rec["passed_pl"].append(q_pl)
            rec["passed_side"].append(q_sei + q_pl)
        out.update(rec, ok_cycles=len(sol.cycles))
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}")
    out["seconds"] = time.perf_counter() - t0
    return out


def jobs():
    """5z's designs: all eight Ai2020@0.45x picks in three variants, two of them refined, and two per control pool."""
    J = []
    for d, c, k in M.POOLS:
        rows = {r["j"]: r for r in B._load(EXP / d / "bench.jsonl") if r["cond"] == c and r.get("ok")}
        picks = [j for j in M.picks(64, k) if j in rows]
        if c == AI:
            for j in picks:
                J += [(c, j, rows[j]["x"], v, False) for v in VARIANTS]
            J += [(c, j, rows[j]["x"], "both", True) for j in picks[:REFINE]]
        elif c in CONTROLS:
            J += [(c, j, rows[j]["x"], "both", False) for j in picks[:N_CONTROL]]
    return J


def bench():
    path = HERE / "bench.jsonl"
    done = {(r["cond"], r["j"], r["variant"], r["fine"]) for r in B._load(path)}
    todo = [jb for jb in jobs() if (jb[0], jb[1], jb[3], jb[4]) not in done]
    print(f"{len(todo)} runs to go", flush=True)

    def one(job):
        c, j, x, v, f = job
        try:
            p = subprocess.run([sys.executable, __file__, "child", json.dumps(list(job))], capture_output=True,
                               text=True, timeout=2400)
            if p.returncode == 0 and p.stdout.strip():
                return json.loads(p.stdout.strip().splitlines()[-1])
            err = f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
        except subprocess.TimeoutExpired:
            err = "timeout 2400s"
        return dict(cond=c, j=j, x=x, variant=v, fine=f, ok=False, error=err, seconds=None)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], r["variant"], r["fine"], "ok" if r["ok"] else r["error"], r.get("seconds"),
                  flush=True)


# ---------- report (stdlib) ----------

def report():
    runs = [r for r in B._load(HERE / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= CYCLES]
    rows = [ledger_row(r) for r in runs]
    V, N = verdicts(rows)
    groups = {}
    for r in rows:
        groups.setdefault((r["cond"], r["variant"], r["fine"]), []).append(r)
    med = lambda xs: statistics.median(xs) if xs else float("nan")
    L = ["cell-fidelity milestone 5zj: where does Ai2020's unbooked lithium loss go? PyBaMM DFN lithium ledger at cycle "
         f"{CYCLES}", "(medians over designs, mmol; passed = charge the negative side reactions pass / F; booked = PyBaMM's"
         " 'Total lithium lost to side reactions')", "",
         f"{'condition':20s}{'variant':>8s}{'fine':>5s}{'n':>3s}{'lost':>8s}{'partcl':>8s}{'elyte':>8s}{'booked':>8s}"
         f"{'passed':>8s}{'SEI':>8s}{'plat':>8s}{'dneg':>8s}{'dpos':>8s}{'bk/pt':>7s}{'neg/pt':>7s}"]
    G = {}
    for (c, v, f), rs in sorted(groups.items(), key=lambda kv: (kv[0][0] != AI, kv[0])):
        d = {k: med([r[k] for r in rs if r[k] is not None]) for k in
             ("lost_total", "lost_particles", "lost_electrolyte", "booked", "passed", "sei", "pl", "d_neg", "d_pos",
              "booked_share", "neg_share")}
        G[f"{c}|{v}|{'fine' if f else 'base'}"] = dict(n=len(rs), **d)
        m = lambda k: 1e3 * d[k]
        L.append(f"{c:20s}{v:>8s}{'yes' if f else '':>5s}{len(rs):3d}{m('lost_total'):8.3f}{m('lost_particles'):8.3f}"
                 f"{m('lost_electrolyte'):8.3f}{m('booked'):8.3f}{m('passed'):8.3f}{m('sei'):8.3f}{m('pl'):8.3f}"
                 f"{m('d_neg'):8.3f}{m('d_pos'):8.3f}{d['booked_share']:7.3f}{d['neg_share']:7.3f}")
    L += ["", f"H187 (the side reactions pass the charge that leaves the particles, within 10%, on every Ai2020 design;"
              f" so the booking variables under-count): {V['H187']}",
          f"H188 (SEI alone accounts for at least 80% of the Ai2020 particle loss on every design): {V['H188']}",
          f"H189 (not numerical: a doubled mesh and 1e-8 tolerances change the Ai2020 particle loss by under 5%):"
          f" {V['H189']}",
          f"H190 (on the control sets the booked side reactions are within 5% of the particle loss): {V['H190']}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(groups=G, verdicts=V, numbers=N, rows=rows), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "child":
        print(json.dumps(simulate(json.loads(sys.argv[2]))))
    else:
        {"bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
