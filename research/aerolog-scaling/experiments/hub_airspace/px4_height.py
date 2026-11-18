"""Milestone 11am: a sourced height-keeping noise sigma_n from public PX4 flight logs.

Why. 11ai to 11al swept the per-drone height-keeping noise sigma_n over 0.5 and 1 m (11ai: 0.5 to 3 m) because no
sourced figure was reachable, and the spacing they choose turns on it: 11ai picked 6 bands (10.9 m) at 0.5 m, 5 bands
(13.3 m) at 1 m and 4 bands (17.1 m) at 2 to 3 m, and 11al's M = 16 delivery case split between 9.2 m and 13.3 m at
0.5 m. PX4 Flight Review (https://logs.px4.io, Meier et al. 2015, doi:10.1109/ICRA.2015.7140074 for PX4) publishes
the logs that pilots chose to share; each ULog holds the vehicle's altitude estimate (vehicle_local_position.z) and
the setpoint its position controller tracks (vehicle_local_position_setpoint.z), so the flight technical error (FTE)
in height can be read off real flights.

Data. The Flight Review public index (browse_data_retrieval) searched for "Mission", newest upload first, read on
2026-11-18. Kept: multirotors (airframe type names a rotor count or "Coaxial", not VTOL, fixed wing, rover or boat),
hardware not SITL / simulation, logged duration at least 2 min, until MAX_LOGS downloaded or the index runs out. Each
log is downloaded, reduced to the statistics below and deleted; only those statistics and the log ids are committed
(`px4_height_2026.json`), so the sample can be re-fetched.

Error. e = z - z_sp (m; NED, so the sign is "below the setpoint" positive; only |e| and e's spread matter here), on
local-position samples that are
  * airborne and armed (vehicle_land_detected.landed false, vehicle_status arming_state 2), rotary-wing phase;
  * in AUTO_MISSION (nav_state 3) for the main set; POSCTL (2) and AUTO_LOITER (4) as a reported second set;
  * level: |vz_sp| < 0.1 m/s and the setpoint z moved less than 0.05 m over the previous 5 s (5 s settling after
    every climb, descent or step), z_valid, no z reset counter change in the previous 5 s;
  * en route: horizontal speed above 1 m/s (main); hovering level samples as a reported second set.
A flight is usable with at least 30 s of qualifying samples. Per flight: n, mean, RMS about zero (a constant offset
the drone holds is part of the gap error to another drone), sd, p95 and p99 of |e|, excess kurtosis, and the 1/e
autocorrelation time of e (segments resampled at 0.2 s, at least 20 s long, per-segment mean removed). The pooled
set weights every flight equally (each contributes its own mean square): sigma_fleet = sqrt(mean over flights of
RMS^2). A 1 Hz subsample of each flight's e (cm) is kept for the scale-mixture analysis.

What this measures and what it does not: FTE is the gap between the drone's own altitude estimate and its setpoint.
It leaves out the estimate's own error (barometer noise, prop-wash and ground-effect pressure errors, GNSS fusion);
the pressure part of that error is 11al's model, the rest is not measured here, so sigma_n from FTE is a lower bound
on the height-keeping noise. Uploaded logs are the flights people chose to share (tuning problems, tests and
demonstrations), not a random sample of delivery operations.

Planner analysis (px4_height_run.py): 11al's model and inputs unchanged (drift_share.PairProblem, 48 layouts, 11aj's
h grid, 200 descents, deliv / T30 / T60 ages), with the noise n_i - n_j taken two ways:
  * gauss: N(0, 2 sigma_fleet^2);
  * mix (the truth here): each drone flies like one of the usable flights, so n_i - n_j ~ N(0, r_i^2 + r_j^2) with
    r_i, r_j drawn independently from the per-flight RMS values (a scale mixture: heterogeneity between flights is
    the heavy tail), averaged over N_MIX quantile pairs.
Planners, all scored under mix: aware-mix (truth), aware-gauss, and old (11al's aware plan at sigma_n = 1 m).

Predictions (written and pushed before any log's error was computed; one log, 419d495a, was downloaded to read its
topic names and message counts, nothing else; 11ai to 11al results were known):
 P1 the median over usable flights of the per-flight RMS (main set: Mission, level, en route) is between 0.10 and
    0.50 m.
 P2 sigma_fleet (main set) is at most 1.0 m, i.e. 11al's sigma_n = 1 m is not optimistic for this sample.
 P3 heavy tails: the excess kurtosis of the pooled 1 Hz e (main set, flights equally weighted by subsampling to the
    same count) is above 3; within a flight the median excess kurtosis is below 3.
 P4 time correlation: the median per-flight 1/e autocorrelation time is at least 2 s.
 P5 with delivery ages, the aware-mix plan's median h* is at most 13.3 m (5 bands or more) at both M.
 P6 aware-gauss scored under mix costs a median at most 1.01 over aware-mix (all missions, both M).
 P7 with delivery ages, the old plan (sigma_n = 1 m) scored under mix costs a median at most 1.02 over aware-mix.
Reported without a prediction: the counts at each filter, the hover and POSCTL/LOITER sets, the per-airframe-type
split, and the T30 / T60 cells of P5 and P7. Preliminary.
"""
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = "https://logs.px4.io/browse_data_retrieval"
DOWNLOAD = "https://logs.px4.io/download?log=%s"
MAX_LOGS = 200
MIN_DURATION_S = 120.0
MIN_USABLE_S = 30.0
SETTLE_S = 5.0
VZ_LEVEL = 0.1
DZ_LEVEL = 0.05
V_ENROUTE = 1.0
DT_ACF = 0.2
MIN_SEG_S = 20.0
NAV_MISSION = 3
NAV_POS = (2, 4)
TOPICS = ["vehicle_local_position", "vehicle_local_position_setpoint", "vehicle_status", "vehicle_land_detected"]


