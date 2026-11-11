"""Milestone 6x figure: a Wave Glider's planned km/day over the open ocean from ERA5, January and July 2024, at the
2015 vehicle's best month (experiments/run_waveglider_era5_sites.py's rules). Stdlib only; writes
experiments/waveglider_era5_map.svg. Run (from research/marine-hull): python3 experiments/figure_waveglider_era5_map.py"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_waveglider_era5_sites as r  # noqa: E402

# sequential blues, light (slow) to dark (fast); bins of km/day
BINS = [(0, 30, "#deebf7"), (30, 40, "#c6dbef"), (40, 50, "#9ecae1"), (50, 60, "#6baed6"), (60, 70, "#4292c6"),
        (70, 86, "#2171b5"), (86, 999, "#08306b")]
W, H, PAD, GAP = 720, 300, 40, 30


def colour(k):
    for lo, hi, c in BINS:
        if lo <= k < hi:
            return c
    return BINS[-1][2]


def panel(cells, x0, y0, title, extrap):
    sx, sy = W / 360, H / 150
    out = [f'<text x="{x0}" y="{y0 - 8}" font-size="14" font-weight="600">{title}</text>',
           f'<rect x="{x0}" y="{y0}" width="{W}" height="{H}" fill="#f4f1ea" stroke="#999"/>']
    for k, c, ex in cells:
        x = x0 + (c["lon"] + 185) * sx
        y = y0 + (75 - (c["lat"] + 5)) * sy
        out.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{10 * sx:.1f}" height="{10 * sy:.1f}" fill="{colour(k)}">'
                   f'<title>{c["lat"]:.0f}, {c["lon"]:.0f}: {k:.0f} km/day, {ex:.0%} of hours outside the mission range'
                   f'</title></rect>')
        if ex >= extrap:
            out.append(f'<circle cx="{x + 5 * sx:.1f}" cy="{y + 5 * sy:.1f}" r="2" fill="#c0392b"/>')
    for lat in (-60, -30, 0, 30, 60):
        y = y0 + (75 - lat) * sy
        out.append(f'<line x1="{x0}" x2="{x0 + W}" y1="{y:.1f}" y2="{y:.1f}" stroke="#bbb" stroke-dasharray="2,3"/>'
                   f'<text x="{x0 - 6}" y="{y + 4:.1f}" font-size="10" text-anchor="end">{lat}</text>')
    return out


def main():
    a, s, (qlo, qhi) = r.vehicle()
    best = max(s.values())
    G = r.grid()
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W + 2 * PAD} {2 * H + 3 * PAD + GAP + 60}" '
           f'font-family="sans-serif">', '<rect width="100%" height="100%" fill="#fff"/>']
    y = PAD
    for mon, name in ((1, "January 2024"), (7, "July 2024")):
        cells = [(r.km_quant(best, a, c["q"]), c, sum(q < qlo or q > qhi for q in c["q"]) / 20)
                 for c in G if c["month"] == mon]
        svg += panel(cells, PAD, y, f"Wave Glider plan from ERA5 waves, {name} (km/day, 2015 vehicle's best month)",
                     0.5)
        y += H + PAD + GAP
    x = PAD
    for lo, hi, c in BINS:
        lab = f"{lo}+" if hi == 999 else f"{lo}-{hi}"
        svg.append(f'<rect x="{x}" y="{y - GAP}" width="14" height="14" fill="{c}" stroke="#999"/>'
                   f'<text x="{x + 18}" y="{y - GAP + 11}" font-size="11">{lab}</text>')
        x += 62
    svg.append(f'<circle cx="{x + 7}" cy="{y - GAP + 7}" r="3" fill="#c0392b"/><text x="{x + 16}" y="{y - GAP + 11}" '
               f'font-size="11">half or more hours outside the 2015 mission\'s Hs/T</text>')
    svg.append(f'<text x="{PAD}" y="{y + 4}" font-size="10" fill="#555">10 degree cells, 70 S to 70 N; '
               f'U = s (Hs/Tm)^{a:.3f} from ERA5 swh and mwp (Open-Meteo, CC BY 4.0, Copernicus); '
               f'</text><text x="{PAD}" y="{y + 18}" font-size="10" fill="#555">86 km/day is the deck-solar ceiling of '
               f'milestone 5c (darkest bin; no cell reaches it).</text>')
    svg.append("</svg>")
    with open(os.path.join(HERE, "waveglider_era5_map.svg"), "w") as f:
        f.write("\n".join(svg) + "\n")
    print("wrote experiments/waveglider_era5_map.svg")


if __name__ == "__main__":
    main()
