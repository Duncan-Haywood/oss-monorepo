"""Milestone 7ak: can the pilot forecast the cells design's own width, and does a rule that uses cells only when that
forecast says they pay remove the small-audit cost without giving back the large-audit gain? (7aj's next step.)

7aj found that the default screen (tau 0.1, guard 0, neg_guard 3) is wider than pooled in 4 of 15 GoEmotions cells
(by up to 2.7%) and that a larger miss guard is the wrong cure: 0.5B sadness n 1,000 got *wider* as the guard grew.
Its reading: the guard counts misses, but the sign of the gain is set by how far the coder's cells separate against
the price the real audit pays (the 0.35 n floor per cell, an estimated allocation, the fitted-lambda pooled rival).
`pilot_ceiling` ignores all three (7l: ceiling 0.916, realised 0.995). New library code: `audit_design.predicted_ratio`
prices them from the pilot itself: the pooled variance of y - lambda f with lambda fitted on the pilot, the cells
variance at the floored allocation `cell_allocation` would make, finite-population corrections on both, at the
planned n. `plan_audit(..., width_margin=m)` keeps cells only when the screen admits them AND predicted_ratio <= 1 - m.

Cells (27): 7aj's 15 GoEmotions cells (Qwen2.5-0.5B fear, sadness, J 0.26; Qwen2.5-1.5B fear, sadness, admiration,
J 0.46 to 0.65; n 500, 1,000, 2,000; pilot n/2; same seeds, so the "default" rule replays 7aj's k=3 rows) and 7ah's 12
NaijaSenti cells (negative share thinned to 2/5/10%, nb-in-language J 0.39 and English lexicon J 0.03; n 600, 2,000;
pilot 0.3 n; same seeds, so "default" replays 7ah's tau=0.1 rows). Rules: pooled; default; width_margin 0; width_margin
0.02. 1,000 draws per cell (+/- 1.4 points on coverage).

    python3 experiments/h7ak_width_forecast.py forecast      # oracle forecasts only, no draws (pasted below)
    python3 experiments/h7ak_width_forecast.py draws [reps]  # -> h7ak_width_forecast_draws.txt
    python3 experiments/h7ak_width_forecast.py summary       # reads it, applies the decision rule -> h7ak_width_forecast.txt

Forecast (from `forecast`, before any draw ran): the oracle predicted_ratio, i.e. the same formula with the whole
corpus as the "pilot" (true cell variances, true lambda), at the planned n; next to it the observed default ratio
already committed by 7aj / 7ah (that column is not new data):
  cell | n | corpus | J | oracle predicted_ratio | committed default ratio
  0.5B fear | 500 | 6683 | 0.264 | 1.049 | 1.027
  0.5B fear | 1000 | 6683 | 0.264 | 0.941 | 0.961
  0.5B fear | 2000 | 6683 | 0.264 | 0.901 | 0.914
  0.5B sadness | 500 | 6683 | 0.265 | 1.032 | 1.027
  0.5B sadness | 1000 | 6683 | 0.265 | 1.035 | 1.027
  0.5B sadness | 2000 | 6683 | 0.265 | 0.945 | 0.942
  1.5B fear | 500 | 6683 | 0.461 | 0.933 | 1.014
  1.5B fear | 1000 | 6683 | 0.461 | 0.834 | 0.918
  1.5B fear | 2000 | 6683 | 0.461 | 0.818 | 0.831
  1.5B sadness | 500 | 6683 | 0.623 | 0.796 | 0.973
  1.5B sadness | 1000 | 6683 | 0.623 | 0.775 | 0.856
  1.5B sadness | 2000 | 6683 | 0.623 | 0.715 | 0.714
  1.5B admiration | 500 | 6683 | 0.649 | 0.819 | 0.910
  1.5B admiration | 1000 | 6683 | 0.649 | 0.801 | 0.801
  1.5B admiration | 2000 | 6683 | 0.649 | 0.752 | 0.742
  nb-in-language 0.02 | 600 | 30480 | 0.397 | 0.919 | 0.993
  nb-in-language 0.02 | 2000 | 30480 | 0.397 | 0.915 | 0.929
  nb-in-language 0.05 | 600 | 31442 | 0.394 | 0.933 | 0.963
  nb-in-language 0.05 | 2000 | 31442 | 0.394 | 0.929 | 0.926
  nb-in-language 0.1 | 600 | 33189 | 0.398 | 0.950 | 0.953
  nb-in-language 0.1 | 2000 | 33189 | 0.398 | 0.948 | 0.951
  lexicon-en 0.02 | 600 | 30480 | 0.030 | 1.218 | 1.024
  lexicon-en 0.02 | 2000 | 30480 | 0.030 | 1.051 | 1.007
  lexicon-en 0.05 | 600 | 31442 | 0.027 | 1.220 | 1.028
  lexicon-en 0.05 | 2000 | 31442 | 0.027 | 1.063 | 1.000
  lexicon-en 0.1 | 600 | 33189 | 0.030 | 1.221 | 1.014
  lexicon-en 0.1 | 2000 | 33189 | 0.030 | 1.087 | 1.003

Read from the table before the draws (an observation, not a prediction, since the committed column is old data):
  the oracle gets the sign of the default's cost right in 6 of the 7 cells where the committed default ratio is above
  1.010 (0.5B fear n 500 1.049, 0.5B sadness n 500 1.032 and n 1,000 1.035, the three lexicon n 600 cells 1.218 to
  1.221) and in all 15 cells below 0.97. The miss is 1.5B fear n 500: the oracle says cells would pay (0.933), the
  committed default is 1.014. So there the cost is the pilot's noise (about 1.5 expected misses in 250 items: the
  allocation is driven by a coder-negative variance estimated from 3 or 4 positives), not the design, and a pilot
  forecast built from that same noisy pilot may not see it. The 0.5B sadness n 1,000 cost that 7aj could not explain
  is a design cost: with the true variances the floored cells design is still 3.5% wider than fitted-lambda pooled.

Prediction (written before the draws):
  P1  every rule covers 93% or more in all 27 cells.
  P2  width_margin 0 brings every cell whose default ratio is above 1.010 to a ratio <= 1.010. My guess: it fails at
      1.5B fear n 500 (see above) and holds in the six cells the oracle calls.
  P3  width_margin 0 keeps >= 90% of the default's gain (sum of 1 - ratio over cells with default ratio < 0.97).
      Guess: 85 to 95%; the risk is 0.5B fear n 1,000 (oracle 0.941) and the nb-in-language cells (0.92 to 0.95),
      where a noisy pilot forecast will often land above 1.
  P4  width_margin 0.02 keeps less of the gain than width_margin 0 (a larger margin trades gain for safety).
  Decision rule, fixed now: if P1, P2 and P3 hold and no cell has a width_margin 0 ratio above 1.010, the library
  default becomes WIDTH_MARGIN 0 in this PR; otherwise plan_audit keeps width_margin=None as its default and the
  summary reports what the rule costs and saves. Refuted: each P if its inequality fails in any cell.
"""
import random
import sys
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
ARGS, sys.argv = sys.argv[1:], sys.argv[:1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent))
from llmci import audit_design as A  # noqa: E402

