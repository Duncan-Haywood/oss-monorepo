"""The triage saving in wall-clock DFN time (milestone 7j, for the discussion section).

The results section counts DFN cycles per design. A practitioner pays wall-clock time, which is a
fixed cost per run (model build, discretisation, initial solve) plus a cost per cycle. This script
measures both from runs already committed, and converts the cycle savings of Table 2 into time.
Stdlib only, no simulation, descriptive (no hypothesis):

    python3 research/cell-fidelity/paper/cost.py      # writes paper/cost.txt and cost.json (< 1 s)

Inputs (all committed):
- `experiments/fade/bench.jsonl`: the same 192 designs run by 5l's DFN runner to cycle 10 (`DFN10`)
  and to cycle 100 (`DFN`). Two run lengths per design give t(k) = a + b k per design; the fixed cost
  is reported in cycle equivalents, a / b.
- `experiments/fresh7g/bench.jsonl`, `experiments/fresh7h/bench.jsonl`: wall time of the 96 runs to
  cycle 100 by the x-resolved child the triage rules were scored with, per parameter set.
- `paper/tables.json`: DFN cycles per design for each out-of-batch look (Table 2).

Two ways to run a flagged design on: continue the cycle-10 run to cycle 50 (pays the fixed cost once),
or restart it from cycle 0 (pays it twice). Both are reported; continuation is what the cycle count
already assumes. Every rule extends flagged designs to K1 = 50 except some 7f/7g free-K1 policies, so
the flagged share f = (cycles - 10) / 40 is exact for K1 = 50 and an approximation otherwise (noted).
"""
import json
import math
import statistics as st
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent / "experiments"
SETS = ["Ai2020", "Chen2020", "OKane2022", "NCA_Kim2011"]
K0, K1, U = 10, 50, 50


def jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def fixed_cost():
    """Per-design a/b from paired 10- and 100-cycle DFN runs (fade bench)."""
    runs = {}
    for r in jsonl(EXP / "fade" / "bench.jsonl"):
        if r.get("ok") and r.get("seconds"):
            runs.setdefault((r["cond"], r["j"]), {})[r["what"]] = (r["ok_cycles"], r["seconds"])
    ratios, per_set = [], {}
    for (cond, _j), v in runs.items():
        if "DFN10" not in v or "DFN" not in v:
            continue
        (k1, t1), (k2, t2) = v["DFN10"], v["DFN"]
        if k1 != 10 or k2 != 100:
            continue
        b = (t2 - t1) / (k2 - k1)
        if b <= 0:
            continue
        a_over_b = (t1 - b * k1) / b
        ratios.append(a_over_b)
        per_set.setdefault(cond.split("@")[0], []).append(a_over_b)
    q = st.quantiles(ratios, n=4)
    return {
        "n": len(ratios),
        "median": st.median(ratios),
        "q25": q[0],
        "q75": q[2],
        "per_set": {s: st.median(v) for s, v in sorted(per_set.items())},
    }


def fixed_cost_horizon():
    """Cross-check: a/b from the per-cycle end times of 2a's 30-cycle DFN runs (experiments/horizon).

    t(k) = a + b k fitted to each run's cycle-end times by least squares over k = 1..30.
    """
    vals = []
    for r in jsonl(EXP / "horizon" / "horizon.jsonl"):
        if r.get("model") != "DFN" or r.get("cycles_done") != 30:
            continue
        ys = r["cycle_end_s"][:30]
        xs = list(range(1, len(ys) + 1))
        mx, my = st.mean(xs), st.mean(ys)
        # math.fsum, not sum: Python 3.12 made float sum() compensated, so plain sum() writes
        # different last digits under 3.11 and 3.12+; fsum is exactly rounded on every version.
        b = math.fsum((x - mx) * (y - my) for x, y in zip(xs, ys)) / math.fsum((x - mx) ** 2 for x in xs)
        if b > 0:
            vals.append((my - b * mx) / b)
    q = st.quantiles(vals, n=4)
    return {"n": len(vals), "median": st.median(vals), "q25": q[0], "q75": q[2]}


def seconds_per_run():
    """Median wall seconds of a 100-cycle x-resolved child run, per set (7g and 7h benches)."""
    out = {}
    for exp in ("fresh7g", "fresh7h"):
        for r in jsonl(EXP / exp / "bench.jsonl"):
            if r.get("ok") and r.get("ok_cycles") == 100 and r.get("seconds"):
                out.setdefault(r["cond"].split("@")[0], []).append(r["seconds"])
    return {s: {"n": len(v), "median": st.median(v)} for s, v in out.items()}


def time_share(cycles, c, uniform=False):
    """Wall time of a rule as a share of U50's, in units of b, for fixed cost c = a/b.

    A uniform rule runs each design once to its length (one fixed cost, nothing flagged); a triage
    rule runs every design to cycle 10 and a share f on to cycle 50.
    """
    u50 = c + U
    cont = c + cycles
    if uniform:
        return {"flag_share": None, "continue": cont / u50, "restart": cont / u50}
    f = max(0.0, min(1.0, (cycles - K0) / (K1 - K0)))
    restart = c + K0 + f * (c + K1)
    return {"flag_share": f, "continue": cont / u50, "restart": restart / u50}


def breakeven(c):
    """Largest flagged share at which restart-triage costs no more than U50: c + K0 + f (c + K1) = c + U."""
    return (U - K0) / (c + K1)


