"""Milestone 5o: what counts as motion on the measured wheel loader?

5n's open-centre counterfactual hinged on `q_min`, the P-port flow below which
a section counts as still, chosen after its first run. Here it is measured: the
authors' flows are derived from 5 Hz low-pass piston velocity, so in windows
where the piston does not move, the flow channel shows the noise floor. A
second motion test uses piston position alone. A third row is the open-centre
floor: dp_spool = 0, because any open-centre spool needs pump pressure above
the load to feed it, and the fixed pump then delivers all its flow at that
pressure (LOG.md, 5o).

Data: Linjama et al., Zenodo doi:10.5281/zenodo.10639199, CC BY 4.0 (see
measured_loader.py). Predictions Q1 to Q4 were written in LOG.md (5o) before
this ran. Needs numpy and scipy.
Usage: python measured_motion.py <path to Short_Y_cycle_data.mat>  (about 60 s)
"""
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import (energies, pump_torque, stationary_samples,  # noqa: E402
                                       percentile, moving_by_position, cycle_starts)
from measured_loader import load, vec, bootstrap, VG, LPM  # noqa: E402
import scipy.io  # noqa: E402

NAMES = ("lift", "tilt")
WIN_S, RANGE_M = 1.0, 0.5e-3          # central stationary-window definition
HALF_S, D_MIN = 0.25, (0.5e-3, 1e-3, 2e-3)  # position motion test


def positions(path):
    D = scipy.io.loadmat(path, squeeze_me=True, struct_as_record=False)["Data"]
    out = []
    for c in (D.LiftCylinder, D.TiltCylinder):
        A = math.pi * float(c.Params.d_piston) ** 2 / 4 * 2  # two cylinders per function
        out.append((np.asarray(c.x.Data, float), A))
    return out


def stationary_np(x, win, rng):
    n = len(x) // win * win
    seg = x[:n].reshape(-1, win)
    ok = (seg.max(1) - seg.min(1)) < rng
    m = np.zeros(len(x), bool)
    m[:n] = np.repeat(ok, win)
    return m


def oc(r, masks, dp_spool=10.0, p_neutral=10.0, leak=2.5, sl=slice(None)):
    """Open-centre hydraulic and shaft energy, J, where section i counts as
    moving where masks[i] is True and its P-port flow is positive."""
    qs = [s[0][sl] for s in r["secs"]]
    ps = [s[1][sl] for s in r["secs"]]
    ms = [m[sl] for m in masks]
    w = r["w"][sl]
    q_fix = np.maximum(0.0, VG * 1e3 * w / (2 * math.pi) * 60 - leak)
    pl = np.full_like(q_fix, -np.inf)
    q_big = np.zeros_like(q_fix)
    for q, p, m in zip(qs, ps, ms):
        on = m & (q > 0) & ~np.isnan(p)
        pl = np.where(on, np.maximum(pl, np.nan_to_num(p, nan=-np.inf)), pl)
        q_big += np.where(on, q, 0.0)
    mv = np.isfinite(pl)
    q_oc = np.where(mv, np.maximum(q_fix, q_big), q_fix)
    p_oc = np.where(mv, pl + dp_spool, p_neutral)
    dt = r["dt"]
    hyd = float((q_oc * p_oc).sum() * dt / 0.6)
    alpha = np.maximum(1.0, q_oc / np.maximum(q_fix + leak, 1e-9))
    shaft = float((pump_torque(alpha, p_oc, w) * w).sum() * dt)
    return hyd, shaft, float(mv.sum() * dt)