RULES = [("pooled", 2.0, 0, None), ("default", A.TAU, A.NEG_GUARD, None), ("m=0", A.TAU, A.NEG_GUARD, 0.0),
         ("m=0.02", A.TAU, A.NEG_GUARD, 0.02)]
OUT = HERE / "h7ak_width_forecast_draws.txt"
HEAD = ("cell | n | J | rule | observed cells % | coverage % | half-width pts | ratio to pooled | "
        "mean pilot predicted_ratio when the screen admits")
# committed default ratios: 7aj k=3 rows (h7aj_neg_guard.txt) and 7ah tau=0.1 rows (h7ah_tau_naija.txt)
COMMITTED = {}


def committed():
    if COMMITTED:
        return COMMITTED
    for line in (HERE / "h7aj_neg_guard_draws.txt").read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        if x[3] == "k=3":
            COMMITTED[(x[0], int(x[1]))] = float(x[-1])
    for line in (HERE / "h7ah_tau_naija.txt").read_text().splitlines()[1:]:
        x = [s.strip() for s in line.split("|")]
        if x[3] == "tau=0.1":
            COMMITTED[(x[0], int(x[1]))] = float(x[-1])
    return COMMITTED


def cells():
    import h7aj_neg_guard as J
    import h7ah_tau as H
    for c in J.cells():
        c["part"] = "goemo"
        yield c
    for c in H.naija_cells():
        yield c


