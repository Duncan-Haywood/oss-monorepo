"""Milestone 11an: the barometer's short-term error in flight, measured against RTK-fixed GNSS height in public PX4
logs.

Why. 11am measured PX4's height-keeping error against its own altitude estimate (FTE, median 4 cm RMS) and left the
estimate's own error as the open number: on the same flights, barometric minus ordinary GNSS altitude was a median
0.92 m (detrended RMS), but that holds the GNSS receiver's vertical noise (about 1 to 3 m sd for a single-frequency
fix) as well as the barometer's. The spacing decision turned on it: with the FTE alone the planner picks 7 bands at
9.2 m; with the baro-GNSS upper bound, 5 bands at 13.3 m (11al's plan). An RTK-fixed receiver (fix_type 6) reports
its height to a few centimetres, so baro minus RTK height is the barometer's own error to that accuracy.

Data. PX4 Flight Review (https://logs.px4.io; Meier et al. 2015, doi:10.1109/ICRA.2015.7140074 for PX4), read
2026-11-18. Candidates: every index row matching "RTK", then the newest uploads with no search term, kept by
px4_height.keep (multirotor, not SITL, at least 2 min), until MAX_LOGS logs are downloaded. Each log is downloaded,
reduced to the per-flight statistics below and deleted; only those statistics and the log ids are committed
(`rtk_baro_2026.json`). A log counts only if one GNSS instance (vehicle_gps_position or sensor_gps, any multi_id)
has RTK fixed solutions.

Samples. 11am's masks (px4_height.masks: airborne, armed, rotary-wing, level setpoint with 5 s settling, z valid, no
reset in 5 s), in Mission, Position or Loiter (nav_state 3, 2, 4), and in addition RTK fixed at that instant (the
latest GNSS sample at most 0.5 s old has fix_type 6 and a reported vertical accuracy of at most 0.10 m). Two sets:
"enroute" (horizontal speed above 1 m/s) and "hover" (at most 1 m/s). A flight is usable in a set with 30 s of
qualifying samples.

Per flight and set:
  * d = baro_alt_meter (vehicle_air_data) - RTK altitude MSL, both interpolated to local-position times;
  * r_lin: RMS of d after a least-squares line in time (headline; the trend holds the pressure drift 11al models,
    and the constant holds the QNH offset); r_hp60, r_hp300: RMS after removing a centred 60 s / 300 s running mean
    within contiguous runs (sensitivity: how much of r_lin is slow wander a line cannot follow);
  * tau: the 1/e autocorrelation time of the line-detrended d (px4_height.acf_time);
  * c: the coefficient on v_h^2 in d ~ 1 + t + v_h^2 over the flight's enroute and hover samples together (static
    pressure error from dynamic pressure and prop wash), reported as the implied offset at 10 m/s, c * 100 m; only
    for flights whose qualifying speeds span at least 5 m/s;
  * fte: RMS of z - z_sp on the same samples (11am's FTE), and ekf_rtk: line-detrended RMS of the EKF altitude
    (ref_alt - z) minus RTK altitude, with EKF2_HGT_REF (0 baro, 1 GNSS) recorded: an RTK-referenced EKF is not
    independent of the RTK height;
  * the receiver's median reported vertical accuracy.

Planner (px4_height_run.py --rtk): 11al's shared-field model and inputs unchanged, as 11am, with each drone's
height-keeping noise r_i = sqrt(fte^2 + r_lin^2) of a usable enroute flight: a barometric-referenced fleet whose
barometer errs like the measured ones (scale mixture, the truth here), against aware-gauss at the fleet RMS and
11al's plan at sigma_n = 1 m.

Predictions (written and pushed before any RTK log was reduced; one log, 3dd3abbe, was downloaded to read topic
names, field names and its fix types (3 and 4, no RTK), nothing else; 11ai to 11am results were known):
 P1 at least 15 flights are usable in the enroute set.
 P2 the median over usable enroute flights of r_lin is between 0.25 and 0.80 m: below 11am's 0.92 m baro-GNSS
    (which holds GNSS noise) and well above the 4 cm FTE.
 P3 hover is quieter: over flights usable in both sets the median ratio r_lin(enroute) / r_lin(hover) is at least
    1.2.
 P4 a speed term exists: over flights whose speeds span 5 m/s, the median |c * 100| (the offset at 10 m/s) is at
    least 0.20 m; its sign is not predicted.
 P5 the error is slow: the median tau (enroute) is at least 5 s, and the median r_hp60 is at most 0.7 of the median
    r_lin.
 P6 with delivery ages the rtk-mix planner's median h* is 13.33 m (5 bands) at both M: the 1 m-scale bound of 11am,
    not the 4 cm FTE, is the right noise.
 P7 with delivery ages 11al's plan (sigma_n = 1 m) costs a median at most 1.02 over the rtk-mix plan at both M.
Reported without a prediction: counts at each filter, EKF minus RTK by EKF2_HGT_REF, r_hp300, the per-hardware split,
and the T30 / T60 cells. Preliminary.

    python3 rtk_baro.py [tmpdir]           # downloads, writes rtk_baro_2026.json (about 30 min)
    python3 rtk_baro.py --stats > rtk_baro_stats_results.txt
"""
import json
import os
import statistics as S
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import px4_height as ph  # noqa: E402

