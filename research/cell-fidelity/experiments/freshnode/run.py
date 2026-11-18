"""Milestone 5zy: do the node-gain profiles learned on 5zk's 40 designs carry the ten-cycle forecast to designs they
never saw? A held-out test on a fresh DFN pool: 8 new designs per set, drawn from the same 64-design pools 5z drew from
but excluding all of 5z's picks, run with x-resolved records to cycle 100 (5zk's bench, unchanged).

Profiles are fitted on the 40 training designs of 5zk/5zw (all designs of the same set; their late gains h_i are read
from experiments/nodetransfer/rows.json) and applied to each fresh design without any fresh-design reading past
cycle 10:

    T : node-wise median of the training designs' h_i (5zw)
    K : node-wise median of the 3 training designs nearest in the scaled design cube (5zx)
    L : per-node least-squares line of h_i against anode thickness over the training designs, clipped to [0, 3] (5zx)
    G : gated line, fixed in the plan: L where the set's training designs have Spearman(L_n, h_sep) >= GATE, else the
        uniform node lever N (forecast NS)

    WORKERS=3 python experiments/freshnode/run.py bench    # DFN to cycle 100, x-resolved (pybamm; resumable)
    python experiments/freshnode/run.py rows               # forecasts (stdlib, 4 cores)
    python experiments/freshnode/run.py report             # H248 to H251 -> results.txt, summary.json

Plan in ../../LOG.md (5zy plan).
"""
import importlib.util
import json
import random
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import Pool
from pathlib import Path
import os

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


NM = _mod("nodematch_run", EXP / "nodematch" / "run.py")
NT = NM.NT
B, PL, SETS = NT.B, NT.PL, NT.SETS
DEPTH = EXP / "depth" / "run.py"
WORKERS = int(os.environ.get("WORKERS", "3"))
POOLS = (("crossset", "Chen2020@1.5x", 12), ("crossset", "OKane2022@1.5x", 12),
         ("crossset", "NCA_Kim2011@0.875x", 8), ("calmap", "Ai2020@0.45x", 8))
N_FRESH = 8
SEED = 5248          # fixed in the plan
GATE = 0.5           # Spearman(L_n, separator-node late gain) over the training designs, fixed in the plan


def sign_p(k, n):
    """One-sided sign-test p-value P(X >= k), X ~ Bin(n, 1/2)."""
    from math import comb
    return sum(comb(n, i) for i in range(k, n + 1)) / 2 ** n if n else 1.0


# ---------- pure helpers (stdlib; tested) ----------

def used_picks(k):
    """5z's picks from a 64-design pool (mechanism/run.py's picks, seed 18)."""
    return sorted(random.Random(18).sample(range(64), k))


def fresh_picks(avail, k_used, n=N_FRESH, seed=SEED):
    """n designs from avail, excluding 5z's picks, by a fixed seed."""
    used = set(used_picks(k_used))
    cand = sorted(j for j in avail if j not in used)
    return sorted(random.Random(seed).sample(cand, n))


def ranks(v):
    """Average ranks (1-based), ties shared."""
    order = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(order):
        k = i
        while k + 1 < len(order) and v[order[k + 1]] == v[order[i]]:
            k += 1
        for m in range(i, k + 1):
            r[order[m]] = (i + k) / 2 + 1
        i = k + 1
    return r


def spearman(a, b):
    ra, rb = ranks(a), ranks(b)
    n = len(a)
    ma, mb = sum(ra) / n, sum(rb) / n
    sab = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    saa = sum((x - ma) ** 2 for x in ra)
    sbb = sum((y - mb) ** 2 for y in rb)
    return sab / (saa * sbb) ** 0.5 if saa and sbb else 0.0


def line_profile(train_ln, train_h, ln):
    nn = len(train_h[0])
    return [NM.clip(NM.line_fit_at(train_ln, [h[n] for h in train_h], ln)) for n in range(nn)]


def knn_profile(u, train_x, train_h, k=NM.K_NN):
    idx, dk = NM.nearest(u, list(enumerate(train_x)), k)
    return NT.median_profile([train_h[i] for i in idx]), dk


def gate_fires(train_ln, train_h, gate=GATE):
    rho = spearman(train_ln, [h[-1] for h in train_h])
    return rho >= gate, rho


