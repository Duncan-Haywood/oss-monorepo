"""Write experiments/max_frequency.svg from experiments/results.txt.

    python experiments/figure.py

Plots the highest first-mode frequency reachable within the holder limit against carriage mass,
for steel, aluminium and hardwood rods. Numbers are parsed from the committed run output, never
retyped: re-run run.py first if the experiment changes. Standard library only. Stylised model;
see the README for its limits.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
MATERIALS = [("steel", "#1f6fb2"), ("aluminium", "#c0392b"), ("hardwood", "#2e8b57")]


def parse(text):
    """Rows (mass kg, steel Hz, aluminium Hz, hardwood Hz)."""
    block = text.split("== highest first-mode frequency", 1)[1].split("==", 1)[0]
    rows = []
    for line in block.splitlines():
        m = re.match(r"\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*$", line)
        if m:
            rows.append(tuple(map(float, m.groups())))
    return rows


def svg(rows):
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 52
    x1, y1 = 1.0, 120.0

    def px(m):
        return L + m / x1 * (W - L - R)

    def py(v):
        return T + (y1 - v) / y1 * (H - T - B)

    f = 'font-family="sans-serif"'
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Highest first-mode frequency reachable within the holder limit against carriage mass: steel is highest, then aluminium, then hardwood, and all fall as the carriage gets heavier">',
           f'<rect width="{W}" height="{H}" fill="#fff"/>',
           f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Highest reachable first-mode frequency vs carriage mass (stylised)</text>']
    for t in range(0, 121, 20):
        out.append(f'<line x1="{L}" x2="{W-R}" y1="{py(t):.1f}" y2="{py(t):.1f}" stroke="#ddd"/>'
                   f'<text x="{L-6}" y="{py(t)+4:.1f}" text-anchor="end" {f} font-size="11">{t}</text>')
    for r in rows:
        out.append(f'<text x="{px(r[0]):.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{r[0]:g}</text>')
    out.append(f'<text x="{(L+W-R)/2}" y="{H-12}" text-anchor="middle" {f} font-size="12">carriage mass (kg)</text>')
    out.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {f} font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">first-mode frequency (Hz)</text>')
    for k, (name, col) in enumerate(MATERIALS):
        pts = " ".join(f"{px(r[0]):.1f},{py(r[k+1]):.1f}" for r in rows)
        out.append(f'<polyline fill="none" stroke="{col}" stroke-width="2" points="{pts}"/>')
        for r in rows:
            out.append(f'<circle cx="{px(r[0]):.1f}" cy="{py(r[k+1]):.1f}" r="3" fill="{col}"/>')
        ly = T + 34 + 16 * k
        out.append(f'<line x1="{W-200}" x2="{W-176}" y1="{ly}" y2="{ly}" stroke="{col}" stroke-width="2"/>'
                   f'<text x="{W-170}" y="{ly+4}" {f} font-size="11">{name}</text>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


def main():
    rows = parse((HERE / "results.txt").read_text())
    assert len(rows) >= 4, "frequency table not found in results.txt"
    (HERE / "max_frequency.svg").write_text(svg(rows))
    print("wrote max_frequency.svg from %d rows" % len(rows))


if __name__ == "__main__":
    main()
