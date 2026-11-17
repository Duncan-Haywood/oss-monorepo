"""mapscreen.svg: DFN fade from cycle 10 to 100 against the map's prediction, fed DFN's own cycle-99 lithium loss (dots)
and the power law's (crosses), on the post hoc diagnostic designs (summary.json). Stdlib only."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
COL = {"Ai2020@0.3x": "#2a6fdb", "NCA_Kim2011@1x": "#d9480f", "Chen2020@0.5x": "#2b8a3e", "OKane2022@1x": "#7048e8"}


def main():
    rows = json.loads((HERE / "summary.json").read_text())["diag"]
    W, H, P = 520, 420, 60
    sx = lambda v: P + v * (W - 2 * P)
    sy = lambda v: H - P - v * (H - 2 * P)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<rect width="{W}" height="{H}" fill="#fff"/>',
         f'<line x1="{sx(0)}" y1="{sy(0)}" x2="{sx(1)}" y2="{sy(1)}" stroke="#999" stroke-dasharray="4 3"/>',
         f'<line x1="{sx(0)}" y1="{sy(0)}" x2="{sx(1)}" y2="{sy(0)}" stroke="#333"/>',
         f'<line x1="{sx(0)}" y1="{sy(0)}" x2="{sx(0)}" y2="{sy(1)}" stroke="#333"/>']
    for t in (0, 0.25, 0.5, 0.75, 1):
        o += [f'<text x="{sx(t)}" y="{sy(0) + 16}" text-anchor="middle">{t:g}</text>',
              f'<text x="{sx(0) - 8}" y="{sy(t) + 4}" text-anchor="end">{t:g}</text>']
    o += [f'<text x="{W / 2}" y="{H - 18}" text-anchor="middle">DFN energy fade, cycle 10 to 100</text>',
          f'<text x="16" y="{H / 2}" text-anchor="middle" transform="rotate(-90 16 {H / 2})">predicted fade</text>',
          f'<text x="{W / 2}" y="24" text-anchor="middle" font-weight="bold">Balance map: right with DFN\'s lithium loss, wrong with a power law</text>']
    for r in rows:
        c = COL[r["cond"]]
        o.append(f'<circle cx="{sx(r["fade_dfn"]):.1f}" cy="{sy(r["map_true"]):.1f}" r="4" fill="{c}"/>')
        x, y = sx(r["fade_dfn"]), sy(min(r["map_pow"], 1))
        o.append(f'<path d="M{x - 4:.1f},{y - 4:.1f}L{x + 4:.1f},{y + 4:.1f}M{x - 4:.1f},{y + 4:.1f}L{x + 4:.1f},{y - 4:.1f}" stroke="{c}" stroke-width="1.5"/>')
    for k, (name, c) in enumerate(COL.items()):
        o += [f'<circle cx="{P + 12}" cy="{50 + 16 * k}" r="4" fill="{c}"/>', f'<text x="{P + 22}" y="{54 + 16 * k}">{name}</text>']
    o += [f'<text x="{P + 12}" y="{54 + 16 * 4 + 4}">dots: map fed DFN\'s L(99); crosses: power law from cycles 2 to 10</text>', "</svg>"]
    (HERE / "mapscreen.svg").write_text("\n".join(o) + "\n")


if __name__ == "__main__":
    main()
