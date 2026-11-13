"""Step 8: rescore every detector so far under a flow-gated match (claim 1, H1 and H4).

    PYTHONPATH=src python experiments/step8-gated/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-13, step 8) before any gated score was computed. An alarm can
count for a leak only from the first hour the leak's own hourly-mean flow reaches phi m3/h
(the gate), and within 30 days of it. Primary phi = 1; phi = 0 is the rule of steps 1 to 7.
The detectors are not re-tuned: each runs at the setting its own step chose on 2018, and its
2019 alarms are checked against that step's alarms.tsv before anything is scored.
Writes experiments/step8-gated/results.txt and gated.tsv. A few minutes once the data are cached.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np

from water_leaks import data, detect, harness, lila, mnf, score
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
W, G, WMIN = 14, 7, 7
PHIS = [0.0, 0.5, 1.0, 2.0, 5.0]
PRIMARY = 1.0
SMALL = 12.0
PRESSURE = ("D1-F", "LILA-auto")


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def leak_flows(hrs):
    """{pipe: hourly-mean leak flow (m3/h) over both years, aligned to hrs}."""
    out = {}
    for y in (2018, 2019):
        ts, cols, L = data.load("Leakages", y)
        h, Lh = detect.hourly(ts, L)
        off = int((h[0] - hrs[0]).astype(int))
        for j, c in enumerate(cols):
            out.setdefault(c, np.zeros(len(hrs)))[off:off + len(h)] = Lh[:, j]
    return out


def alarm_lists(S):
    """Each detector's full 2018-19 alarm list at the setting its own step chose on 2018."""
    hrs, P, F, Lv, f = S["hrs"], S["P"], S["F"], S["Lv"], S["fcols"]
    al = {}
    A = detect.design(hrs, Lv, F)
    al["D1-F"], _ = detect.detect_sequential(P, A, W=W, g=G, wmin=WMIN, k=0.5, h=240)
    al["LILA-auto"], _ = lila.detect_lila(P, F[:, f.index("PUMP_1")], W=W, g=G, wmin=WMIN,
                                          delta=1.0, c_thr=20, tie="index")
    inflow = F[:, f.index("p227")] + F[:, f.index("p235")]
    q = mnf.net_demand(inflow, Lv[:, 0], tank=True)
    s7 = _load(EXP / "step7-mnf2" / "run.py", "step7")
    amr, _ = s7.amr_hourly(hrs)
    days = hrs[::24].astype("datetime64[D]")
    train = days < Y19.astype("datetime64[D]")
    m1, m3 = mnf.night_min(q), mnf.night_min(q - amr)
    series = {"M1": (m1, 3), "M2": (mnf.deweek(m1, days, mnf.weekday_offsets(m1, days, train)), 12),
              "M3": (m3, 3), "M4": (mnf.deweek(m3, days, mnf.weekday_offsets(m3, days, train)), 3)}
    for k, (m, h) in series.items():
        al[k], _ = mnf.detect_mnf(m, W=W, g=G, wmin=WMIN, h=h)
    return al


def recorded_2019(path, col, keep):
    """2019 alarm hours an earlier step wrote to alarms.tsv for one variant."""
    rows = [ln.split("\t") for ln in path.read_text().splitlines()[1:] if ln]
    return sorted(np.datetime64(r[col], "h") for r in rows if keep(r))


def check_against_steps(hrs, al):
    ref = {"D1-F": recorded_2019(EXP / "step1-baseline" / "alarms.tsv", 2, lambda r: r[0] == "F"),
           "LILA-auto": recorded_2019(EXP / "step2-lila" / "alarms.tsv", 3, lambda r: r[0] == "index"),
           "M1": recorded_2019(EXP / "step6-mnf" / "alarms.tsv", 2, lambda r: r[0] == "M1")}
    for v in ("M2", "M3", "M4"):
        ref[v] = recorded_2019(EXP / "step7-mnf2" / "alarms.tsv", 2, lambda r, v=v: r[0] == v)
    lines = []
    for k, a in al.items():
        mine = sorted(hrs[t] for t, _ in a if hrs[t] >= Y19)
        ok = mine == ref[k]
        lines.append(f"  {k:<10} alarms {len(a):>3} (2019: {len(mine)}); 2019 alarms equal the step's alarms.tsv: {'yes' if ok else 'NO'}")
        if not ok:
            raise SystemExit("\n".join(lines) + f"\n{k}: regenerated alarms differ from the recorded ones; plan says stop")
    return lines


