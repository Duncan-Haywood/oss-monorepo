"""Milestone 5n: the circuit model against a measured load-sensing machine.

Data: Linjama, Huova, Tammisto, Tervonen and Ahola, "6-ton wheel loader short
Y-cycle data for 440 seconds loading of gravel", Zenodo, 2024,
doi:10.5281/zenodo.10639199, CC BY 4.0 (Tampere University; measured
2017-08-02). File `Short_Y_cycle_data.mat` (96 MB, not committed):
  https://zenodo.org/api/records/10639199/files/Short_Y_cycle_data.mat/content
Signals used: lift and tilt valve P-port flows (derived by the authors from
piston velocity and area), lift and tilt chamber pressures, work-pump outlet
pressure, pump speed, the authors' pump angle, torque and shaft-power estimates,
ECU fuel rate and engine power estimate, lift piston position.

Predictions P1 to P4 were written in LOG.md (2026-11-11, 5n) before this ran.

Needs numpy and scipy. Usage: python measured_loader.py <path to .mat>  (about 30 s)
"""
import math
import os
import random
import sys

import numpy as np
import scipy.io

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from heavy_hydraulics.measured import (energies, pump_torque, linfit,  # noqa: E402
                                       cycle_starts)

LPM = 6e4          # m3/s -> L/min
BAR = 1e-5         # Pa -> bar
VG = 63e-6         # work pump displacement, m3/rev (dataset Params.Size)
SPOOL = (6.0, 10.0, 15.0)      # bar, open-centre spool drop while moving (swept, unsourced for this size)
NEUTRAL = (5.0, 10.0, 15.0)    # bar, open-centre neutral drop at ~100 L/min (swept, unsourced)
QMIN = (0.5, 2.0, 5.0)         # L/min, flow below which the bypass is taken as open (a modelling choice)
MOVING = 5.0       # L/min of P-port flow that counts as "moving" for P1


def load(path):
    D = scipy.io.loadmat(path, squeeze_me=True, struct_as_record=False)["Data"]
    g = lambda o: np.asarray(o.Data, float)  # noqa: E731
    r = dict(dt=float(D.SamplingPeriod), t=np.asarray(D.t, float))
    r["pP"] = g(D.WorkPump.pP) * BAR
    r["w"] = g(D.WorkPump.w)
    r["Q"] = g(D.WorkPump.FlowEstimate) * LPM
    r["alpha"] = g(D.WorkPump.AngleEstimate)
    r["tau"] = g(D.WorkPump.TorqueEstimate)
    r["Pshaft"] = g(D.WorkPump.ShaftPowerEstimate)
    r["fuel"] = g(D.Diesel.FuelRate)          # L/h
    r["Peng"] = g(D.Diesel.PowerEstimate)     # W
    r["x"] = g(D.LiftCylinder.x)
    L, T = D.LiftCylinder, D.TiltCylinder
    secs = []
    for valve, cyl in ((D.LiftValve, L), (D.TiltValve, T)):
        qa, qb = g(valve.Q_PA) * LPM, g(valve.Q_PB) * LPM
        pa, pb = g(cyl.pA) * BAR, g(cyl.pB) * BAR
        q = qa + qb
        pin = np.where(qa > 0, pa, np.where(qb > 0, pb, np.nan))
        secs.append((q, pin))
    r["secs"] = secs
    return r