MAX_LOGS = 400
RTK_FIXED = 6
MAX_VACC = 0.10
MAX_AGE = 0.5
MIN_USABLE_S = 30.0
MIN_SPAN = 5.0
NAVS = (2, 3, 4)
GNSS_TOPICS = ("vehicle_gps_position", "sensor_gps")
TOPICS = ph.TOPICS + ["vehicle_air_data", "vehicle_gps_position", "sensor_gps"]


# ---------------------------------------------------------------- pure helpers (tested)

def pick_rtk(instances):
    """From a list of (name, multi_id, data dict) GNSS instances, the one with the most RTK fixed samples, or None."""
    best, nbest = None, 0
    for name, mid, g in instances:
        if "fix_type" not in g:
            continue
        n = int(np.sum(np.asarray(g["fix_type"]) == RTK_FIXED))
        if n > nbest:
            best, nbest = (name, mid, g), n
    return best


def gnss_fields(g):
    """(t s, MSL altitude m, vertical accuracy m, fix type) of one GNSS instance."""
    t = np.asarray(g["timestamp"], float) / 1e6
    a = np.asarray(g["altitude_msl_m"], float) if "altitude_msl_m" in g else np.asarray(g["alt"], float) / 1e3
    acc = np.asarray(g["epv"], float) if "epv" in g else (
        np.asarray(g["v_accuracy"], float) if "v_accuracy" in g else np.full(len(t), np.nan))
    return t, a, acc, np.asarray(g["fix_type"])


def rtk_ok(t, gt, gfix, gacc):
    """True at times t where the latest GNSS sample is at most MAX_AGE s old, RTK fixed, vertical accuracy <= MAX_VACC."""
    j = np.searchsorted(gt, t, side="right") - 1
    jj = np.clip(j, 0, len(gt) - 1)
    fresh = (j >= 0) & (t - gt[jj] <= MAX_AGE)
    return fresh & (gfix[jj] == RTK_FIXED) & (np.nan_to_num(gacc[jj], nan=99.0) <= MAX_VACC)


def line_resid(t, x):
    A = np.vstack([t - t.mean(), np.ones(len(t))]).T
    coef, *_ = np.linalg.lstsq(A, x, rcond=None)
    return x - A @ coef


def runs(t, gap=1.0):
    cuts = np.where(np.diff(t) >= gap)[0] + 1
    return list(zip(np.r_[0, cuts], np.r_[cuts, len(t)]))


def highpass_rms(t, x, window):
    """RMS of x minus its centred running mean of `window` s, computed within contiguous runs (gaps >= 1 s)."""
    out = []
    for a, b in runs(t):
        tt, xx = t[a:b], x[a:b]
        cs = np.r_[0.0, np.cumsum(xx)]
        lo = np.searchsorted(tt, tt - window / 2.0, side="left")
        hi = np.searchsorted(tt, tt + window / 2.0, side="right")
        out.append(xx - (cs[hi] - cs[lo]) / (hi - lo))
    r = np.concatenate(out) if out else np.array([])
    return float(np.sqrt(np.mean(r ** 2))) if len(r) else float("nan")


def speed_term(t, d, v):
    """Coefficient c (m per (m/s)^2) on v^2 in d ~ 1 + t + v^2, or NaN if the speeds span less than MIN_SPAN."""
    if len(t) < 20 or np.ptp(v) < MIN_SPAN:
        return float("nan")
    A = np.vstack([np.ones(len(t)), t - t.mean(), v ** 2]).T
    coef, *_ = np.linalg.lstsq(A, d, rcond=None)
    return float(coef[2])