# ---------------------------------------------------------------- index

def index_page(start, length=100, search="Mission"):
    q = {"draw": 1, "start": start, "length": length, "search[value]": search,
         "order[0][column]": 0, "order[0][dir]": "desc"}
    with urllib.request.urlopen(INDEX + "?" + urllib.parse.urlencode(q), timeout=60) as r:
        return json.load(r)


def parse_row(row):
    """One index row -> dict (id, type, airframe, hardware, version, duration_s, modes)."""
    link = str(row[1])
    lid = link.split("log=")[1].split('"')[0] if "log=" in link else None
    return {"id": lid, "date": link.split(">")[1].split("<")[0] if ">" in link else None, "type": str(row[3]),
            "airframe": str(row[4]), "hardware": str(row[5]), "version": str(row[6]),
            "duration_s": duration_s(str(row[7])), "modes": str(row[9])}


def duration_s(s):
    """'1h2m3s' / '3m44s' / '12s' -> seconds (NaN if unparsable)."""
    tot, num = 0.0, ""
    unit = {"h": 3600.0, "m": 60.0, "s": 1.0}
    for ch in s.strip():
        if ch.isdigit() or ch == ".":
            num += ch
        elif ch in unit and num:
            tot += float(num) * unit[ch]
            num = ""
        else:
            return float("nan")
    return tot if not num else float("nan")


def is_multirotor(row):
    t = row["type"].lower()
    if any(w in t for w in ("vtol", "fixed", "plane", "rover", "boat", "glider", "airship", "tailsitter", "tiltrotor")):
        return False
    return any(w in t for w in ("quad", "hexa", "octo", "tri", "rotor", "coaxial", "helicopter", "multicopter"))


def keep(row):
    hw = row["hardware"].upper()
    return (row["id"] is not None and is_multirotor(row) and "SITL" not in hw and "SIM" not in hw
            and row["duration_s"] >= MIN_DURATION_S)


# ---------------------------------------------------------------- per-log reduction

def ffill(ts_src, vs_src, ts):
    """Value of the last src sample at or before each t (the first value before the first sample)."""
    j = np.searchsorted(ts_src, ts, side="right") - 1
    return np.asarray(vs_src)[np.clip(j, 0, len(ts_src) - 1)]


def settled(t, bad, settle=SETTLE_S):
    """True where at least `settle` seconds have passed since the last `bad` sample (and since the first sample)."""
    last = np.full(len(t), t[0] if len(t) else 0.0)
    cur = t[0] if len(t) else 0.0
    for i in range(len(t)):
        if bad[i]:
            cur = t[i]
        last[i] = cur
    return (t - last) >= settle


