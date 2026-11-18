"""Milestone 11am, post hoc (written after px4_height_stats_results.txt was read, so no prediction): how large is the
altitude estimate's own error next to the 4 cm flight technical error?

FTE (px4_height.py) is the gap between the drone's altitude estimate and its setpoint. On the 18 usable flights it is
a median 4 cm RMS, so the height-keeping noise sigma_n is set by the estimate's error, which FTE cannot see. No truth
reference exists in these logs, so this script bounds it from the two altitude sensors on the same qualifying samples
(Mission, level, en route) of the same flights, re-downloaded:
  * baro - GNSS: vehicle_air_data.baro_alt_meter minus the GNSS altitude (vehicle_gps_position / sensor_gps, MSL),
    with a per-flight linear trend removed (the trend holds the pressure drift that 11al models). Its residual RMS is
    the combined short-term noise of both sensors, an upper bound on either one's;
  * EKF - GNSS: the EKF altitude (ref_alt - z) minus the GNSS altitude, detrended the same way;
  * the EKF's own reported vertical sd (vehicle_local_position.epv) and the receiver's reported vertical accuracy.

    python3 px4_height_posthoc.py [tmpdir] > px4_height_posthoc_results.txt
"""
import json
import os
import statistics as S
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import px4_height as ph  # noqa: E402
import px4_height_stats as phs  # noqa: E402

TOPICS = ph.TOPICS + ["vehicle_air_data", "vehicle_gps_position", "sensor_gps"]


def gnss_alt(D):
    """(t s, MSL altitude m, vertical accuracy m or None) from vehicle_gps_position or sensor_gps."""
    for name in ("vehicle_gps_position", "sensor_gps"):
        g = D.get(name)
        if g is None:
            continue
        t = g["timestamp"] / 1e6
        if "altitude_msl_m" in g:
            a = g["altitude_msl_m"].astype(float)
        elif "alt" in g:
            a = g["alt"].astype(float) / 1000.0
        else:
            continue
        acc = g["epv"].astype(float) if "epv" in g else (g["v_accuracy"].astype(float) if "v_accuracy" in g else None)
        fix = g["fix_type"] >= 3 if "fix_type" in g else np.ones(len(t), dtype=bool)
        return t[fix], a[fix], (acc[fix] if acc is not None else None)
    return None


def detrended_rms(t, x):
    if len(t) < 10:
        return float("nan")
    A = np.vstack([t - t.mean(), np.ones(len(t))]).T
    coef, *_ = np.linalg.lstsq(A, x, rcond=None)
    r = x - A @ coef
    return float(np.sqrt(np.mean(r ** 2)))


def one(lid, tmp):
    path = os.path.join(tmp, lid + ".ulg")
    try:
        ph.fetch(lid, path)
        r = ph.series(path, TOPICS)
    finally:
        if os.path.exists(path):
            os.remove(path)
    if "error" in r:
        return {"id": lid, "error": r["error"]}
    D, t, e, m = r["D"], r["t"], r["e"], r["sets"]["mission_enroute"]
    lp = D["vehicle_local_position"]
    out = {"id": lid, "fte_rms": float(np.sqrt(np.mean(e[m] ** 2))),
           "epv": float(np.median(lp["epv"][m])) if "epv" in lp else float("nan")}
    g = gnss_alt(D)
    tm = t[m]
    if g is not None and len(g[0]) > 10:
        ga = np.interp(tm, g[0], g[1])
        out["gnss_acc"] = float(np.median(np.interp(tm, g[0], g[2]))) if g[2] is not None else float("nan")
        ekf = (lp["ref_alt"][m].astype(float) if "ref_alt" in lp else 0.0) - lp["z"][m].astype(float)
        out["ekf_gnss"] = detrended_rms(tm, ekf - ga)
        if "vehicle_air_data" in D:
            ad = D["vehicle_air_data"]
            ba = np.interp(tm, ad["timestamp"] / 1e6, ad["baro_alt_meter"].astype(float))
            out["baro_gnss"] = detrended_rms(tm, ba - ga)
    return out


def main(tmp):
    os.makedirs(tmp, exist_ok=True)
    F = phs.usable(phs.load(), "mission_enroute")
    rows = [one(f["id"], tmp) for f in F]
    P = print
    P("# Milestone 11am post hoc: altitude-estimate error bounds on the %d usable flights' qualifying samples "
      "(Mission, level, en route); per-flight linear trend removed from each sensor difference" % len(F))
    P("  id                                    FTE_rms  EKF_epv  GNSS_acc  EKF-GNSS  baro-GNSS   (m)")
    for r in rows:
        P("  %-36s  %6.3f   %6.3f   %6.3f    %6.3f    %6.3f" % (
            r["id"], r.get("fte_rms", np.nan), r.get("epv", np.nan), r.get("gnss_acc", np.nan),
            r.get("ekf_gnss", np.nan), r.get("baro_gnss", np.nan)))
    P()
    for k, name in (("fte_rms", "FTE RMS"), ("epv", "EKF-reported vertical sd (epv)"),
                    ("gnss_acc", "receiver-reported vertical accuracy"), ("ekf_gnss", "EKF - GNSS detrended RMS"),
                    ("baro_gnss", "baro - GNSS detrended RMS")):
        v = [r[k] for r in rows if k in r and np.isfinite(r[k])]
        if v:
            P("  %-38s median %.3f  (p25 %.3f, p75 %.3f, max %.3f; %d flights); sqrt(mean sq) %.3f" % (
                name, S.median(v), *np.percentile(v, [25, 75]), max(v), len(v), float(np.sqrt(np.mean(np.square(v))))))
    json.dump({"note": "post hoc altitude-sensor bounds per usable mission_enroute flight (px4_height_posthoc.py)",
               "flights": rows}, open(os.path.join(HERE, "px4_height_posthoc.json"), "w"), indent=0)
    P("  check: FTE RMS recomputed here equals the committed value in %d of %d flights (to 1 mm)" % (
        sum(abs(r.get("fte_rms", -1) - f["rms"]) < 1e-3 for r, f in zip(rows, F)), len(F)))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/px4_ulogs_posthoc")
