"""Milestone 5zx: does a node-gain profile matched to the held-out design carry the cycle-99 forecast where 5zw's
set-wide median (T) did not? Two leave-one-design-out profiles of the late gains h_i (5zw's, fitted over cycles 3..99
and only ever used for other designs):

    K: node-wise median of h_i over the k = 3 other designs of the set nearest in design space (x scaled to the unit
       cube by energy_cell.cell.BOUNDS; ties by design index)
    L: per-node least-squares line of h_i against anode thickness L_n over the other designs, at the held-out L_n,
       clipped to the gain grid [0, 3]

    python experiments/nodematch/run.py rows      # per design: NK, NL through 5zw's _second (stdlib, ~35 s, 4 cores)
    python experiments/nodematch/run.py report    # H244 to H247 -> results.txt, summary.json

NS, NT, C are read from experiments/nodetransfer/rows.json unchanged. Plan in ../../LOG.md.
"""
import importlib.util
import json
import math
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


NT = _mod("nodetransfer_run", EXP / "nodetransfer" / "run.py")
B, PL, SETS = NT.B, NT.PL, NT.SETS
K_NN = 3
GMIN, GMAX = 0.0, 3.0
# energy_cell.cell.BOUNDS (pos_thickness_um, pos_porosity, neg_porosity, np_ratio_rel), copied so this stays stdlib
BOUNDS = [(50.0, 150.0), (0.20, 0.40), (0.20, 0.40), (0.90, 1.30)]
SIGN_OK, SIGN_BAD = 26, 20


# ---------- pure helpers (stdlib; tested) ----------

def scale(x, bounds=BOUNDS):
    return [(v - lo) / (hi - lo) for v, (lo, hi) in zip(x, bounds)]


def dist(a, b):
    return math.sqrt(sum((p - q) ** 2 for p, q in zip(a, b)))


def nearest(u, others, k=K_NN):
    """Indices (into others: list of (index, scaled x)) of the k nearest, ties by index; and the k-th distance."""
    d = sorted((dist(u, v), i) for i, v in others)
    return [i for _, i in d[:k]], d[min(k, len(d)) - 1][0]


def line_fit_at(xs, ys, x0):
    """Least-squares line through (xs, ys) at x0; the mean if xs do not vary."""
    m = len(xs)
    mx, my = sum(xs) / m, sum(ys) / m
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        return my
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    return my + b * (x0 - mx)


def clip(g):
    return min(GMAX, max(GMIN, g))


def knn_profile(i, rows, xs):
    others = [(k, xs[k]) for k, r in enumerate(rows) if k != i and r["set"] == rows[i]["set"]]
    idx, dk = nearest(xs[i], others)
    return NT.median_profile([rows[k]["h"] for k in idx]), dk


def line_profile(i, rows, ln):
    others = [k for k, r in enumerate(rows) if k != i and r["set"] == rows[i]["set"]]
    nn = len(rows[i]["h"])
    return [clip(line_fit_at([ln[k] for k in others], [rows[k]["h"][n] for k in others], ln[i])) for n in range(nn)]


def verdicts(S, n_beat, n_tot):
    v = PL.verdict
    k_lt_t = [S[s]["e"]["NK"] < S[s]["e"]["NT"] for s in S]
    rep = [S[s]["e"]["NK"] <= S[s]["e"]["NS"] for s in ("Chen2020", "NCA_Kim2011") if s in S]
    h245 = v(len(rep) == 2 and all(rep), len(rep) == 2 and not any(rep)) if len(rep) == 2 else None
    o = S.get("OKane2022")
    h246 = v(o["e"]["NK"] <= (o["e"]["NS"] + o["e"]["C"]) / 2, o["e"]["NK"] > o["e"]["NS"]) if o else None
    return dict(H244=v(sum(k_lt_t) >= 3, sum(k_lt_t) <= 1), H245=h245, H246=h246,
                H247=v(n_beat >= SIGN_OK, n_beat <= SIGN_BAD),
                counts=dict(nk_lt_nt_sets=sum(k_lt_t), repaired=sum(rep), nk_beats_ns=n_beat, n=n_tot))


# ---------- rows ----------

def _job(a):
    r, bal, ocp, t = a
    return NT._second((r, bal, ocp, t))


