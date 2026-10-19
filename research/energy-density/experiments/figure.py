"""Draw experiments/ceilings.svg from section G of results.txt: a log-scale bar chart.

    python experiments/figure.py

A bar chart, so it does not use research/_shared/linefig.py (line plots only). Numbers are
parsed from the committed results.txt, never retyped. Stdlib only.
"""
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLOUR = {"electrochemical": "#1f6fb2", "fuel": "#6741d9", "mechanical": "#2e8b57",
          "heat": "#c0392b", "exergy": "#e8890c"}
NAME = {"electrochemical": "electrochemical (reactant mass)", "fuel": "fuel alone",
        "mechanical": "mechanical", "heat": "heat", "exergy": "heat as electricity (exergy)"}


def rows():
    lines = (HERE / "results.txt").read_text().splitlines()
    start = next(i for i, l in enumerate(lines) if l.startswith("G. "))
    out = []
    for l in lines[start + 1:]:
        if not l.strip():
            break
        label, value, kind = l[:32].strip(), float(l[32:44]), l[44:].strip()
        out.append((label, value, kind))
    return out


def main():
    data = rows()
    left, top, bar, gap, width = 230, 40, 16, 6, 470
    lo, hi = -1, 5  # log10 Wh/kg axis
    h = top + len(data) * (bar + gap) + 70
    W = left + width + 30

    def x(v):
        return left + (math.log10(v) - lo) / (hi - lo) * width

    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {h}" width="{W}" height="{h}" '
         'font-family="system-ui, sans-serif" font-size="12">',
         f'<rect width="{W}" height="{h}" fill="#ffffff"/>',
         f'<text x="{left}" y="22" font-size="14" font-weight="600" fill="#222">'
         'Theoretical ceiling, Wh per kg of active material (log scale)</text>']
    for p in range(lo, hi + 1):
        xp = x(10 ** p)
        s.append(f'<line x1="{xp:.1f}" y1="{top - 6}" x2="{xp:.1f}" y2="{top + len(data) * (bar + gap)}" stroke="#ddd"/>')
        s.append(f'<text x="{xp:.1f}" y="{top + len(data) * (bar + gap) + 16}" text-anchor="middle" fill="#444">'
                 f'{10 ** p:g}</text>')
    for i, (label, v, kind) in enumerate(data):
        y = top + i * (bar + gap)
        s.append(f'<text x="{left - 8}" y="{y + bar - 4}" text-anchor="end" fill="#222">{label}</text>')
        s.append(f'<rect x="{left}" y="{y}" width="{x(v) - left:.1f}" height="{bar}" fill="{COLOUR[kind]}"/>')
        s.append(f'<text x="{x(v) + 4:.1f}" y="{y + bar - 4}" fill="#222">{v:,.0f}</text>' if v >= 10 else
                 f'<text x="{x(v) + 4:.1f}" y="{y + bar - 4}" fill="#222">{v:.2f}</text>')
    ly = top + len(data) * (bar + gap) + 36
    lx = 20
    for kind in ["electrochemical", "fuel", "mechanical", "heat", "exergy"]:
        s.append(f'<rect x="{lx}" y="{ly - 10}" width="12" height="12" fill="{COLOUR[kind]}"/>')
        s.append(f'<text x="{lx + 16}" y="{ly}" fill="#222">{NAME[kind]}</text>')
        lx += 16 + 7 * len(NAME[kind]) + 14
        if lx > W - 150:
            lx, ly = 20, ly + 18
    s.append("</svg>")
    (HERE / "ceilings.svg").write_text("\n".join(s) + "\n")


if __name__ == "__main__":
    main()