def seconds(t):
    dt = np.diff(t)
    return float(np.sum(dt[dt < 1.0])) if len(dt) else 0.0


def summarise(t, d, fte, ekf_d):
    r = line_resid(t, d)
    return {"n": int(len(t)), "seconds": round(seconds(t), 1), "r_lin": float(np.sqrt(np.mean(r ** 2))),
            "r_hp60": highpass_rms(t, d, 60.0), "r_hp300": highpass_rms(t, d, 300.0),
            "tau": ph.acf_time(t, r), "fte": float(np.sqrt(np.mean(fte ** 2))),
            "ekf_rtk": float(np.sqrt(np.mean(line_resid(t, ekf_d) ** 2))) if ekf_d is not None else float("nan"),
            "d_1hz_cm": [int(v) for v in np.round(np.interp(np.arange(t[0], t[-1], 1.0), t, r) * 100)]}


# ---------------------------------------------------------------- per-log reduction

def reduce_log(path):
    from pyulog import ULog
    u = ULog(path, TOPICS)
    D, G = {}, []
    for x in u.data_list:
        if x.name in GNSS_TOPICS:
            G.append((x.name, x.multi_id, x.data))
        if x.multi_id == 0 and x.name not in D:
            D[x.name] = x.data
    g = pick_rtk(G)
    if g is None:
        return {"rtk": False}
    params = {k: u.initial_parameters.get(k) for k in ("EKF2_HGT_REF", "EKF2_GPS_CTRL", "EKF2_BARO_CTRL")}
    out = {"rtk": True, "gnss": "%s/%d" % (g[0], g[1]), "params": params}
    if "vehicle_air_data" not in D or any(k not in D for k in ph.TOPICS[:3]):
        return dict(out, error="missing topic")
    lp, sp, st = D["vehicle_local_position"], D["vehicle_local_position_setpoint"], D["vehicle_status"]
    t = lp["timestamp"] / 1e6
    zsp = ph.ffill(sp["timestamp"] / 1e6, sp["z"], t).astype(float)
    vzsp = ph.ffill(sp["timestamp"] / 1e6, sp["vz"], t).astype(float)
    stt = st["timestamp"] / 1e6
    nav = ph.ffill(stt, st["nav_state"], t)
    armed = ph.ffill(stt, st["arming_state"], t) == 2
    key = "vehicle_type" if "vehicle_type" in st else ("is_rotary_wing" if "is_rotary_wing" in st else None)
    rotary = ph.ffill(stt, st[key], t) == 1 if key else np.ones(len(t), dtype=bool)
    if "vehicle_land_detected" in D:
        ld = D["vehicle_land_detected"]
        landed = ph.ffill(ld["timestamp"] / 1e6, ld["landed"], t) == 1
    else:
        landed = np.zeros(len(t), dtype=bool)
    airborne = armed & rotary & ~landed
    z_ok = lp["z_valid"] == 1 if "z_valid" in lp else np.ones(len(t), dtype=bool)
    if "z_reset_counter" in lp:
        z_ok = z_ok & ~ph.settled_reset(t, lp["z_reset_counter"].astype(float))
    z = lp["z"].astype(float)
    level, enroute = ph.masks(t, z, zsp, vzsp, lp["vx"], lp["vy"], airborne, nav, z_ok)
    gt, ga, gacc, gfix = gnss_fields(g[2])
    ok = level & np.isin(nav, NAVS) & rtk_ok(t, gt, gfix, gacc)
    out["rtk_level_s"] = round(seconds(t[ok]), 1)
    out["vacc_med"] = float(np.median(gacc[gfix == RTK_FIXED]))
    ad = D["vehicle_air_data"]
    baro = np.interp(t, ad["timestamp"] / 1e6, ad["baro_alt_meter"].astype(float))
    rtk = np.interp(t, gt, ga)
    d = baro - rtk
    ekf = (lp["ref_alt"].astype(float) - z) - rtk if "ref_alt" in lp else None
    v = np.hypot(lp["vx"].astype(float), lp["vy"].astype(float))
    fte = z - zsp
    for name, m in (("enroute", ok & enroute), ("hover", ok & ~enroute)):
        out[name] = summarise(t[m], d[m], fte[m], ekf[m] if ekf is not None else None) \
            if seconds(t[m]) >= MIN_USABLE_S else None
    out["c"] = speed_term(t[ok], d[ok], v[ok]) if ok.sum() else float("nan")
    out["v_span"] = float(np.ptp(v[ok])) if ok.sum() else 0.0
    return out


