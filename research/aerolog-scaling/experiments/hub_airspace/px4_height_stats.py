"""Milestone 11am statistics (P1 to P4 in px4_height.py's docstring) from the committed px4_height_2026.json.

    python3 px4_height_stats.py > px4_height_stats_results.txt
"""
import json
import math
import os
import statistics as S

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SETS = ("mission_enroute", "mission_hover", "pos_level")


def load(path=None):
    return json.load(open(path or os.path.join(HERE, "px4_height_2026.json")))


def usable(d, name):
    """The flights with a summary for set `name`: that summary merged with the log's index fields.
    The same flight uploaded twice (identical sample count, mean and RMS under two log ids) is kept once: a
    correction made after the first statistics were read, when two ids gave the same row (see LOG.md, 11am)."""
    meta = lambda L: {k: v for k, v in L.items() if not isinstance(v, dict)}
    out, seen = [], set()
    for L in d["logs"]:
        x = L.get(name)
        if not x:
            continue
        key = (x["n"], round(x["mean"], 9), round(x["rms"], 9))
        if key not in seen:
            seen.add(key)
            out.append(dict(meta(L), **x))
    return out


def fleet_sigma(rms):
    """sqrt(mean over flights of RMS^2): each flight weighted equally."""
    return math.sqrt(sum(r * r for r in rms) / len(rms))


def pooled_equal(flights, rng, n_each=None):
    """Pooled 1 Hz errors (m), every flight subsampled (with replacement) to the same count."""
    lens = [len(f["e_1hz_cm"]) for f in flights]
    n = n_each or min(lens)
    return np.concatenate([rng.choice(np.asarray(f["e_1hz_cm"], float) / 100.0, n) for f in flights])


def excess_kurtosis(x):
    x = np.asarray(x, float) - np.mean(x)
    return float(np.mean(x ** 4) / np.mean(x ** 2) ** 2 - 3.0)


def bootstrap_ci(vals, f, rng, n=2000):
    vals = np.asarray(vals, float)
    bs = [f(rng.choice(vals, len(vals))) for _ in range(n)]
    return float(np.percentile(bs, 2.5)), float(np.percentile(bs, 97.5))


def main():
    d = load()
    P = print
    rng = np.random.default_rng(11)
    logs = d["logs"]
    P("# Milestone 11am: height-keeping error (FTE = altitude estimate - setpoint) on public PX4 Flight Review logs")
    P("# index searched 'Mission' on %s: %d matching, %d read, %d kept (multirotor, not SITL, >= 2 min), %d errors" % (
        d["retrieved"], d["index_total"], d["index_read"], len(logs), sum("error" in L for L in logs)))
    errs = {}
    for L in logs:
        if "error" in L:
            errs[L["error"].split(":")[0]] = errs.get(L["error"].split(":")[0], 0) + 1
    P("# duplicate uploads dropped (same n, mean and RMS under two ids): %s" % ", ".join(
        "%s %d" % (nm, sum(1 for L in logs if L.get(nm)) - len(usable(d, nm))) for nm in SETS))
    P("# error kinds: %s" % (", ".join("%s %d" % kv for kv in sorted(errs.items())) or "none"))
    for name in SETS:
        F = usable(d, name)
        P()
        P("## %s: %d usable flights (>= 30 s qualifying)" % (name, len(F)))
        if len(F) < 3:
            continue
        rms = [f["rms"] for f in F]
        sd = [f["sd"] for f in F]
        mean = [abs(f["mean"]) for f in F]
        k = [f["kurt"] for f in F if np.isfinite(f["kurt"])]
        ac = [f["acf_s"] for f in F if f["acf_s"] is not None and np.isfinite(f["acf_s"])]
        secs = [f["seconds"] for f in F]
        sig = fleet_sigma(rms)
        lo, hi = bootstrap_ci(rms, lambda v: math.sqrt(np.mean(v ** 2)), rng)
        mlo, mhi = bootstrap_ci(rms, np.median, rng)
        pool = pooled_equal(F, np.random.default_rng(11))
        P("  qualifying seconds per flight: median %.0f (%.0f to %.0f), total %.0f" % (
            S.median(secs), min(secs), max(secs), sum(secs)))
        P("  per-flight RMS (m): median %.3f [95%% CI %.3f, %.3f]; p10 %.3f p25 %.3f p75 %.3f p90 %.3f max %.3f" % (
            S.median(rms), mlo, mhi, *np.percentile(rms, [10, 25, 75, 90]), max(rms)))
        P("  sigma_fleet = sqrt(mean RMS^2) = %.3f m [95%% CI %.3f, %.3f]" % (sig, lo, hi))
        P("  per-flight |mean| (m): median %.3f; per-flight sd: median %.3f; p95 |e| median %.3f; p99 |e| median %.3f" % (
            S.median(mean), S.median(sd), S.median([f["p95"] for f in F]), S.median([f["p99"] for f in F])))
        P("  excess kurtosis: pooled (flights equal, %d per flight) %.2f; within flight median %.2f (%d flights)" % (
            len(pool) // len(F), excess_kurtosis(pool), S.median(k), len(k)))
        P("  pooled 1 Hz |e| beyond 3 sd: %.2f%% (Gaussian 0.27%%); pooled sd %.3f m" % (
            100 * np.mean(np.abs(pool - pool.mean()) > 3 * pool.std()), pool.std()))
        if ac:
            P("  1/e autocorrelation time (s): median %.2f (p25 %.2f, p75 %.2f), %d flights with a 20 s run" % (
                S.median(ac), *np.percentile(ac, [25, 75]), len(ac)))
        types = {}
        for f in F:
            types.setdefault(f["type"], []).append(f["rms"])
        P("  by airframe type: " + "; ".join("%s n=%d median RMS %.3f" % (t, len(v), S.median(v))
                                             for t, v in sorted(types.items(), key=lambda kv: -len(kv[1]))))
        vers = {}
        for f in F:
            v = ".".join(f["version"].lstrip("v").split(".")[:2])
            vers.setdefault(v, []).append(f["rms"])
        P("  by PX4 version: " + "; ".join("%s n=%d %.3f" % (v, len(x), S.median(x)) for v, x in sorted(vers.items())))
    F = usable(d, "mission_enroute")
    if F:
        rms = [f["rms"] for f in F]
        P()
        P("# predictions (main set mission_enroute)")
        P("  P1 median per-flight RMS in [0.10, 0.50]: %.3f -> %s" % (
            S.median(rms), "held" if 0.10 <= S.median(rms) <= 0.50 else "refuted"))
        P("  P2 sigma_fleet <= 1.0: %.3f -> %s" % (fleet_sigma(rms), "held" if fleet_sigma(rms) <= 1.0 else "refuted"))
        pool = pooled_equal(F, np.random.default_rng(11))
        k = [f["kurt"] for f in F if np.isfinite(f["kurt"])]
        P("  P3 pooled excess kurtosis > 3 and within-flight median < 3: %.2f, %.2f -> %s" % (
            excess_kurtosis(pool), S.median(k), "held" if excess_kurtosis(pool) > 3 and S.median(k) < 3 else
            ("split" if excess_kurtosis(pool) > 3 or S.median(k) < 3 else "refuted")))
        ac = [f["acf_s"] for f in F if f["acf_s"] is not None and np.isfinite(f["acf_s"])]
        if ac:
            P("  P4 median 1/e time >= 2 s: %.2f -> %s" % (S.median(ac), "held" if S.median(ac) >= 2 else "refuted"))


if __name__ == "__main__":
    main()
