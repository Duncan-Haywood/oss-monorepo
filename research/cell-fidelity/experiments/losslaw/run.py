"""Milestone 5t: does a sqrt(n) lithium-loss law, fitted to the same ten DFN cycles as 5s's power law, make 5r's
electrode-balance map a usable fade list for 5n's union screen?

    python experiments/losslaw/run.py    # stdlib only, seconds -> results.txt, summary.json

5s found the map right and the extrapolated lithium loss wrong: L(n) = a n^b through cycles 2 to 10 over-predicts the
cycle-99 loss 1.2 to 2.8 times because plating slows down. This milestone swaps in L(n) = a + b sqrt(n) (the SEI-growth
form), least squares through the same end-of-cycle losses, chosen on the 27 diagnostic designs (lithium only) before any
test prediction was computed. Everything it needs is committed by 5s: the ten-cycle DFN runs (bench.jsonl), the balance
tables (balance.jsonl, ocp.json) and the committed 100-cycle pools. No new simulation. Plan in ../../LOG.md (5t plan).
"""
import importlib.util
import json
import math
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
MS = EXP / "mapscreen"


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


S = _mod("mapscreen_run", MS / "run.py")
B, K, TO, M = S.B, S.K, S.TO, S.M
spearman, ocv_energy = S.spearman, S.ocv_energy
FIT = range(2, K + 1)
TEST = tuple(c for c in S.CONDITIONS if c not in S.DIAG)   # fixed in the plan: 13 conditions


# ---------- pure helpers (stdlib; tested) ----------

def sqrt_law_fit(lost, fit=FIT):
    """(a, b) of L(n) = a + b sqrt(n), least squares through the lithium lost by the end of cycle n (lost[n-1]), n in
    fit; None when fewer than three positive points (5s's rule)."""
    pts = [(n, lost[n - 1]) for n in fit if n - 1 < len(lost) and lost[n - 1] > 0]
    if len(pts) < 3:
        return None
    return S.lsq([math.sqrt(n) for n, _ in pts], [v for _, v in pts])


def sqrt_law_at(ab, n):
    a, b = ab
    return a + b * math.sqrt(n)


def map_predict_sqrt(bal, lost, wh10, k=K, to=TO):
    """5s's map_predict with the sqrt law: cycle-`to` energy = wh10 x E_ocv(n_Li - L(to-1)) / E_ocv(n_Li - L_end(k-1)),
    L(to-1) floored at the measured cycle-(k-1) loss; no fade when no law can be fitted."""
    ab = sqrt_law_fit(lost)
    if ab is None:
        return wh10
    l_k = lost[k - 2]
    l_to = max(sqrt_law_at(ab, to - 1), l_k)
    e_k, _ = ocv_energy(bal["n_li"] - l_k, bal)
    e_to, _ = ocv_energy(bal["n_li"] - l_to, bal)
    return wh10 * e_to / e_k if e_k > 0 else 0.0


def sign_p(wins, n):
    """Exact two-sided sign test (binomial, p = 1/2) for `wins` of `n` paired comparisons."""
    k = min(wins, n - wins)
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)


def verdicts(C, test=TEST):
    T = [C[c] for c in test if c in C]
    n = len(T)
    w112 = sum(c["rho_law"] > c["rho_sqrt"] for c in T)
    w113 = sum(c["mae_fade_law"] < c["mae_fade_sqrt"] for c in T)
    g = [c["gap_law"] for c in T]
    d = [c["gap_law"] - c["gap_sqrt"] for c in T]
    w116 = sum(c["rho_law"] > c["rho_map"] for c in T)
    return dict(n=n,
                H112=S.verdict(w112 >= 9, w112 <= 6), H112_wins=w112,
                H113=S.verdict(w113 >= 9, w113 <= 6), H113_wins=w113,
                H114=S.verdict(all(x <= 0.01 for x in g), any(x > 0.03 for x in g)), H114_worst=max(g),
                H115=S.verdict(all(x <= 0.0 for x in d), any(x > 0.01 for x in d)), H115_worst=max(d),
                H116=S.verdict(w116 >= 10, w116 <= 6), H116_wins=w116,
                p112=sign_p(w112, n), p113=sign_p(w113, n), p116=sign_p(w116, n))


