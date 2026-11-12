"""Step 1: D1 trailing-window residual CUSUM on BattLeDIM, tuned on 2018, tested on 2019.

    PYTHONPATH=src python experiments/step1-baseline/run.py   # from research/water-leaks

Downloads the BattLeDIM files on first use (about 75 MB, data.py). Deterministic (seeded null), about 4 minutes.
Writes experiments/step1-baseline/results.txt and alarms.tsv.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

from water_leaks import data, detect, network, score

HERE = Path(__file__).resolve().parent
W, G, K, WMIN = 14, 7, 0.5, 7
HS = [10, 15, 20, 30, 40, 60, 80, 120, 160, 240, 320, 400, 480]
MAX_FP_2018 = 2
Y19 = np.datetime64("2019-01-01T00", "h")


def year_arrays(year):
    ts, pcols, P = data.load("Pressures", year)
    _, _, F = data.load("Flows", year)
    _, _, Lv = data.load("Levels", year)
    return ts, pcols, P, F, Lv, data.load("Leakages", year)


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


def main():
    a, b = year_arrays(2018), year_arrays(2019)
    pcols = a[1]
    ts = np.concatenate([a[0], b[0]])
    hrs, P = detect.hourly(ts, np.vstack([a[2], b[2]]))
    _, F = detect.hourly(ts, np.vstack([a[3], b[3]]))
    _, Lv = detect.hourly(ts, np.vstack([a[4], b[4]]))
    events, carried = score.merge_years(score.leak_events(*a[5]), score.leak_events(*b[5]))
    first_scored = hrs[(G + WMIN) * 24]
    coords, links = network.parse_inp(data.fetch("L-TOWN.inp").read_text())
    lts, lcols, L19 = b[5]
    leak_pipes = {e[0] for e in events}
    dist = {}
    for sname in pcols:
        gd = network.graph_dist(links, sname)
        dist[sname] = {p: network.pipe_dist(links, gd, p) for p in leak_pipes}

    out = [f"# water-leaks step 1: D1 on BattLeDIM; trailing window W={W} d, gap g={G} d, re-anchored after an alarm (min {WMIN} d), CUSUM k={K}",
           f"# tune on 2018 (leaks starting from {str(first_scored)[:10]}), test on 2019",
           f"# leaks: {len(events)} over both years; 2019 has {len(carried)} carried from 2018 "
           f"({', '.join(events[i][0] for i in sorted(carried))}) and {sum(e[1] >= Y19 for e in events)} new",
           "# matching: an alarm counts for the running, unmatched leak with the latest onset if it is "
           "within 30 days of that onset; otherwise it is a false alarm. Detection only (no pipe reported).",
           ""]
    rows, best = {}, {}
    for variant in ("L", "F"):
        A = detect.design(hrs, Lv, F if variant == "F" else None)
        for h in HS:
            al, _ = detect.detect_sequential(P, A, W=W, g=G, wmin=WMIN, k=K, h=h)
            r = evaluate(hrs, al, events, carried, first_scored)
            rows[(variant, h)] = (r, al)
            out.append(f"variant {variant} h {h:>4}: 2018 TP {len(r['tp18'])}/{r['n18']} FP {len(r['fp18']):>2} | "
                       f"2019 new TP {len(r['tp19'])}/{r['n19']} FP {len(r['fp19']):>2}")
            key = (len(r["tp18"]), -len(r["fp18"]), h)
            if len(r["fp18"]) <= MAX_FP_2018 and (variant not in best or key > best[variant][0]):
                best[variant] = (key, h)

    out += ["", f"# selection on 2018 only: most 2018 true positives with at most {MAX_FP_2018} 2018 false "
            "alarms (ties: fewer false alarms, then larger h)"]
    tsv = ["variant\th\talarm_time\tsensor\tmatched_pipe\tdelay_h\teuclid_m\tpipe_m"]
    for variant, (_, h) in sorted(best.items(), key=lambda kv: kv[0] != "F"):
        r, al = rows[(variant, h)]
        m = r["m"]
        sensor_at = {hrs[t]: pcols[i] for t, i in al}
        out.append(f"## variant {variant} ({'hour-of-week + tank level + 3 inlet flows' if variant == 'F' else 'hour-of-week + tank level'}): h = {h}")
        out.append(f"2018: TP {len(r['tp18'])}/{r['n18']}, FP {len(r['fp18'])}")
        out.append(f"2019: TP {len(r['tp19'])}/{r['n19']} new leaks, FP {len(r['fp19'])}; carried leaks found in 2018: "
                   f"{len(r['carried_found'])}/{len(carried)}; on BattLeDIM's 23-leak count: "
                   f"{len(r['tp19']) + len(r['carried_found'])}/23 detected (no localisation)")
        mine = metrics(hrs, al, r, events, pcols, dist)
        nul = null_metrics(hrs, len(al), events, carried, first_scored, (G + WMIN) * 24, pcols, dist)
        out.append(f"chance level: the same {len(al)} alarms over 2018-19 at random hours ({G + WMIN} d apart, the blind time after an alarm) "
                   "from random sensors, 1,000 draws; 2019 new leaks:")
        out.append("  metric          D1   chance median (95% range)   P(chance >= D1)")
        for key, v in mine.items():
            x = nul[key]
            out.append(f"  {key:<14} {v:>3}   {np.median(x):>5.0f} ({np.percentile(x, 2.5):.0f} to "
                       f"{np.percentile(x, 97.5):.0f}){'':>14}{(x >= v).mean():.3f}")
        delays, w300e, w300p, saved, total = [], 0, 0, 0.0, 0.0
        for i, e in enumerate(events):
            pipe, on, end, peak, vol = e
            if on < Y19:
                continue
            total += vol
            if i in m:
                t = m[i]
                dly = int((t - on.astype("datetime64[h]")).astype(int))
                s = sensor_at[t]
                de = network.euclid_to_pipe(coords, links, s, pipe)
                dp = network.pipe_dist(links, network.graph_dist(links, s), pipe)
                w300e += de <= 300
                w300p += dp <= 300
                saved += vol - score.volume_before(lts, lcols, L19, pipe, on, t.astype("datetime64[m]"))
                delays.append(dly)
                out.append(f"  {pipe:>5} onset {str(on)[:16]} peak {peak:5.2f} m3/h  detected "
                           f"+{dly:>4} h by {s:>4} ({de:5.0f} m straight, {dp:5.0f} m along pipes)")
                tsv.append(f"{variant}\t{h}\t{t}\t{s}\t{pipe}\t{dly}\t{de:.0f}\t{dp:.0f}")
            else:
                out.append(f"  {pipe:>5} onset {str(on)[:16]} peak {peak:5.2f} m3/h  missed")
        for t in r["fp19"]:
            tsv.append(f"{variant}\t{h}\t{t}\t{sensor_at[t]}\t\t\t\t")
            out.append(f"  false alarm {t} by {sensor_at[t]}")
        if delays:
            out.append(f"  median delay {np.median(delays):.0f} h (range {min(delays)} to {max(delays)}); "
                       f"alarming sensor within 300 m of the leak: {w300e}/{len(delays)} straight, "
                       f"{w300p}/{len(delays)} along pipes")
        out.append(f"  volume the 2019 new leaks lose after their detection (saved by an instant repair): "
                   f"{saved:,.0f} of {total:,.0f} m3 ({100 * saved / total:.1f}%)")
        out.append("")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "alarms.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    sys.exit(main())