def oracle(c):
    return A.predicted_ratio(c["f"], dict(enumerate(c["h"])), c["n"])


def run(c, reps):
    """Same draws as 7aj (goemo: common pilots, then a per-draw stream) and 7ah (naija: one stream per rule)."""
    h, f, n = c["h"], c["f"], c["n"]
    N, truth = len(h), sum(h) / len(h)
    res = {}
    if c["part"] == "goemo":
        rr = random.Random(c["seed"] + 5)
        pilots = [rr.sample(range(N), n // 2) for _ in range(reps)]
    for name, tau, ng, m in RULES:
        out = []
        if c["part"] != "goemo":
            rr = random.Random(c["seed"])
        for d in range(reps):
            if c["part"] == "goemo":
                pilot, sb = pilots[d], random.Random(c["seed"] + 7 * d)
            else:
                pilot, sb = rr.sample(range(N), round(A.PILOT_SHARE * n)), rr
            labels = {i: h[i] for i in pilot}
            ps = [labels[i] for i in sorted(labels)]
            fs = [f[i] for i in sorted(labels)]
            admit = name != "pooled" and A.screen(ps, fs, tau, 0, ng) == "cells"
            pr = A.predicted_ratio(f, labels, n) if admit else None
            plan = A.plan_audit(f, labels, n, tau=tau, guard=0, neg_guard=ng, width_margin=m)
            for cell, t in zip(plan["cells"], plan["to_label"]):
                for i in sb.sample([i for i in cell if i not in labels], t):
                    labels[i] = h[i]
            _, lo, hi = A.audit_interval(plan, f, labels)
            out.append(((hi - lo) / 2, lo <= truth <= hi, plan["design"] == "cells", pr))
        res[name] = out
    return res


def one_cell(args):
    c, reps = args
    res = run(c, reps)
    wp = sum(x[0] for x in res["pooled"]) / reps
    lines = []
    for name, *_r in RULES:
        r = res[name]
        w = sum(x[0] for x in r) / reps
        prs = [x[3] for x in r if x[3] is not None]
        mp = f"{sum(prs) / len(prs):.3f}" if prs else "-"
        lines.append(f"{c['label']} | {c['n']} | {c['J']:.3f} | {name} | {100 * sum(x[2] for x in r) / reps:.1f} | "
                     f"{100 * sum(x[1] for x in r) / reps:.1f} | {100 * w:.3f} | {w / wp:.3f} | {mp}")
    print("\n".join(lines), flush=True)
    return lines


def draws(reps):
    cs = list(cells())
    with Pool(4) as p:
        got = p.map(one_cell, [(c, reps) for c in cs], chunksize=1)
    OUT.write_text("\n".join([HEAD] + [l for g in got for l in g]) + "\n")


def summary():
    rows = []
    for line in OUT.read_text().splitlines()[1:]:
        cell, n, J, rule, obs, cov, hw, ratio, mp = [x.strip() for x in line.split("|")]
        rows.append(dict(cell=cell, n=int(n), rule=rule, obs=float(obs), cov=float(cov), ratio=float(ratio), mp=mp))
    by = {(r["cell"], r["n"], r["rule"]): r for r in rows}
    keys = sorted({(r["cell"], r["n"]) for r in rows})
    orc = {(c["label"], c["n"]): oracle(c) for c in cells()}
    com = committed()
    out = []
    replay = [k for k in keys if k in com and abs(com[k] - by[(*k, "default")]["ratio"]) > 0.0005]
    out.append(f"replay of the committed default ratios (7aj k=3, 7ah tau=0.1): "
               f"{len(keys) - len(replay)} of {len(keys)} identical; differ {replay}")
    low = [(r["cell"], r["n"], r["rule"], r["cov"]) for r in rows if r["cov"] < 93.0]
    out.append(f"P1 coverage >= 93% in every cell and rule: {'yes' if not low else 'no ' + str(low)}")
    costly = [k for k in keys if by[(*k, "default")]["ratio"] > 1.010]
    gain = [k for k in keys if by[(*k, "default")]["ratio"] < 0.97]
    bad = [k for k in costly if orc[k] <= 0.99] + [k for k in gain if orc[k] >= 1.0]
    out.append(f"(observation) oracle sign right ({len(costly)} costly, {len(gain)} gain cells): "
               f"{'yes' if not bad else 'no, misses ' + str(bad)}")
    for k in keys:
        out.append(f"{k[0]} n {k[1]}: oracle {orc[k]:.3f}; " + ", ".join(
            f"{name} {by[(*k, name)]['ratio']:.3f} ({by[(*k, name)]['obs']:.0f}% cells, cov {by[(*k, name)]['cov']:.1f})"
            for name, *_r in RULES[1:]) + f"; mean pilot forecast when admitted {by[(*k, 'default')]['mp']}")
    g0 = sum(1 - by[(*k, "default")]["ratio"] for k in gain)
    res = {}
    for name in ("m=0", "m=0.02"):
        worst_costly = max((by[(*k, name)]["ratio"] for k in costly), default=float("nan"))
        worst = max(by[(*k, name)]["ratio"] for k in keys)
        keep = sum(1 - by[(*k, name)]["ratio"] for k in gain) / g0 if g0 > 0 else float("nan")
        res[name] = (worst_costly, worst, keep)
        out.append(f"{name}: worst ratio in the {len(costly)} cells the default made wider than 1.010: {worst_costly:.3f}; "
                   f"worst ratio in any cell {worst:.3f}; keeps {100 * keep:.0f}% of the default's gain over the "
                   f"{len(gain)} cells with default ratio < 0.97")
    wc0, w0, k0 = res["m=0"]
    out.append(f"P2 m=0 brings every costly cell to <= 1.010: {'yes' if wc0 <= 1.010 else 'no'}")
    out.append(f"P3 m=0 keeps >= 90% of the gain: {'yes' if k0 >= 0.90 else 'no'}")
    out.append(f"P4 m=0.02 keeps less of the gain than m=0: {'yes' if res['m=0.02'][2] < k0 else 'no'}")
    ok = not low and wc0 <= 1.010 and k0 >= 0.90 and w0 <= 1.010
    out.append(f"Decision rule: {'WIDTH_MARGIN 0 becomes the default' if ok else 'keep width_margin=None as the default'}")
    text = "\n".join(out); print(text); (HERE / "h7ak_width_forecast.txt").write_text(text + "\n")


def main():
    mode = ARGS[0] if ARGS else "forecast"
    if mode == "forecast":
        com = committed()
        print("cell | n | corpus | J | oracle predicted_ratio | committed default ratio")
        for c in cells():
            print(f"{c['label']} | {c['n']} | {len(c['h'])} | {c['J']:.3f} | {oracle(c):.3f} | "
                  f"{com.get((c['label'], c['n']), float('nan')):.3f}", flush=True)
    elif mode == "summary":
        summary()
    else:
        draws(int(ARGS[1]) if len(ARGS) > 1 else 1000)


if __name__ == "__main__":
    main()
