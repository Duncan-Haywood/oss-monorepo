"""Reach against cost for every repair of the shipped rule's conditional undercoverage (milestones 7at to 7bd).

No new draws. This reads the seven committed summary files those milestones wrote and puts their
candidates on one scale, so Section 6.1 of the paper can state the negative result from a single
table instead of seven paragraphs:

- gain kept: the candidate's summed width gain over pooled (all cells of its milestone) divided by
  the same milestone's t10 gain (t10 = the rule before any repair, replayed in every milestone);
- failing cells: how many cells have 30 or more admitted (cells-design) draws covering under 88%,
  the per-cell defect every milestone counted; t10's count in the same milestone is the baseline.

The cell sets differ between milestones (87 cells in 7at, growing to 157 in 7bb to 7bd), so ratios
are comparable across milestones and raw counts are not. Every number printed comes from a regex
over a committed summary file; nothing is retyped. Stdlib only.

    python3 experiments/validity_frontier.py   # writes validity_frontier.txt and validity_frontier.svg
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent

# (milestone, summary file, family, candidates). Family names follow paper Section 6.1.
SOURCES = [
    ("7at", "h7at_weak_admit.txt", "admission test on J_hat", ["t20", "t30", "l10", "l16"]),
    ("7au", "h7au_neg_floor.txt", "uniform variance floor", ["n2", "b2", "wu1", "n4"]),
    ("7ay", "h7ay_cond_floor.txt", "pilot-triggered floor", ["p5n2", "p5n4", "p8n2", "a8n2"]),
    ("7az", "h7az_joint_trigger.txt", "pilot-triggered floor", ["p5j40", "p5j50", "p5j60"]),
    ("7bb", "h7bb_second_phase.txt", "second-phase check", ["v2", "tp10", "tp25", "tp1"]),
    ("7bc", "h7bc_reserved_check.txt", "reserved second phase", ["rs10", "rs10v2", "rs20v2", "rs10tp"]),
    ("7bd", "h7bd_tested_check.txt", "tested check on the reserve", ["rs10q10", "rs10q25", "rs10q10tp", "rs10q25tp"]),
]
FAMILIES = ["admission test on J_hat", "uniform variance floor", "pilot-triggered floor",
            "second-phase check", "reserved second phase", "tested check on the reserve"]
SHIPPED = ("7az", "p5j40")  # the one candidate that passed its decision rule; now the library default
GAIN_BAR = 0.90  # every decision rule from 7at on required 90%+ of the reference gain

LINE = re.compile(r"^(?P<rule>[a-z0-9]+): gain all (?P<gain>-?[0-9.]+) .*?"
                  r"admitted >= 30 under 88%: \[(?P<fail>[^\]]*)\]", re.M)
CELL = re.compile(r"\(\('(?P<name>[^']+)', (?P<n>\d+)\), (?P<m>\d+), (?P<cov>[0-9.]+)\)")
CELLS_RUN = re.compile(r"^cells run: (\d+)", re.M)


def read(milestone, fname):
    text = (HERE / fname).read_text()
    rules = {}
    for m in LINE.finditer(text):
        fails = [(c["name"], int(c["n"]), int(c["m"]), float(c["cov"])) for c in CELL.finditer(m["fail"])]
        rules[m["rule"]] = (float(m["gain"]), fails)
    ncells = int(CELLS_RUN.search(text).group(1))
    return ncells, rules


def rows():
    out = []
    for milestone, fname, family, cands in SOURCES:
        ncells, rules = read(milestone, fname)
        g0, f0 = rules["t10"]
        for c in cands:
            g, f = rules[c]
            out.append(dict(milestone=milestone, family=family, rule=c, cells=ncells,
                            gain=g, gain_ref=g0, kept=g / g0, fail=len(f), fail_ref=len(f0),
                            reach=1 - len(f) / len(f0), fails=f))
    return out


def svg(rs, path):
    W, H, L, R, T, B = 720, 450, 70, 200, 42, 60
    x0, x1 = -0.6, 1.05  # gain kept; points below x0 are drawn at the edge with their value
    y0, y1 = -0.2, 1.0  # share of t10's failing cells repaired (1 = all)
    sx = lambda v: L + (min(max(v, x0), x1) - x0) / (x1 - x0) * (W - L - R)
    sy = lambda v: H - B - (min(max(v, y0), y1) - y0) / (y1 - y0) * (H - T - B)
    cols = ["#c0392b", "#1f6fb2", "#2e8b57", "#8e44ad", "#d68910", "#17a2b8"]
    shapes = []
    a = shapes.append
    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
      'font-family="sans-serif" font-size="11">')
    a(f'<rect width="{W}" height="{H}" fill="#ffffff"/>')
    # acceptable region: gain kept >= 90% (every decision rule's bar), shaded
    a(f'<rect x="{sx(GAIN_BAR):.1f}" y="{T}" width="{sx(x1) - sx(GAIN_BAR):.1f}" height="{H - T - B}" '
      'fill="#2e8b57" fill-opacity="0.10"/>')
    a(f'<text x="{sx(GAIN_BAR) + 3:.1f}" y="{T + 12}" fill="#2e8b57">gain bar</text>')
    for v in [-0.5, 0, 0.25, 0.5, 0.75, 1.0]:
        a(f'<line x1="{sx(v):.1f}" y1="{T}" x2="{sx(v):.1f}" y2="{H - B}" stroke="#ddd"/>')
        a(f'<text x="{sx(v):.1f}" y="{H - B + 15}" text-anchor="middle">{v:.2f}</text>')
    for v in [-0.2, 0, 0.25, 0.5, 0.75, 1.0]:
        a(f'<line x1="{L}" y1="{sy(v):.1f}" x2="{W - R}" y2="{sy(v):.1f}" stroke="#ddd"/>')
        a(f'<text x="{L - 6}" y="{sy(v) + 4:.1f}" text-anchor="end">{v:.2f}</text>')
    a(f'<rect x="{L}" y="{T}" width="{W - L - R}" height="{H - T - B}" fill="none" stroke="#444"/>')
    a(f'<text x="{(L + W - R) / 2:.0f}" y="{H - 18}" text-anchor="middle">share of the unrepaired rule\'s '
      'width gain kept (all cells of the milestone)</text>')
    a(f'<text transform="translate(16 {(T + H - B) / 2:.0f}) rotate(-90)" text-anchor="middle">'
      'share of failing cells repaired</text>')
    a(f'<text x="{L}" y="{T - 10}" font-weight="bold">Six repair families for conditional undercoverage '
      '(7at to 7bd): none reaches the top right</text>')
    labels = {}  # points within a few px share one label, so coincident candidates stay readable
    for r in rs:
        k = FAMILIES.index(r["family"])
        x, y = sx(r["kept"]), sy(r["reach"])
        star = (r["milestone"], r["rule"]) == SHIPPED
        if star:
            a(f'<rect x="{x - 5:.1f}" y="{y - 5:.1f}" width="10" height="10" fill="{cols[k]}" stroke="#000"/>')
        else:
            a(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="{cols[k]}" fill-opacity="0.85"/>')
        label = r["rule"] + (f" ({r['kept']:.1f})" if r["kept"] < x0 else "")
        key = next((q for q in labels if abs(q[0] - x) < 8 and abs(q[1] - y) < 8), (x, y))
        labels.setdefault(key, []).append(label)
    for (x, y), names in labels.items():
        a(f'<text x="{x + 6:.1f}" y="{y - 5:.1f}" font-size="9" fill="#333">{", ".join(names)}</text>')
    for k, fam in enumerate(FAMILIES):
        y = T + 10 + 18 * k
        a(f'<circle cx="{W - R + 16}" cy="{y}" r="4.5" fill="{cols[k]}"/>')
        a(f'<text x="{W - R + 26}" y="{y + 4}">{fam}</text>')
    y = T + 10 + 18 * len(FAMILIES)
    a(f'<rect x="{W - R + 11}" y="{y - 5}" width="10" height="10" fill="#fff" stroke="#000"/>')
    a(f'<text x="{W - R + 26}" y="{y + 4}">shipped default (7az)</text>')
    a(f'<text x="{W - R + 11}" y="{y + 22}" font-size="9">points left of {x0} are drawn</text>')
    a(f'<text x="{W - R + 11}" y="{y + 34}" font-size="9">at the edge, value in brackets</text>')
    a("</svg>")
    path.write_text("\n".join(shapes) + "\n")


def main():
    rs = rows()
    lines = ["# Reach against cost, milestones 7at to 7bd (no new draws; parsed from the committed summaries)",
             "# kept = candidate gain / t10 gain in the same milestone; fail = cells with 30+ admitted draws under 88%",
             "# reach = 1 - fail / t10 fail; qualifies-on-cost = kept >= 0.90 (the bar every decision rule used)",
             "milestone family rule cells gain t10_gain kept fail t10_fail reach"]
    for r in rs:
        lines.append(f"{r['milestone']} {r['family'].replace(' ', '_')} {r['rule']} {r['cells']} {r['gain']:.3f} "
                     f"{r['gain_ref']:.3f} {r['kept']:.3f} {r['fail']} {r['fail_ref']} {r['reach']:.3f}")
    lines.append("")
    lines.append("# best reach among candidates keeping 90%+ of the gain, per family")
    for fam in FAMILIES:
        ok = [r for r in rs if r["family"] == fam and r["kept"] >= GAIN_BAR]
        best = max(ok, key=lambda r: (r["reach"], r["kept"]), default=None)
        top = max((r for r in rs if r["family"] == fam), key=lambda r: (r["reach"], r["kept"]))
        lines.append(f"{fam.replace(' ', '_')}: cheap best "
                     + (f"{best['milestone']} {best['rule']} reach {best['reach']:.3f} kept {best['kept']:.3f}"
                        if best else "none keeps 90%")
                     + f"; widest reach {top['milestone']} {top['rule']} reach {top['reach']:.3f} kept {top['kept']:.3f}")
    both = [r for r in rs if r["kept"] >= GAIN_BAR and r["reach"] >= 0.5]
    lines.append(f"candidates keeping 90%+ of the gain AND repairing half or more of the failing cells: "
                 f"{len(both)} of {len(rs)}" + (": " + ", ".join(f"{r['milestone']} {r['rule']}" for r in both) if both else ""))
    # cells still failing under the shipped default, at the largest cell set (7bd)
    _, rules = read("7bd", "h7bd_tested_check.txt")
    left = rules["p5j40"][1]
    lines.append(f"cells failing under the shipped default in 7bd's 157: {len(left)}: "
                 + "; ".join(f"{n} n {k} ({m} admitted, {c}%)" for n, k, m, c in left))
    # how often each of those cells is repaired by any of the 7bb to 7bd candidates
    cands = [c for ms, _, _, cs in SOURCES if ms in ("7bb", "7bc", "7bd") for c in cs]
    files = {ms: read(ms, f)[1] for ms, f, _, _ in SOURCES if ms in ("7bb", "7bc", "7bd")}
    for n, k, m, c in left:
        fixed = []
        for ms, _, _, cs in SOURCES:
            if ms not in files:
                continue
            for cand in cs:
                if not any(x[0] == n and x[1] == k for x in files[ms][cand][1]):
                    fixed.append(f"{cand} ({files[ms][cand][0] / files[ms]['t10'][0]:.2f})")
        lines.append(f"  {n} n {k}: out of the failing list under {len(fixed)} of {len(cands)} second-phase candidates"
                     + (": " + ", ".join(fixed) if fixed else ""))
    (HERE / "validity_frontier.txt").write_text("\n".join(lines) + "\n")
    svg(rs, HERE / "validity_frontier.svg")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