def verdicts(S, n_beat, n_gated):
    v = PL.verdict
    gated = [s for s in S if S[s]["gate"]]
    wins = [S[s]["e"]["NG"] < S[s]["e"]["NS"] for s in gated]
    h248 = v(bool(gated) and all(wins), bool(gated) and not any(wins)) if gated else "untestable (gate fired on no set)"
    o = S.get("OKane2022")
    h249 = v(o["e"]["NL"] <= (o["e"]["NS"] + o["e"]["C"]) / 2, o["e"]["NL"] > o["e"]["NS"]) if o else None
    h250 = v(sign_p(n_beat, n_gated) <= 0.05, 2 * n_beat <= n_gated) if n_gated else "untestable (no gated design)"
    h251 = v(o["e"]["NT"] < o["e"]["NS"], o["e"]["NT"] > o["e"]["NS"]) if o else None
    return dict(H248=h248, H249=h249, H250=h250, H251=h251,
                counts=dict(gated_sets=gated, gated_wins=sum(wins), ng_beats_ns_gated=n_beat, n_gated=n_gated))


# ---------- bench (pybamm, via 5zk's child) ----------

def jobs():
    J = []
    for d, c, k in POOLS:
        src = {r["j"]: r for r in B._load(EXP / d / "bench.jsonl") if r["cond"] == c and r.get("ok")}
        bal = {r["j"] for r in B._load(EXP / d / "balance.jsonl") if r["cond"] == c}
        for j in fresh_picks([j for j in src if j in bal], k):
            J.append((c, j, src[j]["x"]))
    return J


def bench():
    path = HERE / "bench.jsonl"
    done = {(r["cond"], r["j"]) for r in B._load(path) if r.get("ok")} if path.exists() else set()
    todo = [(c, j, x) for c, j, x in jobs() if (c, j) not in done]
    print(f"{len(todo)} runs to go", flush=True)

    def one(job):
        c, j, x = job
        try:
            p = subprocess.run([sys.executable, str(DEPTH), "child", json.dumps([c, j, x])], capture_output=True,
                               text=True, timeout=2400)
            if p.returncode == 0 and p.stdout.strip():
                return json.loads(p.stdout.strip().splitlines()[-1])
            err = f"exit {p.returncode}: {p.stderr.strip()[-160:]}"
        except subprocess.TimeoutExpired:
            err = "timeout 2400s"
        return dict(cond=c, j=j, x=x, ok=False, error=err, seconds=None)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            print(r["cond"], r["j"], "ok" if r["ok"] else r["error"], r.get("seconds"), flush=True)


# ---------- rows (stdlib) ----------