# ---------- report ----------

def rows_for(c, pool, runs, bal, ocp):
    rows, _ = S.score_condition(c, pool, runs, bal, ocp)
    by = {r["j"]: r for r in rows}
    for r in pool:
        if r["j"] not in by:
            continue
        f = runs[(c, r["j"])]
        b = dict(bal[(c, r["j"])]) | dict(g=ocp["grid"]) | ocp["sets"][bal[(c, r["j"])]["pset"]]
        mass, wh10 = bal[(c, r["j"])]["mass_kg"], f["cycle_wh"][K - 1]
        pred = map_predict_sqrt(b, f["lost_mol"], wh10)
        ab = sqrt_law_fit(f["lost_mol"])
        by[r["j"]].update(law=pred / mass, fade_law=1 - pred / wh10 if wh10 else None,
                          l99_ratio_pow=(S.power_at(S.power_fit(f["lost_mol"]), TO - 1) / sqrt_law_at(ab, TO - 1))
                          if ab and S.power_fit(f["lost_mol"]) and sqrt_law_at(ab, TO - 1) > 0 else None)
    return rows


def condition(rows):
    d = S.condition(rows)
    sc = [r["score"] for r in rows]
    ib = max(range(len(rows)), key=lambda i: sc[i])
    gl, pl = S.union(rows, "law")
    fl = [abs(r["fade_law"] - r["fade_dfn"]) for r in rows if r["fade_dfn"] is not None]
    # three-list union, descriptive only (not a hypothesis): raw + sqrt + law, top 4 each
    idx = range(len(rows))
    tri = set(sorted(idx, key=lambda i: -rows[i]["raw10"])[:M]) | set(sorted(idx, key=lambda i: -rows[i]["sqrt"])[:M]) \
        | set(sorted(idx, key=lambda i: -rows[i]["law"])[:M])
    return d | dict(rho_law=spearman([r["law"] for r in rows], sc), mae_fade_law=statistics.median(fl), gap_law=gl,
                    n_law=len(pl), best_rank_law=sorted(idx, key=lambda i: -rows[i]["law"]).index(ib) + 1,
                    fade_law_median=statistics.median(r["fade_law"] for r in rows if r["fade_law"] is not None),
                    gap_tri=1 - max(rows[i]["score"] for i in tri) / max(sc), n_tri=len(tri),
                    pow_over_sqrt_l99=statistics.median(r["l99_ratio_pow"] for r in rows if r.get("l99_ratio_pow")))


def diag_rows(bal, ocp):
    """The 27 development designs (5s's diagnostic, cycle-100 lithium known): the sqrt law's L(99) and fade against DFN's."""
    out = []
    for r in B._load(MS / "diag.jsonl"):
        key = (r["cond"], r["j"])
        if not r["ok"] or len(r.get("cycle_wh", [])) < TO:
            continue
        b = dict(bal[key]) | dict(g=ocp["grid"]) | ocp["sets"][bal[key]["pset"]]
        L, wh = r["lost_mol"], r["cycle_wh"]
        ab = sqrt_law_fit(L[:K])
        e9, _ = ocv_energy(b["n_li"] - L[K - 2], b)
        e_law, _ = ocv_energy(b["n_li"] - max(sqrt_law_at(ab, TO - 1), L[K - 2]), b)
        out.append(dict(cond=r["cond"], j=r["j"], l_ratio=sqrt_law_at(ab, TO - 1) / L[TO - 2],
                        fade_dfn=1 - wh[TO - 1] / wh[K - 1], map_law=1 - e_law / e9))
    return out


