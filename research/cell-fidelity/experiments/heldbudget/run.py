"""Milestone 7a (paper draft, its error-budget table): does 5zu's error budget of the ten-cycle forecast hold on the
64 designs 5zk to 5zx never saw (5zy's and 5zz's fresh pools, 16 per set)? 5zu's 2 x 2 x 2 factorial and Shapley split,
imported unchanged from experiments/budget/run.py, applied to the committed x-resolved benches of those pools; then
the pooled 104-design table the paper prints. No new simulation.

    python experiments/heldbudget/run.py rows      # per fresh design: the eight cells and Shapley values (stdlib)
    python experiments/heldbudget/run.py report    # H256 to H259 -> results.txt, summary.json
    python experiments/heldbudget/run.py rounded   # post hoc: the same benches rounded as 5zk's -> rounded.txt

    M: N's node-lever OCP rise (forecast) or the measured plating-weighted OCP rise (5zo)
    D: no drift (forecast) or the measured non-OCP drift (5zq)
    q: 5zs's saturating ten-cycle factor q_S or the measured factor q_M (5zp)
    e_111 (every input measured) is the law floor: what is left is the law itself (its line through cycles 2..10 and
    kappa), not any input.
Plan in ../../LOG.md (7a plan).
"""
import importlib.util
import json
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


BU = _mod("budget_run", EXP / "budget" / "run.py")
PL, WL, B, SK = BU.PL, BU.WL, BU.B, BU.SK
CELLS, FACTORS, SETS, LM50 = BU.CELLS, BU.FACTORS, BU.SETS, BU.LM50
POOLS = (("5zy", "freshnode"), ("5zz", "rangeline"))
TOL, BAD = 0.01, 0.02


# ---------- pure helpers (stdlib; tested) ----------

def set_summary(t):
    med = PL._med
    return dict(n=len(t), e={c: med(r["e"][c] for r in t) for c in CELLS},
                phi={g: med(r["phi"][g] for r in t) for g in FACTORS},
                gap=med(r["e"]["000"] - r["e"]["111"] for r in t),
                floor_share=med((r["e"]["111"] / r["e"]["000"]) if r["e"]["000"] > 0 else 0.0 for r in t),
                top={g: sum(r["top"] == g for r in t) for g in FACTORS},
                neg={g: sum(r["phi"][g] < 0 for r in t) for g in FACTORS})


def verdicts(S):
    v = PL.verdict
    rk = lambda st, g: BU.rank_of(S[st]["phi"], g) if st in S else None
    r256, r259 = rk("OKane2022", "M"), rk("Chen2020", "D")
    q = [abs(S[s]["phi"]["q"]) for s in S]
    ok257, bad257 = sum(x <= TOL for x in q), sum(x > BAD for x in q)
    g = S["Ai2020"]["gap"] if "Ai2020" in S else None
    return dict(H256=v(r256 == 1, r256 == 3), H257=v(ok257 >= 3, bad257 >= 3),
                H258=v(g is not None and g < 0, g is not None and g > 0),
                H259=v(r259 == 1, r259 == 3),
                counts=dict(r256=r256, ok257=ok257, bad257=bad257, gap_ai=g, r259=r259))


# ---------- rows ----------

def _job(a):
    pool, r = a
    bals = {s: WL.SF._bal(EXP / s) for s in ("crossset", "calmap")}
    row = BU._row(r, *bals[WL.SRC.get(r["cond"], "crossset")])
    row["pool"] = pool
    return row


def rows():
    jobs = []
    for pool, d in POOLS:
        for r in B._load(EXP / d / "bench.jsonl"):
            if r.get("ok") and r.get("ok_cycles", 0) >= 100:
                jobs.append((pool, r))
    with Pool(4) as p:
        out = p.map(_job, jobs)
    (HERE / "rows.json").write_text(json.dumps(out) + "\n")
    print(len(out), "designs")


def _table(L, title, S):
    f = lambda x: f"{x:7.3f}"
    L += [title, f"{'set':12s}{'n':>3s}" + "".join(f"{'e' + c:>7s}" for c in CELLS)
          + f"{'gap':>7s}{'phi_M':>7s}{'phi_D':>7s}{'phi_q':>7s}{'floor':>7s}{'topM':>5s}{'topD':>5s}{'topq':>5s}"
          f"{'negM':>5s}{'negD':>5s}{'negq':>5s}"]
    for st, d in S.items():
        L.append(f"{st:12s}{d['n']:3d}" + "".join(f(d['e'][c]) for c in CELLS) + f(d["gap"])
                 + "".join(f(d["phi"][g]) for g in FACTORS) + f(d["floor_share"])
                 + "".join(f"{d['top'][g]:>5d}" for g in FACTORS) + "".join(f"{d['neg'][g]:>5d}" for g in FACTORS))
    L.append("")


