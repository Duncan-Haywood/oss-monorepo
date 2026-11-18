"""Milestone 5zc: does 5zb's kinetic law forecast the 100-cycle lithium loss better on LG M50 when the charge time is read
from the loaded charge capacity, measured in the design's own first ten cycles, instead of the open-circuit capacity?

    WORKERS=3 python experiments/loaded/run.py dev      # 5zb's 128 seen designs re-run to cycle 10 for the charge Ah,
                                                        # scored against 5zb's committed 100-cycle curves (pybamm)
    python experiments/loaded/run.py devreport          # the plan's dev table (stdlib) -> dev.txt
    python experiments/loaded/run.py tables             # balance tables of the fresh designs (pybamm, no simulation)
    WORKERS=3 python experiments/loaded/run.py bench    # DFN (SEI + plating) to cycle 100, charge Ah recorded (resumable)
    python experiments/loaded/run.py report             # H152 to H156 (stdlib) -> results.txt, summary.json

5zb: dL/dn = r0 (Q(L)/Q(0)) exp(-kappa dU(L)), Q the open-circuit capacity between the cut-offs, so
R_Q = int exp(kappa dU) Q(0)/Q(l) dl is a line in n. 5zb's post hoc: on LG M50 the loaded capacity shrinks faster than Q.
Here the charge ends when the open-circuit voltage is eta short of the cut-off (and the discharge ends eta above the lower
cut-off): Q_eta(L) is the open-circuit capacity between vlo + eta and vhi - eta, with eta solved per cycle from the
measured charge Ah of cycles 2..10 and averaged. Nothing else changes from 5zb. Plan in ../../LOG.md (5zc plan).
"""
import importlib.util
import json
import math
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
    spec.loader.exec_module(m)
    return m


KN = _mod("kinetic_run", EXP / "kinetic" / "run.py")
SF, RL, D, FL, S, B = KN.SF, KN.RL, KN.D, KN.FL, KN.S, KN.B
K, TO, KAPPA, NGRID = KN.K, KN.TO, KN.KAPPA, KN.NGRID
spearman, line_fit, log_err = KN.spearman, KN.line_fit, KN.log_err

CYCLES = TO
WORKERS = int(os.environ.get("WORKERS", "3"))
SOBOL_SEED = 21        # used by no milestone (5zb used 20)
N_LOG2 = 5             # 32 designs per pool
# fixed before any run: one current per set that no milestone has used, inside each set's dev range
CONDITIONS = ("Ai2020@0.525x", "NCA_Kim2011@0.6875x", "Chen2020@1.375x", "OKane2022@1.375x")
CONTROLS, LGM50 = CONDITIONS[:2], CONDITIONS[2:]


# ---------- pure helpers (stdlib; tested) ----------

def cap_eta(n_li, b, eta):
    """Open-circuit capacity (Ah) between OCV = vlo + eta and OCV = vhi - eta with n_li mol of cyclable lithium."""
    if eta <= 0:
        return KN.cap(n_li, b)
    if 2 * eta >= b["vhi"] - b["vlo"]:
        return 0.0
    return KN.cap(n_li, dict(b, vlo=b["vlo"] + eta, vhi=b["vhi"] - eta))


def solve_eta(n_li, b, q, it=50):
    """eta >= 0 with cap_eta(n_li, b, eta) = q (bisection; capacity falls with eta). 0 when q is at least the
    open-circuit capacity."""
    if q >= KN.cap(n_li, b):
        return 0.0
    lo, hi = 0.0, 0.5 * (b["vhi"] - b["vlo"])
    for _ in range(it):
        mid = 0.5 * (lo + hi)
        if cap_eta(n_li, b, mid) > q:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def eta_of(q_ch, lost, b, k=K):
    """eta: mean over cycles 2..k of the eta that puts the open-circuit window at the measured charge Ah of cycle n,
    with the lithium left at the end of that cycle (as 5za's offset)."""
    return statistics.mean(solve_eta(b["n_li"] - lost[n - 1], b, q_ch[n - 1]) for n in range(2, k + 1))


