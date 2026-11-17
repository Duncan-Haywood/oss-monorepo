"""Step 7: the two minimum-night-flow variants step 6 named, against pressure CUSUM on H4.

    PYTHONPATH=src python experiments/step7-mnf2/run.py   # from research/water-leaks

Plan fixed in LOG.md (2026-11-13, step 7) before either variant was computed:
  M2  M1's nightly minimum less 2018 weekday offsets
  M3  the night balance net of the 82 AMR demands (L/h -> m3/h)
  M4  both (offsets recomputed on M3's 2018 minima); declared primary for H4
Detector, grid, selection rule, matching, chance level and the H4 test are step 6's, imported
from experiments/step6-mnf/run.py. Writes results.txt, alarms.tsv and night.tsv here.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np

from water_leaks import data, detect, harness, mnf
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("step6", HERE.parent / "step6-mnf" / "run.py")
step6 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(step6)
W, G, WMIN, HS, MAX_FP_2018 = step6.W, step6.G, step6.WMIN, step6.HS, step6.MAX_FP_2018


def amr_hourly(hrs):
    """Sum of the 82 AMR demands as hourly means in m3/h, aligned to the harness's hours."""
    parts = [data.load("Demands", y) for y in (2018, 2019)]
    ts = np.concatenate([p[0] for p in parts])
    X = np.vstack([p[2] for p in parts])
    h, D = detect.hourly(ts, X)
    assert len(h) == len(hrs) and (h == hrs).all(), "Demands and SCADA hours differ"
    return D.sum(axis=1) / 1000.0, len(parts[0][1])


def score(S, variant, m, first_scored, out, tsv):
    """Step 6's run() from the nightly series on: grid, selection, 2019 once, chance, delays."""
    hrs, events, carried = S["hrs"], S["events"], S["carried"]
    d18 = (Y19 - hrs[0]).astype(int) // 24
    mads = [1.4826 * np.median(np.abs(m[i:i + 14] - np.median(m[i:i + 14]))) for i in range(0, d18 - 14)]
    out.append(f"  statistic, 2018: median {np.median(m[:d18]):.1f} m3/h; 2019: median {np.median(m[d18:]):.1f}")
    out.append(f"  14-day robust sd in 2018: median {np.median(mads):.2f} m3/h "
               f"(5-95% {np.percentile(mads, 5):.2f} to {np.percentile(mads, 95):.2f})")
    rows, best = {}, None
    for h in HS:
        al, _ = mnf.detect_mnf(m, W=W, g=G, wmin=WMIN, h=h)
        r = harness.evaluate(hrs, al, events, carried, first_scored)
        rows[h] = (r, al)
        out.append(f"  h {h:>3}: alarms {len(al):>3} | 2018 TP {len(r['tp18'])}/{r['n18']} FP {len(r['fp18']):>2} | "
                   f"2019 new TP {len(r['tp19'])}/{r['n19']} FP {len(r['fp19']):>2}")
        key = (len(r["tp18"]), -len(r["fp18"]), h)
        if len(r["fp18"]) <= MAX_FP_2018 and (best is None or key > best):
            best = key
    out.append(f"  selection on 2018 only: most 2018 TP with at most {MAX_FP_2018} 2018 FP (ties: fewer FP, larger h)")
    h = best[2]
    r, al = rows[h]
    mm = r["m"]
    out += ["", f"## {variant}: h = {h}",
            f"2018: TP {len(r['tp18'])}/{r['n18']}, FP {len(r['fp18'])}",
            f"2019: TP {len(r['tp19'])}/{r['n19']} new leaks, FP {len(r['fp19'])}; carried leaks found in 2018: "
            f"{len(r['carried_found'])}/{len(carried)}"]
    full = harness.metrics(hrs, [(t, 0) for t, _ in al], r, events, S["pcols"], S["dist"])
    mine = {k: full[k] for k in ("TP", "FP", "TP<=72h")}
    nul = harness.null_metrics(hrs, len(al), events, carried, first_scored, (G + WMIN) * 24, S["pcols"], S["dist"])
    out.append(f"chance level: the same {len(al)} alarms over 2018-19 at random hours ({G + WMIN} d apart), 1,000 draws; 2019 new leaks:")
    out += harness.chance_table(mine, nul)
    delays = {}
    for i, e in enumerate(events):
        pipe, on, end, peak, vol = e
        if on < Y19:
            continue
        if i in mm:
            t = mm[i]
            dly = int((t - on.astype("datetime64[h]")).astype(int))
            delays[pipe] = float(dly)
            out.append(f"  {pipe:>5} onset {str(on)[:16]} peak {peak:5.2f} m3/h  detected +{dly:>4} h")
            tsv.append(f"{variant}\t{h}\t{t}\t{pipe}\t{dly}")
        else:
            delays[pipe] = np.inf
            out.append(f"  {pipe:>5} onset {str(on)[:16]} peak {peak:5.2f} m3/h  missed")
    for t in r["fp19"]:
        out.append(f"  false alarm {t}")
        tsv.append(f"{variant}\t{h}\t{t}\t\t")
    return delays


