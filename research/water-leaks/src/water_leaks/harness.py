"""Shared evaluation for every detector: data assembly, 2018/2019 split, metrics, chance level.

Moved out of experiments/step1-baseline/run.py on 2026-11-12 (step 2) so LILA and later
detectors are scored by exactly the same code; step 1's results were rerun after the move
and are unchanged.
"""
from __future__ import annotations

import numpy as np

from water_leaks import data, detect, network, score

Y19 = np.datetime64("2019-01-01T00", "h")


def year_arrays(year):
    ts, pcols, P = data.load("Pressures", year)
    _, fcols, F = data.load("Flows", year)
    _, _, Lv = data.load("Levels", year)
    return ts, pcols, P, F, Lv, data.load("Leakages", year), fcols


def setup():
    """Both years as hourly arrays plus ground truth and sensor-to-leak-pipe distances."""
    a, b = year_arrays(2018), year_arrays(2019)
    ts = np.concatenate([a[0], b[0]])
    hrs, P = detect.hourly(ts, np.vstack([a[2], b[2]]))
    _, F = detect.hourly(ts, np.vstack([a[3], b[3]]))
    _, Lv = detect.hourly(ts, np.vstack([a[4], b[4]]))
    events, carried = score.merge_years(score.leak_events(*a[5]), score.leak_events(*b[5]))
    coords, links = network.parse_inp(data.fetch("L-TOWN.inp").read_text())
    pcols = a[1]
    leak_pipes = {e[0] for e in events}
    dist = {}
    for sname in pcols:
        gd = network.graph_dist(links, sname)
        dist[sname] = {p: network.pipe_dist(links, gd, p) for p in leak_pipes}
    return {"hrs": hrs, "P": P, "F": F, "Lv": Lv, "fcols": a[6], "pcols": pcols,
            "events": events, "carried": carried, "coords": coords, "links": links,
            "dist": dist, "L19": b[5]}


def evaluate(hrs, al, events, carried, first_scored):
    """Split alarms and matches by year. Leaks starting before the first scored hour
    (no model yet) are left out of the 2018 count."""
    times = [hrs[t] for t, _ in al]
    m, fp = score.match(times, events)
    new19 = [i for i, e in enumerate(events) if e[1] >= Y19]
    tune18 = [i for i, e in enumerate(events) if first_scored <= e[1] < Y19]
    return {
        "m": m,
        "tp18": [i for i in tune18 if i in m and m[i] < Y19], "n18": len(tune18),
        "fp18": [t for t in fp if t < Y19],
        "tp19": [i for i in new19 if i in m], "n19": len(new19),
        "fp19": [t for t in fp if t >= Y19],
        "carried_found": [i for i in carried if i in m],
    }


def metrics(hrs, al, r, events, sensors, dist):
    """2019 new-leak metrics: TP, FP, TP within 72 h, TP whose alarming sensor is within
    300 m (along pipes) of the leak pipe, and both together."""
    sensor_at = {hrs[t]: sensors[i] for t, i in al}
    tp72 = tploc = both = 0
    for i in r["tp19"]:
        t = r["m"][i]
        fast = (t - events[i][1].astype("datetime64[h]")).astype(int) <= 72
        near = dist[sensor_at[t]][events[i][0]] <= 300
        tp72 += fast
        tploc += near
        both += fast and near
    return {"TP": len(r["tp19"]), "FP": len(r["fp19"]), "TP<=72h": tp72, "TP<=300m": tploc,
            "TP<=72h&300m": both}


def null_metrics(hrs, n_alarms, events, carried, first_scored, holdoff, sensors, dist,
                 draws=1000, seed=0):
    """Chance level: n_alarms at random hours over the scored period (at least `holdoff`
    apart), each from a random sensor, scored exactly like the detector."""
    rng = np.random.default_rng(seed)
    lo, H = int((first_scored - hrs[0]).astype(int)), len(hrs)
    out = []
    while len(out) < draws:
        # uniform over spaced sets: sort n uniforms on the shortened line, then add i * gap
        span = H - lo - (n_alarms - 1) * holdoff
        t = lo + np.sort(rng.integers(0, span, n_alarms)) + np.arange(n_alarms) * holdoff
        al = [(int(x), int(rng.integers(len(sensors)))) for x in t]
        r = evaluate(hrs, al, events, carried, first_scored)
        out.append(metrics(hrs, al, r, events, sensors, dist))
    return {k: np.array([o[k] for o in out]) for k in out[0]}


def chance_table(mine, nul):
    """Lines of a detector-against-chance table."""
    out = ["  metric          det  chance median (95% range)   P(chance >= det)"]
    for key, v in mine.items():
        x = nul[key]
        out.append(f"  {key:<14} {v:>3}   {np.median(x):>5.0f} ({np.percentile(x, 2.5):.0f} to "
                   f"{np.percentile(x, 97.5):.0f}){'':>14}{(x >= v).mean():.3f}")
    return out
