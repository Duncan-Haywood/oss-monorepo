"""Draw experiments/gap.svg: practical / ceiling ranges, parsed from results.txt.

    python experiments/figure.py

Stdlib only. Numbers come from the committed results.txt, never retyped.
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent


def rows():
    out = []
    for l in (HERE / "results.txt").read_text().splitlines():
        m = re.match(r"(.{38})\S+\s+.*?\s(\d\.\d\d)(?:-(\d\.\d\d))?\s+(primary|secondary)$", l)
        if m:
            lo = float(m.group(2)); hi = float(m.group(3) or lo)
            out.append((m.group(1).strip(), lo, hi, m.group(4)))
        m = re.match(r"practical / ceiling = (\d\.\d\d) and (\d\.\d\d)", l)
        if m:
            out.append(("700 bar H2 tank system (H2 mass share)", float(m.group(1)), float(m.group(2)), "primary"))
    return out


def main():
    r = rows()
    W, H, L, T, bh = 760, 60 + 40 * len(r), 300, 40, 40
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="13">',
         '<rect width="100%" height="100%" fill="#fff"/>',
         f'<text x="{L}" y="22" font-weight="bold">Published practical figure as a share of the first-principles ceiling</text>']
    sc = (W - L - 30) / 1.0
    for g in (0, .25, .5, .75, 1):
        x = L + g * sc
        s.append(f'<line x1="{x}" y1="{T}" x2="{x}" y2="{H-20}" stroke="#ddd"/><text x="{x}" y="{H-5}" text-anchor="middle">{int(g*100)}%</text>')
    for i, (name, lo, hi, how) in enumerate(r):
        y = T + i * bh
        col = "#1f6fb2" if how == "primary" else "#c0392b"
        s.append(f'<text x="{L-8}" y="{y+22}" text-anchor="end">{name}</text>')
        w = max((hi - lo) * sc, 3)
        s.append(f'<rect x="{L+lo*sc}" y="{y+8}" width="{w}" height="20" fill="{col}"/>')
        s.append(f'<text x="{L+hi*sc+6}" y="{y+23}">{lo:.2f}' + (f'-{hi:.2f}' if hi != lo else '') + '</text>')
    s.append(f'<text x="{L}" y="{H-24}" fill="#1f6fb2">blue: read in a primary document</text>'
             f'<text x="{L+250}" y="{H-24}" fill="#c0392b">red: secondary page citing a source not opened</text>')
    s.append('</svg>')
    (HERE / "gap.svg").write_text("\n".join(s))
    print("wrote gap.svg", len(r), "bars")


if __name__ == "__main__":
    main()
