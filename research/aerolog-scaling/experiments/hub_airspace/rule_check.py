"""Milestone 11ap post hoc: does the paper's planning rule (h - Z >= 3 sigma_gap, `paper/airspace_layers.md` 4.3)
predict the band count 11ao's search chose once the gap error carries an operator-specific speed offset?

Written after 11ao's results were read (post hoc, no prediction). The rule was fitted in 11ai on independent
per-drone Gaussian noise, and discussion point 5 of the paper says a Gaussian at the measured sd is enough for
planning. 11ao's offset is neither independent per drone nor Gaussian: it is one of 5 (or 12) values per operator,
and the planner chooses which operators sit in neighbouring levels.

For each offset set and scale s this prints:
  * sigma_gap = sqrt(sigma_pair^2 + sd(b_i - b_j)^2), sigma_pair = sqrt(0.912^2 + 0.543^2) m: the median pair sd of
    11an's --rtk5 noise (rtk_baro_s5_results.txt) and the median pair pressure sd of 11al (drift_share_stats_results.txt);
    sd(b_i - b_j) over the equally likely pairs of draws (same flight included, difference 0);
  * the rule's band count: the most k with 120 / (2k - 1) - Z >= 3 sigma_gap;
  * the probability that a pair one level apart loses separation, P(|h + e| < Z), averaged over the offset pairs
    (e = offset difference + N(0, sigma_pair^2)) and under a Gaussian with the same sd, at each band count's widest
    spacing;
  * the search's median h* (aware planner) from speed_offset_results.txt and speed_offset_all12_results.txt.

    python3 rule_check.py > rule_check_results.txt
"""
import itertools
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

Z = 7.62
H = 120.0
SIGMA_PAIR = math.hypot(0.912, 0.543)
SCALES = (0.25, 0.5, 1.0, 2.0)
BANDS = (6, 5, 4, 3, 2)


def spacing(k):
    return H / (2 * k - 1)


def phi(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def p_leak(mu, sd, h):
    """P(|h + e| < Z) for e ~ N(mu, sd^2)."""
    return phi((Z - h - mu) / sd) - phi((-Z - h - mu) / sd)


def pair_diffs(c10, s):
    return [s * (a - b) for a, b in itertools.product(c10, c10)]


def sigma_gap(c10, s, sigma_pair=SIGMA_PAIR):
    d = pair_diffs(c10, s)
    sdd = math.sqrt(sum(x * x for x in d) / len(d))
    return math.hypot(sigma_pair, sdd), sdd


def rule_bands(sg, z=Z):
    """Most bands whose widest spacing clears Z by 3 sigma_gap (1 if none does)."""
    ok = [k for k in range(1, 20) if spacing(k) - z >= 3.0 * sg]
    return max(ok) if ok else 1


def p_mix(c10, s, h, sigma_pair=SIGMA_PAIR):
    """Leak probability one level apart, averaged over the offset pairs; the sign of the gap is symmetrised as in
    drift_share.p_overlap."""
    d = pair_diffs(c10, s)
    return sum(0.5 * (p_leak(x, sigma_pair, h) + p_leak(-x, sigma_pair, h)) for x in d) / len(d)


def searched(fname):
    """{(M, s): median h*_aware} from a speed_offset results file, or {} if it is absent."""
    path = os.path.join(HERE, fname)
    if not os.path.exists(path):
        return {}
    out, m = {}, None
    for line in open(path):
        g = re.match(r"## M = (\d+)", line)
        if g:
            m = int(g.group(1))
            continue
        g = re.match(r"\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+[0-9.]+\s+[0-9.]+\s+[0-9.]+", line)
        if g and m is not None:
            out[(m, float(g.group(1)))] = float(g.group(2))
    return out


def main():
    import numpy as np  # noqa: F401  (rtk_baro needs it)
    import rtk_baro as rb
    import speed_offset as so
    d = rb.load()
    print("# Milestone 11ap post hoc: the planning rule h - Z >= 3 sigma_gap against 11ao's search (rule_check.py's"
          " docstring). Z = %.2f m, H = %.0f m, sigma_pair = %.3f m" % (Z, H, SIGMA_PAIR))
    for name, all12, fname in (("5 en-route flights", False, "speed_offset_results.txt"),
                               ("all 12 flights", True, "speed_offset_all12_results.txt")):
        c10 = [float(x) for x in so.offsets_10(d, all12)]
        got = searched(fname)
        print("\n## offsets from %s (%d values, %.2f to %+.2f m at 10 m/s)" % (name, len(c10), min(c10), max(c10)))
        print("  s     sd_diff  sigma_gap  rule_h>=  rule_k  rule_h*   search_h* (M=12, M=16)")
        for s in SCALES:
            sg, sdd = sigma_gap(c10, s)
            k = rule_bands(sg)
            srch = ", ".join("%.2f" % got[(m, s)] if (m, s) in got else "-" for m in (12, 16))
            print("  %-5g %7.3f  %9.3f  %8.2f  %6d  %7.2f   %s" % (s, sdd, sg, Z + 3 * sg, k, spacing(k), srch))
        print("  leak probability one level apart, offset mixture / Gaussian at sigma_gap:")
        print("  s     " + "  ".join("k=%d (%.2f m)" % (k, spacing(k)) for k in BANDS))
        for s in SCALES:
            sg, _ = sigma_gap(c10, s)
            cells = []
            for k in BANDS:
                h = spacing(k)
                cells.append("%.4f/%.4f" % (p_mix(c10, s, h), p_leak(0.0, sg, h)))
            print("  %-5g " % s + "  ".join("%-14s" % c for c in cells))
        same = sum(1 for a, b in itertools.product(c10, c10) if abs(a - b) < 1e-12)
        near = sum(1 for a, b in itertools.product(c10, c10) if abs(a - b) <= 3.0)
        print("  pairs of draws: %d of %d share a flight; %d of %d differ by <= 3 m at s = 1"
              % (same, len(c10) ** 2, near, len(c10) ** 2))


if __name__ == "__main__":
    main()