def rq_table(b, l_max, eta, delta=0.0, kappa=KAPPA, n=NGRID):
    """(L, R) with R(L) = int_0^L exp(kappa dU(l)) Q_eta(0)/Q_eta(l) dl; eta = 0 is 5zb's R_Q."""
    ls = [l_max * i / n for i in range(n + 1)]
    q0 = cap_eta(b["n_li"], b, eta)
    gs = []
    for l in ls:
        q = cap_eta(b["n_li"] - l, b, eta)
        gs.append(math.exp(kappa * SF.du_surf(l, b, delta)) * (q0 / q if q > 0 else 1e9))
    rs = [0.0]
    for i in range(1, n + 1):
        rs.append(rs[-1] + 0.5 * (gs[i] + gs[i - 1]) * (ls[i] - ls[i - 1]))
    return ls, rs


def loaded_loss(lost, b, eta, delta=0.0, k=K, to=TO):
    """L(to-1): a line through R at cycles 2..k, read at cycle to-1, inverted (5zb's kinetic_loss with Q_eta)."""
    if lost[k - 1] <= 0:
        return None
    tab = rq_table(b, min(0.95 * b["n_li"], 30 * lost[k - 1]), eta, delta)
    rk = [B.interp(tab[0], tab[1], lost[m - 1]) for m in range(2, k + 1)]
    a, s = line_fit(list(range(2, k + 1)), rk)
    return D.l_of_r(tab, a + s * (to - 1))


def row(b, lost, q_ch, xs_end, l_true):
    eta = eta_of(q_ch, lost, b)
    delta = SF.offset(xs_end, lost, b)
    return dict(l_true=l_true, n_li=b["n_li"], eta=eta, delta=delta,
                l_q=KN.kinetic_loss(lost, b), l_e=loaded_loss(lost, b, eta),
                l_es=loaded_loss(lost, b, eta, delta), l_rp=RL.rlaw_loss(lost, b))


def summarise(rows):
    ok = [r for r in rows if r["l_q"] and r["l_e"] and r["l_rp"]]
    med = lambda k: statistics.median(abs(log_err(r[k], r["l_true"])) for r in ok)
    sgn = lambda k: statistics.median(log_err(r[k], r["l_true"]) for r in ok)
    return dict(n=len(ok), lerr_q=med("l_q"), lerr_e=med("l_e"), lerr_es=med("l_es"), lerr_rp=med("l_rp"),
                sgn_q=sgn("l_q"), sgn_e=sgn("l_e"), sgn_es=sgn("l_es"), sgn_rp=sgn("l_rp"),
                wins=sum(abs(log_err(r["l_e"], r["l_true"])) < abs(log_err(r["l_q"], r["l_true"])) for r in ok),
                rhoL_e=spearman([r["l_e"] for r in ok], [r["l_true"] for r in ok]),
                eta_mV=1000 * statistics.median(r["eta"] for r in ok))


# ---------- pybamm ----------