def masks(t, z, zsp, vzsp, vx, vy, airborne, nav, z_ok):
    """(level, enroute) boolean masks over local-position samples (t in s)."""
    finite = np.isfinite(z) & np.isfinite(zsp)
    vz_bad = ~np.isfinite(vzsp) | (np.abs(np.nan_to_num(vzsp, nan=99.0)) >= VZ_LEVEL)
    zsp_prev = np.interp(t - SETTLE_S, t, np.nan_to_num(zsp, nan=0.0))
    step = np.abs(np.nan_to_num(zsp, nan=0.0) - zsp_prev) >= DZ_LEVEL
    bad = vz_bad | ~finite | ~z_ok | ~airborne
    level = finite & airborne & z_ok & ~vz_bad & ~step & settled(t, bad)
    speed = np.hypot(np.nan_to_num(vx), np.nan_to_num(vy))
    return level, level & (speed > V_ENROUTE)


def acf_time(t, e, dt=DT_ACF, min_seg=MIN_SEG_S, gap=1.0):
    """1/e autocorrelation time (s) of e over contiguous runs (sample gaps < `gap` s) at least `min_seg` long,
    resampled at dt, per-run mean removed, autocovariance pooled over runs. NaN if no run qualifies."""
    if len(t) < 2:
        return float("nan")
    cuts = np.where(np.diff(t) >= gap)[0] + 1
    runs = [(a, b) for a, b in zip(np.r_[0, cuts], np.r_[cuts, len(t)]) if t[b - 1] - t[a] >= min_seg]
    if not runs:
        return float("nan")
    maxlag = int(min_seg / dt)
    num = np.zeros(maxlag + 1)
    cnt = np.zeros(maxlag + 1)
    for a, b in runs:
        g = np.arange(t[a], t[b - 1], dt)
        x = np.interp(g, t[a:b], e[a:b])
        x = x - x.mean()
        for L in range(min(maxlag, len(x) - 1) + 1):
            num[L] += float(np.dot(x[:len(x) - L], x[L:]))
            cnt[L] += len(x) - L
    c = num / np.maximum(cnt, 1)
    if c[0] <= 0:
        return 0.0
    r = c / c[0]
    below = np.where(r < math.exp(-1))[0]
    if not len(below):
        return float("inf")
    L = below[0]
    # linear interpolation between lag L-1 and L
    r0, r1 = r[L - 1], r[L]
    return float(dt * ((L - 1) + (r0 - math.exp(-1)) / (r0 - r1)))


def summarise(t, e):
    """Per-flight statistics of e on the qualifying samples (t in s, e in m)."""
    if len(e) == 0:
        return None
    dt = np.diff(t)
    dur = float(np.sum(dt[dt < 1.0])) if len(dt) else 0.0
    a = np.abs(e)
    sd = float(np.std(e))
    kurt = float(np.mean((e - e.mean()) ** 4) / sd ** 4 - 3.0) if sd > 0 else float("nan")
    sub = np.round(np.interp(np.arange(t[0], t[-1], 1.0), t, e) * 100).astype(int)
    keep_ = np.isin(np.floor(np.arange(t[0], t[-1], 1.0)), np.floor(t))   # drop 1 Hz points inside gaps
    return {"n": int(len(e)), "seconds": round(dur, 1), "mean": float(e.mean()), "rms": float(np.sqrt(np.mean(e ** 2))),
            "sd": sd, "p95": float(np.percentile(a, 95)), "p99": float(np.percentile(a, 99)), "kurt": kurt,
            "acf_s": acf_time(t, e), "e_1hz_cm": [int(v) for v in sub[keep_]]}


