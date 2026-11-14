"""Milestone 6p: a bench-measured Casappa KP30 (44 cm3/r) against the 0.83 crux and against Casappa's catalogue.

Inputs (all committed): data/frosina2017_kp30_bench.csv (digitise_frosina_kp30.py: Frosina, Senatore, Rigosi 2017,
Energies 10:1113, Figures 11 to 13, CC BY 4.0), data/casappa_kp30_curves.csv (6k: Casappa KAPPA catalogue, KP 30.43
at 43.98 cm3/r), the three makers' 50% crossings in excavator_gear_pump_marzocchi_results.txt and the Casappa c sweep
in gear_pump_crux_results.txt. Stdlib only; no simulation is rerun.

Definitions: hydro-mechanical efficiency eta_hm = V p / (2 pi T) with V = 44 cm3/r (Table 1) and p the delivery
pressure in the figures (the inlet is 0.7 to 3 bar absolute, Table 1, and is not subtracted); volumetric efficiency
eta_v = Figure 13's normalised flow divided by n / 2500 r/min (the base is checked below from the two speeds, assuming
leakage independent of speed); overall eta_t = eta_v eta_hm. 2100 r/min by linear interpolation in speed between
1500 and 2500 r/min.

Usage: python3 kp30_bench.py > kp30_bench_results.txt
"""
import csv
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
V_BENCH = 44.0        # cm3/r, Frosina et al. 2017 Table 1 (nominal)
V_CAT = 43.98         # cm3/r, KP 30.43, Casappa catalogue p. 4 (6k)
N_W = 2100.0          # r/min, the excavator's working speed (6k)
SPEEDS = (1000, 1500, 2500)
PRESS = (50.0, 150.0, 250.0)
THRESHOLD = 0.83      # 6n/6o: the excavator ranking flips between 0.8188 and 0.8309 on the 85 L/min index


def rows(path):
    with open(path) as fh:
        return [r for r in csv.reader(l for l in fh if not l.startswith("#"))][1:]


def interp(x, xs, ys):
    for (x0, y0), (x1, y1) in zip(zip(xs, ys), zip(xs[1:], ys[1:])):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    raise ValueError(x)


def bench():
    t, d, q = {}, {}, {}
    for quantity, series, oil, n, p, v in rows(os.path.join(HERE, "data", "frosina2017_kp30_bench.csv")):
        key = (int(n), float(p))
        if quantity == "fig11_torque_Nm":
            t[(series,) + key] = float(v)
        elif quantity == "fig12_delta_torque_Nm":
            d[key] = float(v)
        elif quantity == "fig13_normalised_flow" and int(oil) == 50:
            q[key] = float(v)
    return t, d, q


def catalogue(size=43):
    """KP 30.43 torque (Nm) and flow (L/min) at pressure p and speed n, from the committed catalogue curves."""
    rs = rows(os.path.join(HERE, "data", "casappa_kp30_curves.csv"))
    tq, fl = {}, {}
    for s, kind, p, n, v in rs:
        if int(s) != size:
            continue
        if kind == "torque":
            tq.setdefault(float(p), []).append((float(n), float(v)))
        elif kind == "flow":
            fl.setdefault(float(p), []).append((float(n), float(v)))

    def torque(p, n):
        ps = sorted(tq)
        vals = []
        for pp in ps:
            pts = sorted(tq[pp])
            vals.append(interp(n, [a for a, _ in pts], [b for _, b in pts]))
        return interp(p, ps, vals)

    def flow(p, n):
        ps = sorted(fl)
        vals = []
        for pp in ps:
            pts = sorted(fl[pp])
            vals.append(interp(n, [a for a, _ in pts], [b for _, b in pts]))
        (p0, v0), (p1, v1) = (ps[0], vals[0]), (ps[-1], vals[-1])
        return v0 + (v1 - v0) * (p - p0) / (p1 - p0)        # linear in p between the two drawn lines (6k)
    return torque, flow


def crossings():
    res = open(os.path.join(HERE, "excavator_gear_pump_marzocchi_results.txt")).read().splitlines()
    line = next(l for l in res if l.strip().startswith("index 2: casappa"))
    parts = line.split(":", 1)[1].split(";")[0].split(",")
    return {k.split()[0]: float(k.split()[1]) for k in parts}


def casappa_sweep():
    res = open(os.path.join(HERE, "gear_pump_crux_results.txt")).read().splitlines()
    i = res.index("casappa: c sweep on both indices")
    out = []
    for l in res[i + 2:]:
        t = l.split()
        if len(t) != 4:
            break
        out.append((float(t[0]), float(t[1]), float(t[3])))
    return out


