"""Write experiments/closure_by_shop.svg from experiments/results.txt (bearing variant lm8uu).

    python experiments/figure.py

Bars are the cost-closure median, with the 5-95% range from the assumed-price Monte Carlo.
The numbers are parsed from the committed run output, never retyped. Standard library only.
Mass and cost inputs are assumptions (see the README), so this is a stylised estimate.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def parse(text):
    """Rows (shop, cost median, cost lo, cost hi) in percent for the lm8uu variant."""
    block = text.split("== bearing variant: lm8uu", 1)[1].split("== bearing variant", 1)[0]
    rows = []
    for line in block.splitlines():
        m = re.match(r"(printer\S*)\s+[\d.]+%\s+[\d.]+%\s+[\d.]+%\s+\[[^\]]*\]%\s+([\d.]+)%\s+\[(\d+)-(\d+)-(\d+)\]%", line)
        if m:
            rows.append((m.group(1), float(m.group(2)), float(m.group(3)), float(m.group(5))))
    return rows


def svg(rows):
    W, H, L, R, T, B = 640, 380, 64, 16, 40, 70
    ymax = 25.0

    def py(v):
        return T + (ymax - v) / ymax * (H - T - B)

    f = 'font-family="sans-serif"'
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Cost closure of a RepRap-class printer shop for three seed shops, with 5 to 95 percent ranges: a printer alone is near 11 percent and adding a CNC router and laser cutter raises it to about 16 percent">',
           f'<rect width="{W}" height="{H}" fill="#fff"/>',
           f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Cost closure by seed shop (assumed prices; stylised)</text>']
    for t in (0, 5, 10, 15, 20, 25):
        out.append(f'<line x1="{L}" x2="{W-R}" y1="{py(t):.1f}" y2="{py(t):.1f}" stroke="#ddd"/>'
                   f'<text x="{L-6}" y="{py(t)+4:.1f}" text-anchor="end" {f} font-size="11">{t}%</text>')
    n = len(rows)
    slot = (W - L - R) / n
    for i, (name, med, lo, hi) in enumerate(rows):
        cx = L + (i + 0.5) * slot
        bw = slot * 0.5
        out.append(f'<rect x="{cx-bw/2:.1f}" y="{py(med):.1f}" width="{bw:.1f}" height="{py(0)-py(med):.1f}" fill="#2e8b57"/>')
        out.append(f'<line x1="{cx:.1f}" x2="{cx:.1f}" y1="{py(lo):.1f}" y2="{py(hi):.1f}" stroke="#222" stroke-width="2"/>'
                   f'<line x1="{cx-6:.1f}" x2="{cx+6:.1f}" y1="{py(lo):.1f}" y2="{py(lo):.1f}" stroke="#222" stroke-width="2"/>'
                   f'<line x1="{cx-6:.1f}" x2="{cx+6:.1f}" y1="{py(hi):.1f}" y2="{py(hi):.1f}" stroke="#222" stroke-width="2"/>')
        out.append(f'<text x="{cx+12:.1f}" y="{py(hi)-4:.1f}" {f} font-size="11">{med:g}%</text>')
        out.append(f'<text x="{cx:.1f}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{name}</text>')
    out.append(f'<text x="14" y="{(T+H-B)/2}" text-anchor="middle" {f} font-size="12" transform="rotate(-90 14 {(T+H-B)/2})">share of cost made in-house</text>')
    out.append("</svg>")
    return "\n".join(out) + "\n"


def main():
    rows = parse((HERE / "results.txt").read_text())
    (HERE / "closure_by_shop.svg").write_text(svg(rows))
    print("wrote closure_by_shop.svg from %d rows" % len(rows))


if __name__ == "__main__":
    main()
