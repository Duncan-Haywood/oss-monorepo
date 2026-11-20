"""Milestone 7u: does an early plating throttle set the bend of the ten-cycle forecast? No new simulation; stdlib only.

    python experiments/bend7u/run.py report     # H331 to H335 -> results.txt, summary.json

7t found the plating reaction slows itself on the tuned cells and that the late throttle T orders each design's drift
multiplier m. T uses cycles 90 to 99. This step asks whether its early analogue, measured inside the ten-cycle look,

    O4 = ln[(P10 - P6) / (P6 - P2)]       P_n cumulative lithium plated at the end of cycle n (bench `pl_mol`)

predicts m out of pool, and whether a forecast R(99) = a + 10 s + 89 s m_hat bent by it beats 7c's correction.
Forecasts, leave-one-pool-out over 7p's five pools: N (m_hat = 1), C (7c: best of O1..O3 by |rho| on the training
pools, its line), T (line on O4), CT (line on O3 and O4). Plan in ../../LOG.md (7u plan).
"""
import importlib.util
import json
import math
import random
import sys
from multiprocessing import Pool
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
CELL = "000"
SOURCES = (("plating7r", "f10"), ("plating7s", "f30"))
CONDS = ("Mohtat2020@3x", "Ecker2015@2x")
RULES = ("N", "C", "T", "CT")
N_PERM, SEED = 20000, 7301


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


def _s7p():
    return _mod("sets7p_run", EXP / "sets7p" / "run.py")


# ---------- pure helpers (tested) ----------

def o4(P):
    """ln of plating per cycle over cycles 6-10 against 2-6 (P cumulative, P[0] is cycle 1)."""
    a, b = P[9] - P[5], P[5] - P[1]
    return math.log(a / b) if a > 0 and b > 0 else float("nan")


def ranks(x):
    order = sorted(range(len(x)), key=lambda i: x[i])
    r = [0.0] * len(x)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and x[order[j + 1]] == x[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return r


def pearson(a, b):
    n = len(a)
    ma, mb = sum(a) / n, sum(b) / n
    sab = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    sa = sum((x - ma) ** 2 for x in a) ** 0.5
    sb = sum((y - mb) ** 2 for y in b) ** 0.5
    return sab / (sa * sb) if sa > 0 and sb > 0 else float("nan")


def spearman(a, b):
    return pearson(ranks(a), ranks(b))


def perm_p(a, b, n=N_PERM, seed=SEED):
    rng = random.Random(seed)
    ra, rb = ranks(a), list(ranks(b))
    obs = abs(pearson(ra, rb))
    hit = 0
    for _ in range(n):
        rng.shuffle(rb)
        if abs(pearson(ra, rb)) >= obs - 1e-12:
            hit += 1
    return (hit + 1) / (n + 1)


def ols(X, y):
    """Least squares with an intercept; X rows are feature lists. Normal equations by Gauss-Jordan (k <= 3)."""
    A = [[1.0] + list(x) for x in X]
    k = len(A[0])
    M = [[sum(r[i] * r[j] for r in A) for j in range(k)] + [sum(r[i] * v for r, v in zip(A, y))] for i in range(k)]
    for c in range(k):
        p = max(range(c, k), key=lambda r: abs(M[r][c]))
        M[c], M[p] = M[p], M[c]
        for r in range(k):
            if r != c:
                f = M[r][c] / M[c][c]
                M[r] = [a - f * b for a, b in zip(M[r], M[c])]
    return [M[i][k] / M[i][i] for i in range(k)]


def predict(beta, x):
    return beta[0] + sum(b * v for b, v in zip(beta[1:], x))


def m_hat(rule, train, r):
    """m_hat for held-out row r from training rows (dicts with m, O1..O4)."""
    y = [t["m"] for t in train]
    if rule == "N":
        return 1.0, None
    if rule == "C":
        best = max(("O1", "O2", "O3"), key=lambda o: abs(spearman([t[o] for t in train], y)))
        return predict(ols([[t[best]] for t in train], y), [r[best]]), best
    feats = {"T": ("O4",), "CT": ("O3", "O4")}[rule]
    return predict(ols([[t[f] for f in feats] for t in train], y), [r[f] for f in feats]), None


def q75(v):
    s = sorted(v)
    i = 0.75 * (len(s) - 1)
    lo = int(math.floor(i))
    return s[lo] + (s[min(lo + 1, len(s) - 1)] - s[lo]) * (i - lo)


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def judge(G):
    """H331 to H335 from G[(cond, tag)] with rho_34, rho_4m, med[rule]. Pure; tested."""
    keys = list(G)
    f30 = [k for k in keys if k[1] == "f30"]
    tgt = {k[0]: G[(k[0], "f10")]["med"]["N"] for k in f30}
    tc = [G[k]["med"]["T"] < G[k]["med"]["C"] for k in keys]
    tc_worse = [G[k]["med"]["T"] > G[k]["med"]["C"] for k in keys]
    ct_best = [G[k]["med"]["CT"] < min(G[k]["med"]["C"], G[k]["med"]["T"]) for k in keys]
    ct_worst = [G[k]["med"]["CT"] > max(G[k]["med"]["C"], G[k]["med"]["T"]) for k in keys]
    return dict(
        H331=verdict(all(G[k]["rho_34"] >= 0.9 for k in keys), any(G[k]["rho_34"] < 0.5 for k in keys)),
        H332=verdict(all(G[k]["rho_4m"] >= 0.5 for k in f30), any(G[k]["rho_4m"] <= 0 for k in f30)),
        H333=verdict(all(G[k]["med"]["T"] <= tgt[k[0]] for k in f30),
                     any(G[k]["med"]["T"] >= G[k]["med"]["N"] for k in f30)),
        H334=verdict(sum(tc) >= 3, all(tc_worse)),
        H335=verdict(sum(ct_best) >= 3, all(ct_worst)))


# ---------- data ----------

def _load(path):
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()]


