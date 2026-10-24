"""Dot plot of whole-sheet error per seed for the three design routes, from results.txt and control_results.txt (stdlib only)."""
from pathlib import Path

HERE = Path(__file__).resolve().parent


def col(path, tag):
    return [float(l.split()[3]) for l in path.read_text().splitlines() if l.startswith(tag + " ")]


def main():
    groups = [("2D-designed", col(HERE / "results.txt", "2d-design"), "#c0504d"),
              ("3D, original bounds", col(HERE / "control_results.txt", "3d-orig"), "#4f81bd"),
              ("3D, wide bounds", col(HERE / "results.txt", "3d-wide"), "#2e8b57")]
    W, H, x0, y0, sy = 520, 300, 70, 270, 100.0
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="white"/>',
         '<text x="10" y="18" font-size="13">Whole-sheet error per seed, M tee, 3 cm half-depth arm</text>']
    for v in (0, 0.5, 1.0, 1.5, 2.0):
        y = y0 - v * sy
        s.append(f'<line x1="{x0}" x2="{W - 10}" y1="{y}" y2="{y}" stroke="#ddd"/><text x="{x0 - 8}" y="{y + 4}" text-anchor="end">{v:g}</text>')
    s.append(f'<text x="14" y="150" transform="rotate(-90 14,150)" text-anchor="middle">err_all (cm)</text>')
    for i, (name, vals, c) in enumerate(groups):
        cx = x0 + 70 + i * 150
        for j, v in enumerate(vals):
            s.append(f'<circle cx="{cx + (j - 3.5) * 7}" cy="{y0 - v * sy}" r="3.5" fill="{c}" fill-opacity="0.8"/>')
        m = sum(vals) / len(vals)
        s.append(f'<line x1="{cx - 32}" x2="{cx + 32}" y1="{y0 - m * sy}" y2="{y0 - m * sy}" stroke="black" stroke-width="2"/>')
        s.append(f'<text x="{cx}" y="{y0 + 18}" text-anchor="middle">{name}</text>')
    s.append("</svg>")
    (HERE / "err_by_route.svg").write_text("\n".join(s) + "\n")


if __name__ == "__main__":
    main()
