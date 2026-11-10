"""Stdlib SVG for the milestone 1a figure: excavator $/tonne by weight, and depreciation by class."""
import math
from html import escape


def write_svg(path, points, rates, w=760, h=330):
    """points: (tonnes, dollars per tonne, n); rates: (class name, depreciation dict)."""
    pw, ph, x0, y0 = 330, 230, 60, 40
    lx = lambda t: x0 + pw * (math.log10(t) - math.log10(0.8)) / (math.log10(60) - math.log10(0.8))
    ly = lambda v: y0 + ph - ph * (v - 1000) / (12000 - 1000)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
           'font-family="system-ui, sans-serif" font-size="11">',
           f'<rect width="{w}" height="{h}" fill="#fff"/>',
           f'<text x="{x0}" y="22" font-size="13" font-weight="600">Track excavators: $ per tonne, 0-3 yr old, sold 2009-12</text>',
           f'<line x1="{x0}" y1="{y0 + ph}" x2="{x0 + pw}" y2="{y0 + ph}" stroke="#555"/>',
           f'<line x1="{x0}" y1="{y0}" x2="{x0}" y2="{y0 + ph}" stroke="#555"/>']
    for t in (1, 2, 5, 10, 20, 50):
        out.append(f'<text x="{lx(t):.1f}" y="{y0 + ph + 15}" text-anchor="middle">{t}</text>')
    out.append(f'<text x="{x0 + pw / 2}" y="{y0 + ph + 30}" text-anchor="middle">operating weight, tonnes (log)</text>')
    for v in (2000, 4000, 6000, 8000, 10000, 12000):
        out.append(f'<text x="{x0 - 6}" y="{ly(v) + 4:.1f}" text-anchor="end">{v // 1000}k</text>')
        out.append(f'<line x1="{x0}" y1="{ly(v):.1f}" x2="{x0 + pw}" y2="{ly(v):.1f}" stroke="#eee"/>')
    for t, v, n in points:
        r = 2.5 + math.sqrt(n) / 5
        out.append(f'<circle cx="{lx(t):.1f}" cy="{ly(v):.1f}" r="{r:.1f}" fill="#2a6f97" fill-opacity="0.75"/>')
    bx, bw = 470, 230
    out.append(f'<text x="{bx}" y="22" font-size="13" font-weight="600">Annual depreciation (FE, 95% CI)</text>')
    scale = lambda p: bx + 150 + bw * p / 0.10 * 0.55
    for i, (name, d) in enumerate(rates):
        y = y0 + 12 + i * 34
        out.append(f'<text x="{bx}" y="{y + 4}">{escape(name.split(" (")[0])}</text>')
        out.append(f'<rect x="{bx + 150}" y="{y - 6}" width="{scale(d["rate"]) - bx - 150:.1f}" height="12" fill="#2a6f97"/>')
        out.append(f'<line x1="{scale(d["rate_lo"]):.1f}" y1="{y}" x2="{scale(d["rate_hi"]):.1f}" y2="{y}" stroke="#000"/>')
        out.append(f'<text x="{scale(d["rate_hi"]) + 4:.1f}" y="{y + 4}">{100 * d["rate"]:.1f}%</text>')
    out.append(f'<text x="{x0}" y="{h - 8}" fill="#555">Source: Blue Book for Bulldozers auction data (Kaggle), 363,718 sales; research/heavy-market</text>')
    out.append("</svg>")
    path.write_text("\n".join(out) + "\n")
