"""Write experiments/price_breakdown.svg: where a new US home's price goes, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt (sections A and B), never retyped.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
LABELS = {"site_work": "Site work (incl. permit, impact, water fees)", "foundations": "Foundations",
          "framing": "Framing", "exterior": "Exterior finishes", "systems": "Plumbing, electrical, HVAC rough-ins",
          "interior": "Interior finishes", "final": "Final steps (landscaping, driveway, cleanup)", "other": "Other",
          "lot": "Finished lot", "financing": "Financing", "overhead": "Overhead", "marketing": "Marketing",
          "commission": "Sales commission", "profit": "Builder profit"}


def section(lines, head):
    i = next(k for k, l in enumerate(lines) if l.startswith(head)) + 2
    rows = []
    while i < len(lines) and lines[i].strip() and not lines[i].startswith("permit"):
        rows.append([c.strip() for c in lines[i].split(", ")])
        i += 1
    return rows


def main():
    lines = (HERE / "results.txt").read_text().splitlines()
    parts = {r[0]: (float(r[1].replace(",", "")), float(r[2])) for r in section(lines, "A.")}
    stages = [(r[0], float(r[1].replace(",", "")), float(r[3])) for r in section(lines, "B.")]
    bars = [(LABELS[n], usd, sp, "#2f6f9f") for n, usd, sp in stages]
    bars += [(LABELS[n], parts[n][0], parts[n][1], "#b5651d") for n in
             ["lot", "profit", "overhead", "commission", "financing", "marketing"]]
    bars.sort(key=lambda b: -b[2])
    w, left, top, bh, gap = 760, 300, 56, 22, 8
    h = top + len(bars) * (bh + gap) + 40
    scale = (w - left - 110) / max(b[2] for b in bars)
    top5 = ", ".join(f"{b[0].lower()} {b[2]:.1f}%" for b in bars[:5])
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" '
           f'aria-label="Bar chart of the share of a new US home\'s price by cost item, NAHB 2024; largest: {top5}">',
           f'<rect width="{w}" height="{h}" fill="#ffffff"/>',
           '<style>text{font-family:system-ui,sans-serif;font-size:13px;fill:#222}</style>',
           f'<text x="16" y="24" style="font-size:16px;font-weight:600">Where a new US home\'s price goes (NAHB 2024 survey, avg ${sum(v[0] for v in parts.values()):,.0f})</text>',
           f'<text x="16" y="44" style="fill:#555">Blue: construction stages ({parts["construction"][1]:.1f}% of price). Orange: lot, builder costs and profit.</text>']
    for k, (label, usd, sp, colour) in enumerate(bars):
        y = top + k * (bh + gap)
        out.append(f'<text x="{left - 8}" y="{y + 16}" text-anchor="end">{label}</text>')
        out.append(f'<rect x="{left}" y="{y}" width="{sp * scale:.1f}" height="{bh}" fill="{colour}"/>')
        out.append(f'<text x="{left + sp * scale + 6:.1f}" y="{y + 16}">{sp:.1f}% · ${usd / 1000:,.0f}k</text>')
    out.append(f'<text x="16" y="{h - 12}" style="fill:#555;font-size:11px">Source: NAHB, Cost of Constructing a Home-2024. '
               'Survey of 41 builders; skews larger and dearer than the Census average.</text></svg>')
    (HERE / "price_breakdown.svg").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