def vec(r, dp_ls, dp_m=5.0, dp_spool=10.0, p_neutral=10.0, leak=2.5, q_min=2.0, sl=slice(None)):
    """numpy twin of measured.energies (checked equal on the central case),
    plus open-centre shaft energy from the pump torque model."""
    dt = r["dt"]
    qs = [s[0][sl] for s in r["secs"]]
    ps = [s[1][sl] for s in r["secs"]]
    q_tot = sum(np.where(q > 0, q, 0.0) for q in qs)
    pl = np.full_like(q_tot, -np.inf)
    for q, p in zip(qs, ps):
        pl = np.where((q > 0) & ~np.isnan(p), np.maximum(pl, np.nan_to_num(p, nan=-np.inf)), pl)
    mv = np.isfinite(pl)
    w = r["w"][sl]
    q_fix = np.maximum(0.0, VG * 1e3 * w / (2 * math.pi) * 60 - leak)
    k = dt / 0.6
    e = {}
    e["measured"] = float((r["pP"][sl] * q_tot).sum() * k)
    with np.errstate(invalid="ignore"):
        e["ls_model"] = float((q_tot * (pl + dp_ls))[mv].sum() * k)
    use = sum(np.where((q > 0) & ~np.isnan(p), q * np.nan_to_num(p), 0.0) for q, p in zip(qs, ps))
    met = sum(np.where((q > 0) & ~np.isnan(p), q * (np.nan_to_num(p) + dp_m), 0.0) for q, p in zip(qs, ps))
    e["useful"] = float(use[mv].sum() * k)
    e["metered"] = float(met[mv].sum() * k)
    q_big = sum(np.where(q > q_min, q, 0.0) for q in qs)
    pl_oc = np.full_like(q_tot, -np.inf)
    for q, p in zip(qs, ps):
        pl_oc = np.where((q > q_min) & ~np.isnan(p), np.maximum(pl_oc, np.nan_to_num(p, nan=-np.inf)), pl_oc)
    mv_oc = np.isfinite(pl_oc)
    q_oc = np.where(mv_oc, np.maximum(q_fix, q_big), q_fix)
    p_oc = np.where(mv_oc, pl_oc + dp_spool, p_neutral)
    e["open_centre"] = float((q_oc * p_oc).sum() * k)
    e["oc_short_s"] = float(((q_big > q_fix) & mv_oc).sum() * dt)
    e["oc_moving_s"] = float(mv_oc.sum() * dt)
    e["moving_s"] = float(mv.sum() * dt)
    # shaft energy: LS from the authors' estimate; OC at full displacement with
    # the same loss model (alpha = 1; flow above the pump is the demand, alpha > 1)
    alpha_oc = np.maximum(1.0, q_oc / np.maximum(q_fix + leak, 1e-9))
    e["ls_shaft"] = float(r["Pshaft"][sl].sum() * dt)
    e["oc_shaft"] = float((pump_torque(alpha_oc, p_oc, w) * w).sum() * dt)
    # metered and ls-model shaft: same angle the measured pump had, own pressure
    a = r["alpha"][sl]
    p_ls = np.where(mv, pl + dp_ls, r["pP"][sl])
    e["lsm_shaft"] = float((pump_torque(a, p_ls, w) * w).sum() * dt)
    return e


def bootstrap(vals, n=4000, seed=0):
    rng = random.Random(seed)
    m = len(vals)
    means = sorted(sum(rng.choice(vals) for _ in range(m)) / m for _ in range(n))
    return means[int(0.025 * n)], means[int(0.975 * n)]