def rows():
    prev = json.loads((EXP / "nodetransfer" / "rows.json").read_text())
    runs = {(r["cond"], r["j"]): r for r in B._load(EXP / "depth" / "bench.jsonl")
            if r.get("ok") and r.get("ok_cycles", 0) >= 100}
    xs = [scale(runs[(p["cond"], p["j"])]["x"]) for p in prev]
    ln = [runs[(p["cond"], p["j"])]["L_n"] * 1e6 for p in prev]
    bals = {s: NT.WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    tk, dk, tl = [], [], []
    for i in range(len(prev)):
        t, d = knn_profile(i, prev, xs)
        tk.append(t)
        dk.append(d)
        tl.append(line_profile(i, prev, ln))
    jobs = []
    for p in prev:
        r = runs[(p["cond"], p["j"])]
        jobs.append((r, *bals[NT.WL.SRC.get(r["cond"], "crossset")]))
    with Pool(4) as pool:
        sk = pool.map(_job, [j + (t,) for j, t in zip(jobs, tk)])
        sl = pool.map(_job, [j + (t,) for j, t in zip(jobs, tl)])
        st = pool.map(_job, [j + (p["t"],) for j, p in zip(jobs, prev)])
    out = []
    for p, x, l, a, b, c, ka, la, d in zip(prev, xs, ln, sk, sl, st, tk, tl, dk):
        out.append(dict(cond=p["cond"], set=p["set"], j=p["j"], x=x, L_n_um=l, h=p["h"], tT=p["t"], tK=ka, tL=la,
                        d3=d, e=dict(NS=p["e"]["NS"], NT=p["e"]["NT"], C=p["e"]["C"], NK=a["e"], NL=b["e"],
                                     NT_re=c["e"]),
                        lev=dict(N=p["lev"]["N"], T=p["lev"]["T"], K=a["lev"], L=b["lev"])))
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs")


def report():
    rs = json.loads((HERE / "rows.json").read_text())
    med = PL._med
    S = {}
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        if not t:
            continue
        sep = lambda key: med(abs(r[key][-1] - r["h"][-1]) for r in t)
        S[st] = dict(n=len(t), e={k: med(r["e"][k] for r in t) for k in ("NS", "NT", "NK", "NL", "C")},
                     lev={k: med(r["lev"][k] for r in t) for k in ("N", "T", "K", "L")},
                     sep_err=dict(T=sep("tT"), K=sep("tK"), L=sep("tL")), d3=med(r["d3"] for r in t),
                     nk_lt_ns=sum(r["e"]["NK"] < r["e"]["NS"] for r in t),
                     nk_lt_nt=sum(r["e"]["NK"] < r["e"]["NT"] for r in t),
                     nl_lt_ns=sum(r["e"]["NL"] < r["e"]["NS"] for r in t))
    n_beat = sum(r["e"]["NK"] < r["e"]["NS"] for r in rs)
    V = verdicts(S, n_beat, len(rs))
    V["counts"]["nl_beats_ns"] = sum(r["e"]["NL"] < r["e"]["NS"] for r in rs)
    f = lambda x, w, p: f"{x:{w}.{p}f}"
    L = ["cell-fidelity milestone 5zx: design-matched node-gain profiles, leave one design out. K = median late gain",
         "profile of the 3 nearest other designs (scaled design space), L = per-node line in anode thickness; T, NS, C",
         "as 5zw. 5zk's records, 40 designs, no new simulation. Set medians.", "",
         f"{'set':12s}{'n':>3s}{'levN':>7s}{'levT':>7s}{'levK':>7s}{'levL':>7s}"
         f"{'eNS':>7s}{'eNT':>7s}{'eNK':>7s}{'eNL':>7s}{'eC':>7s}{'d3':>6s}{'NK<NS':>7s}{'NK<NT':>7s}{'NL<NS':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d['lev'][k], 7, 2) for k in ("N", "T", "K", "L"))
                 + "".join(f(d['e'][k], 7, 3) for k in ("NS", "NT", "NK", "NL", "C")) + f(d["d3"], 6, 2)
                 + f"{d['nk_lt_ns']:>7d}{d['nk_lt_nt']:>7d}{d['nl_lt_ns']:>7d}")
    L += ["", "set-median |predicted - own late gain| at the separator node (20):"]
    for st, d in S.items():
        L.append(f"  {st:12s}" + "  ".join(f"{k} {d['sep_err'][k]:.2f}" for k in ("T", "K", "L")))
    c = V["counts"]
    L += ["", "(lev = |du(L_99) - du(L_2) - Mw_99| in mV; e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, line through",
          " cycles 2..10, q_S, no drift; d3 = distance to the third neighbour in the unit design cube)", "",
          f"H244 (e_NK < e_NT on >= 3 of 4 sets): {V['H244']} ({c['nk_lt_nt_sets']} of {len(S)})",
          f"H245 (e_NK <= e_NS on Chen2020 and NCA_Kim2011): {V['H245']} ({c['repaired']} of 2)",
          f"H246 (OKane2022 e_NK <= (e_NS + e_C)/2): {V['H246']}",
          f"H247 (NK < NS on >= {SIGN_OK} of 40): {V['H247']} ({c['nk_beats_ns']} of {c['n']}; NL: {c['nl_beats_ns']})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V), indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
