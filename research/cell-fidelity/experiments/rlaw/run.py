"""Milestone 5y: with the plating feedback taken out (R, 5x), does one law, a power law fitted to R over cycles 2 to 10,
predict the 100-cycle lithium loss on fresh pools with no constant fitted and no per-pool law choice?

    python experiments/rlaw/run.py dev       # the seen-pool table in the 5y plan (the ten committed pools; stdlib)
    python experiments/rlaw/run.py tables    # balance tables and stack mass of the fresh designs (pybamm, no simulation)
    WORKERS=2 python experiments/rlaw/run.py bench   # DFN (SEI + plating) to cycle 100 with the lithium curve (resumable)
    python experiments/rlaw/run.py report    # H135 to H138 (stdlib) -> results.txt, summary.json

5x mapped each design's ten-cycle lithium loss L to R = int_0^L exp(kappa dU(l)) dl (the loss without the plating law's
own feedback through the negative electrode's OCP rise at top of charge) and fitted 5u's per-pool law to R. On
NCA_Kim2011 (power law) that fixed a 30% error; on Ai2020 (sqrt law) it under-predicted by 26 to 28%, because a + b sqrt(n)
already bends like the feedback and the feedback was applied twice. Dev here (seen): fitting the power law a n^b to R on
every pool, with no choice, gives a median |ln error| of 0.08 to 0.105 on the six Ai2020 pools (5x 0.30 to 0.32; the
uncorrected law 0.11 to 0.18) and 0.03 to 0.06 on NCA_Kim2011. Plan in ../../LOG.md (5y plan), written before any fresh run.
"""
import importlib.util
import json
import math
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


D = _mod("derived_run", EXP / "derived" / "run.py")
CS, CM, FL, S, B = D.CS, D.CM, D.FL, D.S, D.B
K, TO = D.K, D.TO
spearman, sign_p = B.spearman, FL.sign_p

SOBOL_SEED = 17        # used by no milestone (5w used 16)
# fixed before any run: the set where 5x double-counted (Ai2020) at a current no milestone ran to cycle 100, and the set
# where it worked (NCA_Kim2011) at two currents no milestone ran to cycle 100 (5n's mapscreen ran them to cycle 10 only,
# on other designs)
CONDITIONS = ("Ai2020@0.55x", "NCA_Kim2011@0.75x", "NCA_Kim2011@1x")
R_LAW = "power"        # the one law fitted to R on every pool


# ---------- pure helpers (stdlib; tested) ----------

def rlaw_loss(lost, b, law=R_LAW):
    """L_R(99): the power law fitted to R over cycles 2 to 10, read at cycle 99, inverted to L (5x's machinery, law fixed)."""
    return D.derived_loss(lost, b, law)


def med_abs_log(rows, key):
    v = [CM.log_err(r[key], r["l_true"]) for r in rows]
    v = [x for x in v if x is not None]
    return statistics.median(v) if v else None


def med_signed_log(rows, key):
    v = [math.log(r[key] / r["l_true"]) for r in rows if r.get(key) and r[key] > 0 and r["l_true"] > 0]
    return statistics.median(v) if v else None


# ---------- per pool ----------

def pool(c, runs, bal, ocp):
    rows, b_med, law, dropped = CM.rows_of(c, runs, bal, ocp)
    for r in rows:
        r["l_der"] = D.derived_loss(r["lost"], r["b"], law)      # 5x: the pool's law on R
        r["l_rp"] = rlaw_loss(r["lost"], r["b"])                   # 5y: the power law on R
    rows = [r for r in rows if r["l_der"] and r["l_rp"] and r["l_law"]]
    cal, held = CS.split(len(rows))
    a1 = CS.fit_intercept(CS.triples(rows, cal))
    H = [rows[i] for i in held]
    for r in H:
        e = lambda l: CM.map_energy(r["b"], r["lost"], r["wh10"], l) / r["m"]
        r["e_rp"], r["e_der"], r["e_law"] = e(r["l_rp"]), e(r["l_der"]), e(r["l_law"])
        r["e_one"] = e(CM.corrected(r["l_law"], r["n_li"], a1, CS.S_FROZEN))
        r["e_true"] = e(r["l_true"])
    sc = [r["score"] for r in H]
    rho = lambda k: spearman([r[k] for r in H], sc)
    wh10 = [r["wh10"] for r in rows]
    return dict(n=len(rows), dropped=dropped, law=law, b_med=b_med, a1=a1, n_held=len(H),
                lerr_law=med_abs_log(rows, "l_law"), lerr_der=med_abs_log(rows, "l_der"), lerr_rp=med_abs_log(rows, "l_rp"),
                sgn_law=med_signed_log(rows, "l_law"), sgn_der=med_signed_log(rows, "l_der"), sgn_rp=med_signed_log(rows, "l_rp"),
                rho_rp=rho("e_rp"), rho_der=rho("e_der"), rho_law=rho("e_law"), rho_one=rho("e_one"),
                rho_true=rho("e_true"), rho_sqrt=rho("sqrt"), rho_raw=rho("raw10"),
                rhoL_rp=spearman([r["l_rp"] for r in rows], [r["l_true"] for r in rows]),
                frac_median=statistics.median(r["l_true"] / r["n_li"] for r in rows),
                fade_median=statistics.median(1 - r["score"] * r["m"] / w for r, w in zip(rows, wh10))), rows