def reduce_log(path):
    """{set name: summary or None} plus meta for one ULog file."""
    from pyulog import ULog
    u = ULog(path, TOPICS)
    D = {}
    for d in u.data_list:
        if d.multi_id == 0 and d.name not in D:
            D[d.name] = d.data
    if "vehicle_local_position" not in D or "vehicle_local_position_setpoint" not in D or "vehicle_status" not in D:
        return {"error": "missing topic"}
    lp, sp, st = D["vehicle_local_position"], D["vehicle_local_position_setpoint"], D["vehicle_status"]
    t = lp["timestamp"] / 1e6
    zsp = ffill(sp["timestamp"] / 1e6, sp["z"], t)
    vzsp = ffill(sp["timestamp"] / 1e6, sp["vz"], t)
    stt = st["timestamp"] / 1e6
    nav = ffill(stt, st["nav_state"], t)
    armed = ffill(stt, st["arming_state"], t) == 2
    if "vehicle_type" in st:
        rotary = ffill(stt, st["vehicle_type"], t) == 1
    elif "is_rotary_wing" in st:
        rotary = ffill(stt, st["is_rotary_wing"], t) == 1
    else:
        rotary = np.ones(len(t), dtype=bool)
    if "vehicle_land_detected" in D:
        ld = D["vehicle_land_detected"]
        landed = ffill(ld["timestamp"] / 1e6, ld["landed"], t) == 1
    else:
        landed = np.zeros(len(t), dtype=bool)
    airborne = armed & rotary & ~landed
    z_ok = lp["z_valid"] == 1 if "z_valid" in lp else np.ones(len(t), dtype=bool)
    if "z_reset_counter" in lp:
        rc = lp["z_reset_counter"].astype(float)
        z_ok = z_ok & ~settled_reset(t, rc)
    z = lp["z"].astype(float)
    level, enroute = masks(t, z, zsp.astype(float), vzsp.astype(float), lp["vx"], lp["vy"], airborne, nav, z_ok)
    e = z - zsp
    mis = nav == NAV_MISSION
    pos = np.isin(nav, NAV_POS)
    out = {}
    for name, m in (("mission_enroute", mis & enroute), ("mission_hover", mis & level & ~enroute),
                    ("pos_level", pos & level)):
        s = summarise(t[m], e[m])
        out[name] = s if s and s["seconds"] >= MIN_USABLE_S else None
    out["airborne_s"] = float(np.sum(np.diff(t)[airborne[1:] & (np.diff(t) < 1.0)])) if len(t) > 1 else 0.0
    return out


def settled_reset(t, rc):
    """True within SETTLE_S after a change of the z reset counter."""
    ch = np.r_[False, np.diff(rc) != 0]
    return ~settled(t, ch) & (np.cumsum(ch) > 0)


# ---------------------------------------------------------------- driver

def fetch(lid, dest):
    req = urllib.request.Request(DOWNLOAD % lid, headers={"User-Agent": "research-script"})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)


def _work(row, tmp):
    path = os.path.join(tmp, row["id"] + ".ulg")
    try:
        fetch(row["id"], path)
        res = reduce_log(path)
    except Exception as ex:  # noqa: BLE001 - a bad log is counted, not fatal
        res = {"error": "%s: %s" % (type(ex).__name__, str(ex)[:120])}
    finally:
        if os.path.exists(path):
            os.remove(path)
    return dict(row, **res)


def main(tmp, out_json):
    from concurrent.futures import ThreadPoolExecutor
    rows, start, total = [], 0, None
    seen = 0
    while total is None or start < total:
        d = index_page(start)
        total = d["recordsFiltered"]
        for r in d["data"]:
            seen += 1
            p = parse_row(r)
            if keep(p):
                rows.append(p)
        start += len(d["data"]) or 100
        if len(rows) >= MAX_LOGS or not d["data"]:
            break
    rows = rows[:MAX_LOGS]
    print("index: %d matching 'Mission', %d read, %d kept" % (total, seen, len(rows)), file=sys.stderr, flush=True)
    os.makedirs(tmp, exist_ok=True)
    done = []
    with ThreadPoolExecutor(4) as ex:
        for i, r in enumerate(ex.map(lambda r: _work(r, tmp), rows)):
            done.append(r)
            print("%d/%d %s %s" % (i + 1, len(rows), r["id"], r.get("error", "ok")), file=sys.stderr, flush=True)
    json.dump({"source": "PX4 Flight Review public logs, https://logs.px4.io, index searched 'Mission', newest "
                         "upload first", "retrieved": time.strftime("%Y-%m-%d", time.gmtime()),
               "index_total": total, "index_read": seen, "filters": {
                   "min_duration_s": MIN_DURATION_S, "min_usable_s": MIN_USABLE_S, "settle_s": SETTLE_S,
                   "vz_level": VZ_LEVEL, "dz_level": DZ_LEVEL, "v_enroute": V_ENROUTE, "max_logs": MAX_LOGS},
               "logs": done}, open(out_json, "w"), separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/px4_ulogs",
         os.path.join(HERE, "px4_height_2026.json"))
