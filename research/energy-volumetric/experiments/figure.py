"""Draw experiments/volumetric.svg from section A of results.txt (Wh/kg vs Wh/L, O2 from air). Stdlib only."""
from pathlib import Path

HERE = Path(__file__).resolve().parent


def rows():
    lines = (HERE / "results.txt").read_text().splitlines()
    out = []
    for l in lines[2:]:
        if not l.strip():
            break
        out.append((l[:44].strip(), float(l[44:53]), float(l[63:73])))
    return out


def main():
    data = rows()
    left, top, bar, gap, width = 270, 44, 11, 14, 330
    hi = 10000.0
    h = top + len(data) * (2 * bar + gap) + 40
    W = left + width + 70
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {h}" width="{W}" height="{h}" font-family="system-ui, sans-serif" font-size="12">',
         f'<rect width="{W}" height="{h}" fill="#ffffff"/>',
         '<text x="20" y="22" font-size="14" font-weight="600" fill="#222">Ceiling per kg (blue) and per litre (orange), O2 taken from air</text>']
    for i, (label, kg, l) in enumerate(data):
        y = top + i * (2 * bar + gap)
        s.append(f'<text x="{left - 8}" y="{y + bar + 4}" text-anchor="end" fill="#222">{label[:40]}</text>')
        for j, (v, c) in enumerate([(kg, "#1f6fb2"), (l, "#e8890c")]):
            wdt = v / hi * width
            s.append(f'<rect x="{left}" y="{y + j * bar}" width="{wdt:.1f}" height="{bar - 1}" fill="{c}"/>')
            s.append(f'<text x="{left + wdt + 4:.1f}" y="{y + j * bar + 9}" fill="#222">{v:,.0f}</text>')
    s.append(f'<text x="{left}" y="{h - 12}" fill="#444">Wh/kg or Wh/L of reactants (linear axis, 0 to {hi:,.0f})</text></svg>')
    (HERE / "volumetric.svg").write_text("\n".join(s) + "\n")


if __name__ == "__main__":
    main()