def report():
    P, _ = S._pools()
    runs = {(r["cond"], r["j"]): r for r in B._load(MS / "bench.jsonl")}
    bal = {(r["cond"], r["j"]): r for r in B._load(MS / "balance.jsonl")}
    ocp = json.loads((MS / "ocp.json").read_text())
    C, R = {}, {}
    for c in S.CONDITIONS:
        R[c] = rows_for(c, P[c], runs, bal, ocp)
        if len(R[c]) >= 8:
            C[c] = condition(R[c])
    V = verdicts(C)
    L = ["cell-fidelity milestone 5t: 5r's balance map fed L(n) = a + b sqrt(n) fitted to ten DFN cycles' lithium loss, as the union screen's fade list",
         f"test conditions (fixed in the plan): {len(TEST)}; development conditions (5s's diagnostic, reported beside, not counted): {', '.join(S.DIAG)}",
         "no new simulation: 5s's committed ten-cycle runs, balance tables and the committed 100-cycle pools", "",
         f"{'condition':18s}{'n':>4s}{'rho sqrtE':>10s}{'rho pow':>8s}{'rho law':>8s}{'|fade| sqrtE':>13s}{'pow':>6s}{'law':>6s}"
         f"{'gap 5n':>8s}{'gap law':>8s}{'gap tri':>8s}{'rank sqrtE/law':>15s}{'fade dfn':>9s}{'law':>6s}{'Lpow/Llaw':>10s}"]
    for c in S.CONDITIONS:
        if c not in C:
            continue
        d = C[c]
        L.append(f"{c + ('' if c in TEST else ' (dev)'):18s}{d['n']:4d}{d['rho_sqrt']:10.3f}{d['rho_map']:8.3f}{d['rho_law']:8.3f}"
                 f"{d['mae_fade_sqrt']:13.3f}{d['mae_fade_map']:6.3f}{d['mae_fade_law']:6.3f}{d['gap_sqrt']:8.4f}{d['gap_law']:8.4f}"
                 f"{d['gap_tri']:8.4f}{d['best_rank_sqrt']:>10d}/{d['best_rank_law']:<4d}{d['fade_dfn_median']:9.3f}{d['fade_law_median']:6.3f}"
                 f"{d['pow_over_sqrt_l99']:10.2f}")
    n = V["n"]
    L += ["", f"H112 (law map ranks DFN@100 better than 5n's sqrt energy fit on >= 9 of {n}): {V['H112']} ({V['H112_wins']} of {n}; sign test p = {V['p112']:.2f})",
          f"H113 (law map's median |fade error| below the sqrt fit's on >= 9 of {n}): {V['H113']} ({V['H113_wins']} of {n}; p = {V['p113']:.2f})",
          f"H114 (union raw + law within 1% of the pool's DFN best on every test condition): {V['H114']} (worst {V['H114_worst']:.4f})",
          f"H115 (union raw + law no worse than 5n's union on every test condition): {V['H115']} (worst excess {V['H115_worst']:+.4f})",
          f"H116 (law map ranks better than 5s's power-law map on >= 10 of {n}): {V['H116']} ({V['H116_wins']} of {n}; p = {V['p116']:.3f})", "",
          "Descriptive, not in the plan (defined in the script before its first run): the three-list union, top 4 each by raw, sqrt energy fit and law map",
          "  " + "; ".join(f"{c} {C[c]['gap_tri']:.4f} ({C[c]['n_tri']} vs 5n {C[c]['n_sqrt']})" for c in TEST if c in C),
          f"  worst gap {max(C[c]['gap_tri'] for c in TEST if c in C):.4f} against 5n's {max(C[c]['gap_sqrt'] for c in TEST if c in C):.4f}; "
          f"designs resumed to cycle 100, mean {statistics.mean(C[c]['n_tri'] for c in TEST if c in C):.1f} against 5n's "
          f"{statistics.mean(C[c]['n_sqrt'] for c in TEST if c in C):.1f}", ""]
    D = diag_rows(bal, ocp)
    L.append(f"Development designs (seen; lithium is what the law was chosen on): {len(D)}")
    by = {}
    for r in D:
        by.setdefault(r["cond"], []).append(r)
    for c, g in by.items():
        L.append(f"  {c:16s} n={len(g)} median Llaw/Ltrue {statistics.median(r['l_ratio'] for r in g):.2f}; "
                 f"MAE fade map(law L) {statistics.mean(abs(r['map_law'] - r['fade_dfn']) for r in g):.3f}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(test=TEST, conditions=C, verdicts=V, diag=D,
                                                       rows={c: [{k: v for k, v in r.items()} for r in R[c]] for c in R}), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    report()
