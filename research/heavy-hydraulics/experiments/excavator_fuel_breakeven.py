"""Milestone 6b: the highest rest-of-machine fuel rate at which a smaller fixed pump still beats
load-sensing on the measured excavator.

6a shrank the fixed open-centre pump on the measured excavator demand (folder `75` of
`fuxi-robot/excavator-motion`, CC BY-NC-SA 4.0) and found pump-energy parity at 108 L/min for 1.114
times load-sensing's record time. The files carry no fuel signal, so this step does not price the time
with one rate. It computes f_t*, the fuel rate of the rest of the machine over the extra time at which
open-centre and load-sensing burn the same fuel, and its maximum over pump size.

No raw data is read (huggingface.co was refused by the proxy in this run). Everything comes from the
committed results of 5z and 6a, through an identity: a fixed pump runs flat out over the stretched
moving time, so r(q_p) = q_p T_OC,moving / V_d and the time ratio is a function of r alone
(measured.time_ratio_from_r). Between 6a's pump sizes r(q_p) is bracketed by convexity: tangents
(slope P(q < q_p) / mu, from 6a's "short %" column) below, chords above. f_t* falls as r rises, so the
bracket on r gives a bracket on f_t*. Predictions C1 to C5 are in LOG.md (6b), registered first.

Pure stdlib. Usage: python3 experiments/excavator_fuel_breakeven.py > experiments/excavator_fuel_breakeven_results.txt
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from heavy_hydraulics.measured import time_ratio_from_r, breakeven_rest_rate  # noqa: E402

Q_LS, COV, P_C = 219.0, 0.78, 0.41 * 316.0          # XE80E pump; 5v; 5y share x XE80E maximum
B_C, ETA_C = 0.2332, 0.818                          # loader's Willans slope (5n) and pump eta (5x): borrowed
BS, ETAS = (0.20, B_C, 0.26), (0.75, ETA_C, 0.95)
MARGINS, PRESS = (14.0, 20.0, 24.9, 25.0), (100.0, P_C, 174.0)
LOADER = {"low": 1.48, "rest of machine": 5.15, "still": 5.99}   # 5x, L/h, borrowed from the loader
F_REF = 5.15


def read(name):
    with open(os.path.join(HERE, name)) as f:
        return f.read()


def parse():
    a = read("measured_excavator_pump_size_results.txt")
    z = read("measured_excavator_flow_results.txt")
    mu = float(re.search(r"central demand while moving: mean ([\d.]+)", a).group(1))
    moving = float(re.search(r"moving \(any joint above [\d.]+ rad/s\): ([\d.]+)% of samples", z).group(1)) / 100
    sweep, eq = [], []
    blk = a.split("Pump sweep")[1].split("Equal-energy")[0]
    for m in re.finditer(r"^\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*$", blk, re.M):
        f, qp, r, ms, tau, short = map(float, m.groups())
        sweep.append({"q": qp, "r": r, "tau": tau, "short": short / 100})
    blk = a.split("Equal-energy")[1].split("per file")[0]
    for m in re.finditer(r"^\s+([\d.]+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*$", blk, re.M):
        mg, pr, r, qe, _, _, tau = map(float, m.groups())
        eq.append({"m": mg, "p": pr, "q": qe, "r": r, "tau": tau})
    assert len(sweep) == 8 and len(eq) == 12, (len(sweep), len(eq))
    return mu, (1 - moving) / moving, sweep, eq


def bracket(sweep, eq, mu):
    """r_lo(q), r_hi(q) for 0 < q <= 219 from the known points (convex, r(0) = 1)."""
    pts = sorted({(0.0, 1.0)} | {(s["q"], s["r"]) for s in sweep} | {(e["q"], e["r"]) for e in eq})
    tangents = [(s["q"], s["r"], (1 - s["short"]) / mu) for s in sweep]

    def hi(q):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x0 <= q <= x1:
                return y0 + (y1 - y0) * (q - x0) / (x1 - x0)
        raise ValueError(q)

    def lo(q):
        cands = [1.0, q / mu]
        cands += [y + s * (q - x) for x, y, s in tangents]
        # a convex function lies above the extension of each chord outside its interval
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x1 - x0 > 1.0 and not (x0 < q < x1):
                cands.append(y0 + (y1 - y0) * (q - x0) / (x1 - x0))
        return min(max(cands), hi(q))

    return lo, hi


def main():
    mu, phi, sweep, eq = parse()
    r219 = next(s["r"] for s in sweep if s["q"] == Q_LS)
    q_ls = mu / (phi + r219 * mu / Q_LS)          # mean demand over load-sensing time, L/min
    out = []
    p = out.append
    p("Milestone 6b: break-even rest-of-machine fuel rate on the measured excavator")
    p("(from the committed 5z and 6a results; fuxi-robot/excavator-motion folder 75, CC BY-NC-SA 4.0; no raw data read)")
    p("")
    p(f"inputs: mean moving demand mu {mu} L/min; still/moving time phi {phi:.4f}; r(219) {r219}; "
      f"mean demand over load-sensing time {q_ls:.2f} L/min")
    p(f"borrowed from the loader (not measured on this machine): b {B_C} L/kWh (5n), eta {ETA_C} (5x); "
      f"m* = {COV} (r - 1) p, central p {P_C:.0f} bar, margin 20 bar")
    p("")
    p("C1, identity tau = (phi + r mu / q_p) / (phi + r(219) mu / 219) against 6a's committed time ratios:")
    errs = []
    for s in sweep:
        t = time_ratio_from_r(s["r"], s["q"], r219, Q_LS, mu, phi)
        errs.append(abs(t - s["tau"]))
        p(f"  sweep  q_p {s['q']:6.1f}  r {s['r']:.3f}  6a {s['tau']:.3f}  identity {t:.4f}  diff {t - s['tau']:+.4f}")
    for e in eq:
        t = time_ratio_from_r(e["r"], e["q"], r219, Q_LS, mu, phi)
        errs.append(abs(t - e["tau"]))
        p(f"  q_eq   q_p {e['q']:6.1f}  r {e['r']:.3f}  6a {e['tau']:.3f}  identity {t:.4f}  diff {t - e['tau']:+.4f}"
          f"  (m {e['m']}, p {e['p']:.0f})")
    c1 = max(errs)
    p(f"  max |diff| {c1:.4f} over {len(errs)} rows (inputs rounded to 3 decimals in r, 0.1 in mu and moving %)")
    p("")

    lo, hi = bracket(sweep, eq, mu)
    viol = [s["q"] for s in sweep if lo(s["q"]) > s["r"] + 1e-9]
    p(f"bracket check: tangent/chord lower bound at the known points never exceeds the known r "
      f"({'ok' if not viol else 'violated at ' + str(viol)}); width at 50/70/100 L/min "
      f"{hi(50) - lo(50):.4f}/{hi(70) - lo(70):.4f}/{hi(100) - lo(100):.4f}")
    grid = [x / 10 for x in range(10, 2191)]

    def fstar(q, rfun, m, pr, b, eta):
        r = rfun(q)
        tau = time_ratio_from_r(r, q, r219, Q_LS, mu, phi)
        return breakeven_rest_rate(m, COV * (r - 1) * pr, q_ls, tau, b, eta)

    def fmax(m, pr, b, eta):
        res = []
        for rfun in (hi, lo):       # higher r -> lower f*: hi gives the lower bound of f*
            best = max(((fstar(q, rfun, m, pr, b, eta) or 0.0, q) for q in grid))
            res.append(best)
        return res                  # [(f lower, q), (f upper, q)]

    (f_l, q_l), (f_u, q_u) = fmax(20.0, P_C, B_C, ETA_C)
    p("")
    p("Break-even rest-of-machine rate f_t*(q_p), central (L/h; open-centre wins only below it):")
    p(f"{'q_p L/min':>10} {'r lo..hi':>14} {'tau':>13} {'m* bar':>13} {'f_t* L/h':>13}")
    for q in (40.0, 60.0, 70.0, 80.0, 87.6, 95.0, 98.5, 102.0, 105.0, 107.0):
        rl, rh = lo(q), hi(q)
        tl = time_ratio_from_r(rl, q, r219, Q_LS, mu, phi)
        th = time_ratio_from_r(rh, q, r219, Q_LS, mu, phi)
        fa, fb = fstar(q, hi, 20.0, P_C, B_C, ETA_C), fstar(q, lo, 20.0, P_C, B_C, ETA_C)
        fs = f"{(fa or 0):.2f}..{(fb or 0):.2f}"
        p(f"{q:>10.1f} {rl:>6.3f}..{rh:<6.3f} {tl:>6.3f}..{th:<6.3f} {COV*(rl-1)*P_C:>5.1f}..{COV*(rh-1)*P_C:<5.1f} {fs:>13}")
    p(f"f_t,max central: {f_l:.2f} to {f_u:.2f} L/h, at q_p {q_l:.1f} to {q_u:.1f} L/min "
      f"({q_l / Q_LS:.2f} to {q_u / Q_LS:.2f} of 219)")
    p("")
    p("Sweep of f_t,max (upper bound, L/h) over margin x pressure x b x eta:")
    allu, rows = [], []
    for m in MARGINS:
        for pr in PRESS:
            vals = []
            for b in BS:
                for eta in ETAS:
                    (fl, _), (fu, qu) = fmax(m, pr, b, eta)
                    vals.append((fu, fl, qu))
            allu += [v[0] for v in vals]
            hi_v = max(vals)
            rows.append((m, pr, min(v[1] for v in vals), hi_v[0], hi_v[2]))
            p(f"  m {m:4.1f} bar, p {pr:3.0f} bar: lower bound min {min(v[1] for v in vals):.2f}, "
              f"upper bound max {hi_v[0]:.2f} L/h (at {hi_v[2]:.1f} L/min)")
    p(f"  over all {len(allu)} cases: upper bound {min(allu):.2f} to {max(allu):.2f} L/h")
    p("")
    # C5: fuel-minimising pump at the loader's rest-of-machine rate
    p(f"At f_t {F_REF} L/h (the loader's rest-of-machine rate, borrowed), central: open-centre minus load-sensing fuel, "
      f"L per hour of load-sensing work")
    res5 = []
    for name, rfun in (("r upper", hi), ("r lower", lo)):
        def gap(q):
            r = rfun(q)
            tau = time_ratio_from_r(r, q, r219, Q_LS, mu, phi)
            return B_C * (COV * (r - 1) * P_C - 20.0) * q_ls / (600 * ETA_C) + F_REF * (tau - 1)
        g, q = min((gap(q), q) for q in grid)
        res5.append((g, q))
        p(f"  {name}: minimum {g:+.3f} L/h at q_p {q:.1f} L/min; at 219 {gap(219.0):+.3f}; at q_eq 108.0 {gap(108.0):+.3f}")
    for name, f in LOADER.items():
        p(f"  reference rate (loader, 5x) {name}: {f} L/h")
    p("")
    # the loader, for comparison, from 5w/5x committed numbers: below V_eq only 25 cc is on the sweep
    p("Loader comparison (5x committed numbers): at 25 cc open-centre saved 8.7 mL of pump-energy fuel per record "
      f"for 669.0 - 444.6 s more time, so f_t* there is {8.7e-3 / ((669.0 - 444.6) / 3600):.2f} L/h")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 6b):")
    p(f"  C1 identity within 0.002 on all 20 rows: {ok(c1 <= 0.002)} (max {c1:.4f})")
    p(f"  C2 f_t,max central in 1.5 to 4 L/h: {ok(1.5 <= f_l and f_u <= 4.0)} ({f_l:.2f} to {f_u:.2f})")
    p(f"  C3 f_t,max below 5.15 L/h in every case: {ok(max(allu) < 5.15)} (max upper bound {max(allu):.2f})")
    p(f"  C4 maximising pump below 98.5 L/min: {ok(max(q_l, q_u) < 98.5)} ({q_l:.1f} to {q_u:.1f})")
    c5 = all(abs(q - 108.0) / 108.0 <= 0.10 and g < 0.7 for g, q in res5)
    p(f"  C5 at 5.15 L/h best pump within 10% of 108.0 and gap under 0.7 L/h: {ok(c5)} "
      f"({', '.join(f'{q:.1f} L/min, {g:+.3f}' for g, q in res5)})")
    print("\n".join(out))


if __name__ == "__main__":
    main()
