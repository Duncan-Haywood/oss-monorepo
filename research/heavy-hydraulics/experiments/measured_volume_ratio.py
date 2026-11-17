"""Milestone 5v: 5u's volume-ratio split of the break-even margin on the measured wheel loader.

5u wrote the exact break-even load-sensing margin as
    m* = beta [(r - 1) p_q + r (p_Q - p_q) + r d_bar] + I / B
(r: fixed-pump volume over load-sensing volume while open-centre moves; p_Q, p_q: pump-flow- and
demand-weighted highest load pressure; d_bar: pump-flow-weighted spool drop; beta = V / B) and ran
it on the synthetic force-model cycles only, because zenodo.org refused the proxy. Here it runs on
the measured 6 t wheel loader of 5n to 5t, in 5t's cases (a), (b), (c), whole record and per Y-cycle.
V6 was registered in LOG.md (5u); V7 to V10 in LOG.md (5v), both before this script existed.

Data: Linjama et al., Zenodo doi:10.5281/zenodo.10639199, CC BY 4.0 (see measured_loader.py).
Needs numpy and scipy. Usage: python measured_volume_ratio.py <path to Short_Y_cycle_data.mat>
"""
import math
import os
import statistics
import sys

import numpy as np

ARGV = list(sys.argv)   # spool_floor_synthetic (imported via breakeven_volume_ratio) resets sys.argv
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import cycle_starts  # noqa: E402
from heavy_hydraulics.breakeven import trace_breakeven  # noqa: E402
from heavy_hydraulics.spool_floor import size_spool  # noqa: E402
from measured_breakeven import parts, orifice_drop  # noqa: E402
from breakeven_volume_ratio import spearman  # noqa: E402

KEYS = ("r", "p_Q", "p_q", "d_bar", "beta", "main", "cov", "drop", "idle", "rule2")
SYNTH = {"r": 1.433, "p_q": 33.0, "m0": 20.5}   # 5u medians on the force-model cycles, d = 0