def main(path):
    r = load(path)
    pos = positions(path)
    dt = r["dt"]
    out = []
    p = out.append
    win = int(round(WIN_S / dt))
    base = vec(r, 24.9)  # measured LS energies (independent of dp_ls); Willans slope from 5n
    meas, ls_shaft = base["measured"], base["ls_shaft"]
    b_willans = 0.2332            # L/kWh, measured_loader_results.txt
    fuel_L = r["fuel"].sum() * dt / 3600

    # --- Q1: noise floor from stationary windows ---
    p(f"stationary windows: {WIN_S:.1f} s, position range < {RANGE_M*1e3:.1f} mm")
    floors = []
    for (q, _), (x, A), nm in zip(r["secs"], pos, NAMES):
        m = stationary_np(x, win, RANGE_M)
        aq = np.abs(q[m])
        f99 = float(np.percentile(aq, 99))
        floors.append(f99)
        v_lim = RANGE_M / WIN_S * A * LPM
        p(f"  {nm}: piston area {A*1e4:.1f} cm2 (both cylinders); stationary {m.mean()*100:.1f}% of record; "
          f"|Q_P| p50 {np.median(aq):.3f}, p95 {np.percentile(aq,95):.3f}, p99 {f99:.3f}, p99.9 "
          f"{np.percentile(aq,99.9):.3f} L/min (window speed limit = {v_lim:.2f} L/min)")
        # check the numpy window rule against the tested stdlib one on the first 200k samples
        k = 100000
        idx = stationary_samples(list(x[:k]), win, RANGE_M)
        assert np.array_equal(np.flatnonzero(m[:k // win * win]), np.array(idx)), nm
        assert abs(percentile(list(aq[:5000]), 99) - np.percentile(aq[:5000], 99)) < 1e-9
    p("  check: numpy window rule and percentile equal the tested stdlib functions")
    p("  sensitivity of p99 floor (lift, tilt) to the window definition:")
    for ws in (0.5, 1.0, 2.0):
        for rg in (0.25e-3, 0.5e-3, 1e-3):
            fl = []
            for (q, _), (x, _) in zip(r["secs"], pos):
                m = stationary_np(x, int(round(ws / dt)), rg)
                fl.append(np.percentile(np.abs(q[m]), 99) if m.any() else float("nan"))
            p(f"    window {ws:.1f} s, range < {rg*1e3:.2f} mm -> {fl[0]:.3f}, {fl[1]:.3f} L/min")
    ok1 = all(0.5 <= f <= 5.0 for f in floors)
    p(f"Q1 {'HOLDS' if ok1 else 'REFUTED'} (both floors in 0.5 to 5 L/min: {floors[0]:.3f}, {floors[1]:.3f})")

    # --- Q2: open-centre with q_min at the measured floor ---
    flow_masks = [s[0] > f for s, f in zip(r["secs"], floors)]
    h, s, mv_s = oc(r, flow_masks)
    p("")
    p(f"open-centre, q_min at noise floor, dp_spool 10, p_neutral 10: OC/LS hydraulic {h/meas:.3f}, "
      f"shaft {s/ls_shaft:.3f}, extra fuel {b_willans*(s-ls_shaft)/3.6e6/fuel_L*100:.1f}%; moving {mv_s:.1f} s")
    # cross-check against the tested stdlib energies (per-section q_min)
    samples = []
    for i in range(len(r["t"])):
        secs = tuple((float(q[i]), None if math.isnan(pp[i]) else float(pp[i])) for q, pp in r["secs"])
        samples.append((float(r["pP"][i]), float(r["w"][i]), secs))
    e0 = energies(samples, dt, dp_ls=24.9, q_min=tuple(floors))
    assert abs(e0["open_centre"] - h) <= 1e-6 * h, (e0["open_centre"], h)
    p("  check: equals measured.energies with per-section q_min")
    q2 = h / meas
    p(f"Q2 {'HOLDS' if 1.3 <= q2 <= 1.6 else 'REFUTED'} (1.3 to 1.6: {q2:.3f})")

    # --- Q3: the open-centre floor ---
    p("")
    p("open-centre floor (dp_spool 0), noise-floor q_min:")
    rows = {}
    for pn in (0.0, 5.0, 10.0):
        hh, ss, _ = oc(r, flow_masks, dp_spool=0.0, p_neutral=pn)
        rows[pn] = (hh, ss)
        p(f"  p_neutral {pn:4.1f} bar: OC/LS hydraulic {hh/meas:.3f}, shaft {ss/ls_shaft:.3f}, "
          f"extra fuel {b_willans*(ss-ls_shaft)/3.6e6/fuel_L*100:.1f}%")
    q3 = rows[5.0][0] / meas
    p(f"Q3 {'HOLDS' if q3 >= 1.2 else 'REFUTED'} (floor at p_neutral 5 bar >= 1.2: {q3:.3f})")

    # --- Q4: position-based motion ---
    p("")
    half = int(round(HALF_S / dt))
    p(f"position-based motion: piston travel over a centred {2*HALF_S:.1f} s window > d_min")
    q4 = None
    for d in D_MIN:
        masks = []
        for x, _ in pos:
            n = len(x)
            i = np.arange(n)
            mm = np.abs(x[np.minimum(n - 1, i + half)] - x[np.maximum(0, i - half)]) > d
            masks.append(mm)
        if d == 1e-3:
            ref = moving_by_position(list(pos[0][0][:20000]), half, d)
            assert list(masks[0][:20000]) == ref
        hh, ss, mvs = oc(r, masks)
        hf, sf, _ = oc(r, masks, dp_spool=0.0, p_neutral=5.0)
        p(f"  d_min {d*1e3:.1f} mm: moving {mvs:.1f} s; OC/LS hydraulic {hh/meas:.3f} (floor {hf/meas:.3f}), "
          f"shaft {ss/ls_shaft:.3f}, extra fuel {b_willans*(ss-ls_shaft)/3.6e6/fuel_L*100:.1f}%")
        if d == 1e-3:
            q4 = hh / meas
    p("  check: numpy position rule equals the tested stdlib one (lift, first 20,000 samples)")
    p(f"Q4 {'HOLDS' if abs(q4 - q2) <= 0.10 else 'REFUTED'} (|{q4:.3f} - {q2:.3f}| = {abs(q4-q2):.3f} <= 0.10)")

    # --- per-cycle intervals for the noise-floor case and its floor ---
    starts = cycle_starts(list(r["x"]), 0.30)
    hyd_c, flo_c, fuel_c = [], [], []
    for i0, i1 in zip(starts, starts[1:]):
        sl = slice(i0, i1)
        e = vec(r, 24.9, sl=sl)
        hh, ss, _ = oc(r, flow_masks, sl=sl)
        hf, _, _ = oc(r, flow_masks, dp_spool=0.0, p_neutral=5.0, sl=sl)
        f = r["fuel"][sl].sum() * dt / 3600
        hyd_c.append(hh / e["measured"])
        flo_c.append(hf / e["measured"])
        fuel_c.append(b_willans * (ss - e["ls_shaft"]) / 3.6e6 / f)
    p("")
    p(f"per cycle ({len(hyd_c)} Y-cycles, noise-floor q_min):")
    for lab, v in (("OC / LS hydraulic", hyd_c), ("OC floor / LS hydraulic", flo_c), ("OC extra fuel share", fuel_c)):
        lo, hi = bootstrap(v)
        p(f"  {lab:24s} mean {sum(v)/len(v):.3f} (95% bootstrap over cycles {lo:.3f} to {hi:.3f}); "
          f"min {min(v):.3f} max {max(v):.3f}")
    return "\n".join(out)


if __name__ == "__main__":
    text = main(sys.argv[1])
    print(text)
    with open(os.path.join(HERE, "measured_motion_results.txt"), "w") as fh:
        fh.write(text + "\n")
