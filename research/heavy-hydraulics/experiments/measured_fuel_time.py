"""Milestone 5x: the smaller open-centre pump's lost time priced in fuel per unit of work.

5w swept the fixed open-centre pump on the measured wheel loader from 63 down to 25 cc and found that
matching load-sensing's hydraulic energy at the measured 24.9 bar margin needs 28.5 cc and 39% more
record time. Here both sides of that trade go into litres, from the record's own fuel signal:

  fuel_OC - fuel_LS = b (E_OC - E_LS) / eta + f_t (T_OC - T_LS) / 3600

b: the marginal fuel per shaft energy of 5n's Willans line on this record (refitted and checked here);
eta: the work pump's hydraulic-to-shaft efficiency, central = the record's measured hydraulic energy over
the authors' shaft-power estimate, swept 0.75 to 0.95; E: 5w's `parts` energies under case (b), with
load-sensing at the measured 24.9 bar margin (A + m B); T: 5w's `times` (each circuit charged its own
pump limit). f_t, the fuel rate of the rest of the machine over the extra time, read three ways:
(i) still: mean measured fuel rate over samples where no section moves for open-centre (5o masks);
(ii) rest of machine (central): mean record fuel rate less b x mean work-pump shaft power;
(iii) low: 5th percentile of the record's 1 s mean fuel rates.
The same motion is the same work, so record fuel is fuel per unit of work (18 Y-cycles of gravel).
Load-sensing fuel = measured fuel + b (E_LS - E_measured) / eta.
Predictions X1 to X5 are in LOG.md (5x), registered before this script existed.

Data: Linjama et al., Zenodo doi:10.5281/zenodo.10639199, CC BY 4.0 (see measured_loader.py).
Needs numpy and scipy. Usage: python measured_fuel_time.py <path to Short_Y_cycle_data.mat>
"""
import os
import statistics
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import cycle_starts, extra_fuel, linfit  # noqa: E402
from heavy_hydraulics.spool_floor import size_spool  # noqa: E402
from measured_breakeven import parts, orifice_drop, MEASURED_MARGIN  # noqa: E402
from measured_pump_size import VGS, times  # noqa: E402

B_5N = 0.2332        # L/kWh, 5n's Willans slope (measured_loader_results.txt), checked below
ETAS = (0.75, 0.85, 0.95)
V_EQ = 28.51         # cc, 5w's bisection value, checked below