def _work(row, tmp):
    path = os.path.join(tmp, row["id"] + ".ulg")
    try:
        ph.fetch(row["id"], path)
        res = reduce_log(path)
    except Exception as ex:  # noqa: BLE001 - a bad log is counted, not fatal
        res = {"error": "%s: %s" % (type(ex).__name__, str(ex)[:120])}
    finally:
        if os.path.exists(path):
            os.remove(path)
    return dict(row, **res)


def candidates():
    rows, seen, ids, counts = [], 0, set(), {}
    for search in ("RTK", ""):
        start, total, n0 = 0, None, len(rows)
        while (total is None or start < total) and len(rows) < MAX_LOGS:
            d = ph.index_page(start, 100, search)
            total = d["recordsFiltered"]
            for r in d["data"]:
                seen += 1
                p = ph.parse_row(r)
                if ph.keep(p) and p["id"] not in ids:
                    ids.add(p["id"])
                    rows.append(dict(p, search=search))
            start += len(d["data"]) or 100
            if not d["data"]:
                break
        counts[search or "(none)"] = {"index_total": total, "kept": len(rows) - n0}
    return rows[:MAX_LOGS], seen, counts


def main(tmp):
    rows, seen, counts = candidates()
    print("index rows read %d, candidates %d %s" % (seen, len(rows), counts), file=sys.stderr, flush=True)
    os.makedirs(tmp, exist_ok=True)
    done = []
    with ThreadPoolExecutor(4) as ex:
        for i, r in enumerate(ex.map(lambda r: _work(r, tmp), rows)):
            done.append(r)
            print("%d/%d %s rtk=%s %s" % (i + 1, len(rows), r["id"], r.get("rtk"), r.get("error", "")),
                  file=sys.stderr, flush=True)
    json.dump({"source": "PX4 Flight Review public logs, https://logs.px4.io; index searched 'RTK', then newest "
                         "uploads with no search term", "retrieved": time.strftime("%Y-%m-%d", time.gmtime()),
               "index_rows_read": seen, "searches": counts,
               "filters": {"max_logs": MAX_LOGS, "rtk_fixed": RTK_FIXED, "max_vacc": MAX_VACC, "max_age": MAX_AGE,
                           "min_usable_s": MIN_USABLE_S, "navs": NAVS, "min_span": MIN_SPAN},
               "logs": done}, open(os.path.join(HERE, "rtk_baro_2026.json"), "w"), separators=(",", ":"))


# ---------------------------------------------------------------- statistics

def load():
    return json.load(open(os.path.join(HERE, "rtk_baro_2026.json")))


def usable(d, name):
    """Flights with a summary for set `name`, each flight once (same n and r_lin under two ids = one upload twice)."""
    out, seen = [], set()
    for L in d["logs"]:
        x = L.get(name)
        if not x:
            continue
        key = (x["n"], round(x["r_lin"], 9))
        if key not in seen:
            seen.add(key)
            out.append(dict({k: v for k, v in L.items() if not isinstance(v, dict)}, params=L.get("params"), **x))
    return out


def q(v):
    v = [x for x in v if np.isfinite(x)]
    if not v:
        return "n/a"
    return "median %.3f (p25 %.3f, p75 %.3f, min %.3f, max %.3f; %d)" % (
        S.median(v), *np.percentile(v, [25, 75]), min(v), max(v), len(v))


