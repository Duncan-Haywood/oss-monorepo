"""Write experiments/savings.svg from results.txt: NPC saving of the optimum over the baseline, default vs EIA prices.

    python experiments/figure.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "results.txt").read_text().splitlines()


def main():
    i = next(k for k, l in enumerate(TEXT) if l.startswith("B."))
    rows = []
    for l in TEXT[i + 2:i + 14]:
        m = re.match(r"\s+(\w+ ?\w*) \((\w+)\)\s+(gas furnace \+ AC|heat pump)\s+([\d,]+)\s+([\d,]+)", l)
        if m:
            rows.append((f"{m.group(1)} {m.group(3)}", int(m.group(4).replace(",", "")), int(m.group(5).replace(",", ""))))
    if len(rows) != 12:
        raise SystemExit("no rows parsed")
    W, H, L, R, T, B = 720, 440, 190, 30, 62, 40
    hi = 5000.0
    px = lambda v: L + v / hi * (W - L - R)
    rh = (H - T - B) / len(rows)
    f = 'font-family="sans-serif"'
    alt = "30-year net-present-cost saving of the cost-optimal envelope over the baseline, house-energy's invented prices against EIA state prices: " + "; ".join(
        f"{n}: ${a:,} against ${b:,}" for n, a, b in rows)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="{alt}">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<text x="{W/2}" y="22" text-anchor="middle" {f} font-size="14">Saving of the cost-optimal envelope over the baseline (USD, 30-year NPC)</text>',
         f'<text x="{W/2}" y="40" text-anchor="middle" {f} font-size="11" fill="#555">grey = house-energy invented prices, blue = EIA state prices (2025 gas, Jan-Jul 2026 electricity)</text>']
    for t in range(0, 5001, 1000):
        o.append(f'<line x1="{px(t)}" y1="{T-4}" x2="{px(t)}" y2="{H-B}" stroke="#ddd"/>')
        o.append(f'<text x="{px(t)}" y="{H-B+16}" text-anchor="middle" {f} font-size="11">{t:,}</text>')
    for k, (n, a, b) in enumerate(rows):
        y = T + k * rh
        o.append(f'<text x="{L-8}" y="{y+rh/2+4}" text-anchor="end" {f} font-size="11">{n}</text>')
        o.append(f'<rect x="{px(0)}" y="{y+2}" width="{px(a)-px(0):.1f}" height="{rh/2-2:.1f}" fill="#aaa"/>')
        o.append(f'<rect x="{px(0)}" y="{y+rh/2}" width="{px(b)-px(0):.1f}" height="{rh/2-2:.1f}" fill="#4878a8"/>')
    o.append('</svg>')
    (HERE / "savings.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
