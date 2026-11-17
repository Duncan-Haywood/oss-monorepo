"""Milestone 5zb: does a ten-cycle law whose shape comes from the plating kinetics (the per-cycle plating proportional to
the charge time, slowed by the negative electrode's potential rise) forecast the 100-cycle lithium loss on fresh pools of
all four parameter sets, with one law and no constant fitted beyond a rate?

    python experiments/kinetic/run.py dev       # the plan's dev table on the 13 committed 100-cycle pools (stdlib)
    python experiments/kinetic/run.py tables    # balance tables of the fresh designs (pybamm, no simulation)
    WORKERS=3 python experiments/kinetic/run.py bench   # DFN (SEI + plating) to cycle 100 (5za's simulate, resumable)
    python experiments/kinetic/run.py report    # H147 to H151 (stdlib) -> results.txt, summary.json

5x/5y write the plating loss per cycle as dL/dn = r(n) exp(-kappa dU(L)) and fit a power law to R = int exp(kappa dU) dl
over cycles 2 to 10; the power law's curvature is free, so it absorbs whatever the feedback misses. At constant current
the charge lasts Q(L)/I, Q(L) the open-circuit capacity between the cut-offs with n_Li - L of lithium, so a plating rate
that is otherwise steady gives dL/dn = r0 (Q(L)/Q(0)) exp(-kappa dU(L)). Then
    R_Q(L) = int_0^L exp(kappa dU(l)) Q(0)/Q(l) dl = R_Q(L(1)) + r0 (n - 1)
is linear in the cycle count: the law's shape is fixed by the kinetics and only its level and rate are fitted (a line
through R_Q at cycles 2 to 10). dU is 5x's open-circuit rise at the upper cut-off; Q from 5r's balance table.
Plan in ../../LOG.md (5zb plan), written before any fresh run.
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


SF = _mod("surface_run", EXP / "surface" / "run.py")
RL, D, CM, FL, S, B = SF.RL, SF.D, SF.CM, SF.FL, SF.S, SF.B
K, TO, KAPPA, NGRID = SF.K, SF.TO, SF.KAPPA, SF.NGRID
spearman = SF.spearman

SOBOL_SEED = 20        # used by no milestone (5za used 19)
N_LOG2 = 5             # 32 designs per pool
# fixed before any run: one fresh current per set, none run to cycle 100 by any milestone
CONDITIONS = ("Ai2020@0.65x", "NCA_Kim2011@0.5x", "Chen2020@1.25x", "OKane2022@1.25x")
CONTROLS, LGM50 = CONDITIONS[:2], CONDITIONS[2:]
DEV_POOLS = tuple(D.POOLS) + ((EXP / "rlaw", RL.CONDITIONS),)


# ---------- pure helpers (stdlib; tested) ----------

def line_fit(xs, ys):
    """(a, s) of the least-squares line y = a + s x."""
    mx, my = statistics.mean(xs), statistics.mean(ys)
    s = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return my - s * mx, s


def cap(n_li, b, n=60):
    """Open-circuit capacity (Ah) between the cut-offs with n_li mol of cyclable lithium (5r's balance)."""
    return B.ocv_energy(n_li, b, n)[1]


def rq_table(b, l_max, delta=0.0, kappa=KAPPA, n=NGRID):
    """(L, R_Q) on [0, l_max]: R_Q(L) = int_0^L exp(kappa dU(l)) Q(0)/Q(l) dl; dU at open circuit (delta = 0) or shifted
    by the surface offset (5za). A lithium level with no capacity left gets a near-infinite weight."""
    ls = [l_max * i / n for i in range(n + 1)]
    q0 = cap(b["n_li"], b)
    gs = []
    for l in ls:
        q = cap(b["n_li"] - l, b)
        gs.append(math.exp(kappa * SF.du_surf(l, b, delta)) * (q0 / q if q > 0 else 1e9))
    rs = [0.0]
    for i in range(1, n + 1):
        rs.append(rs[-1] + 0.5 * (gs[i] + gs[i - 1]) * (ls[i] - ls[i - 1]))
    return ls, rs


def kinetic_loss(lost, b, delta=0.0, k=K, to=TO):
    """L_Q(to-1): a line through R_Q at cycles 2..k, read at cycle to-1, inverted. None when there is no loss to fit."""
    if lost[k - 1] <= 0:
        return None
    tab = rq_table(b, min(0.95 * b["n_li"], 30 * lost[k - 1]), delta)
    rk = [B.interp(tab[0], tab[1], lost[m - 1]) for m in range(2, k + 1)]
    a, s = line_fit(list(range(2, k + 1)), rk)
    return D.l_of_r(tab, a + s * (to - 1))


def log_err(p, t):
    return math.log(p / t)


def summarise(rows):
    ok = [r for r in rows if r["l_rp"] and r["l_q"]]
    med = lambda k: statistics.median(abs(log_err(r[k], r["l_true"])) for r in ok)
    sgn = lambda k: statistics.median(log_err(r[k], r["l_true"]) for r in ok)
    out = dict(n=len(ok), lerr_rp=med("l_rp"), lerr_q=med("l_q"), sgn_rp=sgn("l_rp"), sgn_q=sgn("l_q"),
               wins=sum(abs(log_err(r["l_q"], r["l_true"])) < abs(log_err(r["l_rp"], r["l_true"])) for r in ok),
               rhoL_q=spearman([r["l_q"] for r in ok], [r["l_true"] for r in ok]),
               rhoL_rp=spearman([r["l_rp"] for r in ok], [r["l_true"] for r in ok]),
               frac_lost=statistics.median(r["l_true"] / r["n_li"] for r in ok))
    qs = [r for r in ok if r.get("l_qs")]
    if qs:
        out |= dict(lerr_qs=statistics.median(abs(log_err(r["l_qs"], r["l_true"])) for r in qs),
                    sgn_qs=statistics.median(log_err(r["l_qs"], r["l_true"]) for r in qs))
    return out


# ---------- dev (seen) ----------

def dev():
    """5y and the kinetic law on the 13 committed 100-cycle pools (all seen)."""
    L = []
    for d, conds in DEV_POOLS:
        runs, bal, ocp = CM._load(d)
        for c in conds:
            rows, _, _, _ = CM.rows_of(c, runs, bal, ocp)
            rs = [dict(l_true=r["l_true"], n_li=r["n_li"], l_rp=RL.rlaw_loss(r["lost"], r["b"]),
                       l_q=kinetic_loss(r["lost"], r["b"])) for r in rows]
            p = summarise(rs)
            L.append(f"{d.name:9s} {c:20s} n {p['n']:2d}  |ln err| 5y {p['lerr_rp']:.3f} kinetic {p['lerr_q']:.3f}"
                     f"  signed 5y {p['sgn_rp']:+.3f} kinetic {p['sgn_q']:+.3f}  wins {p['wins']}/{p['n']}")
            print(L[-1], flush=True)
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")


# ---------- pybamm ----------

def tables():
    FL.HERE, FL.SOBOL_SEED, FL.CONDITIONS, FL.N_LOG2 = HERE, SOBOL_SEED, CONDITIONS, N_LOG2
    FL.tables()


def bench():
    path = HERE / "bench.jsonl"
    done = {(r["cond"], r["j"]) for r in B._load(path)
            if not str(r.get("error") or "").startswith("exit -9")} if path.exists() else set()
    rows = B._load(HERE / "balance.jsonl")
    SF.WORKERS = int(os.environ.get("WORKERS", "3"))
    SF._run([(r["cond"], r["j"], r["x"]) for r in rows if (r["cond"], r["j"]) not in done], path)


# ---------- report ----------

def verdicts(C):
    ctl = [C[c] for c in CONTROLS if c in C]
    lg = [C[c] for c in LGM50 if c in C]
    allp = ctl + lg
    w147 = sum(c["lerr_q"] < c["lerr_rp"] for c in ctl)
    w148 = sum(c["lerr_q"] <= 0.06 for c in ctl)
    f148 = sum(c["lerr_q"] > 0.10 for c in ctl)
    w149 = sum(c["lerr_q"] < c["lerr_rp"] for c in lg)
    worst_q, worst_rp = max(c["lerr_q"] for c in allp), max(c["lerr_rp"] for c in allp)
    return dict(H147=S.verdict(w147 == len(ctl), w147 == 0), H147_wins=w147,
                H148=S.verdict(w148 == len(ctl), f148 >= 1), H148_wins=w148,
                H149=S.verdict(w149 == len(lg) and all(c["lerr_q"] > 0.15 for c in lg), w149 == 0), H149_wins=w149,
                H150=S.verdict(worst_q < worst_rp, worst_q >= worst_rp), worst_q=worst_q, worst_rp=worst_rp,
                H151=S.verdict(all(c["rhoL_q"] >= 0.9 for c in allp), any(c["rhoL_q"] < 0.8 for c in allp)))


def report():
    runs = {(r["cond"], r["j"]): r for r in B._load(HERE / "bench.jsonl")}
    bal, ocp = SF._bal(HERE)
    C, Rows, dropped = {}, {}, {}
    for c in CONDITIONS:
        rows = []
        for (cc, j), f in sorted(runs.items()):
            if cc != c:
                continue
            if not f.get("ok") or f.get("ok_cycles", 0) < TO:
                dropped[c] = dropped.get(c, 0) + 1
                continue
            b = dict(bal[(c, j)]) | dict(g=ocp["grid"]) | ocp["sets"][bal[(c, j)]["pset"]]
            lost = f["lost_mol"]
            delta = SF.offset(f["xs_end"], lost, b)
            rows.append(dict(j=j, l_true=lost[TO - 2], n_li=b["n_li"], l_rp=RL.rlaw_loss(lost, b),
                             l_q=kinetic_loss(lost, b), l_qs=kinetic_loss(lost, b, delta), delta=delta,
                             q_ratio=cap(b["n_li"] - lost[TO - 2], b) / cap(b["n_li"] - lost[0], b),
                             wh_ratio=f["cycle_wh"][TO - 1] / f["cycle_wh"][1]))
        if rows:
            C[c] = summarise(rows) | dict(dropped=dropped.get(c, 0),
                                          q_ratio=statistics.median(r["q_ratio"] for r in rows),
                                          wh_ratio=statistics.median(r["wh_ratio"] for r in rows))
            Rows[c] = rows
    V = verdicts(C)
    L = ["cell-fidelity milestone 5zb: a ten-cycle law shaped by the plating kinetics (a line in n through",
         "R_Q = int exp(kappa dU) Q(0)/Q(l) dl, cycles 2 to 10) against 5y's power law on R. DFN (SEI + plating) to cycle 100,",
         f"fresh Sobol designs (seed {SOBOL_SEED}); median |ln(L_pred(99) / L_DFN(99))|", "",
         f"{'condition':20s}{'n':>3s}{'drop':>5s}{'5y':>7s}{'kin':>7s}{'sgn 5y':>8s}{'sgn k':>7s}{'wins':>6s}"
         f"{'rhoL k':>8s}{'rhoL 5y':>8s}{'kin+s':>7s}{'sgn ks':>8s}{'Q99/Q1':>8s}{'lost%':>7s}"]
    for c, d in C.items():
        L.append(f"{c:20s}{d['n']:3d}{d['dropped']:5d}{d['lerr_rp']:7.3f}{d['lerr_q']:7.3f}{d['sgn_rp']:+8.3f}"
                 f"{d['sgn_q']:+7.3f}{d['wins']:6d}{d['rhoL_q']:8.3f}{d['rhoL_rp']:8.3f}{d.get('lerr_qs', float('nan')):7.3f}"
                 f"{d.get('sgn_qs', float('nan')):+8.3f}{d['q_ratio']:8.3f}{100 * d['frac_lost']:7.1f}")
    L += ["", "(kin+s: the kinetic law with 5za's surface offset, descriptive; Q99/Q1: open-circuit capacity after the",
          " cycle-99 loss over that after cycle 1; lost%: median share of the cyclable lithium lost by cycle 99)", "",
          f"H147 (kinetic law beats 5y on both control pools): {V['H147']}",
          f"H148 (kinetic law within 0.06 on both control pools): {V['H148']}",
          f"H149 (on LG M50: beats 5y on both pools, still above 0.15 on both): {V['H149']}",
          f"H150 (one law: worst-pool error below 5y's worst-pool error; {V['worst_q']:.3f} vs {V['worst_rp']:.3f}): {V['H150']}",
          f"H151 (ranks the cycle-99 loss at 0.9 or above on all four pools): {V['H151']}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=Rows), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"dev": dev, "tables": tables, "bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