def simulate(job):
    """5za's simulate, unchanged, plus the charge and discharge Ah of every cycle."""
    import numpy as np
    import pybamm
    fc = B._fc()
    from energy_cell import cell
    pybamm.set_logging_level("ERROR")
    c, j, x = job
    s, rate = fc.G._parse(c)
    x = cell.clip(x)
    S_, TR = fc.P._sand(), fc.G.TR
    _, _, _, _, cur = S_.geometry(x, s, rate)
    pv, _, _ = TR.params(x, s)
    vlo, vhi = pv["Lower voltage cut-off [V]"], pv["Upper voltage cut-off [V]"]
    out = dict(cond=c, j=j, x=list(map(float, x)), current_A=cur, ok=True, error=None)
    exp = pybamm.Experiment([(f"Discharge at {cur:.6g} A until {vlo} V", f"Charge at {cur:.6g} A until {vhi} V")] * CYCLES)
    t0 = time.perf_counter()
    try:
        sol = pybamm.Simulation(pybamm.lithium_ion.DFN(B.VARIANTS["both"]), parameter_values=pv,
                                experiment=exp).solve(initial_soc=1.0)
        rec = {k: [] for k in ("cycle_wh", "lost_mol", "pl_mol", "sei_mol", "xs_end", "u_end", "q_ch", "q_dis")}
        for cy in sol.cycles:
            d, ch = cy.steps[0], cy.steps[1]
            i, t = d["Current [A]"].entries, d["Time [s]"].entries
            rec["cycle_wh"].append(float(np.trapezoid(d["Terminal voltage [V]"].entries * i, t)) / 3600)
            rec["q_dis"].append(float(np.trapezoid(i, t)) / 3600)
            rec["q_ch"].append(float(-np.trapezoid(ch["Current [A]"].entries, ch["Time [s]"].entries)) / 3600)
            rec["lost_mol"].append(float(cy["Total lithium lost [mol]"].entries[-1]))
            rec["pl_mol"].append(float(cy["Loss of lithium to negative lithium plating [mol]"].entries[-1]))
            rec["sei_mol"].append(float(cy["Loss of lithium to negative SEI [mol]"].entries[-1]))
            rec["xs_end"].append(float(ch["Negative particle surface stoichiometry"].entries[-1, -1]))   # separator node
            rec["u_end"].append(float(ch["Negative electrode open-circuit potential [V]"].entries[-1, -1]))
        out.update(rec, ok_cycles=len(sol.cycles),
                   n_parallel=float(pv["Number of electrodes connected in parallel to make a cell"]))
    except Exception as ex:
        out.update(ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}")
    out["seconds"] = time.perf_counter() - t0
    return out


def _run(todo, path, cycles, timeout=2400):
    def one(job):
        c, j, x = job
        try:
            p = subprocess.run([sys.executable, __file__, "child", json.dumps([c, j, x]), str(cycles)],
                               capture_output=True, text=True, timeout=timeout)
            if p.returncode == 0 and p.stdout.strip():
                return json.loads(p.stdout.strip().splitlines()[-1])
            err = f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
        except subprocess.TimeoutExpired:
            err = f"timeout {timeout}s"
        return dict(cond=c, j=j, x=x, ok=False, error=err, seconds=None)
    print(f"{len(todo)} runs to go", flush=True)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], "ok" if r["ok"] else r["error"], r.get("seconds"), flush=True)


def _todo(path, rows):
    # a run the kernel killed for memory (exit -9) is retried; readers keep the last record per design
    done = {(r["cond"], r["j"]) for r in B._load(path)
            if not str(r.get("error") or "").startswith("exit -9")} if path.exists() else set()
    return [(r["cond"], r["j"], r["x"]) for r in rows if (r["cond"], r["j"]) not in done]


def tables():
    FL.HERE, FL.SOBOL_SEED, FL.CONDITIONS, FL.N_LOG2 = HERE, SOBOL_SEED, CONDITIONS, N_LOG2
    FL.tables()


def bench():
    path = HERE / "bench.jsonl"
    _run(_todo(path, B._load(HERE / "balance.jsonl")), path, TO)


# ---------- dev (seen: 5zb's pools) ----------

def dev():
    path = HERE / "dev.jsonl"
    _run(_todo(path, B._load(EXP / "kinetic" / "balance.jsonl")), path, K)