def main():
    fc = fixed_cost()
    fh = fixed_cost_horizon()
    spr = seconds_per_run()
    tables = json.loads((HERE / "tables.json").read_text())
    c = fc["median"]
    looks = []
    for row in tables["out_of_batch"]:
        uni = row["rule"] == "U"
        ts = time_share(row["cycles"], c, uni)
        lo = time_share(row["cycles"], fc["q25"], uni)
        hi = time_share(row["cycles"], fc["q75"], uni)
        looks.append({
            "look": row["look"], "rule": row["rule"], "cycles": row["cycles"],
            "cycles_saved": 1 - row["cycles"] / U,
            "flag_share": ts["flag_share"],
            "time_saved_continue": 1 - ts["continue"],
            "time_saved_continue_range": [1 - hi["continue"], 1 - lo["continue"]],
            "time_saved_restart": 1 - ts["restart"],
        })
    pooled = tables["pooled_fresh"]["cycles"]
    pts = time_share(pooled, c)
    # Per set: seconds per design under U50 and under the pooled fresh-pool rate, per 1000 designs.
    per_set = {}
    for s in SETS:
        t100 = spr[s]["median"]
        b = t100 / (c + 100)
        per_set[s] = {
            "runs": spr[s]["n"],
            "t100_s": t100,
            "s_per_cycle": b,
            "fixed_s": c * b,
            "u50_h_per_1000": 1000 * b * (c + U) / 3600,
            "saved_h_per_1000_continue": 1000 * b * (U - pooled) / 3600,
        }
    out = {"fixed_cost_cycles": fc, "fixed_cost_cycles_horizon": fh, "seconds_per_run": spr, "looks": looks,
           "pooled_fresh": {"cycles": pooled, "flag_share": pts["flag_share"],
                            "time_saved_continue": 1 - pts["continue"],
                            "time_saved_restart": 1 - pts["restart"]},
           "per_set": per_set}
    (HERE / "cost.json").write_text(json.dumps(out, indent=1) + "\n")

    L = []
    L.append("cell-fidelity paper: the triage saving in wall-clock DFN time (milestone 7j).")
    L.append("")
    L.append(f"Fixed cost of a DFN run, in cycle equivalents (a/b from t(k) = a + b k, {fc['n']} designs run to")
    L.append(f"cycle 10 and to cycle 100, experiments/fade): median {fc['median']:.2f} (IQR {fc['q25']:.2f} to {fc['q75']:.2f})")
    L.append("  per set: " + ", ".join(f"{s} {v:.2f}" for s, v in fc["per_set"].items()))
    L.append(f"  cross-check, least squares on per-cycle end times of {fh['n']} 30-cycle DFN runs (experiments/horizon):")
    L.append(f"  median {fh['median']:.2f} (IQR {fh['q25']:.2f} to {fh['q75']:.2f})")
    L.append("")
    L.append("Wall time of a 100-cycle x-resolved child run (7g and 7h benches, 3 workers, shared cloud container):")
    L.append(f"{'set':<13}{'runs':>5}{'t100 s':>8}{'s/cycle':>9}{'fixed s':>9}{'U50 h/1000':>12}{'saved h/1000':>14}")
    for s in SETS:
        p = per_set[s]
        L.append(f"{s:<13}{p['runs']:>5}{p['t100_s']:>8.1f}{p['s_per_cycle']:>9.3f}{p['fixed_s']:>9.2f}"
                 f"{p['u50_h_per_1000']:>12.2f}{p['saved_h_per_1000_continue']:>14.2f}")
    L.append(f"(saved h/1000: designs triaged at the pooled fresh-pool rate, {pooled:.1f} cycles per design, continuation)")
    L.append("")
    L.append("Table 2 in time: saving against U50 in DFN cycles and in wall time (continue the cycle-10 run;")
    L.append("range over the fixed-cost IQR; restart = rerun a flagged design from cycle 0).")
    L.append(f"{'look':<26}{'rule':<7}{'cycles':>7}{'flagged':>9}{'cyc saved':>10}{'time saved':>11}{'range':>14}{'restart':>9}")
    for x in looks:
        r = x["time_saved_continue_range"]
        L.append(f"{x['look']:<26}{x['rule']:<7}{x['cycles']:>7.1f}{('-' if x['flag_share'] is None else format(x['flag_share'], '.0%')):>9}{x['cycles_saved']:>10.0%}"
                 f"{x['time_saved_continue']:>11.1%}{r[0]:>7.1%}-{r[1]:<6.1%}{x['time_saved_restart']:>9.1%}")
    L.append("U is one run per design (no cycle-10 run to continue or restart), so its two columns agree.")
    L.append("")
    L.append(f"Pooled fresh-pool rate (frozen 7f threshold policies on 7g and 7h): {pooled:.1f} cycles per design, "
             f"flagged share {pts['flag_share']:.0%},")
    L.append(f"  cycles saved {1 - pooled / U:.1%}, wall time saved {1 - pts['continue']:.1%} (continue), "
             f"{1 - pts['restart']:.1%} (restart)")
    be = breakeven(c)
    beh = breakeven(fh["median"])
    out["breakeven_flag_share_restart"] = be
    out["breakeven_flag_share_restart_horizon"] = beh
    L.append(f"Restarting breaks even with U50 only if at most {be:.0%} of designs are flagged (fixed cost {c:.2f} cycles;")
    L.append(f"  {beh:.0%} at the horizon cross-check's {fh['median']:.2f}).")
    L.append("Flagged share assumes every flagged design runs to cycle 50; 7f/7g free-K1 policies with K1 = 40 or 45")
    L.append("flag slightly more designs than shown, which changes only the restart column.")
    (HERE / "cost.txt").write_text("\n".join(L) + "\n")
    print("\n".join(L))
    return out


if __name__ == "__main__":
    main()
