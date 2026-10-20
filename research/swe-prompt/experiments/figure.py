"""Write experiments/type_one_error.svg: false-positive rate under no real effect, per rule, parsed from results.txt.

    python experiments/figure.py

The numbers are parsed from the committed results.txt, never retyped: re-run run.py first if the experiment changes.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLS = {"fixed": "#1f6fb2", "peek": "#c0392b", "msprt": "#2e8b57"}
NAMES = {"fixed": "fixed n (one look)", "peek": "peek after every pair", "msprt": "mixture SPRT"}


def parse():
    """{table letter: {rule: null reject rate}} from the rows whose effect is +0.00."""
    out, tab = {}, None
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"([AB])\. ", l)
        if m:
            tab = m.group(1); out[tab] = {}
        m = re.match(r"\s+\+0\.00\s+(fixed|peek|msprt)\s+([\d.]+) ", l)
        if m and tab:
            out[tab][m.group(1)] = float(m.group(2))
    return out


def main():
    d = parse()
    assert set(d) == {"A", "B"} and all(len(v) == 3 for v in d.values()), d
    W, H, L, R, T, B = 560, 340, 56, 16, 48, 60
    hi = 0.5
    py = lambda y: T + (1 - y / hi) * (H - T - B)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" '
         f'aria-label="False-positive rate of three stopping rules when the candidate brief is no different from the champion">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="14">False-positive rate when nothing changed (nominal 0.05)</text>']
    for v in (0, 0.1, 0.2, 0.3, 0.4, 0.5):
        o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(v):.1f}" y2="{py(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{py(v)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{v:g}</text>')
    o.append(f'<line x1="{L}" x2="{W-R}" y1="{py(0.05):.1f}" y2="{py(0.05):.1f}" stroke="#000" stroke-dasharray="4 3"/>')
    gw = (W - L - R) / 2; bw = gw * 0.25
    for i, (tab, lab) in enumerate((("A", "success rate (binary)"), ("B", "project value (1 to 3)"))):
        o.append(f'<text x="{L + (i + 0.5) * gw:.1f}" y="{H-B+18}" text-anchor="middle" font-family="sans-serif" font-size="12">{lab}</text>')
        for j, rule in enumerate(("fixed", "peek", "msprt")):
            x = L + i * gw + gw * 0.125 + j * bw
            v = d[tab][rule]
            o.append(f'<rect x="{x:.1f}" y="{py(v):.1f}" width="{bw-3:.1f}" height="{py(0)-py(v):.1f}" fill="{COLS[rule]}"/>'
                     f'<text x="{x + (bw-3)/2:.1f}" y="{py(v)-4:.1f}" text-anchor="middle" font-family="sans-serif" font-size="11">{v:.3f}</text>')
    for j, rule in enumerate(("fixed", "peek", "msprt")):
        x = L + j * 170
        o.append(f'<rect x="{x}" y="{H-24}" width="12" height="10" fill="{COLS[rule]}"/>'
                 f'<text x="{x+16}" y="{H-15}" font-family="sans-serif" font-size="11">{NAMES[rule]}</text>')
    o.append("</svg>")
    (HERE / "type_one_error.svg").write_text("\n".join(o) + "\n")
    print("wrote", HERE / "type_one_error.svg")


if __name__ == "__main__":
    main()