def _pools(d, runs, short, conds):
    bal, ocp = SF._bal(d)
    C, Rows, dropped = {}, {}, {}
    for c in conds:
        rows = []
        for (cc, j), f in sorted(runs.items()):
            if cc != c:
                continue
            s = short.get((c, j), f)
            if not f.get("ok") or f.get("ok_cycles", 0) < TO or not s.get("ok") or len(s.get("q_ch", [])) < K:
                dropped[c] = dropped.get(c, 0) + 1
                continue
            b = dict(bal[(c, j)]) | dict(g=ocp["grid"]) | ocp["sets"][bal[(c, j)]["pset"]]
            lost = f["lost_mol"]
            r = row(b, lost, s["q_ch"], f["xs_end"], lost[TO - 2]) | dict(j=j)
            if "q_ch" in f:     # fresh bench: the model's own check, predicted against measured charge Ah at cycle 99
                q99 = cap_eta(b["n_li"] - lost[TO - 2], b, r["eta"])
                r |= dict(q_err=log_err(q99, f["q_ch"][TO - 2]) if q99 > 0 else None,
                          q_err_oc=log_err(KN.cap(b["n_li"] - lost[TO - 2], b), f["q_ch"][TO - 2]),
                          eta99=solve_eta(b["n_li"] - lost[TO - 2], b, f["q_ch"][TO - 2]))
            rows.append(r)
        if rows:
            C[c] = summarise(rows) | dict(dropped=dropped.get(c, 0))
            qs = [r for r in rows if r.get("q_err") is not None]
            if qs:
                C[c] |= dict(q_err=statistics.median(abs(r["q_err"]) for r in qs),
                             q_err_oc=statistics.median(abs(r["q_err_oc"]) for r in qs),
                             eta99_mV=1000 * statistics.median(r["eta99"] for r in qs))
            Rows[c] = rows
    return C, Rows


def _table(C, head):
    L = head + ["", f"{'condition':22s}{'n':>3s}{'drop':>5s}{'5y':>7s}{'5zb':>7s}{'load':>7s}{'sgn 5zb':>8s}{'sgn ld':>7s}"
                    f"{'wins':>6s}{'rhoL':>7s}{'ld+s':>7s}{'sgn ls':>8s}{'eta mV':>8s}"]
    for c, d in C.items():
        L.append(f"{c:22s}{d['n']:3d}{d['dropped']:5d}{d['lerr_rp']:7.3f}{d['lerr_q']:7.3f}{d['lerr_e']:7.3f}"
                 f"{d['sgn_q']:+8.3f}{d['sgn_e']:+7.3f}{d['wins']:6d}{d['rhoL_e']:7.3f}{d['lerr_es']:7.3f}"
                 f"{d['sgn_es']:+8.3f}{d['eta_mV']:8.1f}")
    return L


def devreport():
    runs = {(r["cond"], r["j"]): r for r in B._load(EXP / "kinetic" / "bench.jsonl")}
    short = {(r["cond"], r["j"]): r for r in B._load(HERE / "dev.jsonl")}
    C, _ = _pools(EXP / "kinetic", runs, short, KN.CONDITIONS)
    L = _table(C, ["cell-fidelity milestone 5zc dev (seen): 5zb's 128 designs, charge Ah from a 10-cycle re-run, scored",
                   "against 5zb's committed 100-cycle curves; median |ln(L_pred(99) / L_DFN(99))|"])
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


# ---------- report ----------

def verdicts(C):
    ctl = [C[c] for c in CONTROLS if c in C]
    lg = [C[c] for c in LGM50 if c in C]
    allp = ctl + lg
    w152 = sum(c["lerr_e"] < c["lerr_q"] for c in lg)
    worse = [c["lerr_e"] - c["lerr_q"] for c in ctl]
    worst_e, worst_q = max(c["lerr_e"] for c in allp), max(c["lerr_q"] for c in allp)
    return dict(H152=S.verdict(w152 == len(lg), w152 == 0), H152_wins=w152,
                H153=S.verdict(all(c["lerr_e"] <= 0.15 for c in lg), any(c["lerr_e"] > 0.22 for c in lg)),
                H154=S.verdict(all(w <= 0.02 for w in worse), any(w > 0.05 for w in worse)),
                H155=S.verdict(worst_e < worst_q, worst_e >= worst_q), worst_e=worst_e, worst_q=worst_q,
                H156=S.verdict(all(c["q_err"] <= 0.05 for c in allp), any(c["q_err"] > 0.10 for c in allp)))