def main(path):
    r = load(path)
    dt, out = r["dt"], []
    p = out.append
    dur = r["t"][-1] - r["t"][0]
    p(f"record: {len(r['t'])} samples at {dt*1e3:.0f} ms, {dur:.1f} s; fuel {r['fuel'].sum()*dt/3600:.3f} L")

    # --- P1: the load-sensing margin ---
    q_tot = sum(np.where(s[0] > 0, s[0], 0) for s in r["secs"])
    pl = np.fmax(*[np.where(s[0] > 0, s[1], np.nan) for s in r["secs"]])
    mv = (q_tot > MOVING) & np.isfinite(pl)
    m = r["pP"][mv] - pl[mv]
    pct = np.percentile(m, [5, 25, 50, 75, 95])
    p(f"moving (P-port flow > {MOVING} L/min): {mv.mean()*100:.1f}% of samples")
    p("P1 margin pP - p_load, bar: p5 %.1f  p25 %.1f  median %.1f  p75 %.1f  p95 %.1f" % tuple(pct))
    p(f"   negative margin (inlet chamber above pump): {(m < 0).mean()*100:.1f}% of moving samples")
    neg = mv & (r["pP"] - pl < 0)
    e_all = (r["pP"] * q_tot).sum()
    p("   negative-margin samples: median flow %.1f L/min, median pump %.1f bar, %.1f%% of measured hydraulic energy"
      % (np.median(q_tot[neg]), np.median(r["pP"][neg]), (r["pP"] * q_tot)[neg].sum() / e_all * 100))
    m_big = (r["pP"] - pl)[(q_tot > 20) & np.isfinite(pl)]
    p("   margin when P-port flow > 20 L/min: median %.1f bar, p5 %.1f, p95 %.1f"
      % (np.median(m_big), *np.percentile(m_big, [5, 95])))
    idle = q_tot < 0.5
    p("   standby (no P-port flow) pump pressure: median %.1f bar, p5 %.1f, p95 %.1f"
      % tuple(np.percentile(r["pP"][idle], [50, 5, 95])))
    dp_ls = float(pct[2])
    p(f"P1 {'HOLDS' if 14 <= dp_ls <= 30 else 'REFUTED'} (14 to 30 bar)")

    # --- check: torque model as read vs the authors' torque estimate ---
    res = pump_torque(r["alpha"], r["pP"], r["w"]) - r["tau"]
    p("check: pump torque model as read minus authors' estimate, N m: p1 %.2f median %.2f p99 %.2f (mean torque %.1f)"
      % (*np.percentile(res, [1, 50, 99]), r["tau"].mean()))

    # --- central case through the tested stdlib code, then the numpy twin ---
    samples = []
    for i in range(len(r["t"])):
        secs = tuple((float(s[0][i]), None if math.isnan(s[1][i]) else float(s[1][i])) for s in r["secs"])
        samples.append((float(r["pP"][i]), float(r["w"][i]), secs))
    e0 = energies(samples, dt, dp_ls=dp_ls, q_min=2.0)
    e = vec(r, dp_ls)
    for k in ("measured", "ls_model", "metered", "useful", "open_centre"):
        assert abs(e0[k] - e[k]) <= 1e-6 * max(1.0, abs(e0[k])), (k, e0[k], e[k])
    p("check: numpy twin equals measured.energies on the central case (5 energies)")

    kj = lambda v: v / 1e3  # noqa: E731
    p("")
    p("central case: dp_ls = measured median, dp_spool 10, p_neutral 10, leak 2.5 L/min, dp_m 5, q_min 2 L/min")
    p(f"  useful (actuator inlet) {kj(e['useful']):8.0f} kJ")
    p(f"  measured LS pump hyd    {kj(e['measured']):8.0f} kJ   (useful/pump {e['useful']/e['measured']:.3f})")
    p(f"  LS model (const margin) {kj(e['ls_model']):8.0f} kJ   ratio to measured {e['ls_model']/e['measured']:.3f}")
    p(f"  metered (ideal)         {kj(e['metered']):8.0f} kJ   ratio to measured {e['metered']/e['measured']:.3f}")
    p(f"  open-centre fixed 63 cc {kj(e['open_centre']):8.0f} kJ   ratio to measured {e['open_centre']/e['measured']:.3f}")
    p(f"  open-centre moving {e['oc_moving_s']:.1f} s of {dur:.1f} s; fixed pump short of demand {e['oc_short_s']:.1f} s")
    p(f"  shaft: LS measured-estimate {kj(e['ls_shaft']):.0f} kJ, OC {kj(e['oc_shaft']):.0f} kJ, ratio {e['oc_shaft']/e['ls_shaft']:.3f}")
    r2 = e["ls_model"] / e["measured"]
    p(f"P2 {'HOLDS' if abs(r2 - 1) <= 0.15 else 'REFUTED'} (LS model within 15% of measured: {r2:.3f})")

    # --- sweep the unsourced open-centre settings ---
    p("")
    p("open-centre sweep: dp_spool | p_neutral | q_min -> OC/LS hydraulic, OC/LS shaft")
    hyd_r, sh_r, cells = [], [], []
    for dps in SPOOL:
        for pn in NEUTRAL:
            for qm in QMIN:
                ee = vec(r, dp_ls, dp_spool=dps, p_neutral=pn, q_min=qm)
                a, b = ee["open_centre"] / ee["measured"], ee["oc_shaft"] / ee["ls_shaft"]
                hyd_r.append(a)
                sh_r.append(b)
                cells.append(ee)
                p(f"  {dps:4.0f} | {pn:4.0f} | {qm:3.1f} -> {a:.3f}  {b:.3f}")
    for lk in (0.0, 4.0):
        ee = vec(r, dp_ls, leak=lk)
        p(f"  leak {lk:.1f} L/min (central otherwise) -> {ee['open_centre']/ee['measured']:.3f}  {ee['oc_shaft']/ee['ls_shaft']:.3f}")
    p(f"  range: hydraulic {min(hyd_r):.3f} to {max(hyd_r):.3f}; shaft {min(sh_r):.3f} to {max(sh_r):.3f}")
    ok3 = all(1.5 <= v <= 3.0 for v in hyd_r)
    p(f"P3 {'HOLDS' if ok3 else 'REFUTED'} overall; inside 1.5 to 3.0 (hydraulic) in {sum(1.5 <= v <= 3.0 for v in hyd_r)}/{len(hyd_r)} sweep cells")

    # --- fuel: Willans line from the record itself ---
    k = int(round(1.0 / dt))
    n = len(r["fuel"]) // k * k
    fs = r["fuel"][:n].reshape(-1, k).mean(1)
    ps_ = r["Peng"][:n].reshape(-1, k).mean(1) / 1e3
    a0, b, rr = linfit(list(ps_), list(fs))
    fuel_L = r["fuel"].sum() * dt / 3600
    p("")
    p(f"Willans line (1 s means): fuel L/h = {a0:.3f} + {b:.4f} x engine kW, r = {rr:.3f} "
      f"(marginal {b:.3f} L/kWh = {b*835:.0f} g/kWh at 0.835 kg/L, an assumed diesel density)")
    d_oc = b * (e["oc_shaft"] - e["ls_shaft"]) / 3.6e6
    d_lsm = b * (e["lsm_shaft"] - e["ls_shaft"]) / 3.6e6
    p(f"  open-centre extra fuel {d_oc:.3f} L = {d_oc/fuel_L*100:.1f}% of the measured {fuel_L:.3f} L")
    p(f"  (LS model-margin shaft vs measured shaft: {d_lsm/fuel_L*100:+.1f}% of fuel)")
    fuel_share = [b * (ee["oc_shaft"] - ee["ls_shaft"]) / 3.6e6 / fuel_L for ee in cells]
    p(f"  sweep: OC extra fuel {min(fuel_share)*100:.1f}% to {max(fuel_share)*100:.1f}% of measured")
    ok4 = all(0.10 <= v <= 0.30 for v in fuel_share)
    p(f"P4 {'HOLDS' if ok4 else 'REFUTED'} overall; inside 10 to 30% in {sum(0.10 <= v <= 0.30 for v in fuel_share)}/{len(fuel_share)} sweep cells")

    # --- per-cycle bootstrap ---
    starts = cycle_starts(list(r["x"]), 0.30)
    cyc = []
    for i0, i1 in zip(starts, starts[1:]):
        ee = vec(r, dp_ls, sl=slice(i0, i1))
        f = r["fuel"][i0:i1].sum() * dt / 3600
        cyc.append(dict(T=(i1 - i0) * dt, hyd=ee["open_centre"] / ee["measured"],
                        sh=ee["oc_shaft"] / ee["ls_shaft"],
                        lsm=ee["ls_model"] / ee["measured"],
                        eff=ee["useful"] / ee["measured"],
                        fuel=b * (ee["oc_shaft"] - ee["ls_shaft"]) / 3.6e6 / f))
    p("")
    p(f"per cycle ({len(cyc)} Y-cycles between upward crossings of lift x = 0.30 m; central settings):")
    for key, lab in (("T", "cycle time s"), ("eff", "useful / LS pump"), ("lsm", "LS model / measured"),
                     ("hyd", "OC / LS hydraulic"), ("sh", "OC / LS shaft"), ("fuel", "OC extra fuel share")):
        v = [c[key] for c in cyc]
        lo, hi = bootstrap(v)
        p(f"  {lab:22s} mean {sum(v)/len(v):.3f} (95% bootstrap over cycles {lo:.3f} to {hi:.3f}); "
          f"min {min(v):.3f} max {max(v):.3f}")
    return "\n".join(out)


if __name__ == "__main__":
    text = main(sys.argv[1])
    print(text)
    with open(os.path.join(os.path.dirname(__file__), "measured_loader_results.txt"), "w") as fh:
        fh.write(text + "\n")