def fmt(x):
    return "missed" if not np.isfinite(x) else f"{x:.0f} h"


def main():
    S = harness.setup()
    hrs, events, carried, pcols, dist = S["hrs"], S["events"], S["carried"], S["pcols"], S["dist"]
    first_scored = hrs[(G + WMIN) * 24]
    flows = leak_flows(hrs)
    flow_at = lambda p: (hrs, flows[p])
    al = alarm_lists(S)
    out = ["# water-leaks step 8: every detector so far rescored under a flow-gated match",
           "# an alarm counts for a leak only from its gate (first hour its hourly-mean flow >= phi m3/h) "
           "to 30 days after it; greedy, latest gate first; phi = 0 is steps 1-7's rule",
           f"# primary phi = {PRIMARY:g} m3/h; detectors at their own steps' 2018 settings, not re-tuned", "",
           "# regenerated alarm lists against the earlier steps"]
    out += check_against_steps(hrs, al)

    # gate lags of the 2019 new leaks
    peaks = {e[0]: e[3] for e in events if e[1] >= Y19}
    small = sorted(p for p in peaks if peaks[p] < SMALL)
    gated = {phi: score.gate_events(events, carried, flow_at, phi) for phi in PHIS}
    out += ["", "# hours from onset to gate, 2019 new leaks ('-' = never reaches phi)",
            f"  {'pipe':>5} {'peak':>6} " + " ".join(f"{'phi ' + format(p, 'g'):>8}" for p in PHIS[1:])]
    lag = {}
    for p in sorted(peaks):
        cells = []
        for phi in PHIS[1:]:
            ev = gated[phi][0]
            g = next((e[1] for e in ev if e[0] == p), None)
            on = next(e[1] for e in events if e[0] == p)
            lag[(p, phi)] = None if g is None else int((g.astype("datetime64[h]") - on.astype("datetime64[h]")).astype(int))
            cells.append("-" if g is None else f"{lag[(p, phi)]}")
        out.append(f"  {p:>5} {peaks[p]:6.2f} " + " ".join(f"{c:>8}" for c in cells))

    tsv = ["detector\tphi\tpipe\tonset\tgate\talarm_time\tdelay_from_gate_h\tdelay_from_onset_h"]
    res = {}
    for phi in PHIS:
        ev, car, onsets, dropped = gated[phi]
        out += ["", f"## phi = {phi:g} m3/h" + (" (primary)" if phi == PRIMARY else " (steps 1-7's rule)" if phi == 0 else ""),
                f"  leaks dropped (never reach phi): {', '.join(dropped) if dropped else 'none'}",
                "  detector    alarms | 2019 new TP  FP | chance TP median (95%)  P(TP)  | TP<=72h P | TP<=300m P | small TP"]
        for k, a in al.items():
            r = harness.evaluate(hrs, a, ev, car, first_scored, onsets)
            sens = pcols if k in PRESSURE else [pcols[0]]
            aa = a if k in PRESSURE else [(t, 0) for t, _ in a]
            mine = harness.metrics(hrs, aa, r, ev, sens, dist)
            nul = harness.null_metrics(hrs, len(a), ev, car, first_scored, (G + WMIN) * 24, sens, dist, onsets=onsets)
            pv = {key: (nul[key] >= mine[key]).mean() for key in mine}
            d_gate, d_on = {}, {}
            for i, e in enumerate(ev):
                if onsets[i] < Y19:
                    continue
                if i in r["m"]:
                    t = r["m"][i]
                    d_gate[e[0]] = float((t - e[1].astype("datetime64[h]")).astype(int))
                    d_on[e[0]] = float((t - onsets[i].astype("datetime64[h]")).astype(int))
                    tsv.append(f"{k}\t{phi:g}\t{e[0]}\t{str(onsets[i])[:16]}\t{str(e[1])[:16]}\t{t}\t{d_gate[e[0]]:.0f}\t{d_on[e[0]]:.0f}")
                else:
                    d_gate[e[0]] = d_on[e[0]] = np.inf
            nsmall = sum(np.isfinite(d_gate.get(p, np.inf)) for p in small)
            loc = f"{mine['TP<=300m']:>2} {pv['TP<=300m']:.3f}" if k in PRESSURE else "   -    "
            out.append(f"  {k:<10} {len(a):>6} | {mine['TP']:>5}/{r['n19']:<2} {mine['FP']:>3} | "
                       f"{np.median(nul['TP']):>9.0f} ({np.percentile(nul['TP'], 2.5):.0f} to {np.percentile(nul['TP'], 97.5):.0f})"
                       f"{'':>5}{pv['TP']:.3f} | {mine['TP<=72h']:>2} {pv['TP<=72h']:.3f} | {loc} | {nsmall}/{len(small)}")
            res[(k, phi)] = {"TP": mine["TP"], "FP": mine["FP"], "P": pv["TP"], "gate": d_gate, "onset": d_on,
                             "small": nsmall}

    # H4 and the predictions at the primary phi
    ph = PRIMARY
    out += ["", f"## H4 under the gate (phi = {ph:g}): 2019 new leaks with peak < {SMALL:g} m3/h, delay from the gate, misses infinite",
            f"  {'pipe':>5} {'peak':>6} {'gate lag':>8} " + " ".join(f"{k:>10}" for k in al)]
    for p in small:
        out.append(f"  {p:>5} {peaks[p]:6.2f} {lag[(p, ph)] if lag[(p, ph)] is not None else '-':>8} " +
                   " ".join(f"{fmt(res[(k, ph)]['gate'].get(p, np.inf)):>10}" for k in al))
    med = {k: float(np.median([res[(k, ph)]["gate"].get(p, np.inf) for p in small])) for k in al}
    out.append("  median delay from gate: " + ", ".join(f"{k} {fmt(v)}" for k, v in med.items()))
    A = np.array([res[("M4", ph)]["gate"].get(p, np.inf) for p in small])
    B = np.array([res[("D1-F", ph)]["gate"].get(p, np.inf) for p in small])
    rng = np.random.default_rng(6)
    wins = sum(np.median(A[ix]) < np.median(B[ix]) for ix in (rng.integers(0, len(A), len(A)) for _ in range(2000)))
    out.append(f"  paired M4 vs D1-F: earlier on {int((A < B).sum())}, later on {int((A > B).sum())}, "
               f"tied on {int(len(A) - (A < B).sum() - (A > B).sum())}; bootstrap (2,000, seed 6) M4 median below D1-F's in {wins / 2000:.3f}")
    h4 = med["M4"] < med["D1-F"]
    out.append(f"  H4 under the gate (M4 median below D1-F's): {'HELD' if h4 else 'REFUTED'}")

    pa = res[("D1-F", ph)]["small"] <= 5 and res[("LILA-auto", ph)]["small"] <= 5
    pb = res[("LILA-auto", ph)]["P"] >= 0.05
    out += ["", "## pre-registered predictions (LOG.md, step 8 plan)",
            f"  (a) D1-F and LILA-auto small-leak detections fall to 5 or fewer: D1-F {res[('D1-F', 0.0)]['small']} -> "
            f"{res[('D1-F', ph)]['small']}, LILA-auto {res[('LILA-auto', 0.0)]['small']} -> {res[('LILA-auto', ph)]['small']}: "
            f"{'HELD' if pa else 'FAILED'}",
            f"  (b) LILA-auto detection count not below chance at P < 0.05 under the gate: P = {res[('LILA-auto', ph)]['P']:.3f} "
            f"(ungated {res[('LILA-auto', 0.0)]['P']:.3f}): {'HELD' if pb else 'FAILED'}",
            f"  (c) H4 still refuted under the gate: {'HELD' if not h4 else 'FAILED'}"]

    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "gated.tsv").write_text("\n".join(tsv) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
