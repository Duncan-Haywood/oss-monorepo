"""Exhaustive table of SKY130 area x delay for every (design, ABC pass sequence of length <= 3), then search methods at equal
budget replayed from that table, then the session-written proposals evaluated through the flow.

Needs the PDK files: sh fetch_pdk.sh pdk   (from this project directory). About 8 minutes on 4 cores."""
import json
import random
import statistics
import sys
import tempfile
from multiprocessing import Pool
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from chip_scriptsearch import search  # noqa: E402
from chip_ppa_sky130mac import flow  # noqa: E402

LIB = ROOT / "work" / "sky130_filtered.lib"
SEEDS = 200
BUDGETS = (10, 20, 40)
_ev = None
INF = float("inf")


def _init(lib):
    global _ev
    _ev = search.Evaluator(lib)


def _one(p):
    return p, _ev(p)


def build_table(pdk):
    LIB.parent.mkdir(exist_ok=True)
    flow.filtered_liberty(Path(pdk) / flow.LIB_REL, LIB)
    pts = search.all_points(search.MAXLEN)
    with Pool(4, initializer=_init, initargs=(str(LIB),)) as pool:
        return dict(pool.map(_one, pts, chunksize=8))


def pct(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(q * len(xs)))]


def run(pdk=ROOT / "pdk"):
    tpath = ROOT / "experiments" / "table.json"
    if tpath.exists():
        table0 = {(k.split(":")[0], tuple(k.split(":")[1].split("|")) if k.split(":")[1] else ()): v
                 for k, v in json.loads(tpath.read_text()).items()}
        table = {k: (float("inf") if v is None else v) for k, v in table0.items()}
    else:
        table = build_table(pdk)
        tpath.write_text(json.dumps({search.key(p): (None if v == float("inf") else round(v, 3)) for p, v in sorted(table.items())}, indent=0))
    opt_p = min(table, key=table.get)
    opt = table[opt_p]
    failed = [p for p, v in table.items() if v == float("inf")]
    table_ok = {p: v for p, v in table.items() if v != float("inf")}
    ref_plain = table[("ref", ())]
    lines = [f"points evaluated: {len(table)} (2 designs x sequences of length 0..{search.MAXLEN} over {len(search.PASSES)} passes); "
             f"{len(failed)} failed in ABC (score = infinity, still cost one evaluation when a method draws them)",
             f"optimum: {opt:.1f} um2.ns at {search.key(opt_p)}",
             f"reference with no passes (strash; map): {ref_plain:.1f}; median over the table: {statistics.median(table_ok.values()):.1f}"]
    srt = sorted(table_ok.values())
    lines.append(f"fraction of table within 1% / 5% of optimum: {sum(v <= opt*1.01 for v in srt)/len(srt):.3f} / {sum(v <= opt*1.05 for v in srt)/len(srt):.3f}")
    lines.append("")
    lines.append(f"search at equal budget, {SEEDS} seeds each; value = best score found / optimum (1.000 = found the optimum)")
    lines.append("budget method        median  finite p90   frac<=1.01  frac==opt")
    for b in BUDGETS:
        for name, fn in (("random", search.random_search), ("hillclimb", search.hill_climb)):
            r = []
            for s in range(SEEDS):
                ev = search.TableEvaluator(table)
                r.append(fn(ev, b, random.Random(1000 * b + s)) / opt)
            lines.append(f"{b:>6} {name:<11} {statistics.median(r):.3f}  {sum(x < INF for x in r)/len(r):.2f} {pct(r, .9):.3f}  "
                         f"{sum(x <= 1.01 for x in r)/len(r):.3f}       {sum(x <= 1.0 + 1e-9 for x in r)/len(r):.3f}")
    lines.append("")
    props = [(d, tuple(s)) for d, s in map(json.loads, (ROOT / "proposals_session.json").read_text().splitlines())]
    ev = search.Evaluator(LIB)
    sc = [ev(p) for p in props]
    # first b proposals, in file order, give the session agent's best after b evaluations (distinct points only)
    lines.append(f"session-written proposals ({len(props)} in file order, one attempt, committed before any search ran; {len(set(props))} distinct)")
    for b in BUDGETS:
        seen, best = set(), None
        for p, s in zip(props, sc):
            if len(seen) >= b:
                break
            seen.add(p)
            best = s if best is None or s < best else best
        lines.append(f"  after {b} distinct evaluations: best/optimum = {best/opt:.3f}")
    inside = [p for p in props if p in table]
    lines.append(f"  {len(props) - len(inside)} proposals have length 4 and lie outside the exhaustive table")
    allbest = min(sc)
    lines.append(f"  best proposal overall: {allbest:.1f} ({allbest/opt:.3f} x optimum)")
    # equivalence of the winning netlists with the reference
    ref = search.DESIGNS["ref"]
    lines.append("")
    lines.append("equivalence of mapped netlists to the reference a*b+c (Yosys miter + sat, all 2^16 inputs):")
    top5 = sorted(table, key=table.get)[:5] + [min(props, key=lambda p: ev(p))]
    for p in top5:
        name = "seq:" + "|".join(p[1])
        flow.SCRIPTS[name] = search.script_text(p[1])
        r, ok = flow.map_checked(ref, "mac4", search.DESIGNS[p[0]], "mac4", name, str(LIB))
        lines.append(f"  {search.key(p):<48} {r['area_um2']*r['delay_ps']/1000:.1f}  equivalent={ok}")
    return "\n".join(lines)


if __name__ == "__main__":
    out = run()
    print(out)
    (ROOT / "experiments" / "results.txt").write_text(out + "\n")
