"""Milestone 6zzq: the history-length design table for the paper (section 2.7).

No new simulation. This script reads the summary rows that milestones 6zzi, 6zzj, 6zzk and
6zzp already wrote ("mean [min, max]" over every choice of learning years) and lays them out as
one table a designer can read: for each amount of the boat's own log (one year, two years, k
years) and each correction rule, the mean, worst and best 168-cell dominance count over the
years drawn, set against no correction (AT_90). Every number is parsed from the results files
named below; nothing is recomputed, so the table cannot drift from the runs it reports.

Columns: all168 = 30 points x 20 swept shapes + real shape, 168 (half x pack x shape) cells;
hi168 = the nine high-amplitude points (6zz A_hat > 0.03). A cell is won when the rule goes at
least as far as the 7-day trailing-mean rule B with no more excess dark hours (6zv to 6zzp).

Run from the project directory: python3 experiments/history_length_table.py
It writes experiments/results_history_length_table.txt.
"""

import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))

# (history label, results file, milestone, rule names to keep, number of draws)
SOURCES = [
    ("1 year", "results_single_year_rules.txt", "6zzj", ["LC", "LHF", "LAP", "LB", "HR", "HX"], 5),
    ("1 year", "results_dark_summer_guard.txt", "6zzp", ["DG", "DH", "SZ", "TE"], 5),
    ("2 years", "results_pair_year_rules.txt", "6zzk", ["LC", "LHF", "LAP", "LB", "HR", "HX"], 10),
]
SUBSETS = ("results_subset_years.txt", "6zzi")  # LC by k = 1..5

ROW = re.compile(r"^\s*([A-Z]+)\s*\|\s*([\d.]+)\s*\[\s*(\d+),\s*(\d+)\]")
KROW = re.compile(r"^\s*k=(\d)\s*\(\s*(\d+) sets\)\s*\|(.*)$")
TRIPLE = re.compile(r"([\d.]+)\s*\[\s*(\d+),\s*(\d+)\]")
AT90 = re.compile(r"AT_90 \(no correction\): all168 (\d+), real8 \d+, hi168 (\d+)")


def _read(name):
    with open(os.path.join(HERE, name)) as f:
        return f.read().splitlines()


def parse_rule_rows(lines):
    """Rows 'RULE | mean [min, max] | ...' after the 'Per rule over' header.

    Returns {rule: [(mean, min, max), ...]} in column order.
    """
    out = {}
    started = False
    for line in lines:
        if line.startswith("Per rule over"):
            started = True
            continue
        if started:
            if not line.strip():
                break
            if ROW.match(line):
                rule = line.split("|")[0].strip()
                out[rule] = [(float(a), int(b), int(c)) for a, b, c in TRIPLE.findall(line)]
    return out


def parse_subsets(lines):
    out = {}
    for line in lines:
        m = KROW.match(line)
        if m:
            out[int(m.group(1))] = (int(m.group(2)), [(float(a), int(b), int(c)) for a, b, c in TRIPLE.findall(m.group(3))])
    return out


def at90():
    for line in _read("results_single_year_rules.txt"):
        m = AT90.search(line)
        if m:
            return int(m.group(1)), int(m.group(2))
    raise ValueError("AT_90 reference row not found")


# Every 'Per rule over' block starts all168, real8, hi168 (then hireal8 and/or pp240).
COL_ALL, COL_HI = 0, 2


def build():
    a_all, a_hi = at90()
    rows = []
    for hist, name, ms, keep, n in SOURCES:
        parsed = parse_rule_rows(_read(name))
        for rule in keep:
            vals = parsed[rule]
            rows.append((hist, n, rule, ms, vals[COL_ALL], vals[COL_HI]))
    sub = parse_subsets(_read(SUBSETS[0]))
    krows = []
    for k in sorted(sub):
        n, vals = sub[k]
        krows.append((k, n, vals[0], vals[2]))
    return (a_all, a_hi), rows, krows


def verdict(stat, ref):
    mean, lo, hi = stat
    if lo >= ref:
        return "never below"
    if mean >= ref:
        return "above on mean"
    return "below on mean"


def render():
    (a_all, a_hi), rows, krows = build()
    out = []
    out.append("Milestone 6zzq: history-length design table (no new runs; parsed from 6zzi, 6zzj, 6zzk, 6zzp)")
    out.append(f"No correction AT_90: all168 {a_all}, hi168 {a_hi} (of 168)")
    out.append("")
    out.append("A. Raw month ratios LC by years of log k, mean [worst, best] over every subset of the five learning years")
    out.append("  k  draws |  all168              vs AT_90       |  hi168               vs AT_90")
    for k, n, s_all, s_hi in krows:
        out.append(
            f"  {k}  {n:5d} | {s_all[0]:6.1f} [{s_all[1]:3d},{s_all[2]:3d}]  {verdict(s_all, a_all):14s} |"
            f" {s_hi[0]:6.1f} [{s_hi[1]:3d},{s_hi[2]:3d}]  {verdict(s_hi, a_hi)}"
        )
    out.append("")
    out.append("B. One and two years by rule, mean [worst, best] over the years drawn")
    out.append("  history  draws rule ms   |  all168              vs AT_90       |  hi168               vs AT_90")
    for hist, n, rule, ms, s_all, s_hi in rows:
        out.append(
            f"  {hist:8s} {n:5d} {rule:4s} {ms:4s} | {s_all[0]:6.1f} [{s_all[1]:3d},{s_all[2]:3d}]  {verdict(s_all, a_all):14s} |"
            f" {s_hi[0]:6.1f} [{s_hi[1]:3d},{s_hi[2]:3d}]  {verdict(s_hi, a_hi)}"
        )
    out.append("")
    # Summary lines the paper section quotes
    never_all = [f"{h}/{r}" for h, _, r, _, s, _ in rows if s[1] >= a_all]
    never_hi = [f"{h}/{r}" for h, _, r, _, _, s in rows if s[1] >= a_hi]
    out.append("Never below no correction over all draws, all168: " + (", ".join(never_all) or "none"))
    out.append("Never below no correction over all draws, hi168: " + (", ".join(never_hi) or "none"))
    both = [f"{h}/{r}" for h, _, r, _, s, t in rows if s[1] >= a_all and t[1] >= a_hi]
    both += [f"LC k={k}" for k, _, s, t in krows if s[1] >= a_all and t[1] >= a_hi]
    out.append("Never below on both pools: " + (", ".join(both) or "none"))
    best_one = max((r for r in rows if r[0] == "1 year"), key=lambda r: r[4][0])
    out.append(f"Best one-year mean all168: {best_one[2]} ({best_one[3]}) {best_one[4][0]:.1f}")
    best_hi = max((r for r in rows if r[0] == "1 year"), key=lambda r: r[5][0])
    out.append(f"Best one-year mean hi168: {best_hi[2]} ({best_hi[3]}) {best_hi[5][0]:.1f}")
    widths = {f"{h}/{r}": (s[2] - s[1], t[2] - t[1]) for h, _, r, _, s, t in rows}
    out.append("Spans (best - worst) all168 / hi168: " + ", ".join(f"{k} {a}/{b}" for k, (a, b) in widths.items()))
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    text = render()
    with open(os.path.join(HERE, "results_history_length_table.txt"), "w") as f:
        f.write(text)
    print(text, end="")
