"""Straddling wheels per drill against the survey's length (2026-11-20, firmware/esp32/README.md "Straddling wheels per
drill against the survey's length"; eval/take-straddle-count-2026-11-20.md).

Each LABEL=FILES group is one survey drill length captured on the same seeds (tests/take_survey_pick.py --drill). Per
group and take band it prints the survey wheels, kept wheels and straddling kept wheels at 1.5 ms (for + against) per
build, and what the shipped advice (host.take_survey_advice, margin 2 at 1.5 ms and 2.5 ms) names: a spread take is
named when the advised TAKE_US is within 1 ms of the true take; an instant build is misadvised when told to set one.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_straddle_count.py [--procs 4] std=a.jsonl,b.jsonl long=c.jsonl

Simulated only, as the captures are.
"""
import statistics
import sys

BANDS = (("instant", 0.0, 0.0), ("1.3-2.1 ms", 1.2, 2.15), ("2.4-2.8 ms", 2.3, 2.9))


def band(t):
    for name, lo, hi in BANDS:
        if (t == 0 and hi == 0) or (hi and lo <= t <= hi):
            return name
    return None


def summary(rows, wheels):
    """{band: dict(builds, wheels, kept, straddle, named, bad)} for one group."""
    import take_straddle_scaled as tss
    out = {}
    for (t, sv), w in zip(rows, wheels):
        g = band(t)
        if g is None or not sv:
            continue
        c = out.setdefault(g, dict(builds=0, wheels=[], kept=[], straddle=[], named=0, bad=0))
        c["builds"] += 1
        c["wheels"].append(w)
        c["kept"].append(sv.get("kept") or 0)
        c["straddle"].append((sv.get("straddle_for") or 0) + (sv.get("straddle_against") or 0))
        v = tss.verdict(sv, "margin", 2)
        if t and tss._ok(v, t):
            c["named"] += 1
        elif not t and v:
            c["bad"] += 1
    return out


def main():
    a = sys.argv
    procs = int(a[a.index("--procs") + 1]) if "--procs" in a else 1
    groups = [x for x in a[1:] if "=" in x]
    import take_straddle_vote as tsv
    for grp in groups:
        label, files = grp.split("=", 1)
        paths = files.split(",")
        builds = tsv.load(paths)
        rows = tsv.rows_for(paths, procs)
        s = summary(rows, [len(b.get("wheels") or ()) for b in builds])
        print(f"{label}: {len(rows)} builds")
        for g, _, _ in BANDS:
            if g not in s:
                continue
            c = s[g]
            m = statistics.fmean
            tail = (f"misadvised {c['bad']} of {c['builds']}" if g == "instant"
                    else f"named {c['named']} of {c['builds']}")
            print(f"  {g}: {c['builds']} builds; per build: survey wheels {m(c['wheels']):.1f}, kept {m(c['kept']):.1f}, "
                  f"straddling at 1.5 ms {m(c['straddle']):.2f} (max {max(c['straddle'])}, none on "
                  f"{sum(1 for x in c['straddle'] if x == 0)}); {tail}")


if __name__ == "__main__":
    main()
