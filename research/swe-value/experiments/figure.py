"""Write experiments/agreement.svg: how many projects each pair of scores (pass A, pass B) put in each cell, from scores.csv.

    python experiments/figure.py
"""
import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main():
    cells = {(a, b): 0 for a in (1, 2, 3) for b in (1, 2, 3)}
    with open(HERE / "scores.csv", newline="") as fh:
        for r in csv.DictReader(fh):
            cells[(int(r["pass_A"]), int(r["pass_B"]))] += 1
    n = sum(cells.values())
    agree = sum(cells[(k, k)] for k in (1, 2, 3))
    W, H, L, T, S = 520, 440, 110, 90, 90
    f = 'font-family="sans-serif"'
    top = max(cells.values())
    alt = ("Heat map of 3 by 3 agreement between two automated value scores for %d research projects; "
           "pass A rows, pass B columns: " % n
           + "; ".join(f"A={a},B={b}: {cells[(a, b)]}" for a in (1, 2, 3) for b in (1, 2, 3))
           + f". {agree} of {n} projects get the same score from both.")
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Two value scores, {n} projects: {agree} get the same score ({agree/n:.0%})</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">Diagonal = agreement. Stylised proxies; no human rater.</text>',
         f'<text x="{L+1.5*S}" y="{T-22}" text-anchor="middle" {f} font-size="12">Pass B (README text): score</text>',
         f'<text x="{L-62}" y="{T+1.5*S}" text-anchor="middle" {f} font-size="12" transform="rotate(-90 {L-62} {T+1.5*S})">Pass A (names and order): score</text>']
    for k in range(3):
        o.append(f'<text x="{L+k*S+S/2}" y="{T-6}" text-anchor="middle" {f} font-size="12">{k+1}</text>')
        o.append(f'<text x="{L-8}" y="{T+k*S+S/2+4}" text-anchor="end" {f} font-size="12">{k+1}</text>')
    for a in (1, 2, 3):
        for b in (1, 2, 3):
            v = cells[(a, b)]
            t = v / top
            col = "#%02x%02x%02x" % (int(235 - 193 * t), int(244 - 133 * t), int(250 - 105 * t))
            x, y = L + (b - 1) * S, T + (a - 1) * S
            stroke = "#222" if a == b else "#fff"
            o.append(f'<rect x="{x}" y="{y}" width="{S}" height="{S}" fill="{col}" stroke="{stroke}" stroke-width="{2 if a == b else 1}"/>')
            o.append(f'<text x="{x+S/2}" y="{y+S/2+6}" text-anchor="middle" {f} font-size="20" fill="{"#fff" if t > 0.55 else "#111"}">{v}</text>')
    o.append("</svg>")
    (HERE / "agreement.svg").write_text("\n".join(o) + "\n")
    print("wrote agreement.svg")


main()
