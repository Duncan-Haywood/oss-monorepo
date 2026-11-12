"""Step 2: LILA's leakage identification (Daniel et al. 2022), automatic, tuned on 2018, tested on 2019.

    PYTHONPATH=src python experiments/step2-lila/run.py   # from research/water-leaks

Same harness, matching, chance level and selection rule as step 1 (src/water_leaks/harness.py).
Deterministic; about 3 minutes. Writes experiments/step2-lila/results.txt and alarms.tsv.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

from water_leaks import harness, lila, network, score
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
W, G, WMIN = 14, 7, 7                    # the same trailing window as D1
DELTAS = [1.0, 2.0, 4.0]                 # 4 is the released code's default, 1 its value for hard leaks
CTHR = [3, 5, 10, 20, 30, 50, 100, 200, 300]   # 3 default, 300 used with delta 1 in the notebook
MAX_FP_2018 = 2


def main():
    S = harness.setup()
    hrs, P, events, carried, pcols, dist = S["hrs"], S["P"], S["events"], S["carried"], S["pcols"], S["dist"]
    v = S["F"][:, S["fcols"].index("PUMP_1")]
    lts, lcols, L19 = S["L19"]
    first_scored = hrs[(G + WMIN) * 24]
    out = [f"# water-leaks step 2: automatic LILA identification on BattLeDIM (LI-1 pairwise regressions on PUMP_1 flow, "
           f"LI-2 most-affected-sensor MRE, LI-3 tabular CUSUM); trailing window W={W} d, gap g={G} d, re-anchored (min {WMIN} d)",
           f"# tune on 2018 (leaks starting from {str(first_scored)[:10]}), test on 2019; hourly means",
           "# matching as step 1 (30-day window, detection only); the alarm's sensor is LILA's MAS", ""]
    rows, best = {}, None
    for delta in DELTAS:
        for c in CTHR:
            al, _ = lila.detect_lila(P, v, W=W, g=G, wmin=WMIN, delta=delta, c_thr=c)
            r = harness.evaluate(hrs, al, events, carried, first_scored)
            rows[(delta, c)] = (r, al)
            out.append(f"delta {delta:>3} C_thr {c:>4}: alarms {len(al):>3} | 2018 TP {len(r['tp18'])}/{r['n18']} FP {len(r['fp18']):>2} | "
                       f"2019 new TP {len(r['tp19'])}/{r['n19']} FP {len(r['fp19']):>2}")
            key = (len(r["tp18"]), -len(r["fp18"]), delta, c)
            if len(r["fp18"]) <= MAX_FP_2018 and (best is None or key > best):
                best = key
    out += ["", f"# selection on 2018 only: most 2018 true positives with at most {MAX_FP_2018} 2018 false alarms "
            "(ties: fewer false alarms, then larger delta, then larger C_thr)"]
    tsv = ["delta\tC_thr\talarm_time\tmas\tmatched_pipe\tdelay_h\tpipe_m"]
    if best is None:
        out.append("no setting meets the 2018 false-alarm cap")
    else:
        delta, c = best[2], best[3]
        r, al = rows[(delta, c)]
        m = r["m"]
        sensor_at = {hrs[t]: pcols[i] for t, i in al}
        out.append(f"## LILA-auto: delta = {delta}, C_thr = {c}")
        out.append(f"2018: TP {len(r['tp18'])}/{r['n18']}, FP {len(r['fp18'])}")
        out.append(f"2019: TP {len(r['tp19'])}/{r['n19']} new leaks, FP {len(r['fp19'])}; carried leaks found in 2018: "
                   f"{len(r['carried_found'])}/{len(carried)}")
        mine = harness.metrics(hrs, al, r, events, pcols, dist)
        nul = harness.null_metrics(hrs, len(al), events, carried, first_scored, (G + WMIN) * 24, pcols, dist)
        out.append(f"chance level: the same {len(al)} alarms over 2018-19 at random hours ({G + WMIN} d apart) from random sensors, 1,000 draws; 2019 new leaks:")
        out += harness.chance_table(mine, nul)
        delays, near = [], 0
        for i, e in enumerate(events):
            pipe, on, end, peak, vol = e
            if on < Y19:
                continue
            if i in m:
                t = m[i]
                dly = int((t - on.astype("datetime64[h]")).astype(int))
                s = sensor_at[t]
                dp = dist[s][pipe]
                near += dp <= 300
                delays.append(dly)
                out.append(f"  {pipe:>5} onset {str(on)[:16]} peak {peak:5.2f} m3/h  detected +{dly:>4} h, MAS {s:>4} ({dp:5.0f} m along pipes)")
                tsv.append(f"{delta}\t{c}\t{t}\t{s}\t{pipe}\t{dly}\t{dp:.0f}")
            else:
                out.append(f"  {pipe:>5} onset {str(on)[:16]} peak {peak:5.2f} m3/h  missed")
        for t in r["fp19"]:
            tsv.append(f"{delta}\t{c}\t{t}\t{sensor_at[t]}\t\t\t")
            out.append(f"  false alarm {t} by {sensor_at[t]}")
        if delays:
            out.append(f"  median delay {np.median(delays):.0f} h (range {min(delays)} to {max(delays)}); MAS within 300 m along pipes: {near}/{len(delays)}")
        # sensitivity: every grid point's 2019 detection count against its own chance level (H1 at >= 20 alarms)
        out += ["", "# H1 check over the whole grid (2019 new leaks; chance from 300 draws per setting)",
                "  delta C_thr alarms  TP  P(chance>=TP)  TP<=300m  P(chance>=)"]
        for (dl, cc), (rr, aa) in rows.items():
            if not aa:
                continue
            mm = harness.metrics(hrs, aa, rr, events, pcols, dist)
            nn = harness.null_metrics(hrs, len(aa), events, carried, first_scored, (G + WMIN) * 24, pcols, dist, draws=300, seed=1)
            out.append(f"  {dl:>5} {cc:>5} {len(aa):>6} {mm['TP']:>3}  {(nn['TP'] >= mm['TP']).mean():>13.3f}  "
                       f"{mm['TP<=300m']:>8}  {(nn['TP<=300m'] >= mm['TP<=300m']).mean():>11.3f}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "alarms.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    sys.exit(main())
