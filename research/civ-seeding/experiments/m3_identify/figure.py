"""Write confusion.svg: which model family each selection rule picks, by the model that made the
synthetic villages. Parsed from results.txt (never retyped). Stdlib only.

python3 experiments/m3_identify/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
NAMES = {"I": "information", "T": "threshold", "R": "reinforcement"}
PANELS = [("in-sample", "bcdj5", "In sample, BCDJ five moments"),
          ("leave-one-village-out", "ext8", "Leave one village out, eight moments")]


def matrix(text, rule, sn):
    blk = text.split(f"## confusion, rule {rule}, moments {sn}")[1]
    rows = {}
    for a in "ITR":
        m = re.search(rf"^  {a}: I ([\d.]+)  T ([\d.]+)  R ([\d.]+)", blk, re.M)
        rows[a] = [float(x) for x in m.groups()]
    return rows


def main():
    text = (HERE / "results.txt").read_text()
    cell, left, top, gap = 64, 120, 70, 70
    W = left + 2 * 3 * cell + gap + 30
    H = top + 3 * cell + 60
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
           'font-family="system-ui, sans-serif" font-size="12" role="img" '
           'aria-labelledby="t d">',
           '<title id="t">Which model the estimation picks, by the model that made the data</title>',
           '<desc id="d">Two 3 by 3 confusion matrices over 200 synthetic datasets per model on the 43 '
           'real village networks. In sample with the BCDJ moments, reinforcement is chosen for most '
           'datasets whatever made them. Leaving one village out, recovery is 58.5% for information, '
           '82% for threshold and 55.5% for reinforcement data.</desc>',
           f'<rect width="{W}" height="{H}" fill="#ffffff"/>']
    for pi, (rule, sn, title) in enumerate(PANELS):
        x0 = left + pi * (3 * cell + gap)
        out.append(f'<text x="{x0 + 1.5 * cell}" y="22" text-anchor="middle" font-weight="600">{title}</text>')
        out.append(f'<text x="{x0 + 1.5 * cell}" y="40" text-anchor="middle" fill="#555">family chosen</text>')
        M = matrix(text, rule, sn)
        for j, f in enumerate("ITR"):
            out.append(f'<text x="{x0 + j * cell + cell / 2}" y="{top - 8}" text-anchor="middle">{NAMES[f][:6]}.</text>')
        for i, a in enumerate("ITR"):
            if pi == 0:
                out.append(f'<text x="{left - 8}" y="{top + i * cell + cell / 2 + 4}" text-anchor="end">{NAMES[a]}</text>')
            for j, x in enumerate(M[a]):
                shade = int(255 - 200 * x)
                fill = f"rgb({shade},{shade + int(25 * x)},255)"
                out.append(f'<rect x="{x0 + j * cell}" y="{top + i * cell}" width="{cell - 2}" '
                           f'height="{cell - 2}" fill="{fill}" stroke="{"#000" if i == j else "none"}"/>')
                col = "#fff" if x > 0.55 else "#111"
                out.append(f'<text x="{x0 + j * cell + cell / 2 - 1}" y="{top + i * cell + cell / 2 + 4}" '
                           f'text-anchor="middle" fill="{col}">{x:.2f}</text>')
    out.append(f'<text x="12" y="{top + 1.5 * cell}" transform="rotate(-90 12 {top + 1.5 * cell})" '
               'text-anchor="middle" fill="#555">model that made the data</text>')
    out.append(f'<text x="{W / 2}" y="{H - 18}" text-anchor="middle" fill="#555">share of 200 synthetic '
               'datasets per row; outlined cells are correct picks</text>')
    out.append("</svg>")
    (HERE / "confusion.svg").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