def main(path):
    from measured_loader import load
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
    drops = [orifice_drop(q, row) for (q, _), row in zip(r["secs"], rows)]
    pn = 5.0
    T_rec = len(r["t"]) * dt
    q_tot = sum(np.where(q > 0, q, 0.0) for q, _ in r["secs"])

    def measured(sl=slice(None)):
        F = float(r["fuel"][sl].sum() * dt / 3600)
        E_hyd = float((r["pP"][sl] * q_tot[sl]).sum() * dt / 0.6)
        E_sh = float(r["Pshaft"][sl].sum() * dt)
        return F, E_hyd, E_sh

    F_meas, E_meas, E_shaft = measured()
    eta_c = E_meas / E_shaft
    # Willans slope, as in 5n
    n = len(r["fuel"]) // win * win
    fs = r["fuel"][:n].reshape(-1, win).mean(1)
    ps_ = r["Peng"][:n].reshape(-1, win).mean(1) / 1e3
    a0, b, rr = linfit(list(ps_), list(fs))
    assert abs(round(b, 4) - B_5N) < 1e-9, b
    p(f"record {T_rec:.1f} s, fuel {F_meas:.3f} L ({F_meas/T_rec*3600:.2f} L/h mean); measured hydraulic {E_meas/1e3:.0f} kJ, "
      f"authors' shaft estimate {E_shaft/1e3:.0f} kJ -> eta {eta_c:.3f} (central; swept {ETAS})")
    p(f"check: Willans slope refitted {b:.4f} L/kWh (5n: {B_5N}), intercept {a0:.3f} L/h, r {rr:.3f}")

    # the three readings of f_t
    still = ~(masks[0] | masks[1])
    f_still = float(r["fuel"][still].mean())
    f_rest = F_meas / T_rec * 3600 - b * (E_shaft / T_rec) / 1e3
    f_low = float(np.percentile(fs, 5))
    rates = {"still": f_still, "rest": f_rest, "low": f_low}
    p(f"f_t, fuel rate over the extra time, L/h: (i) still {f_still:.2f} (over {still.mean()*100:.1f}% of samples, "
      f"engine power there {r['Peng'][still].mean()/1e3:.1f} kW); (ii) rest of machine {f_rest:.2f} (central: "
      f"{F_meas/T_rec*3600:.2f} less {b:.4f} x {E_shaft/T_rec/1e3:.2f} kW); (iii) low, p5 of 1 s means {f_low:.2f}")

    ls = parts(r, masks, drops, pn)
    E_ls = ls["A"] + MEASURED_MARGIN * ls["B"]
    F_ls = F_meas + b * (E_ls - E_meas) / eta_c / 3.6e6
    p(f"load-sensing at the measured {MEASURED_MARGIN} bar margin: model hydraulic {E_ls/1e3:.0f} kJ (measured {E_meas/1e3:.0f}), "
      f"fuel {F_ls:.3f} L")
    t_oc63, t_ls, _ = times(r, masks, 63)
    p(f"load-sensing time with its own 63 cc limit {t_ls:.1f} s against the record's {T_rec:.1f} s (5w's data check: the "
      f"derived demand exceeds the 63 cc pump in places; both circuits carry it, so only T_OC - T_LS is charged)")

    def trade(vg, eta, f_t, sl=slice(None), base=None):
        x = parts(r, masks, drops, pn, sl=sl, vg=vg * 1e-6)
        to, tl, _ = times(r, masks, vg, sl)
        e_ls = x["A"] + MEASURED_MARGIN * x["B"]
        h, t = extra_fuel(x["OC"], e_ls, to, tl, b, eta, f_t)
        return h, t, x, to / tl

    # V_eq check: m* there equals the measured margin, so the hydraulic part vanishes
    h, t, x, tr = trade(V_EQ, eta_c, f_rest)
    assert abs(x["m"] - MEASURED_MARGIN) < 0.01, x["m"]
    assert abs(h) < 1e-3 * F_ls
    p(f"check: at 5w's V_eq {V_EQ} cc, m* {x['m']:.2f} bar and the hydraulic part is {h*1e3:+.2f} mL (zero by construction)")

    p("")
    p("whole record, fuel per unit of work: open-centre minus load-sensing, central eta and f_t (rest of machine)")
    p("  Vg cc  T_oc/T_ls  hyd mL  time mL  total mL  OC/LS fuel")
    sweep = []
    for vg in VGS + (V_EQ,):
        h, t, x, tr = trade(vg, eta_c, f_rest)
        sweep.append((vg, h, t, tr))
        p(f"  {vg:5.2f} {tr:10.4f} {h*1e3:7.1f} {t*1e3:8.1f} {(h+t)*1e3:9.1f} {1+(h+t)/F_ls:10.4f}")
    grid = [row for row in sweep if row[0] != V_EQ]
    best = min(grid, key=lambda row: row[1] + row[2])

    # finer search for the fuel-minimising Vg (central)
    fine = [(v, sum(trade(v, eta_c, f_rest)[:2])) for v in np.arange(25.0, 63.01, 0.5)]
    vbest, dbest = min(fine, key=lambda z: z[1])
    p(f"fuel-minimising Vg (0.5 cc grid, central): {vbest:.1f} cc, open-centre {dbest*1e3:+.1f} mL "
      f"({dbest/F_ls*100:+.1f}% of load-sensing fuel); on the registered sweep {best[0]} cc")

    p("")
    p("sensitivity: OC/LS fuel at 63 cc, at the fuel-minimising Vg (0.5 cc grid) and at V_eq, for each f_t and eta")
    p("  f_t     L/h   eta   63 cc   best Vg (OC/LS)   V_eq   any Vg with OC <= LS")
    any_win = False
    cells = []
    for name, f_t in rates.items():
        for eta in ETAS + (eta_c,):
            vals = [(v, sum(trade(v, eta, f_t)[:2])) for v in np.arange(25.0, 63.01, 0.5)]
            vb, db = min(vals, key=lambda z: z[1])
            d63 = sum(trade(63, eta, f_t)[:2])
            deq = sum(trade(V_EQ, eta, f_t)[:2])
            win_ = any(d <= 0 for _, d in vals)
            any_win |= win_
            cells.append((name, eta, vb, db / F_ls))
            p(f"  {name:6s} {f_t:5.2f} {eta:5.3f} {1+d63/F_ls:7.4f}  {vb:5.1f} ({1+db/F_ls:.4f})  {1+deq/F_ls:9.4f}   "
              f"{'yes' if win_ else 'no'}")

    # per Y-cycle, central
    starts = cycle_starts(list(r["x"]), 0.30)
    cyc = list(zip(starts, starts[1:]))
    p("")
    p(f"per Y-cycle ({len(cyc)} cycles), central: OC/LS fuel at 63 cc, at V_eq and the per-cycle fuel-minimising Vg (1 cc grid)")
    c63, ceq, cbest, cpen = [], [], [], []
    for i0, i1 in cyc:
        sl = slice(i0, i1)
        F_c, E_c, _ = measured(sl)
        x = parts(r, masks, drops, pn, sl=sl)
        F_lsc = F_c + b * (x["A"] + MEASURED_MARGIN * x["B"] - E_c) / eta_c / 3.6e6
        c63.append(1 + sum(trade(63, eta_c, f_rest, sl)[:2]) / F_lsc)
        ceq.append(1 + sum(trade(V_EQ, eta_c, f_rest, sl)[:2]) / F_lsc)
        vals = [(v, sum(trade(v, eta_c, f_rest, sl)[:2])) for v in range(25, 64)]
        vb, db = min(vals, key=lambda z: z[1])
        cbest.append(vb)
        cpen.append(1 + db / F_lsc)
    for lab, v in (("OC/LS fuel at 63 cc", c63), ("OC/LS fuel at V_eq", ceq), ("best Vg, cc", cbest),
                   ("OC/LS fuel at best Vg", cpen)):
        p(f"  {lab:22s} median {statistics.median(v):.3f} (min {min(v):.3f}, max {max(v):.3f})")
    p(f"  cycles where some Vg gives OC <= LS fuel: {sum(c <= 1 for c in cpen)} of {len(cyc)}")

    p("")
    _, _, _, _ = sweep[-1]
    deq_c = sweep[-1][1] + sweep[-1][2]
    p(f"X1 {'HOLDS' if deq_c / F_ls > 0.15 else 'REFUTED'} (OC fuel at V_eq > 1.15 x LS, central: {1+deq_c/F_ls:.4f})")
    p(f"X2 {'HOLDS' if not any_win else 'REFUTED'} (no Vg with OC fuel <= LS under any f_t reading and eta 0.75 to 0.95)")
    p(f"X3 {'HOLDS' if 45 <= vbest <= 56 else 'REFUTED'} (fuel-minimising Vg in 45 to 56 cc, central: {vbest:.1f})")
    p(f"X4 {'HOLDS' if 0.07 <= dbest / F_ls <= 0.13 else 'REFUTED'} (minimum penalty 7 to 13%, central: {dbest/F_ls*100:.1f}%)")
    p(f"X5 {'HOLDS' if f_still < f_rest else 'REFUTED'} (still rate below rest-of-machine rate: {f_still:.2f} vs {f_rest:.2f} L/h)")
    return "\n".join(out)


if __name__ == "__main__":
    text = main(sys.argv[1])
    print(text)
    with open(os.path.join(HERE, "measured_fuel_time_results.txt"), "w") as fh:
        fh.write(text + "\n")