def report():
    runs = {(r["cond"], r["j"]): r for r in B._load(HERE / "bench.jsonl")}
    C, Rows = _pools(HERE, runs, {}, CONDITIONS)
    V = verdicts(C)
    L = _table(C, ["cell-fidelity milestone 5zc: 5zb's kinetic law with the loaded charge capacity (eta short of each",
                   "cut-off, eta from the measured charge Ah of cycles 2 to 10) against 5zb (open-circuit Q) and 5y.",
                   f"DFN (SEI + plating) to cycle 100, fresh Sobol designs (seed {SOBOL_SEED}); median |ln(L_pred(99) / L_DFN(99))|"])
    L += ["", f"{'condition':22s}{'Qch err eta':>12s}{'Qch err oc':>11s}{'eta99 mV':>9s}"]
    for c, d in C.items():
        L.append(f"{c:22s}{d['q_err']:12.3f}{d['q_err_oc']:11.3f}{d['eta99_mV']:9.1f}")
    L += ["", "(ld+s: the loaded law with 5za's surface offset, descriptive; Qch err: median |ln| of the predicted over the",
          " DFN charge Ah at cycle 99, with eta held at its cycles 2 to 10 value and at open circuit; eta99: the eta the",
          " cycle-99 charge needs)", "",
          f"H152 (loaded law beats 5zb on both LG M50 pools): {V['H152']}",
          f"H153 (loaded law within 0.15 on both LG M50 pools): {V['H153']}",
          f"H154 (controls: no worse than 5zb by more than 0.02 on either): {V['H154']}",
          f"H155 (worst-pool error below 5zb's; {V['worst_e']:.3f} vs {V['worst_q']:.3f}): {V['H155']}",
          f"H156 (a fixed eta predicts the cycle-99 charge Ah within 0.05 on all four pools): {V['H156']}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=Rows), indent=1) + "\n")
    print("\n".join(L))


# ---------- post hoc (after the verdicts; not counted) ----------

def posthoc():
    """Which levers make the per-cycle plating steady from cycle 2 to 99? Median over each fresh pool of
    ln(dL_99 / dL_2), then minus the measured charge-Ah change, plus kappa times the open-circuit dU rise (5x) or the
    measured separator-node surface OCP rise (5z). Near 0 means those levers carry the whole slowdown."""
    bal, ocp = SF._bal(HERE)
    L = ["cell-fidelity 5zc post hoc (after the verdicts): median ln of the per-cycle lithium loss at cycle 99 over cycle 2,",
         "raw, then with the measured charge Ah and the open-circuit (5x) or measured separator-surface (5z) OCP rise removed", "",
         f"{'condition':22s}{'raw':>8s}{'Qch+oc dU':>11s}{'Qch+surf dU':>13s}{'Qch only':>10s}"]
    for c in CONDITIONS:
        cols = [[], [], [], []]
        for f in B._load(HERE / "bench.jsonl"):
            if f["cond"] != c or not f.get("ok"):
                continue
            b = dict(bal[(c, f["j"])]) | dict(g=ocp["grid"]) | ocp["sets"][bal[(c, f["j"])]["pset"]]
            lo, q, u = f["lost_mol"], f["q_ch"], f["u_end"]
            raw = math.log((lo[98] - lo[97]) / (lo[1] - lo[0]))
            qt = math.log(q[98] / q[1])
            du_oc = SF.du_surf(lo[97], b, 0) - SF.du_surf(lo[0], b, 0)   # lithium lost before cycle 99 and cycle 2 began
            for i, v in enumerate((raw, raw - qt + KAPPA * du_oc, raw - qt + KAPPA * (u[98] - u[1]), raw - qt)):
                cols[i].append(v)
        L.append(f"{c:22s}" + "".join(f"{statistics.median(v):+{w}.3f}" for v, w in zip(cols, (8, 11, 13, 10))))
    (HERE / "posthoc.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "child":
        CYCLES = int(sys.argv[3])
        print(json.dumps(simulate(json.loads(sys.argv[2]))))
    else:
        {"dev": dev, "devreport": devreport, "tables": tables, "bench": bench,
         "report": report, "posthoc": posthoc}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
