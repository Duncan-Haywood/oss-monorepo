"""Milestone 7t: why does the ten-cycle forecast error grow with the plating rate? No new simulation; stdlib only.

    python experiments/bend7t/run.py report     # H326 to H330 -> results.txt, summary.json

7s found the cycle-10 forecast error of the two tuned cells (Mohtat2020@3x, Ecker2015@2x) rises from plating
multiplier f = 10 to f = 30 while the drift multiplier m (the R-rate drift the ten-cycle line ignores) moves off 1.
This step reads every design already benched by fresh7h (four committed sets), plating7r (f = 10) and plating7s
(f = 30) and asks whether the plating reaction throttles itself over the cycles (lithium plated per cycle late
against early), whether that throttle sets each design's drift, and how long a look the faster cells need.

    T    = [(P99 - P90) / 9] / [(P10 - P2) / 8]      P_n cumulative lithium lost to plating at the end of cycle n
    phi  = (P99 - P2) / (L99 - L2)                    L_n cumulative lithium lost (SEI + plating)
    s_k  = (L_k - L2) / (L99 - L2)                    share of the cycle-99 loss seen by cycle k
Plan in ../../LOG.md (7t plan).
"""
import json
import random
import sys
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
CELL = "000"
WINDOWS = (10, 15, 20, 30, 40, 50)
SOURCES = (("fresh7h", "committed"), ("plating7r", "f10"), ("plating7s", "f30"))
TUNED = ("Mohtat2020", "Ecker2015")
FADE_X10 = 25.0          # H329's bar: 10 cycles times the fade ratio of about 2.5 (7r probe 0.042 -> 0.107, 0.050 -> 0.120)
N_PERM, SEED = 20000, 7201


# ---------- pure helpers (tested) ----------

def _cum(seq, n):
    """Cumulative value at the end of cycle n (1-based)."""
    return seq[n - 1]


def throttle(P):
    early = (_cum(P, 10) - _cum(P, 2)) / 8
    late = (_cum(P, 99) - _cum(P, 90)) / 9
    return late / early if early > 0 else float("nan")


def share(P, L):
    d = _cum(L, 99) - _cum(L, 2)
    return (_cum(P, 99) - _cum(P, 2)) / d if d > 0 else float("nan")


def seen(L, k):
    d = _cum(L, 99) - _cum(L, 2)
    return (_cum(L, k) - _cum(L, 2)) / d if d > 0 else float("nan")


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
    """Two-sided permutation p value of Spearman's rho."""
    rng = random.Random(seed)
    ra, rb = ranks(a), ranks(b)
    obs = abs(pearson(ra, rb))
    rb = list(rb)
    hit = 0
    for _ in range(n):
        rng.shuffle(rb)
        if abs(pearson(ra, rb)) >= obs - 1e-12:
            hit += 1
    return (hit + 1) / (n + 1)


def look_needed(med_e, target):
    """Shortest look k (linear between windows) at which the median error med_e[k] reaches target; None if never."""
    ks = sorted(med_e)
    if med_e[ks[0]] <= target:
        return float(ks[0])
    for k0, k1 in zip(ks, ks[1:]):
        e0, e1 = med_e[k0], med_e[k1]
        if e1 <= target < e0:
            return k0 + (e0 - target) / (e0 - e1) * (k1 - k0)
    return None


def look_at_share(med_s, target):
    """Window k (linear between windows, extrapolated below the first from s_2 = 0) where median s_k reaches target."""
    ks = sorted(med_s)
    pts = [(2, 0.0)] + [(k, med_s[k]) for k in ks]
    for (k0, s0), (k1, s1) in zip(pts, pts[1:]):
        if s0 <= target <= s1 and s1 > s0:
            return k0 + (target - s0) / (s1 - s0) * (k1 - k0)
    return None


def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def judge(G):
    """H326 to H330 from the per set-condition summary G[(set, tag)]. Pure; tested."""
    keys = list(G)
    tuned = [k for k in keys if k[1] in ("f10", "f30")]
    r326 = [G[k]["rho_dm_e10"] for k in keys]
    t10 = {s: G[(s, "f10")]["med_T"] for s in TUNED}
    t30 = {s: G[(s, "f30")]["med_T"] for s in TUNED}
    r328 = [G[k]["rho_T_m"] for k in tuned]
    looks = {s: look_needed(G[(s, "f30")]["med_E"], G[(s, "f10")]["med_E"][10]) for s in TUNED}
    r330 = spearman([G[k]["med_T"] for k in keys], [G[k]["med_dm"] for k in keys])
    return dict(
        H326=verdict(all(r >= 0.7 for r in r326), any(r < 0.3 for r in r326)),
        H327=verdict(all(t30[s] < t10[s] for s in TUNED), all(t30[s] > t10[s] for s in TUNED)),
        H328=verdict(all(r >= 0.5 for r in r328), any(r <= 0 for r in r328)),
        H329=verdict(all(looks[s] is not None and looks[s] <= FADE_X10 for s in TUNED),
                     all(looks[s] is None for s in TUNED)),
        H330=verdict(r330 <= -0.5, r330 >= 0)), dict(looks=looks, rho330=r330)


# ---------- data ----------

def _load(path):
    return [json.loads(x) for x in path.read_text().splitlines() if x.strip()]