def _job(r):
    _, dr = _s7p()._job(r)
    c = dr["cells"][CELL]
    return dict(cond=r["cond"], j=r["j"], a=c["a"], s=c["s"], m=c["m"], ls=c["ls"], rs=c["rs"], lt=c["lt"],
                e_m=c["e_m"], O4=o4(r["pl_mol"]))


def designs():
    S = _s7p()
    out = []
    for src, tag in SOURCES:
        rows = {(o["cond"], o["j"]): o for o in json.loads((EXP / src / "rows.json").read_text())}
        bench = [b for b in _load(EXP / src / "bench.jsonl") if (b["cond"], b["j"]) in rows]
        with Pool(4) as p:
            per = {(d["cond"], d["j"]): d for d in p.map(_job, bench)}
        for cond in CONDS:
            js = sorted(j for c, j in rows if c == cond)
            pools = S.split_pools(js)
            for pool, pj in pools.items():
                for j in pj:
                    o, d = rows[(cond, j)], per[(cond, j)]
                    out.append(dict(d, tag=tag, set=o["set"], pool=pool, O1=o["O1"], O2=o["O2"], O3=o["O3"],
                                    E10=o["E"]["10"], m_rows=o["m"]))
    return out


def score(D):
    LF = _s7p()._deps().LF
    DC = sys.modules["drift7c_run"]
    out = []
    for key in [(c, t) for _, t in SOURCES for c in CONDS]:
        ds = [d for d in D if (d["cond"], d["tag"]) == key]
        for d in ds:
            train = [t for t in ds if t["pool"] != d["pool"]]
            row = dict(cond=d["cond"], tag=d["tag"], set=d["set"], j=d["j"], pool=d["pool"], m=d["m"], O3=d["O3"],
                       O4=d["O4"], E10=d["E10"], e_m=d["e_m"])
            for rule in RULES:
                mh, pick = m_hat(rule, train, d)
                row[f"m_{rule}"] = mh
                row[f"e_{rule}"] = LF.err_of((d["ls"], d["rs"]), DC.r_at(d["a"], d["s"], mh), d["lt"])
                if pick:
                    row["pick_C"] = pick
            row["e_oracle"] = LF.err_of((d["ls"], d["rs"]), DC.r_at(d["a"], d["s"], d["m"]), d["lt"])
            out.append(row)
    return out