def _by_set(rs):
    return {st: set_summary([r for r in rs if r["set"] == st]) for st in SETS if any(r["set"] == st for r in rs)}


def report():
    fresh = json.loads((HERE / "rows.json").read_text())
    old = json.loads((EXP / "budget" / "rows.json").read_text())
    S = _by_set(fresh)
    V = verdicts(S)
    per_pool = {p: _by_set([r for r in fresh if r["pool"] == p]) for p, _ in POOLS}
    allS = _by_set(old + fresh)
    L = ["cell-fidelity milestone 7a: the ten-cycle forecast's error budget (5zu) held out on 64 fresh designs",
         "(5zy's and 5zz's pools, never used to build any forecast input), and the pooled 104-design table.",
         "Cells mdq: M node-lever OCP rise, D non-OCP drift, q capacity factor; 0 forecast, 1 measured. Set medians.", ""]
    _table(L, "Held out (primary, H256 to H259): 64 fresh designs", S)
    for p, _ in POOLS:
        _table(L, f"Held out, pool {p} only (32 designs)", per_pool[p])
    _table(L, "5zu, in sample (40 designs, from experiments/budget/rows.json)", _by_set(old))
    _table(L, "Paper table: all 104 x-resolved designs", allS)
    c = V["counts"]
    L += ["(e = |ln(L_pred(99)/L_DFN(99))| at kappa = 25.3, line through cycles 2..10. gap = e_000 - e_111;",
          " phi_X = Shapley value of measuring X (drop in e), set medians of per-design values; floor = median of",
          " e_111 / e_000, the share of the forecast's error left when every input is measured (the law's own term);",
          " topX = designs where X has the largest phi; negX = designs where measuring X raises e on average)", "",
          f"H256 (phi_M the largest of three on OKane2022, held out): {V['H256']} (rank {c['r256']})",
          f"H257 (|phi_q| <= {TOL} on >= 3 of 4 sets, held out): {V['H257']} ({c['ok257']} <= {TOL}, {c['bad257']} > {BAD})",
          f"H258 (Ai2020 set median gap < 0, held out): {V['H258']} (gap {c['gap_ai']:.3f})",
          f"H259 (phi_D the largest of three on Chen2020, held out): {V['H259']} (rank {c['r259']})"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(sets=S, pools=per_pool, in_sample=_by_set(old),
                                                       all104=allS, verdicts=V), indent=1) + "\n")
    print("\n".join(L))


def _sig(x, n=7):
    if isinstance(x, float):
        return float(f"{x:.{n - 1}e}")
    if isinstance(x, list):
        return [_sig(v, n) for v in x]
    return x


def rounded():
    """Post hoc (not in the plan): the fresh benches rounded to 7 significant digits, as 5zk's depth bench was
    committed, to see whether rounding explains the in-sample budget's lower all-measured error."""
    jobs = []
    for pool, d in POOLS:
        for r in B._load(EXP / d / "bench.jsonl"):
            if r.get("ok") and r.get("ok_cycles", 0) >= 100:
                jobs.append((pool, {k: (_sig(v) if k not in ("cond", "j", "current_A") else v) for k, v in r.items()}))
    with Pool(4) as p:
        out = p.map(_job, jobs)
    full = json.loads((HERE / "rows.json").read_text())
    L = ["Post hoc: the 64 fresh designs with their benches rounded to 7 significant digits (5zk's depth format).",
         f"{'set':12s}{'e000 full':>10s}{'e000 rnd':>10s}{'e111 full':>10s}{'e111 rnd':>10s}{'max|d e111|':>12s}"]
    for st in SETS:
        a = [r for r in full if r["set"] == st]
        b = {(r["cond"], r["j"]): r for r in out if r["set"] == st}
        d = max(abs(r["e"]["111"] - b[(r["cond"], r["j"])]["e"]["111"]) for r in a)
        med = PL._med
        L.append(f"{st:12s}{med(r['e']['000'] for r in a):10.4f}{med(r['e']['000'] for r in b.values()):10.4f}"
                 f"{med(r['e']['111'] for r in a):10.4f}{med(r['e']['111'] for r in b.values()):10.4f}{d:12.4f}")
    (HERE / "rounded.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"rows": rows, "report": report, "rounded": rounded}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
