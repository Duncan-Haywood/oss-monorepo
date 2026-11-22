"""Figures for the altitude-layer paper draft (airspace_layers.md), drawn only from committed results files.

Run: python3 paper/airspace_figures.py   (stdlib only)
Writes paper/figures/figA1_band_count.svg (median losses of separation against band count, 11ai post hoc)
paper/figures/figA2_error_ladder.svg (the sourced per-drone error terms of 11ak to 11an, as bars) and
paper/figures/figA3_rule_costs.svg (Table A1's cheap planners against the aware search, 16 operators, 11aw and 11ay).
"""
import pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE.parent / "_shared"))
from linefig import write_lines, write_bars  # noqa: E402

OUT = HERE / "paper" / "figures"
EXP = HERE / "experiments" / "hub_airspace"


def band_curves(m):
    """Median F/F_1 by band count k for Z = 7.62 m (25 ft), main condition, from level_leak_posthoc_results.txt."""
    text = (EXP / "level_leak_posthoc_results.txt").read_text()
    block = text.split(f"## M = {m}:")[1].split("## M =")[0]
    series = []
    for line in block.splitlines():
        if not line.strip().startswith("main") or "7.62" not in line.split("|")[0]:
            continue
        head, tail = line.split("|")
        sigma = float(head.split()[2])
        ys = [float(v) for v in tail.split()]
        series.append((f"M = {m}, sigma {sigma:g} m", list(range(1, len(ys) + 1)), ys))
    return series


def grab(fname, pattern):
    m = re.search(pattern, (EXP / fname).read_text())
    if not m:
        raise SystemExit(f"pattern not found in {fname}: {pattern}")
    return float(m.group(1))


RULES = [("blind plan (no offsets)", "exact_rules_results.txt", "blind"),
         ("band sort of the blind plan", "exact_rules_results.txt", "sort"),
         ("greedy insertion", "exact_rules_results.txt", "goff"),
         ("band sort + one descent", "exact_rules_results.txt", "sdesc"),
         ("greedy insertion + one descent", "exact_rules_results.txt", "gdesc"),
         ("1 random start per spacing", "exact_rules_results.txt", "rand_1"),
         ("leak budget, 1 spacing x 50 starts", "budget_cv_results.txt", "B(LOLO)"),
         ("leak budget, 3 spacings x 50 starts", "budget_cv_results.txt", "N(LOLO)"),
         ("10 random starts per spacing", "exact_rules_results.txt", "rand_10"),
         ("50 random starts per spacing", "exact_rules_results.txt", "rand_50")]


def rule_median(fname, key, m, s):
    """Median ratio to the aware plan for one rule and cell, from the block of exact_rules or budget_cv."""
    text = (EXP / fname).read_text()
    if fname.startswith("exact_rules"):
        block = text.split(f"## M = {m} ")[1].split("## M =")[0]
        block = block.split(f"  s = {s} (")[1].split("  s = ")[0]
    else:
        block = text.split(f"## M = {m}, s = {s}.0 ")[1].split("## M =")[0]
    m_ = re.search(r"^\s*" + re.escape(key) + r"\s+(?:median\s+)?([\d.]+)", block, re.M)
    if not m_:
        raise SystemExit(f"{key} not found for M = {m}, s = {s} in {fname}")
    return float(m_.group(1))


def main():
    OUT.mkdir(exist_ok=True)
    series = [s for s in band_curves(12)] + [s for s in band_curves(16) if "sigma 1 m" in s[0]]
    write_lines(OUT, "figA1_band_count.svg",
                "Losses of separation against band count under 400 ft (Z = 25 ft)",
                "Median losses of separation per hour, relative to one band with exact altitude, against the number of "
                "two-level bands at their widest spacing, for per-drone altitude error sd 0.5 to 3 m",
                "bands of two levels (k), spacing 120/(2k-1) m", "median F / F_1 (24 layouts)",
                series, hline=1.0, xticks=list(range(1, 17)))
    cats = ["FTE (PX4 controller, 17 flights)", "pressure part of a pair gap (11al, deliv)",
            "baro - RTK, 5 s mean (7 flights)", "baro - RTK raw (7 flights)",
            "baro - GNSS (17 flights)", "take-off zero drift, 30 min (one drone)",
            "stale airport setting (S1, JFK)", "setting from 18.5 km away (S2, JFK->LGA)"]
    vals = [grab("px4_height_stats_results.txt", r"sigma_fleet = sqrt\(mean RMS\^2\) = ([\d.]+) m"),
            grab("drift_share_stats_results.txt", r"dwell 0 min, M = 12[\s\S]*?pair pressure sd: median ([\d.]+)"),
            grab("rtk_baro_posthoc_results.txt", r"enroute[\s\S]*?s5 .*sqrt\(mean sq\) ([\d.]+)"),
            grab("rtk_baro_posthoc_results.txt", r"enroute[\s\S]*?raw .*sqrt\(mean sq\) ([\d.]+)"),
            grab("px4_height_posthoc_results.txt", r"baro - GNSS detrended RMS .*sqrt\(mean sq\) ([\d.]+)"),
            grab("pressure_stats_results.txt", r"T 30 min  JFK .*?sd +([\d.]+)"),
            grab("pressure_ref_results.txt", r"S1_JFK: sd ([\d.]+) m"),
            grab("pressure_ref_results.txt", r"S2_JFK_LGA: sd ([\d.]+) m")]
    write_bars(OUT, "figA2_error_ladder.svg", "Sourced altitude-error terms (sd or RMS, m)",
               "Each sourced vertical error term of milestones 11ak to 11an, in metres", "metres",
               cats, [("sd / RMS (m)", vals)], ref=1.0, fmt="{:.2f}")
    series = [(f"16 operators, s = {s}", [round(100 * (rule_median(f, k, 16, s) - 1), 2) for _, f, k in RULES]) for s in (1, 2)]
    write_bars(OUT, "figA3_rule_costs.svg", "Cheap planners against the offset-aware search (16 operators)",
               "Median extra cost of each cheap planning rule over the offset-aware search, in per cent, at the "
               "measured speed offset (s = 1) and twice it (s = 2)", "median extra cost over the aware search, % (96 layout-draws)",
               [r[0] for r in RULES], series, fmt="{:.2f}")


if __name__ == "__main__":
    main()