def report():
    D = designs()
    R = score(D)
    ctrl_n = max(abs(r["e_N"] - r["E10"]) for r in R)
    ctrl_m = max(abs(r["e_oracle"] - r["e_m"]) for r in R)
    G = {}
    for key in [(c.split("@")[0], t) for _, t in SOURCES for c in CONDS]:
        rs = [r for r in R if (r["set"], r["tag"]) == key]
        G[key] = dict(n=len(rs), rho_34=spearman([r["O3"] for r in rs], [r["O4"] for r in rs]),
                      rho_4m=spearman([r["O4"] for r in rs], [r["m"] for r in rs]),
                      p_4m=perm_p([r["O4"] for r in rs], [r["m"] for r in rs]),
                      rho_3m=spearman([r["O3"] for r in rs], [r["m"] for r in rs]),
                      med={u: median(r[f"e_{u}"] for r in rs) for u in RULES},
                      q75={u: q75([r[f"e_{u}"] for r in rs]) for u in RULES},
                      oracle=median(r["e_oracle"] for r in rs),
                      picks={o: sum(r.get("pick_C") == o for r in rs) for o in ("O1", "O2", "O3")},
                      win_T_C=sum(r["e_T"] < r["e_C"] for r in rs))
    V = judge(G)
    L = ["cell-fidelity milestone 7u: an early plating throttle O4 = ln[(P10-P6)/(P6-P2)] as the bend of the ten-cycle",
         "forecast. No new simulation: plating7r (f = 10) and plating7s (f = 30) rows and bench; cell 000; 7p's pools,",
         "leave-one-pool-out; error |ln(L_hat/L)| at cycle 99. N straight line; C 7c's correction (best of O1..O3);",
         "T line on O4; CT line on O3 and O4. Spearman p by 20,000 permutations (seed 7301).", "",
         f"control: max |e_N - rows.json E10| = {ctrl_n:.2e}; max |e(m_hat = m) - 7c e_m| = {ctrl_m:.2e}", "",
         f"{'set':12s}{'f':>4s}{'n':>4s}{'rho(O3,O4)':>11s}{'rho(O3,m)':>10s}{'rho(O4,m)':>16s}"
         + "".join(f"{'med ' + u:>9s}" for u in RULES) + f"{'oracle':>8s}{'T<C':>5s}  C picks O1/O2/O3"]
    for k, g in G.items():
        L.append(f"{k[0]:12s}{k[1]:>4s}{g['n']:4d}{g['rho_34']:+11.2f}{g['rho_3m']:+10.2f}{g['rho_4m']:+9.2f} p{g['p_4m']:.3f}"
                 + "".join(f"{g['med'][u]:9.3f}" for u in RULES) + f"{g['oracle']:8.3f}{g['win_T_C']:5d}  "
                 + "/".join(str(g["picks"][o]) for o in ("O1", "O2", "O3")))
    L += ["", "75th percentile of the held-out error:"]
    for k, g in G.items():
        L.append(f"  {k[0]:12s}{k[1]:>4s}" + "".join(f"  {u} {g['q75'][u]:.3f}" for u in RULES))
    L += [""]
    for h, t in (("H331", "rho(O3, O4) >= 0.9 on all four set-conditions"),
                 ("H332", "rho(O4, m) >= 0.5 on both f = 30 set-conditions"),
                 ("H333", "T's median on each f = 30 cell <= that cell's f = 10 median under N"),
                 ("H334", "T's median below C's on >= 3 of 4"),
                 ("H335", "CT's median below min(C, T) on >= 3 of 4")):
        L.append(f"{h} ({t}): {V[h]}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    S = dict(verdicts=V, control=dict(e_N_vs_E10=ctrl_n, oracle_vs_e_m=ctrl_m),
             groups={f"{a}|{b}": g for (a, b), g in G.items()},
             designs=[{k: r[k] for k in ("set", "tag", "j", "pool", "m", "O3", "O4", "E10", "m_C", "m_T", "m_CT",
                                         "e_C", "e_T", "e_CT")} for r in R])
    (HERE / "summary.json").write_text(json.dumps(S, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"report": report}[sys.argv[1]]()