def designs():
    out = []
    for src, tag in SOURCES:
        rows = json.loads((EXP / src / "rows.json").read_text())
        bench = {(r["cond"], r["j"]): r for r in _load(EXP / src / "bench.jsonl")}
        for o in rows:
            if "cells" in o:
                m, E = o["cells"][CELL]["m"], o["cells"][CELL]["eL"]
            else:
                m, E = o["m"], o["E"]
            b = bench[(o["cond"], o["j"])]
            P, L = b["pl_mol"], b["lost_mol"]
            out.append(dict(set=o["set"], tag=tag, cond=o["cond"], j=o["j"], m=m, dm=abs(m - 1),
                            E={int(k): v for k, v in E.items()}, T=throttle(P), phi=share(P, L),
                            s={k: seen(L, k) for k in WINDOWS}))
    return out


def group(D):
    G = {}
    for key in sorted({(d["set"], d["tag"]) for d in D}, key=lambda k: ([t for _, t in SOURCES].index(k[1]), k[0])):
        ds = [d for d in D if (d["set"], d["tag"]) == key]
        dm, e10, T, m = [d["dm"] for d in ds], [d["E"][10] for d in ds], [d["T"] for d in ds], [d["m"] for d in ds]
        G[key] = dict(n=len(ds), med_T=median(T), med_phi=median(d["phi"] for d in ds), med_m=median(m),
                      med_dm=median(dm), med_E={k: median(d["E"][k] for d in ds) for k in WINDOWS},
                      med_s={k: median(d["s"][k] for d in ds) for k in WINDOWS},
                      rho_dm_e10=spearman(dm, e10), p_dm_e10=perm_p(dm, e10),
                      rho_T_m=spearman(T, m), p_T_m=perm_p(T, m))
    return G


def report():
    D = designs()
    G = group(D)
    V, X = judge(G)
    share_look = {s: look_at_share(G[(s, "f30")]["med_s"], G[(s, "f10")]["med_s"][10]) for s in TUNED}
    keys = list(G)
    p330 = perm_p([G[k]["med_T"] for k in keys], [G[k]["med_dm"] for k in keys])
    f = lambda x: "  none" if x is None else f"{x:6.1f}"
    L = ["cell-fidelity milestone 7t: what bends the curve the ten-cycle forecast draws straight. No new simulation;",
         "rows.json and bench.jsonl of fresh7h (committed sets), plating7r (f = 10), plating7s (f = 30); cell 000.",
         "T = late (cycles 90-99) over early (2-10) plating per cycle; phi = plating share of the cycle 2-99 loss;",
         "rho by Spearman, p by 20,000 permutations (seed 7201).", "",
         f"{'set':12s}{'cond':>10s}{'n':>4s}{'med T':>8s}{'med phi':>9s}{'med m':>8s}{'med E10':>9s}{'med E50':>9s}"
         f"{'s10':>7s}{'rho(|m-1|,E10)':>16s}{'rho(T,m)':>14s}"]
    for k in keys:
        g = G[k]
        L.append(f"{k[0]:12s}{k[1]:>10s}{g['n']:4d}{g['med_T']:8.3f}{g['med_phi']:9.3f}{g['med_m']:8.3f}"
                 f"{g['med_E'][10]:9.3f}{g['med_E'][50]:9.3f}{g['med_s'][10]:7.3f}"
                 f"{g['rho_dm_e10']:+9.2f} p{g['p_dm_e10']:.3f}{g['rho_T_m']:+7.2f} p{g['p_T_m']:.3f}")
    L += ["", "median E_k by window (k = " + ", ".join(map(str, WINDOWS)) + ") and median s_k on the tuned cells:"]
    for s in TUNED:
        for tag in ("f10", "f30"):
            g = G[(s, tag)]
            L.append(f"  {s:11s}{tag:4s} E " + " ".join(f"{g['med_E'][k]:.3f}" for k in WINDOWS)
                     + "   s " + " ".join(f"{g['med_s'][k]:.3f}" for k in WINDOWS))
    L += ["", "look the f = 30 cell needs to reach the f = 10 median E10, and the look a share-scaled rule would pick:"]
    for s in TUNED:
        L.append(f"  {s:11s} target {G[(s, 'f10')]['med_E'][10]:.3f}: needed {f(X['looks'][s])} cycles; "
                 f"share-matched (s = {G[(s, 'f10')]['med_s'][10]:.3f}) {f(share_look[s])} cycles")
    L += ["", f"across the {len(keys)} set-conditions: rho(med T, med |m-1|) = {X['rho330']:+.2f}, p = {p330:.3f}", ""]
    for h, t in (("H326", "within every set-condition rho(|m-1|, E10) >= 0.7"),
                 ("H327", "median T lower at f = 30 than at f = 10 on both cells"),
                 ("H328", "within every tuned set-condition rho(T, m) >= 0.5"),
                 ("H329", "f = 30 reaches the f = 10 median E10 within 25 cycles on both cells"),
                 ("H330", "across set-conditions rho(med T, med |m-1|) <= -0.5")):
        L.append(f"{h} ({t}): {V[h]}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    S = dict(verdicts=V, looks=X["looks"], share_look=share_look, rho330=X["rho330"], p330=p330,
             groups={f"{a}|{b}": g for (a, b), g in G.items()},
             designs=[dict(set=d["set"], tag=d["tag"], j=d["j"], m=d["m"], T=d["T"], phi=d["phi"], E10=d["E"][10],
                           s10=d["s"][10]) for d in D])
    (HERE / "summary.json").write_text(json.dumps(S, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"report": report}[sys.argv[1]]()