def verdicts(C):
    T = list(C.values())
    n = len(T)
    w135 = sum(c["lerr_rp"] < c["lerr_law"] for c in T)
    w136 = sum(c["lerr_rp"] <= 0.10 for c in T)
    f136 = sum(c["lerr_rp"] > 0.15 for c in T)
    w137a = sum(c["rho_rp"] > c["rho_sqrt"] for c in T)
    nca = [c for k, c in C.items() if k.startswith("NCA_Kim2011")]
    w137b = sum(c["rho_rp"] >= c["rho_one"] - 0.05 for c in nca)
    w138 = sum(c["lerr_rp"] <= c["lerr_der"] + 0.03 for c in T)
    ai = [c for k, c in C.items() if k.startswith("Ai2020")]
    w138ai = all(c["lerr_rp"] < c["lerr_der"] for c in ai)
    return dict(n=n,
                H135=S.verdict(w135 == n, w135 <= 1), H135_wins=w135, p135=sign_p(w135, n),
                H136=S.verdict(w136 == n, f136 >= 1), H136_wins=w136,
                H137=S.verdict(w137a == n and w137b == len(nca), w137a <= 1), H137_sqrt=w137a, H137_one=w137b,
                H138=S.verdict(w138 == n and w138ai, w138 <= 1 or not w138ai), H138_wins=w138, H138_ai=w138ai)


# ---------- dev (seen pools) ----------

def dev():
    """The plan's dev table: the uncorrected pool law, 5x (pool law on R) and the power law on R, on the ten committed pools."""
    L = []
    for d, conds in D.POOLS:
        runs, bal, ocp = CM._load(d)
        for c in conds:
            reps, CM.NOISE_REPS = CM.NOISE_REPS, 1
            p, _ = pool(c, runs, bal, ocp)
            CM.NOISE_REPS = reps
            L.append(f"{c:20s} law {p['law']:5s} |lnerr| law {p['lerr_law']:.3f} 5x {p['lerr_der']:.3f} Rpow {p['lerr_rp']:.3f}"
                     f"  signed Rpow {p['sgn_rp']:+.3f}  rhoE sqrt {p['rho_sqrt']:.3f} one {p['rho_one']:.3f}"
                     f" 5x {p['rho_der']:.3f} Rpow {p['rho_rp']:.3f}")
    print("\n".join(L))


# ---------- pybamm ----------

def tables():
    FL.HERE, FL.SOBOL_SEED, FL.CONDITIONS = HERE, SOBOL_SEED, CONDITIONS
    FL.tables()


def bench():
    FL.HERE = HERE
    FL.bench()


# ---------- report ----------

def report():
    runs, bal, ocp = CM._load(HERE)
    C, Rows = {}, {}
    for c in CONDITIONS:
        p, rows = pool(c, runs, bal, ocp)
        if p["n"] < CS.N_CAL + 8:
            continue
        C[c] = p
        Rows[c] = [dict(j=r["j"], n_li=r["n_li"], l_true=r["l_true"], l_law=r["l_law"], l_der=r["l_der"], l_rp=r["l_rp"])
                   for r in rows]
    V = verdicts(C)
    n = V["n"]
    L = [f"cell-fidelity milestone 5y: the power law fitted to R (the plating feedback removed, 5x) on every pool, no constant",
         f"fitted; fresh pools: 64 Sobol designs (seed {SOBOL_SEED}) x {len(CONDITIONS)} conditions, DFN (SEI + plating) to cycle 100;",
         "ranks on 5w's held-out split (8 calibration designs, random.Random(0)) so the one-constant map can be compared", "",
         f"{'condition':20s}{'n':>4s}{'drop':>5s}{'law':>6s}{'|lnerr| law':>12s}{'5x':>7s}{'Rpow':>7s}{'signed Rpow':>12s}"
         f"{'rhoE raw':>9s}{'sqrt':>7s}{'law':>7s}{'one':>7s}{'5x':>7s}{'Rpow':>7s}{'trueL':>7s}{'rhoL':>7s}{'lost':>6s}{'fade':>6s}"]
    for c, d in C.items():
        L.append(f"{c:20s}{d['n']:4d}{d['dropped']:5d}{d['law']:>6s}{d['lerr_law']:12.3f}{d['lerr_der']:7.3f}{d['lerr_rp']:7.3f}"
                 f"{d['sgn_rp']:+12.3f}{d['rho_raw']:9.3f}{d['rho_sqrt']:7.3f}{d['rho_law']:7.3f}{d['rho_one']:7.3f}"
                 f"{d['rho_der']:7.3f}{d['rho_rp']:7.3f}{d['rho_true']:7.3f}{d['rhoL_rp']:7.3f}{d['frac_median']:6.3f}"
                 f"{d['fade_median']:6.3f}")
    L += ["",
          f"H135 (power law on R: median |ln err| at cycle 99 below the uncorrected pool law's on all {n}): {V['H135']}"
          f" ({V['H135_wins']} of {n}, sign p = {V['p135']:.3f})",
          f"H136 (that median at most 0.10 on all {n}; refuted above 0.15 on any): {V['H136']} ({V['H136_wins']} of {n})",
          f"H137 (its map ranks held-out DFN@100 above 5n's sqrt fit on all {n} and within 0.05 of the one-constant map on"
          f" both NCA_Kim2011 pools): {V['H137']} (above sqrt {V['H137_sqrt']}, within 0.05 of one-constant on NCA_Kim2011 {V['H137_one']})",
          f"H138 (no worse than 5x by more than 0.03 on all {n}, better on Ai2020): {V['H138']}"
          f" ({V['H138_wins']} of {n}; better on Ai2020: {V['H138_ai']})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=Rows), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"dev": dev, "tables": tables, "bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
