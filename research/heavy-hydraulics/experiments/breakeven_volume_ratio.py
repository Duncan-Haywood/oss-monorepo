"""Milestone 5u: the break-even LS margin as a volume ratio times a load pressure.

On the same 3,000 force-model cycles as 2n, 5p, 5q and 5s (drawn by breakeven_closed_form.CYCLES),
`heavy_hydraulics.breakeven.decompose` splits each exact m*_c into

    m* = beta [(r - 1) p_q + r (p_Q - p_q) + r d_bar] + I / B

(r: fixed-pump volume over load-sensing volume while moving; p_Q, p_q: time- and demand-weighted
highest load pressure; beta = V / B) and evaluates the two-number rule R2 = (r - 1) p_q + r d.
Predictions V1 to V5 were written in LOG.md (5u) before this script existed. Stdlib, seeded.

    python3 experiments/breakeven_volume_ratio.py   (writes breakeven_volume_ratio_results.txt)
"""
import os
import statistics

from breakeven_closed_form import CYCLES, pct
from spool_floor_synthetic import pc, QSB, PN
from heavy_hydraulics.breakeven import decompose

here = os.path.dirname(os.path.abspath(__file__))


def ranks(xs):
    order = sorted(range(len(xs)), key=xs.__getitem__)
    r = [0.0] * len(xs)
    for i, j in enumerate(order):
        r[j] = float(i)
    return r


def spearman(a, b):
    ra, rb = ranks(a), ranks(b)
    ma, mb = statistics.mean(ra), statistics.mean(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    return num / (sum((x - ma) ** 2 for x in ra) * sum((y - mb) ** 2 for y in rb)) ** 0.5


def run(d):
    return [decompose(c, pc.Q_PUMP, oc_drop=d, p_neutral=PN, t_idle=t, q_idle=qi, p_idle=pi, q_standby=QSB)
            for c, t, pi, qi in CYCLES]


def q(xs):
    return f"median {statistics.median(xs):.3f} (5-95% {pct(xs, .05):.3f} to {pct(xs, .95):.3f})"


def main():
    out = []
    p = out.append
    p(f"pump {pc.Q_PUMP:g} L/min; p_n {PN:.2f} bar; LS standby {QSB:g} L/min; {len(CYCLES)} cycles (as 5s)")
    p("m* = beta [(r-1) p_q + r (p_Q - p_q) + r d_bar] + I/B; R2 = (r-1) p_q + r d (two-number rule)")
    res, verdict = {}, {}
    for d in (0.0, 6.0):
        rs = run(d)
        res[d] = rs
        err = max(abs(r["main"] + r["cov"] + r["drop"] + r["idle"] - r["m"]) / r["m"] for r in rs)
        assert err < 1e-9, err
        ms, r2 = [r["m"] for r in rs], [r["rule2"] for r in rs]
        p("")
        p(f"d = {d:g} bar (identity checked on every cycle: largest relative gap {err:.1e})")
        for k, lab in (("r", "r, pump volume / LS volume while moving"), ("p_Q", "p_Q, time-weighted load pressure, bar"),
                       ("p_q", "p_q, demand-weighted load pressure, bar"), ("beta", "beta = V / B")):
            p(f"  {lab}: {q([r[k] for r in rs])}")
        p("  terms of m*, bar:")
        for k, lab in (("main", "beta (r-1) p_q"), ("cov", "beta r (p_Q - p_q), covariance"),
                       ("drop", "beta r d_bar"), ("idle", "I / B")):
            p(f"    {lab}: {q([r[k] for r in rs])}")
        covshare = [abs(r["cov"]) / (r["main"] + r["cov"]) for r in rs]
        p(f"  |covariance| / (S / B): {q(covshare)}")
        p(f"  exact m*: {q(ms)}")
        p(f"  R2 two-number rule: {q(r2)}; median R2 / median m* {statistics.median(r2) / statistics.median(ms):.3f}")
        rel = [abs(a - b) / b for a, b in zip(r2, ms)]
        p(f"  per-cycle |R2 - m*| / m*: {q(rel)}")
        r1 = [r["main"] + r["drop"] + r["idle"] for r in rs]
        p(f"  R1 (all but covariance): median {statistics.median(r1):.2f}; per-cycle |R1 - m*| / m* "
          f"{q([abs(a - b) / b for a, b in zip(r1, ms)])}")
        rho = spearman(r2, ms)
        p(f"  Spearman(R2, m*) {rho:.3f}; Spearman(r, m*) {spearman([r['r'] for r in rs], ms):.3f}; "
          f"Spearman(p_q, m*) {spearman([r['p_q'] for r in rs], ms):.3f}")
        agree = {}
        for m in (14.0, 25.0):
            agree[m] = 100.0 * sum((a > m) == (b > m) for a, b in zip(r2, ms)) / len(ms)
            p(f"  winner agreement R2 vs exact at a {m:g} bar margin: {agree[m]:.1f}% of cycles "
              f"(LS wins by exact {100 * sum(b > m for b in ms) / len(ms):.1f}%, by R2 {100 * sum(a > m for a in r2) / len(ms):.1f}%)")
        verdict[d] = dict(r=statistics.median(r["r"] for r in rs), cov=statistics.median(covshare),
                          ratio=statistics.median(r2) / statistics.median(ms), rho=rho, agree=agree)
    v0, v6 = verdict[0.0], verdict[6.0]
    p("")
    p(f"V1 {'HOLDS' if 1.35 <= v0['r'] <= 1.55 else 'REFUTED'} (median r in 1.35 to 1.55: {v0['r']:.3f})")
    p(f"V2 {'HOLDS' if v0['cov'] < 0.10 else 'REFUTED'} (median |covariance| / (S/B) < 0.10: {v0['cov']:.3f})")
    ok3 = all(abs(v['ratio'] - 1) <= 0.25 for v in (v0, v6))
    p(f"V3 {'HOLDS' if ok3 else 'REFUTED'} (median R2 within 25% of median m* at d 0 and 6: "
      f"{v0['ratio']:.3f}, {v6['ratio']:.3f})")
    p(f"V4 {'HOLDS' if v0['rho'] > 0.7 else 'REFUTED'} (Spearman(R2, m*) > 0.7 at d 0: {v0['rho']:.3f})")
    ok5 = min(v6["agree"].values()) >= 85.0
    p(f"V5 {'HOLDS' if ok5 else 'REFUTED'} (winner agreement >= 85% at 14 and 25 bar, d 6: "
      f"{v6['agree'][14.0]:.1f}%, {v6['agree'][25.0]:.1f}%)")
    return "\n".join(out)


if __name__ == "__main__":
    txt = main()
    print(txt)
    with open(os.path.join(here, "breakeven_volume_ratio_results.txt"), "w") as f:
        f.write(txt + "\n")