def main():
    S = harness.setup()
    hrs, events = S["hrs"], S["events"]
    first_scored = hrs[(G + WMIN) * 24]
    peaks = {e[0]: e[3] for e in events if e[1] >= Y19}
    d1 = step6.prior_delays(HERE.parent / "step1-baseline" / "results.txt", "## variant F", "## variant L")
    li = step6.prior_delays(HERE.parent / "step2-lila" / "results.txt", "## LILA-auto, MAS ties by index", "# H1 check")
    f = S["fcols"]
    inflow = S["F"][:, f.index("p227")] + S["F"][:, f.index("p235")]
    q = mnf.net_demand(inflow, S["Lv"][:, 0], tank=True)
    amr, n_amr = amr_hourly(hrs)
    d18h = int((Y19 - hrs[0]).astype(int))
    days = hrs[::24].astype("datetime64[D]")
    train = days < Y19.astype("datetime64[D]")
    out = ["# water-leaks step 7: minimum night flow with a weekday baseline (M2), net of AMR demands (M3), both (M4)",
           f"# detector, grid, selection and matching as step 6 (W={W} d, g={G} d, min {WMIN} d, k=0.5, night 00-06, alarm 06:00)",
           "# D1-F and LILA-auto delays read from steps 1 and 2's results.txt", ""]
    # units check fixed in the plan: the AMR sum must be below the district balance
    qa, aa = np.median(q[:d18h]), np.median(amr[:d18h])
    out.append(f"# AMR series: {n_amr}; 2018 median of sum {aa:.2f} m3/h against district balance Q {qa:.2f} m3/h "
               f"({100 * aa / qa:.1f}%); units check {'passed' if aa < qa else 'FAILED'}")
    if not aa < qa:
        print("\n".join(out))
        return 1
    m1 = mnf.night_min(q)
    namr = mnf.night_min(amr)
    out.append(f"# nightly minimum (00-06) of the AMR sum: 2018 median {np.median(namr[train]):.2f} m3/h; "
               f"nightly minimum of Q: {np.median(m1[train]):.2f}")
    m3 = mnf.night_min(q - amr)
    o1 = mnf.weekday_offsets(m1, days, train)
    o3 = mnf.weekday_offsets(m3, days, train)
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    out.append("# 2018 weekday offsets of the nightly minimum (m3/h), Q: " +
               ", ".join(f"{n} {v:+.2f}" for n, v in zip(names, o1)))
    out.append("# 2018 weekday offsets, Q - AMR: " + ", ".join(f"{n} {v:+.2f}" for n, v in zip(names, o3)))
    series = {"M2": mnf.deweek(m1, days, o1), "M3": m3, "M4": mnf.deweek(m3, days, o3)}
    tsv = ["variant\th\talarm_time\tmatched_pipe\tdelay_h"]
    labels = {"M2": "nightly minimum of Q less 2018 weekday offsets",
              "M3": "nightly minimum of Q - sum AMR",
              "M4": "nightly minimum of Q - sum AMR less its 2018 weekday offsets (primary)"}
    res = {}
    for v in ("M4", "M2", "M3"):
        out += ["", f"# {v}: {labels[v]}"]
        res[v] = score(S, v, series[v], first_scored, out, tsv)
        step6.h4(v, res[v], d1, li, peaks, out)
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "alarms.tsv").write_text("\n".join(tsv) + "\n")
    night = ["day\tM1_m3h\tAMRnight_m3h\tM2_m3h\tM3_m3h\tM4_m3h"] + [
        f"{d}\t{a:.2f}\t{n:.2f}\t{b:.2f}\t{c:.2f}\t{e:.2f}"
        for d, a, n, b, c, e in zip(days, m1, namr, series["M2"], series["M3"], series["M4"])]
    (HERE / "night.tsv").write_text("\n".join(night) + "\n")
    print("\n".join(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
