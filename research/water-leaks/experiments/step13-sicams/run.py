"""Step 13: SICAMS (Melnikov 2025) automatic, tuned on 2018, tested on 2019; and the paper's own
published detection times scored against chance on the same harness.

    PYTHONPATH=src python experiments/step13-sicams/run.py   # from research/water-leaks

Plan: LOG.md, "Step 13 plan". Deterministic apart from the seeded chance draws; a few minutes.
Writes experiments/step13-sicams/results.txt, alarms.tsv and series.npz (for the figure).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

from water_leaks import data, detect, harness, sicams
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
PENS = [1, 3, 10, 30, 100, 300, 1000, 3000]
DELTAS = [0.0, 0.001, 0.01]
ALPHAS = [1e-2, 1e-3, 1e-4, 1e-5]
MAX_FP_2018 = 2
HOLDOFF = 24
MA = 12
B_SENS, C_SENS = ["n215"], ["n1", "n4", "n31"]
BASELINE_A = {"p257", "p427"}

# Melnikov (2025), Appendix A, Table 1: (pipe, detection time). p680's printed time (19-06-13 11:00)
# is before its onset; its Delta t column says 2 h, so onset + 2 h is used. Missed leaks are left out.
PUBLISHED = [
    ("p257", "2018-01-18T13"), ("p461", "2018-01-23T22"), ("p232", "2018-02-03T03"),
    ("p427", "2018-02-20T10"), ("p673", "2018-03-05T18"), ("p628", "2018-05-07T01"),
    ("p538", "2018-05-18T22"), ("p866", "2018-06-01T21"), ("p31", "2018-07-05T08"),
    ("p654", "2018-07-05T10"), ("p183", "2018-08-07T13"), ("p158", "2018-10-06T13"),
    ("p369", "2018-10-26T13"), ("p523", "2019-01-16T10"), ("p827", "2019-01-25T04"),
    ("p280", "2019-02-11T09"), ("p653", "2019-03-13T06"), ("p710", "2019-03-25T08"),
    ("p514", "2019-04-03T07"), ("p331", "2019-04-20T19"), ("p277", "2019-06-20T04"),
    ("p142", "2019-06-13T08"), ("p680", "2019-07-10T10"), ("p721", "2019-08-21T12"),
    ("p800", "2019-09-07T04"), ("p426", "2019-10-26T03"), ("p879", "2019-11-27T10"),
]


def active_2018(hrs18):
    ts, cols, L = data.load("Leakages", 2018)
    _, Lh = detect.hourly(ts, L)
    assert len(Lh) == len(hrs18)
    return cols, Lh > 0


def filter_alarms(X, cl, train, alpha, reanchor, n_hours):
    """B or C: Algorithm 1 on the 12 h MA of T^2_F. With `reanchor`, after each alarm the filter is
    off for 21 days and the model is refitted on the 14 days starting 7 days after the alarm."""
    model = sicams.Model(X, cl, train)
    t2 = model.t2f(X, cl)
    if not reanchor:
        th1, th0 = sicams.thresholds(model.s, model.n_median(), alpha)
        return sicams.hysteresis(sicams.moving_average(t2, MA), th1, th0), model, t2
    starts, t, on = [], 0, False
    th1, th0 = sicams.thresholds(model.s, model.n_median(), alpha)
    m = sicams.moving_average(t2, MA)
    while t < n_hours:
        if not on and m[t] > th1:
            starts.append(t)
            tr = np.zeros(n_hours, bool)
            tr[t + 7 * 24:t + 21 * 24] = True
            if t + 21 * 24 >= n_hours:
                break
            model = sicams.Model(X, cl, tr)
            th1, th0 = sicams.thresholds(model.s, model.n_median(), alpha)
            t2 = model.t2f(X, cl)
            m = sicams.moving_average(t2, MA)
            t, on = t + 21 * 24, False
            continue
        if on and m[t] < th0:
            on = False
        t += 1
    return starts, model, t2


def describe(name, al, r, S, first_scored, out, tsv, cols_for_sensor=True, compare=None):
    hrs, events, carried, pcols, dist = S["hrs"], S["events"], S["carried"], S["pcols"], S["dist"]
    out.append(f"## {name}: {len(al)} alarms over 2018-19")
    out.append(f"2018: TP {len(r['tp18'])}/{r['n18']}, FP {len(r['fp18'])}")
    out.append(f"2019: TP {len(r['tp19'])}/{r['n19']} new leaks, FP {len(r['fp19'])}; carried leaks found: "
               f"{len(r['carried_found'])}/{len(carried)}")
    mine = harness.metrics(hrs, al, r, events, pcols, dist)
    if not cols_for_sensor:
        mine = {k: mine[k] for k in ("TP", "FP", "TP<=72h")}
    nul = harness.null_metrics(hrs, len(al), events, carried, first_scored, HOLDOFF, pcols, dist)
    out.append(f"chance level: {len(al)} alarms at random hours ({HOLDOFF} h apart) from random sensors, 1,000 draws; 2019 new leaks:")
    out += harness.chance_table(mine, nul)
    sensor_at = {hrs[t]: pcols[i] for t, i in al}
    m, delays, near = r["m"], [], 0
    for i, e in enumerate(events):
        pipe, on = e[0], e[1]
        if on < Y19:
            continue
        pub = compare.get(pipe) if compare else None
        ptxt = f" | paper +{pub} h" if pub is not None else (" | paper missed" if compare is not None else "")
        if i in m:
            t = m[i]
            dly = int((t - on.astype("datetime64[h]")).astype(int))
            delays.append(dly)
            if cols_for_sensor:
                s = sensor_at[t]
                dp = dist[s][pipe]
                near += dp <= 300
                out.append(f"  {pipe:>5} onset {str(on)[:16]} peak {e[3]:5.2f}  detected +{dly:>4} h, sensor {s:>4} ({dp:5.0f} m){ptxt}")
                tsv.append(f"{name}\t{t}\t{s}\t{pipe}\t{dly}\t{dp:.0f}")
            else:
                out.append(f"  {pipe:>5} onset {str(on)[:16]} peak {e[3]:5.2f}  detected +{dly:>4} h{ptxt}")
        else:
            out.append(f"  {pipe:>5} onset {str(on)[:16]} peak {e[3]:5.2f}  missed{ptxt}")
    for t in r["fp19"]:
        out.append(f"  false alarm {t}" + (f" by {sensor_at[t]}" if cols_for_sensor else ""))
        if cols_for_sensor:
            tsv.append(f"{name}\t{t}\t{sensor_at[t]}\t\t\t")
    if delays:
        out.append(f"  median delay {np.median(delays):.0f} h (range {min(delays)} to {max(delays)})"
                   + (f"; sensor within 300 m: {near}/{len(delays)}" if cols_for_sensor else ""))
    out.append("")
    return mine, nul


def main():
    S = harness.setup()
    hrs, P, F, Lv, pcols, fcols = S["hrs"], S["P"], S["F"], S["Lv"], S["pcols"], S["fcols"]
    events, carried = S["events"], S["carried"]
    H = len(hrs)
    Y = int((Y19 - hrs[0]).astype(int))
    first_scored = hrs[14 * 24]
    hod = (hrs - hrs.astype("datetime64[D]")).astype(int)
    lcols, act = active_2018(hrs[:Y])
    idx = {c: j for j, c in enumerate(pcols)}
    out = ["# water-leaks step 13: SICAMS (Melnikov 2025, arXiv:2512.15685) reimplemented, automatic; hourly means",
           "# tune on 2018 (leaks from 2018-01-15), test on 2019; step 1's harness and 30-day matching", ""]
    tsv = ["variant\talarm_time\tsensor\tmatched_pipe\tdelay_h\tpipe_m"]

    # ---- area A: 29 pressures + p227, p235 + T1, hour-of-day clusters, PELT + Algorithm 2
    a_sens = [c for c in pcols if c not in B_SENS + C_SENS]
    XA = np.hstack([P[:, [idx[c] for c in a_sens]], F[:, [fcols.index("p227"), fcols.index("p235")]], Lv])
    other = [j for j, c in enumerate(lcols) if c not in BASELINE_A]
    trA = np.zeros(H, bool)
    trA[:Y] = ~act[:, other].any(axis=1)
    mA = sicams.Model(XA, hod, trA)
    t2A = mA.t2f(XA, hod)
    maA = sicams.moving_average(t2A, MA)
    sdA = maA[trA].std()
    xs = maA / sdA
    z2A = mA.z2(XA, hod)[:, :len(a_sens)]
    out.append(f"area A: s = {mA.s}, training hours {trA.sum()} (2018 hours with only {sorted(BASELINE_A)} active), "
               f"per hour-of-day cluster {min(mA.n.values())} to {max(mA.n.values())}; MA sd on training {sdA:.3f}")
    cpsA = {}
    for c in PENS:
        cpsA[c] = [sicams.pelt(xs[:Y], c * np.log(Y), HOLDOFF),
                   [Y + k for k in sicams.pelt(xs[Y:], c * np.log(H - Y), HOLDOFF)]]
        out.append(f"  PELT c = {c:>4}: change points 2018 {len(cpsA[c][0])}, 2019 {len(cpsA[c][1])}")

    def alarms_A(c, delta):
        al = []
        for yr, cps in enumerate(cpsA[c]):
            off = 0 if yr == 0 else Y
            seg = xs[:Y] if yr == 0 else xs[Y:]
            for cp, lab in sicams.classify(seg, [k - off for k in cps], 0.05, delta):
                if lab == "start":
                    t = cp + off
                    al.append((t, idx[a_sens[sicams.alarm_sensor(z2A, t, a_sens, MA)]]))
        return al

    # ---- areas B and C
    trB = np.zeros(H, bool)
    trB[:Y] = ~act[:, lcols.index("p673")]
    XB = P[:, [idx["n215"]]]
    XC = np.hstack([P[:, [idx[c] for c in C_SENS]], Lv])
    clC = hod // 2
    trC = hrs < np.datetime64("2018-01-17T18", "h")
    out.append(f"area B: n215, training hours {trB.sum()}; area C: s = 4, training hours {trC.sum()} "
               f"({trC.sum() // 12} per 2-hour cluster)")
    one = np.zeros(H, int)

    def alarms_BC(alpha, reanchor):
        al = []
        stB, _, _ = filter_alarms(XB, one, trB, alpha, reanchor, H)
        al += [(t, idx["n215"]) for t in stB]
        stC, mC, _ = filter_alarms(XC, clC, trC, alpha, reanchor, H)
        z2C = mC.z2(XC, clC)[:, :3]
        al += [(t, idx[C_SENS[sicams.alarm_sensor(z2C, t, C_SENS, MA)]]) for t in stC]
        return al, len(stB), len(stC)

    for reanchor in (False, True):
        label = "secondary, B and C re-anchored" if reanchor else "primary, no retraining"
        out += ["", f"# grid ({label}): PELT c x delta x filter alpha; 2018 rule: most TP with <= {MAX_FP_2018} FP"]
        bc = {a: alarms_BC(a, reanchor) for a in ALPHAS}
        rows, best = {}, None
        for c in PENS:
            for d in DELTAS:
                aA = alarms_A(c, d)
                for a in ALPHAS:
                    al = sorted(aA + bc[a][0])
                    r = harness.evaluate(hrs, al, events, carried, first_scored)
                    rows[(c, d, a)] = (r, al)
                    out.append(f"c {c:>4} delta {d:<5} alpha {a:.0e}: alarms {len(al):>3} (A {len(aA)}, B {bc[a][1]}, C {bc[a][2]}) | "
                               f"2018 TP {len(r['tp18'])}/{r['n18']} FP {len(r['fp18']):>2} | 2019 TP {len(r['tp19'])}/{r['n19']} FP {len(r['fp19']):>2}")
                    key = (len(r["tp18"]), -len(r["fp18"]), c, -a, -d)
                    if len(r["fp18"]) <= MAX_FP_2018 and (best is None or key > best):
                        best = key
        out.append("")
        if best is None:
            out.append("no setting meets the 2018 false-alarm cap")
            continue
        c, a, d = best[2], -best[3], -best[4]
        r, al = rows[(c, d, a)]
        name = f"SICAMS-auto ({label}): c = {c}, delta = {d}, alpha = {a:.0e}"
        pub = {p: int((np.datetime64(t, "h") - next(e[1] for e in events if e[0] == p).astype("datetime64[h]")).astype(int))
               for p, t in PUBLISHED}
        describe(name, al, r, S, first_scored, out, tsv, compare=pub)
        if not reanchor:
            np.savez_compressed(HERE / "series.npz", hours=hrs.astype("datetime64[h]").astype(np.int64),
                                ma=xs, alarms=np.array([t for t, _ in al]))
            out.append("# H1 over the whole grid at this rule (2019 new leaks; chance from 300 draws per setting)")
            out.append("  c     delta alpha  alarms TP P(chance>=TP) TP<=300m P(chance>=)")
            for (cc, dd, aa), (rr, ala) in rows.items():
                if not ala:
                    continue
                mm = harness.metrics(hrs, ala, rr, events, pcols, S["dist"])
                nn = harness.null_metrics(hrs, len(ala), events, carried, first_scored, HOLDOFF, pcols, S["dist"], draws=300, seed=1)
                out.append(f"  {cc:>4} {dd:<5} {aa:.0e} {len(ala):>6} {mm['TP']:>2} {(nn['TP'] >= mm['TP']).mean():>12.3f} "
                           f"{mm['TP<=300m']:>8} {(nn['TP<=300m'] >= mm['TP<=300m']).mean():>11.3f}")
            out.append("")

    # ---- the paper's own times
    hi = {h: i for i, h in enumerate(hrs)}
    for extra in (True, False):
        al = sorted((hi[np.datetime64(t, "h")], 0) for p, t in PUBLISHED)
        if extra:
            al = sorted(al + [(hi[np.datetime64("2019-10-26T03", "h")], 0)])
        r = harness.evaluate(hrs, al, events, carried, first_scored)
        tag = "with p426's stated false alarm as one more alarm" if extra else "Table 1 times only"
        describe(f"published SICAMS times (Melnikov 2025, Table 1; {tag}), detection only", al, r, S,
                 first_scored, out, [], cols_for_sensor=False)
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "alarms.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    sys.exit(main())
