"""Step 6: minimum night flow (M1) against pressure CUSUM on the incipient leaks (H4).

    PYTHONPATH=src python experiments/step6-mnf/run.py   # from research/water-leaks

Plan fixed in LOG.md before any night-flow statistic was computed. Same harness, matching,
chance level and selection rule as steps 1 and 2. Deterministic; under a minute once the data
are cached. Writes experiments/step6-mnf/results.txt and alarms.tsv.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np

from water_leaks import harness, mnf
from water_leaks.harness import Y19

HERE = Path(__file__).resolve().parent
W, G, WMIN = 14, 7, 7
HS = [1, 2, 3, 5, 8, 12, 20, 30, 50]
MAX_FP_2018 = 2
SMALL = 12.0   # m3/h: H4's "incipient" set, peak under this in 2019_Leakages.csv


def prior_delays(path, start, stop):
    """{pipe: delay h or inf} for the 2019 new leaks from an earlier step's results block."""
    block = path.read_text().split(start, 1)[1].split(stop, 1)[0]
    out = {}
    for pipe, rest in re.findall(r"^\s+(p\d+) onset 2019\S+ peak\s+[\d.]+ m3/h\s+(.*)$", block, re.M):
        d = re.search(r"detected \+\s*(\d+) h", rest)
        out[pipe] = float(d.group(1)) if d else np.inf
    return out


def run(S, variant, tank, first_scored, out, tsv):
    hrs, events, carried = S["hrs"], S["events"], S["carried"]
    f = S["fcols"]
    inflow = S["F"][:, f.index("p227")] + S["F"][:, f.index("p235")]
    q = mnf.net_demand(inflow, S["Lv"][:, 0], tank=tank)
    m = mnf.night_min(q)
    S.setdefault("night", {})[variant] = m
    d18 = (Y19 - hrs[0]).astype(int) // 24
    out.append(f"# {variant}: night minimum of {'p227 + p235 - A_T1 dL/dt' if tank else 'p227 + p235 (no tank term)'}")
    out.append(f"  nightly minimum, 2018: median {np.median(m[:d18]):.1f} m3/h, 5-95% {np.percentile(m[:d18], 5):.1f} to "
               f"{np.percentile(m[:d18], 95):.1f}; 2019: median {np.median(m[d18:]):.1f}")
    # night-to-night spread the CUSUM sees: the 1.4826 MAD of each 14-day window in 2018
    mads = [1.4826 * np.median(np.abs(m[i:i + 14] - np.median(m[i:i + 14]))) for i in range(0, d18 - 14)]
    out.append(f"  14-day robust sd of the nightly minimum in 2018: median {np.median(mads):.2f} m3/h "
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
    mine = {k: full[k] for k in ("TP", "FP", "TP<=72h")}   # one network-wide flow names no sensor
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


def med(x):
    return float(np.median(np.asarray(x, dtype=float)))


def fmt(x):
    return "missed" if not np.isfinite(x) else f"{x:.0f} h"


def h4(name, mine, d1, li, peaks, out):
    small = sorted(p for p in mine if peaks[p] < SMALL)
    large = sorted(p for p in mine if peaks[p] >= SMALL)
    out += ["", f"## H4 ({name}): 2019 new leaks with peak < {SMALL:g} m3/h, misses as infinite delay",
            f"  {'pipe':>5} {'peak':>6} {name:>8} {'D1-F':>8} {'LILA':>8}"]
    for p in small:
        out.append(f"  {p:>5} {peaks[p]:6.2f} {fmt(mine[p]):>8} {fmt(d1[p]):>8} {fmt(li[p]):>8}")
    a, b, c = [mine[p] for p in small], [d1[p] for p in small], [li[p] for p in small]
    out.append(f"  median delay: {name} {fmt(med(a))}, D1-F {fmt(med(b))}, LILA-auto {fmt(med(c))}; "
               f"detected {sum(np.isfinite(a))}, {sum(np.isfinite(b))}, {sum(np.isfinite(c))} of {len(small)}")
    for other, o in (("D1-F", b), ("LILA-auto", c)):
        earlier = sum(x < y for x, y in zip(a, o))
        later = sum(x > y for x, y in zip(a, o))
        out.append(f"  paired with {other}: {name} earlier on {earlier}, later on {later}, tied on {len(a) - earlier - later}")
    rng = np.random.default_rng(6)
    A, B = np.array(a), np.array(b)
    wins = 0
    for _ in range(2000):
        ix = rng.integers(0, len(A), len(A))
        wins += np.median(A[ix]) < np.median(B[ix])
    out.append(f"  bootstrap over the {len(A)} leaks (2,000 resamples): {name} median below D1-F's in {wins / 2000:.3f}")
    held = med(a) < med(b)
    out.append(f"  H4 (median below D1-F's {fmt(med(b))}): {'HELD' if held else 'REFUTED'}")
    a2, b2, c2 = [mine[p] for p in large], [d1[p] for p in large], [li[p] for p in large]
    out.append(f"  leaks of {SMALL:g} m3/h and above ({len(large)}): median delay {name} {fmt(med(a2))}, D1-F {fmt(med(b2))}, "
               f"LILA-auto {fmt(med(c2))}; detected {sum(np.isfinite(a2))}, {sum(np.isfinite(b2))}, {sum(np.isfinite(c2))}")


def main():
    S = harness.setup()
    hrs, events = S["hrs"], S["events"]
    first_scored = hrs[(G + WMIN) * 24]
    peaks = {e[0]: e[3] for e in events if e[1] >= Y19}
    d1 = prior_delays(HERE.parent / "step1-baseline" / "results.txt", "## variant F", "## variant L")
    li = prior_delays(HERE.parent / "step2-lila" / "results.txt", "## LILA-auto, MAS ties by index", "# H1 check")
    out = [f"# water-leaks step 6: minimum night flow (M1) on BattLeDIM's water balance; trailing window W={W} d, g={G} d, "
           f"re-anchored (min {WMIN} d), CUSUM k=0.5; night 00:00-06:00, alarm at 06:00",
           f"# tune on 2018 (leaks starting from {str(first_scored)[:10]}), test on 2019; matching as step 1 (30-day window)",
           "# D1-F and LILA-auto delays read from steps 1 and 2's results.txt", ""]
    tsv = ["variant\th\talarm_time\tmatched_pipe\tdelay_h"]
    dm = run(S, "M1", True, first_scored, out, tsv)
    h4("M1", dm, d1, li, peaks, out)
    out += ["", "# ablation declared in the plan: no tank term", ""]
    dn = run(S, "M1-nt", False, first_scored, out, tsv)
    h4("M1-nt", dn, d1, li, peaks, out)
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    (HERE / "alarms.tsv").write_text("\n".join(tsv) + "\n")
    days = hrs[::24].astype("datetime64[D]")
    night = ["day\tM1_m3h\tM1nt_m3h"] + [f"{d}\t{a:.2f}\t{b:.2f}" for d, a, b in
                                         zip(days, S["night"]["M1"], S["night"]["M1-nt"])]
    (HERE / "night.tsv").write_text("\n".join(night) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    sys.exit(main())
