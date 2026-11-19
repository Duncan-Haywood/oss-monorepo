"""Milestone 5zz: does the anode-thickness line hold on a second fresh DFN pool once it is (a) fitted on all 72
designs simulated so far (5zk's 40 and 5zy's 32) and (b) used only inside the training thickness range, falling back
to the uniform node lever NS outside it? 8 more fresh designs per set, drawn from the same 64-design pools, excluding
every design 5z and 5zy picked, run with x-resolved records to cycle 100 (5zk's bench, unchanged).

Profiles, fitted on the training designs of the fresh design's set, read nothing of the fresh design past cycle 10:

    L   : per-node least-squares line of the late gain h_i against anode thickness over the 72-design pool, clipped
          to [0, 3] (5zx)
    R   : L where the fresh design's anode thickness lies inside the pooled training range of its set, else NS
          (primary, fixed in the plan)
    L40 : L fitted on 5zk's 40 designs only (5zy's training), for H254
    T   : node-wise median of the pooled h_i (5zw)

    WORKERS=3 python experiments/rangeline/run.py bench    # DFN to cycle 100, x-resolved (pybamm; resumable)
    python experiments/rangeline/run.py rows               # forecasts (stdlib, 4 cores)
    python experiments/rangeline/run.py report             # H252 to H255 -> results.txt, summary.json

Plan in ../../LOG.md (5zz plan).
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


FN = _mod("freshnode_run", EXP / "freshnode" / "run.py")
NM, NT = FN.NM, FN.NT
B, PL, SETS = NT.B, NT.PL, NT.SETS
DEPTH = FN.DEPTH
WORKERS = int(os.environ.get("WORKERS", "3"))
POOLS = FN.POOLS
N_FRESH = 8
SEED = 5252          # fixed in the plan
sign_p = FN.sign_p


# ---------- pure helpers (stdlib; tested) ----------

def second_picks(avail, k_used, n=N_FRESH, seed=SEED):
    """n designs from avail, excluding 5z's and 5zy's picks, by a fixed seed."""
    used = set(FN.used_picks(k_used)) | set(FN.fresh_picks(avail, k_used))
    cand = sorted(j for j in avail if j not in used)
    return sorted(random.Random(seed).sample(cand, n))


def in_range(ln, train_ln):
    return min(train_ln) <= ln <= max(train_ln)


def min_k(n, alpha=0.05):
    """Smallest k with one-sided sign-test p <= alpha over n designs (None if none)."""
    for k in range(n + 1):
        if sign_p(k, n) <= alpha:
            return k
    return None


def verdicts(S, n_beat, n_in):
    v = PL.verdict
    r_wins = sum(S[s]["e"]["NR"] < S[s]["e"]["NS"] for s in S)
    l_wins = sum(S[s]["e"]["NL"] < S[s]["e"]["NL40"] for s in S)
    h252 = v(r_wins >= 3, r_wins <= 1)
    h253 = v(sign_p(n_beat, n_in) <= 0.05, 2 * n_beat <= n_in) if n_in else "untestable (no in-range design)"
    h254 = v(l_wins >= 3, l_wins <= 1)
    o = S.get("OKane2022")
    h255 = v(o["e"]["NR"] <= (o["e"]["NS"] + o["e"]["C"]) / 2, o["e"]["NR"] > o["e"]["NS"]) if o else None
    return dict(H252=h252, H253=h253, H254=h254, H255=h255,
                counts=dict(nr_sets=r_wins, nl_vs_nl40_sets=l_wins, nl_beats_ns_in=n_beat, n_in=n_in))


# ---------- bench (pybamm, via 5zk's child) ----------

def jobs():
    J = []
    for d, c, k in POOLS:
        src = {r["j"]: r for r in B._load(EXP / d / "bench.jsonl") if r["cond"] == c and r.get("ok")}
        bal = {r["j"] for r in B._load(EXP / d / "balance.jsonl") if r["cond"] == c}
        for j in second_picks([j for j in src if j in bal], k):
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

def _train():
    """Per set: 5zk's 40 designs (h from nodetransfer) and 5zy's 32 (h from freshnode), anode thickness in um."""
    old = {(r["cond"], r["j"]): r for r in B._load(EXP / "depth" / "bench.jsonl") if r.get("ok")}
    fr = {(r["cond"], r["j"]): r for r in B._load(EXP / "freshnode" / "bench.jsonl") if r.get("ok")}
    a = json.loads((EXP / "nodetransfer" / "rows.json").read_text())
    b = json.loads((EXP / "freshnode" / "rows.json").read_text())["rows"]
    T = {}
    for st in SETS:
        k40 = [(old[(p["cond"], p["j"])]["L_n"] * 1e6, p["h"]) for p in a if p["set"] == st]
        k32 = [(fr[(p["cond"], p["j"])]["L_n"] * 1e6, p["h"]) for p in b if p["set"] == st]
        T[st] = dict(ln40=[x for x, _ in k40], h40=[h for _, h in k40],
                     ln=[x for x, _ in k40 + k32], h=[h for _, h in k40 + k32])
    return T


def rows():
    T = _train()
    fresh = [r for r in B._load(HERE / "bench.jsonl") if r.get("ok") and r.get("ok_cycles", 0) >= 100]
    bals = {s: NT.WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    jobs_, prof = [], []
    for r in fresh:
        st = NT.SK.pset(r["cond"])
        t, ln = T[st], r["L_n"] * 1e6
        jobs_.append((r, *bals[NT.WL.SRC.get(r["cond"], "crossset")]))
        prof.append(dict(set=st, ln=ln, inr=in_range(ln, t["ln"]), T=NT.median_profile(t["h"]),
                         L=FN.line_profile(t["ln"], t["h"], ln), L40=FN.line_profile(t["ln40"], t["h40"], ln)))
    with Pool(4) as pool:
        first = pool.map(NT._first, jobs_)
        sec = {k: pool.map(NT._second, [j + (p[k],) for j, p in zip(jobs_, prof)]) for k in ("T", "L", "L40")}
    out = []
    for i, (r, f, p) in enumerate(zip(fresh, first, prof)):
        e = dict(NS=f["e"]["NS"], C=f["e"]["C"], Tself=f["e"]["Tself"], NT=sec["T"][i]["e"], NL=sec["L"][i]["e"],
                 NL40=sec["L40"][i]["e"])
        e["NR"] = e["NL"] if p["inr"] else e["NS"]
        lev = dict(N=f["lev"]["N"], Tself=f["lev"]["Tself"], T=sec["T"][i]["lev"], L=sec["L"][i]["lev"],
                   L40=sec["L40"][i]["lev"])
        out.append(dict(cond=r["cond"], set=p["set"], j=r["j"], L_n_um=p["ln"], inr=p["inr"], h=f["h"], tL=p["L"],
                        e=e, lev=lev))
    meta = {st: dict(n_train=len(T[st]["h"]), ln_range=[min(T[st]["ln"]), max(T[st]["ln"])],
                     rho=FN.spearman(T[st]["ln"], [h[-1] for h in T[st]["h"]])) for st in T}
    (HERE / "rows.json").write_text(json.dumps(dict(meta=meta, rows=out)) + "\n")
    print(len(out), "fresh designs;", {s: (m["n_train"], round(m["rho"], 3)) for s, m in meta.items()})


def report():
    D = json.loads((HERE / "rows.json").read_text())
    rs, meta = D["rows"], D["meta"]
    med = PL._med
    S = {}
    for st in SETS:
        t = [r for r in rs if r["set"] == st]
        if not t:
            continue
        S[st] = dict(n=len(t), n_in=sum(r["inr"] for r in t), rho=meta[st]["rho"], n_train=meta[st]["n_train"],
                     e={k: med(r["e"][k] for r in t) for k in ("NS", "NT", "NL", "NL40", "NR", "C", "Tself")},
                     emax={k: max(r["e"][k] for r in t) for k in ("NS", "NL", "NR")},
                     lev={k: med(r["lev"][k] for r in t) for k in ("N", "T", "L", "L40", "Tself")},
                     beat={k: sum(r["e"][k] < r["e"]["NS"] for r in t) for k in ("NT", "NL", "NL40")})
    g = [r for r in rs if r["inr"]]
    n_beat = sum(r["e"]["NL"] < r["e"]["NS"] for r in g)
    V = verdicts(S, n_beat, len(g))
    f = lambda x, w, p: f"{x:{w}.{p}f}"
    L = ["cell-fidelity milestone 5zz: the anode-thickness line on a second fresh DFN pool (8 designs per set, none of",
         "5z's or 5zy's picks), fitted on all 72 designs simulated so far (L) or on 5zk's 40 (L40); R = L inside the",
         "pooled training thickness range of the set, else NS. Set medians over the fresh designs.", "",
         f"{'set':12s}{'tr':>3s}{'rho':>6s}{'in':>3s}{'eNS':>7s}{'eNT':>7s}{'eNL40':>7s}{'eNL':>7s}{'eNR':>7s}"
         f"{'eC':>7s}{'eTs':>7s}{'NT<NS':>6s}{'NL<NS':>6s}{'maxNS':>7s}{'maxNL':>7s}{'maxNR':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n_train']:3d}{d['rho']:6.2f}{d['n_in']:3d}"
                 + "".join(f(d['e'][k], 7, 3) for k in ("NS", "NT", "NL40", "NL", "NR", "C", "Tself"))
                 + "".join(f"{d['beat'][k]:6d}" for k in ("NT", "NL"))
                 + "".join(f(d['emax'][k], 7, 3) for k in ("NS", "NL", "NR")))
    L += ["", f"{'set':12s}{'levN':>7s}{'levT':>7s}{'levL40':>7s}{'levL':>7s}{'levTs':>7s}"]
    for st, d in S.items():
        L.append(f"{st:12s}" + "".join(f(d['lev'][k], 7, 2) for k in ("N", "T", "L40", "L", "Tself")))
    c = V["counts"]
    L += ["", "(tr = training designs, 5zk's and 5zy's; rho = their Spearman of anode thickness against the"
              " separator-node late gain; in = fresh designs inside the training thickness range; e = |ln(L_pred(99) /"
              " L_DFN(99))| at kappa = 25.3, line through cycles 2..10, q_S, no drift; eTs = the design's own late"
              " gains, reads cycle 99, an in-sample ceiling; max = worst fresh design; lev in mV)", "",
          f"H252 (e_NR < e_NS on >= 3 of 4 sets): {V['H252']} ({c['nr_sets']} of {len(S)})",
          f"H253 (NL < NS on the in-range designs, one-sided sign test p <= 0.05): {V['H253']} ({c['nl_beats_ns_in']}"
          f" of {c['n_in']}, p = {sign_p(c['nl_beats_ns_in'], c['n_in']):.3f})",
          f"H254 (pooled line beats 5zk-only line, e_NL < e_NL40 on >= 3 of 4 sets): {V['H254']}"
          f" ({c['nl_vs_nl40_sets']} of {len(S)})",
          f"H255 (OKane2022 e_NR <= (e_NS + e_C)/2): {V['H255']}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, verdicts=V, meta=meta), indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"bench": bench, "rows": rows, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
