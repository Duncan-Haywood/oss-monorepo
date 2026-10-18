"""Write experiments/vitamin_gain.svg: mass-closure points gained by making each top vitamin in-house, parsed from results.txt.

    python experiments/figure.py

Numbers are parsed from the committed results.txt (first shop block), never retyped: re-run run.py first if the experiment changes.
"""
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent


def top_vitamins(text):
    """(name, mass gain in points) rows of the first '-- top 8 vitamins' block."""
    rows, on = [], False
    for l in text.splitlines():
        if l.startswith("-- top 8 vitamins"):
            on = True
            continue
        if on:
            if l.startswith("--") or not l.strip():
                break
            p = l.split()
            rows.append((" ".join(p[:-5]), float(p[-3])))
    return rows


def main():
    text = (HERE / "results.txt").read_text()
    rows = top_vitamins(text)
    assert rows, "no vitamin block found in results.txt"
    shop = text.split("== ", 1)[1].split(":", 1)[0]
    w, left, bar_h, gap, top = 640, 210, 22, 8, 56
    h = top + len(rows) * (bar_h + gap) + 40
    vmax = max(v for _, v in rows)
    scale = (w - left - 60) / vmax
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="Bar chart of mass-closure points gained by making each of the top eight vitamins in-house; the NEMA17 stepper motor gains the most">',
           f'<rect width="{w}" height="{h}" fill="#ffffff"/>',
           f'<text x="12" y="24" font-family="sans-serif" font-size="15" font-weight="bold" fill="#222">Which vitamin is worth making in-house? (shop: {escape(shop)})</text>',
           '<text x="12" y="44" font-family="sans-serif" font-size="12" fill="#444">Mass-closure points gained if made in-house (selfrep-judgement, first shop block of results.txt)</text>']
    for i, (name, v) in enumerate(rows):
        y = top + i * (bar_h + gap)
        out.append(f'<text x="{left - 8}" y="{y + 16}" text-anchor="end" font-family="sans-serif" font-size="12" fill="#222">{escape(name)}</text>')
        out.append(f'<rect x="{left}" y="{y}" width="{v * scale:.1f}" height="{bar_h}" fill="#1f6fb2"/>')
        out.append(f'<text x="{left + v * scale + 6:.1f}" y="{y + 16}" font-family="sans-serif" font-size="12" fill="#222">+{v:.1f}</text>')
    out.append("</svg>")
    (HERE / "vitamin_gain.svg").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