def main(path):
    from measured_loader import load, bootstrap
    from measured_motion import positions, stationary_np
    from spool_floor import TABLE
    r = load(path)
    dt = r["dt"]
    out = []
    p = out.append
    win = int(round(1.0 / dt))
    floors = [float(np.percentile(np.abs(q[stationary_np(x, win, 0.5e-3)]), 99))
              for (q, _), (x, _) in zip(r["secs"], positions(path))]
    masks = [s[0] > f for s, f in zip(r["secs"], floors)]
    rows = [size_spool(float(np.percentile(q[q > 0], 99.9)), TABLE, 0) for q, _ in r["secs"]]
    cases = {
        "a": ("floor, no drop, p_n 5", [np.zeros_like(r["w"]) for _ in r["secs"]], 5.0),
        "b": ("PVG 32 orifice floor, p_n 5", [orifice_drop(q, row) for (q, _), row in zip(r["secs"], rows)], 5.0),
        "c": ("10 bar spool drop, p_n 10", [np.full_like(r["w"], 10.0) for _ in r["secs"]], 10.0),
    }
    p(f"record {len(r['t'])} samples, {r['t'][-1]-r['t'][0]:.1f} s; spools {rows[0]['spool']}, {rows[1]['spool']}; q_sb 0")
    p("m* = beta [(r-1) p_q + r (p_Q - p_q) + r d_bar] + I/B; R2 = (r-1) p_q + r d_bar; R1 = all but covariance")

    # check: numpy twin's split equals the tested stdlib trace_breakeven on the first 50,000 samples
    n = 50000
    qf = np.maximum(0.0, 63e-6 * 1e3 * r["w"][:n] / (2 * math.pi) * 60 - 2.5)
    db = cases["b"][1]
    samples = [(float(qf[i]), tuple((float(q[i]), None if math.isnan(pp[i]) else float(pp[i]), bool(m[i]), float(d[i]))
                                    for (q, pp), m, d in zip(r["secs"], masks, db))) for i in range(n)]
    ref = trace_breakeven(samples, dt, 5.0, 0.0)
    got = parts(r, masks, db, 5.0, 0.0, sl=slice(0, n))
    for key in ("m",) + KEYS:
        assert abs(got[key] - ref[key]) <= 1e-9 * max(1.0, abs(ref[key])), key
    p("check: numpy split equals stdlib trace_breakeven (all 5u fields) on the first 50,000 samples")

    whole = {}
    p("")
    p("whole record")
    for c, (lab, drops, pn) in cases.items():
        x = parts(r, masks, drops, pn, 0.0)
        whole[c] = x
        gap = abs(x["main"] + x["cov"] + x["drop"] + x["idle"] - x["m"]) / x["m"]
        assert gap < 1e-9, gap
        r1 = x["main"] + x["drop"] + x["idle"]
        p(f"  ({c}) {lab}: m* {x['m']:.1f}; r {x['r']:.3f}, p_Q {x['p_Q']:.1f}, p_q {x['p_q']:.1f}, d_bar {x['d_bar']:.2f} bar, "
          f"beta {x['beta']:.3f}")
        p(f"      terms: beta(r-1)p_q {x['main']:.1f}, covariance {x['cov']:.1f}, drop {x['drop']:.1f}, idle {x['idle']:.1f} bar "
          f"(sum gap {gap:.1e}); R2 {x['rule2']:.1f} ({x['rule2']/x['m']:.3f} of m*), R1 {r1:.1f} ({r1/x['m']:.3f} of m*)")

    starts = cycle_starts(list(r["x"]), 0.30)
    p("")
    p(f"per Y-cycle ({len(starts)-1} cycles): median (min to max)")
    per = {}
    for c, (lab, drops, pn) in cases.items():
        v = [parts(r, masks, drops, pn, 0.0, sl=slice(i0, i1)) for i0, i1 in zip(starts, starts[1:])]
        per[c] = v
        ms = [x["m"] for x in v]
        p(f"  ({c}) {lab}")
        for k in ("m",) + KEYS:
            xs = [x[k] for x in v]
            p(f"      {k:6s} {statistics.median(xs):7.2f} ({min(xs):7.2f} to {max(xs):7.2f})")
        rel2 = [abs(x["rule2"] - x["m"]) / x["m"] for x in v]
        rel1 = [abs(x["main"] + x["drop"] + x["idle"] - x["m"]) / x["m"] for x in v]
        p(f"      per-cycle |R2 - m*|/m* median {statistics.median(rel2):.3f}; |R1 - m*|/m* median {statistics.median(rel1):.3f}")
        p(f"      Spearman(r, m*) {spearman([x['r'] for x in v], ms):.3f}; Spearman(p_q, m*) "
          f"{spearman([x['p_q'] for x in v], ms):.3f}; Spearman(R2, m*) {spearman([x['rule2'] for x in v], ms):.3f}")
        lo, hi = bootstrap([x["p_q"] for x in v])
        p(f"      p_q per cycle mean 95% bootstrap {lo:.1f} to {hi:.1f} bar")

    # where the synthetic-to-loader gap comes from, at no spool drop (case a), moving rule only
    a = whole["a"]
    p("")
    p(f"synthetic (5u, d 0) to loader (a): r {SYNTH['r']} -> {a['r']:.3f}; p_q {SYNTH['p_q']:.0f} -> {a['p_q']:.1f} bar; "
      f"m* {SYNTH['m0']} -> {a['m']:.1f} bar")
    p(f"  (r-1) p_q: synthetic {(SYNTH['r']-1)*SYNTH['p_q']:.1f}; loader r with synthetic p_q {(a['r']-1)*SYNTH['p_q']:.1f}; "
      f"synthetic r with loader p_q {(SYNTH['r']-1)*a['p_q']:.1f}; loader {(a['r']-1)*a['p_q']:.1f} bar")

    # not predicted: the pressure at which the surplus flow (pump flow minus demand) is pushed,
    # p_s = (r p_Q - p_q) / (r - 1), so that S / V = (r - 1) p_s exactly and the covariance folds into it
    p("")
    p("surplus-flow pressure p_s = (r p_Q - p_q) / (r - 1); then m* = beta [(r-1) p_s + r d_bar] + I/B exactly")
    for c in cases:
        x = whole[c]
        ps = (x["r"] * x["p_Q"] - x["p_q"]) / (x["r"] - 1)
        chk = x["beta"] * ((x["r"] - 1) * ps + x["r"] * x["d_bar"]) + x["idle"]
        assert abs(chk - x["m"]) <= 1e-9 * x["m"]
        pss = [(y["r"] * y["p_Q"] - y["p_q"]) / (y["r"] - 1) for y in per[c]]
        p(f"  ({c}) whole record p_s {ps:.1f} bar (p_q {x['p_q']:.1f}, p_Q {x['p_Q']:.1f}); per cycle median {statistics.median(pss):.1f} "
          f"({min(pss):.1f} to {max(pss):.1f}); (r-1) p_s {(x['r']-1)*ps:.1f} bar")

    b = whole["b"]
    vb = per["b"]
    msb = [x["m"] for x in vb]
    r1b = b["main"] + b["drop"] + b["idle"]
    p("")
    p(f"V6 {'HOLDS' if 90 <= a['p_q'] <= 115 and a['cov'] > 0 else 'REFUTED'} (p_q in 90 to 115 bar: {a['p_q']:.1f}; "
      f"covariance positive: {a['cov']:.1f} bar)")
    p(f"V7 {'HOLDS' if abs(r1b - b['m']) / b['m'] <= 0.10 else 'REFUTED'} (R1 within 10% of whole-record m* under b: "
      f"{r1b:.1f} against {b['m']:.1f}, {abs(r1b-b['m'])/b['m']*100:.1f}%)")
    sr, sp = spearman([x["r"] for x in vb], msb), spearman([x["p_q"] for x in vb], msb)
    p(f"V8 {'HOLDS' if sr > sp else 'REFUTED'} (Spearman(r, m*_c) > Spearman(p_q, m*_c) under b: {sr:.3f} against {sp:.3f})")
    p(f"V9 {'HOLDS' if b['beta'] > 0.9 else 'REFUTED'} (whole-record beta > 0.9: {b['beta']:.3f})")
    med2 = statistics.median(abs(x["rule2"] - x["m"]) / x["m"] for x in vb)
    p(f"V10 {'HOLDS' if med2 <= 0.25 else 'REFUTED'} (median per-cycle |R2 - m*_c| / m*_c <= 0.25 under b: {med2:.3f})")
    return "\n".join(out)


if __name__ == "__main__":
    text = main(ARGV[1])
    print(text)
    with open(os.path.join(HERE, "measured_volume_ratio_results.txt"), "w") as fh:
        fh.write(text + "\n")