def stats():
    d = load()
    L = d["logs"]
    P = print
    P("# Milestone 11an: barometer minus RTK-fixed GNSS height in public PX4 logs (rtk_baro.py's docstring)")
    P("# retrieved %s; index rows read %d; searches %s" % (d["retrieved"], d["index_rows_read"], d["searches"]))
    P("  downloaded %d, errors %d, with RTK fixed solutions %d, RTK-fixed level time >= 30 s %d" % (
        len(L), sum("error" in x and not x.get("rtk") for x in L), sum(bool(x.get("rtk")) for x in L),
        sum(x.get("rtk_level_s", 0) >= MIN_USABLE_S for x in L)))
    E, H = usable(d, "enroute"), usable(d, "hover")
    P("  usable flights: enroute %d, hover %d (duplicates dropped)" % (len(E), len(H)))
    P()
    P("  id                                    hw                       ref  vacc   sec   r_lin  r_hp60 r_hp300 tau_s"
      "   fte   ekf-rtk")
    for f in E:
        P("  %-36s  %-24s %3s  %.3f %5.0f  %.3f  %.3f  %.3f  %5.1f  %.3f  %.3f" % (
            f["id"], f["hardware"][:24], (f["params"] or {}).get("EKF2_HGT_REF"), f["vacc_med"], f["seconds"],
            f["r_lin"], f["r_hp60"], f["r_hp300"], f["tau"], f["fte"], f["ekf_rtk"]))
    P()
    for name, F in (("enroute", E), ("hover", H)):
        P("  %s (%d flights)" % (name, len(F)))
        for k in ("r_lin", "r_hp60", "r_hp300", "tau", "fte", "ekf_rtk"):
            P("    %-8s %s" % (k, q([f[k] for f in F])))
    for ref in (0, 1):
        P("  enroute ekf_rtk with EKF2_HGT_REF = %d: %s" % (
            ref, q([f["ekf_rtk"] for f in E if (f["params"] or {}).get("EKF2_HGT_REF") == ref])))
    hw = {}
    for f in E:
        hw.setdefault(f["hardware"], []).append(f["r_lin"])
    P("  enroute r_lin by hardware: " + "; ".join("%s %s" % (k, ", ".join("%.2f" % x for x in sorted(v)))
                                                 for k, v in sorted(hw.items())))
    rl = [f["r_lin"] for f in E]
    sig = float(np.sqrt(np.mean(np.square([np.hypot(f["fte"], f["r_lin"]) for f in E])))) if E else float("nan")
    P("  planner noise r = sqrt(fte^2 + r_lin^2): %s; fleet sqrt(mean r^2) %.3f m" % (
        q([np.hypot(f["fte"], f["r_lin"]) for f in E]), sig))
    byid = {f["id"]: f for f in H}
    ratio = [f["r_lin"] / byid[f["id"]]["r_lin"] for f in E if f["id"] in byid and byid[f["id"]]["r_lin"] > 0]
    cs = []
    seen = set()
    for x in L:
        if x.get("rtk") and x.get("v_span", 0) >= MIN_SPAN and np.isfinite(x.get("c", np.nan)) \
                and x.get("rtk_level_s", 0) >= MIN_USABLE_S and x.get("enroute"):
            key = (x["enroute"]["n"], round(x["enroute"]["r_lin"], 9))
            if key not in seen:
                seen.add(key)
                cs.append(100.0 * x["c"])
    P("  speed term: offset at 10 m/s, c*100 (m): %s; positive in %d of %d" % (
        q(cs), sum(c > 0 for c in cs), len(cs)))
    P("  ratio r_lin(enroute)/r_lin(hover): %s" % q(ratio))
    P()
    P("# predictions")
    P("  P1 usable enroute flights >= 15: %d -> %s" % (len(E), "held" if len(E) >= 15 else "refuted"))
    m = S.median(rl) if rl else float("nan")
    rng = np.random.default_rng(0)
    if len(rl) > 1:
        bs = [np.median(rng.choice(rl, len(rl))) for _ in range(2000)]
        P("  P2 median r_lin in [0.25, 0.80]: %.3f (95%% CI %.3f to %.3f) -> %s" % (
            m, *np.percentile(bs, [2.5, 97.5]), "held" if 0.25 <= m <= 0.80 else "refuted"))
    if ratio:
        P("  P3 median enroute/hover >= 1.2: %.3f (%d flights) -> %s" % (
            S.median(ratio), len(ratio), "held" if S.median(ratio) >= 1.2 else "refuted"))
    else:
        P("  P3 no flight usable in both sets -> untested")
    if cs:
        mc = S.median(np.abs(cs))
        P("  P4 median |c*100| >= 0.20 m: %.3f (%d flights) -> %s" % (mc, len(cs), "held" if mc >= 0.2 else "refuted"))
    else:
        P("  P4 no flight spans 5 m/s -> untested")
    if E:
        mt = S.median([f["tau"] for f in E if np.isfinite(f["tau"])] or [float("nan")])
        hp = S.median([f["r_hp60"] for f in E]) / m
        P("  P5 median tau >= 5 s and median r_hp60 <= 0.7 median r_lin: tau %.2f s, ratio %.3f -> %s" % (
            mt, hp, "held" if mt >= 5 and hp <= 0.7 else "refuted"))


if __name__ == "__main__":
    if "--stats" in sys.argv:
        stats()
    else:
        main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/rtk_ulogs")