def rows():
    train = json.loads((EXP / "nodetransfer" / "rows.json").read_text())
    old = {(r["cond"], r["j"]): r for r in B._load(EXP / "depth" / "bench.jsonl") if r.get("ok")}
    fresh = [r for r in B._load(HERE / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= 100]
    bals = {s: NT.WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    T = {}
    for st in SETS:
        tr = [p for p in train if p["set"] == st]
        recs = [old[(p["cond"], p["j"])] for p in tr]
        ln = [r["L_n"] * 1e6 for r in recs]
        hs = [p["h"] for p in tr]
        fire, rho = gate_fires(ln, hs)
        T[st] = dict(ln=ln, h=hs, x=[NM.scale(r["x"]) for r in recs], med=NT.median_profile(hs), gate=fire, rho=rho)
    jobs_, prof = [], []
    for r in fresh:
        st = NT.SK.pset(r["cond"])
        t = T[st]
        tk, dk = knn_profile(NM.scale(r["x"]), t["x"], t["h"])
        tl = line_profile(t["ln"], t["h"], r["L_n"] * 1e6)
        jobs_.append((r, *bals[NT.WL.SRC.get(r["cond"], "crossset")]))
        prof.append(dict(set=st, T=t["med"], K=tk, L=tl, d3=dk))
    with Pool(4) as pool:
        first = pool.map(NT._first, jobs_)
        sec = {k: pool.map(NT._second, [j + (p[k],) for j, p in zip(jobs_, prof)]) for k in ("T", "K", "L")}
    out = []
    for i, (r, f, p) in enumerate(zip(fresh, first, prof)):
        e = dict(NS=f["e"]["NS"], C=f["e"]["C"], Tself=f["e"]["Tself"], NT=sec["T"][i]["e"], NK=sec["K"][i]["e"],
                 NL=sec["L"][i]["e"])
        g = T[p["set"]]["gate"]
        e["NG"] = e["NL"] if g else e["NS"]
        lev = dict(N=f["lev"]["N"], Tself=f["lev"]["Tself"], T=sec["T"][i]["lev"], K=sec["K"][i]["lev"],
                   L=sec["L"][i]["lev"])
        out.append(dict(cond=r["cond"], set=p["set"], j=r["j"], L_n_um=r["L_n"] * 1e6, h=f["h"], tT=p["T"],
                        tK=p["K"], tL=p["L"], d3=p["d3"], gate=g, e=e, lev=lev))
    meta = {st: dict(gate=T[st]["gate"], rho=T[st]["rho"], n_train=len(T[st]["h"]),
                     ln_range=[min(T[st]["ln"]), max(T[st]["ln"])]) for st in T}
    (HERE / "rows.json").write_text(json.dumps(dict(meta=meta, rows=out)) + "\n")
    print(len(out), "fresh designs;", {s: round(m["rho"], 3) for s, m in meta.items()})


def report():
    D = json.loads((HERE / "rows.json").read_text())
    rs, meta = D["rows"], D["meta"]
    med = PL._med
    S = {}
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        if not t:
            continue
        sep = lambda key: med(abs(r[key][-1] - r["h"][-1]) for r in t)
        S[st] = dict(n=len(t), gate=meta[st]["gate"], rho=meta[st]["rho"],
                     e={k: med(r["e"][k] for r in t) for k in ("NS", "NT", "NK", "NL", "NG", "C", "Tself")},
                     lev={k: med(r["lev"][k] for r in t) for k in ("N", "T", "K", "L", "Tself")},
                     sep_err=dict(T=sep("tT"), K=sep("tK"), L=sep("tL")), d3=med(r["d3"] for r in t),
                     beat={k: sum(r["e"][k] < r["e"]["NS"] for r in t) for k in ("NT", "NK", "NL")},
                     ln_out=sum(not (meta[st]["ln_range"][0] <= r["L_n_um"] <= meta[st]["ln_range"][1]) for r in t))
    g = [r for r in rs if r["gate"]]
    n_beat = sum(r["e"]["NL"] < r["e"]["NS"] for r in g)
    V = verdicts(S, n_beat, len(g))
    f = lambda x, w, p: f"{x:{w}.{p}f}"
    L = ["cell-fidelity milestone 5zy: node-gain profiles learned on 5zk's 40 designs, tested on 32 fresh DFN designs",
         "(8 per set, same pools, none of 5z's picks). Profiles T (median), K (3 nearest), L (thickness line), G (L where",
         f"the training Spearman(L_n, h_sep) >= {GATE}, else NS). Set medians over the fresh designs.", "",
         f"{'set':12s}{'n':>3s}{'rho':>6s}{'gate':>5s}{'eNS':>7s}{'eNT':>7s}{'eNK':>7s}{'eNL':>7s}{'eNG':>7s}{'eC':>7s}"
         f"{'eTs':>7s}{'NT<NS':>6s}{'NK<NS':>6s}{'NL<NS':>6s}{'out':>4s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}{d['rho']:6.2f}{'yes' if d['gate'] else 'no':>5s}"
                 + "".join(f(d['e'][k], 7, 3) for k in ("NS", "NT", "NK", "NL", "NG", "C", "Tself"))
                 + "".join(f"{d['beat'][k]:6d}" for k in ("NT", "NK", "NL")) + f"{d['ln_out']:4d}")
    L += ["", f"{'set':12s}{'levN':>7s}{'levT':>7s}{'levK':>7s}{'levL':>7s}{'levTs':>7s}{'d3':>6s}"
              "   |pred - own| sep-node gain T, K, L"]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d['lev'][k], 7, 2) for k in ("N", "T", "K", "L", "Tself")) + f(d["d3"], 6, 2)
                 + "   " + "  ".join(f"{d['sep_err'][k]:.2f}" for k in ("T", "K", "L")))
    c = V["counts"]
    L += ["", "(rho = training Spearman of anode thickness against the separator-node late gain; e = |ln(L_pred(99) /"
              " L_DFN(99))| at kappa = 25.3, line through cycles 2..10, q_S, no drift; eTs = the design's own late gains,"
              " reads cycle 99, an in-sample ceiling; out = fresh designs outside the training thickness range;"
              " lev in mV)", "",
          f"H248 (gated line beats NS on every gated set): {V['H248']} (gated {c['gated_sets']}, wins {c['gated_wins']})",
          f"H249 (OKane2022 e_NL <= (e_NS + e_C)/2): {V['H249']}",
          f"H250 (NL < NS on the gated designs, one-sided sign test p <= 0.05): {V['H250']} ({c['ng_beats_ns_gated']} of"
          f" {c['n_gated']}, p = {sign_p(c['ng_beats_ns_gated'], c['n_gated']):.3f})",
          f"H251 (5zw's median profile replicates on fresh OKane2022: e_NT < e_NS): {V['H251']}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V, meta=meta), indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"bench": bench, "rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