def main():
    t, d, q = bench()
    torque_cat, flow_cat = catalogue()
    p = print
    p("Milestone 6p: a bench-measured Casappa KP30 (44 cm3/r; Frosina, Senatore, Rigosi 2017, Energies 10:1113, "
      "Figs. 11-13, CC BY 4.0) against the 0.83 crux and Casappa's KAPPA catalogue curves (KP 30.43)")
    p("")
    p("Bench torque, read by pixel (Nm): measured (torque meter) and CFD model (pressure only, no friction)")
    p("  r/min   p bar  measured  model  ideal V p/2pi  measured-model  Fig. 12 delta  eta_hm")
    ideal = {pp: V_BENCH * pp / (20.0 * math.pi) for pp in PRESS}   # cm3 x bar / (2 pi) / 10 = Nm
    hm = {}
    for n in SPEEDS:
        for pp in PRESS:
            m, s = t[("measured", n, pp)], t[("model", n, pp)]
            hm[(n, pp)] = ideal[pp] / m
            p(f"  {n:5d}  {pp:6.0f}  {m:8.2f}  {s:6.2f}  {ideal[pp]:13.2f}  {m - s:14.2f}  {d[(n, pp)]:13.2f}  "
              f"{hm[(n, pp)]:.4f}")
    p("")
    p("Bench volumetric efficiency (Figure 13, 50 C; normalised flow / (n / 2500))")
    base = {}
    for pp in PRESS:
        base[pp] = 1000.0 / (q[(2500, pp)] - q[(1500, pp)])          # in r/min: B (q2500 - q1500) = V x 1000
    p("  base check, speed-independent leakage: Q_norm x B = V n - L gives B = 1000 / (q2500 - q1500) r/min x V: " +
      ", ".join(f"{pp:.0f} bar {base[pp]:.0f}" for pp in PRESS))
    vol = {}
    for pp in PRESS:
        vol[(1500, pp)] = q[(1500, pp)] / 0.6
        vol[(2500, pp)] = q[(2500, pp)]
        p(f"  {pp:3.0f} bar: 1500 r/min {vol[(1500, pp)]:.4f}, 2500 r/min {vol[(2500, pp)]:.4f}")
    p("")
    p(f"At {N_W:.0f} r/min (linear in speed between 1500 and 2500 r/min), bench against catalogue KP 30.43 "
      f"(catalogue at {N_W:.0f} r/min from the committed curves):")
    p("  p bar  bench T Nm  cat T Nm  T ratio  bench eta_v  cat eta_v  bench eta_hm  cat eta_hm  bench eta_t  cat eta_t")
    w = (N_W - 1500.0) / 1000.0
    at = {}
    for pp in PRESS:
        tb = t[("measured", 1500, pp)] * (1 - w) + t[("measured", 2500, pp)] * w
        vb = vol[(1500, pp)] * (1 - w) + vol[(2500, pp)] * w
        hb = ideal[pp] / tb
        tc = torque_cat(pp, N_W)
        qc = flow_cat(pp, N_W)
        vc = qc / (V_CAT * N_W / 1000.0)
        hc = V_CAT * pp / (20.0 * math.pi) / tc
        at[pp] = (tb, vb, hb, vb * hb, tc, vc, hc, vc * hc)
        p(f"  {pp:5.0f}  {tb:10.2f}  {tc:8.2f}  {tc / tb:7.3f}  {vb:11.4f}  {vc:9.4f}  {hb:12.4f}  {hc:10.4f}  "
          f"{vb * hb:11.4f}  {vc * hc:9.4f}")
    p("  catalogue/bench torque at the bench's own speeds, 150 bar: " +
      ", ".join(f"{n} r/min {torque_cat(150.0, n) / t[('measured', n, 150.0)]:.3f}" for n in SPEEDS))
    eta = at[150.0][3]
    p("")
    p("Sensitivity of the bench overall efficiency at 150 bar, 2100 r/min:")
    alt = []
    fr = d[(1500, 150.0)] * (1 - w) + d[(2500, 150.0)] * w
    hb_fig12 = ideal[150.0] / (ideal[150.0] + fr)
    alt.append(("friction from Figure 12's delta added to the ideal torque", at[150.0][1] * hb_fig12))
    hb_2500 = hm[(2500, 150.0)]
    alt.append(("eta_hm at 2500 r/min (the lowest of the three speeds)", at[150.0][1] * hb_2500))
    alt.append(("eta_v from the catalogue (KP 30.43) instead of Figure 13", at[150.0][5] * at[150.0][2]))
    alt.append(("eta_v 0.95, Marzocchi's sizing advice (6o)", 0.95 * at[150.0][2]))
    alt.append(("both worst: eta_hm at 2500 r/min and eta_v 0.95", 0.95 * hb_2500))
    alt.append(("V 2% under nominal (43.12 cm3/r) in eta_hm, eta_v unchanged", at[150.0][1] * at[150.0][2] * 0.98))
    for name, v in alt:
        p(f"  {name}: {v:.4f}")
    lo = min(v for _, v in alt)
    p(f"  central {eta:.4f}; lowest variant {lo:.4f}")
    p("")
    cr = crossings()
    p("Against the crux (6n/6o: 50% crossings on the 85 L/min index, a smaller fixed pump beats load-sensing at "
      "S = 0.38 in half of 384 geometries):")
    p("  crossings: " + ", ".join(f"{k} {v:.4f}" for k, v in cr.items()))
    p(f"  bench KP30 at 150 bar, {N_W:.0f} r/min: {eta:.4f}, {eta - max(cr.values()):+.4f} above the highest crossing; "
      f"lowest variant {lo:.4f}, {lo - max(cr.values()):+.4f}")
    q20 = V_BENCH * N_W / 1000.0 * (vol[(1500, 50.0)] * (1 - w) + vol[(2500, 50.0)] * w)
    p(f"  bench KP30 flow at {N_W:.0f} r/min, 50 bar: {q20:.1f} L/min (the index is read at 85 L/min of 20 bar flow; "
      "6n's central optimum picks 85 to 93 L/min)")
    k = open(os.path.join(HERE, "excavator_gear_pump_results.txt")).read().splitlines()
    r43 = next(l.split() for l in k if l.split()[:2] == ["43", "43.98"])
    cat150 = float(r43[5])                          # 6k's eta_t(150) from the power curves, which the sweeps use
    c_bench = eta / cat150
    sw = casappa_sweep()
    p(f"  6k's KP 30.43 eta_t at 150 bar from the power curves (what the sweeps scale): {cat150:.3f}; from the torque "
      f"curves as above {at[150.0][7]:.4f} (6k: power over torque x n is 1.037 for this size)")
    p(f"  as a scale on Casappa's catalogue curves (6k's c): bench / catalogue at 150 bar = {c_bench:.3f}; "
      f"the committed Casappa sweep reaches c {sw[-1][0]:.2f} with {sw[-1][1]:.1f}% of geometries, and the share rises "
      "with c (a higher efficiency only lowers the fixed pump's fuel), so at the bench efficiency it is at least that")
    p("")
    ok = lambda c: "held" if c else "refuted"  # noqa: E731
    p("Predictions (LOG.md 6p):")
    p(f"  GB1 bench eta_t at 150 bar, 2100 r/min above 0.83: {ok(eta > THRESHOLD)} ({eta:.4f})")
    p(f"  GB2 bench eta_hm at 150 bar exceeds the catalogue's 0.801 by at least 0.10: "
      f"{ok(at[150.0][2] - 0.801 >= 0.10)} ({at[150.0][2]:.4f}, {at[150.0][2] - 0.801:+.4f}; "
      f"catalogue here {at[150.0][6]:.4f})")
    dev = {n: t[("model", n, 150.0)] / ideal[150.0] - 1 for n in SPEEDS}
    p(f"  GB3 model torque at 150 bar within 2% of {ideal[150.0]:.2f} Nm at all speeds: "
      f"{ok(max(abs(v) for v in dev.values()) <= 0.02)} (" +
      ", ".join(f"{n} {v * 100:+.1f}%" for n, v in dev.items()) + ")")
    dd = {n: t[("measured", n, 150.0)] - t[("model", n, 150.0)] - d[(n, 150.0)] for n in SPEEDS}
    p(f"  GB4 Figure 11 measured-model within 1 Nm of Figure 12 at 150 bar: {ok(max(abs(v) for v in dd.values()) <= 1.0)} "
      "(" + ", ".join(f"{n} {v:+.2f}" for n, v in dd.items()) + ")")
    p(f"  GB5 bench eta_v at 150 bar, 2500 r/min in 0.95-0.99: {ok(0.95 <= vol[(2500, 150.0)] <= 0.99)} "
      f"({vol[(2500, 150.0)]:.4f})")
    fr150 = [t[("measured", n, 150.0)] - t[("model", n, 150.0)] for n in SPEEDS]
    fr12 = [d[(n, 150.0)] for n in SPEEDS]
    p(f"  GB6 friction torque at 150 bar rises with speed: {ok(fr150[0] < fr150[1] < fr150[2])} on Figure 11 "
      f"({', '.join(f'{v:.2f}' for v in fr150)}); Figure 12 {ok(fr12[0] < fr12[1] < fr12[2])} "
      f"({', '.join(f'{v:.2f}' for v in fr12)})")
    p("")
    p("Sources: Frosina, Senatore, Rigosi (2017), doi:10.3390/en10081113 (CC BY 4.0); Casappa KAPPA catalogue "
      "K 05 T A (2012), pp. 4 and 9-11 (6k); crossings from 6n and 6o.")


if __name__ == "__main__":
    main()
