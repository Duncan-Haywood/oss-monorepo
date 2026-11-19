"""Milestone 11an, post hoc (written after rtk_baro_stats_results.txt was read, so no prediction): how much of the
barometer's error against RTK height would a filtered altitude estimate inherit?

The pre-registered statistic r_lin is the RMS of the raw baro - RTK difference. Its 1/e autocorrelation time came out
at a median 0.2 s: most of it is sample-to-sample sensor noise, which an altitude estimator averages down before the
position controller sees it. A barometer-referenced EKF follows the barometer only at its fusion bandwidth, so the
error it inherits is closer to the baro - RTK difference smoothed over a few seconds. This script re-downloads the
usable flights (enroute and hover sets), recomputes d = baro - RTK on the same samples as rtk_baro.reduce_log, and
reports the line-detrended RMS of d after a centred running mean of 1, 2, 5 and 10 s (within contiguous runs), and
the speed-binned mean of the detrended d (hover, 1 to 5, 5 to 10, above 10 m/s) relative to the flight's hover mean.

    python3 rtk_baro_posthoc.py [tmpdir] > rtk_baro_posthoc_results.txt   # writes rtk_baro_posthoc.json
"""
import json
import os
import statistics as S
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import px4_height as ph  # noqa: E402
import rtk_baro as rb  # noqa: E402

WINDOWS = (1.0, 2.0, 5.0, 10.0)
BINS = ((0.0, 1.0), (1.0, 5.0), (5.0, 10.0), (10.0, 99.0))


def smooth(t, x, window):
    """Centred running mean of x over `window` s within contiguous runs."""
    out = np.empty_like(x)
    for a, b in rb.runs(t):
        tt, xx = t[a:b], x[a:b]
        cs = np.r_[0.0, np.cumsum(xx)]
        lo = np.searchsorted(tt, tt - window / 2.0, side="left")
        hi = np.searchsorted(tt, tt + window / 2.0, side="right")
        out[a:b] = (cs[hi] - cs[lo]) / (hi - lo)
    return out


def capture(path):
    """Re-run rtk_baro.reduce_log's sample selection, returning (t, d, v, enroute mask) on the qualifying samples."""
    keep = {}
    orig = rb.summarise

    def grab(t, d, fte, ekf):
        keep.setdefault("parts", []).append((t, d))
        return orig(t, d, fte, ekf)

    orig_speed = rb.speed_term

    def grab_speed(t, d, v):
        keep["all"] = (t, d, v)
        return orig_speed(t, d, v)

    rb.summarise, rb.speed_term = grab, grab_speed
    try:
        res = rb.reduce_log(path)
    finally:
        rb.summarise, rb.speed_term = orig, orig_speed
    return res, keep.get("all")


def per_flight(t, d, v, enroute):
    out = {}
    for name, m in (("enroute", enroute), ("hover", ~enroute)):
        if rb.seconds(t[m]) < rb.MIN_USABLE_S:
            continue
        r = {}
        for w in WINDOWS:
            ds = smooth(t, d, w)        # smoothed over all qualifying samples, then restricted to the set
            r["s%g" % w] = float(np.sqrt(np.mean(rb.line_resid(t[m], ds[m]) ** 2)))
        r["raw"] = float(np.sqrt(np.mean(rb.line_resid(t[m], d[m]) ** 2)))
        out[name] = r
    res = rb.line_resid(t, d)
    hov = res[v <= 1.0]
    base = float(np.mean(hov)) if len(hov) >= 50 else None
    out["bins"] = {}
    for lo, hi in BINS:
        m = (v > lo) & (v <= hi)
        if m.sum() >= 50:
            out["bins"]["%g-%g" % (lo, hi)] = float(np.mean(res[m]) - base) if base is not None else None
    return out


def main(tmp):
    os.makedirs(tmp, exist_ok=True)
    d = rb.load()
    ids = []
    for name in ("enroute", "hover"):
        for f in rb.usable(d, name):
            if f["id"] not in ids:
                ids.append(f["id"])
    rows = []
    for lid in ids:
        path = os.path.join(tmp, lid + ".ulg")
        try:
            ph.fetch(lid, path)
            res, allv = capture(path)
        finally:
            if os.path.exists(path):
                os.remove(path)
        if allv is None:
            rows.append({"id": lid, "error": "no samples"})
            continue
        t, dd, v = allv
        row = dict(id=lid, **per_flight(t, dd, v, v > ph.V_ENROUTE))
        committed = {k: (d_["r_lin"] if d_ else None) for k, d_ in
                     ((k, next(x for x in d["logs"] if x["id"] == lid).get(k)) for k in ("enroute", "hover"))}
        row["check"] = {k: (abs(row[k]["raw"] - committed[k]) < 1e-6) for k in ("enroute", "hover")
                        if k in row and committed[k] is not None}
        rows.append(row)
    json.dump({"note": "post hoc smoothed baro - RTK statistics (rtk_baro_posthoc.py)", "flights": rows},
              open(os.path.join(HERE, "rtk_baro_posthoc.json"), "w"), indent=0)
    P = print
    P("# Milestone 11an post hoc: line-detrended RMS of baro - RTK after a centred running mean (m), %d flights" % len(rows))
    for name in ("enroute", "hover"):
        F = [r[name] for r in rows if name in r]
        P("  %s (%d flights)" % (name, len(F)))
        for k in ["raw"] + ["s%g" % w for w in WINDOWS]:
            v = [f[k] for f in F]
            P("    %-4s median %.3f (p25 %.3f, p75 %.3f, max %.3f); sqrt(mean sq) %.3f" % (
                k, S.median(v), *np.percentile(v, [25, 75]), max(v), float(np.sqrt(np.mean(np.square(v))))))
    P("  speed-binned mean of detrended baro - RTK minus the flight's hover mean (m)")
    for lo, hi in BINS[1:]:
        k = "%g-%g" % (lo, hi)
        v = [r["bins"][k] for r in rows if "bins" in r and r["bins"].get(k) is not None]
        if v:
            P("    %-6s m/s: %s" % (k, ", ".join("%+.2f" % x for x in sorted(v))))
    chk = [c for r in rows for c in r.get("check", {}).values()]
    P("  check: raw RMS recomputed equals the committed r_lin in %d of %d flight-sets" % (sum(chk), len(chk)))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/rtk_ulogs_posthoc")
