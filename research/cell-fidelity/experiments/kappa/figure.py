"""Milestone 5zf figure: per fresh pool, the oracle kappa* (the kappa that makes the cycle-99 forecast exact) and the
ten-cycle estimate k_fit, medians with interquartile bars, against alpha F / RT = 25.3 /V used since 5zb."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
C = json.loads((HERE / "summary.json").read_text())["conditions"]
KAPPA = 25.3
SERIES = (("k_star", "oracle kappa* (needs cycle 99)", "#d1495b"),
          ("k_fit", "ten-cycle estimate k_fit", "#2a6fdb"))
W, H, P = 640, 380, 60
top = 110.0
sy = lambda v: H - P - v / top * (H - 2 * P)
gw = (W - 2 * P) / max(1, len(C))
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<line x1="{P}" y1="{H - P}" x2="{W - P}" y2="{H - P}" stroke="#333"/>',
     f'<line x1="{P}" y1="{P}" x2="{P}" y2="{H - P}" stroke="#333"/>',
     f'<text x="{W / 2}" y="24" text-anchor="middle" font-size="13">Milestone 5zf: the plating exponent each fresh pool needs</text>',
     f'<text x="16" y="{H / 2}" text-anchor="middle" transform="rotate(-90 16 {H / 2})">kappa (1/V), median and IQR</text>',
     f'<line x1="{P}" y1="{sy(KAPPA):.1f}" x2="{W - P}" y2="{sy(KAPPA):.1f}" stroke="#555" stroke-dasharray="5 4"/>',
     f'<line x1="{P + 12}" y1="{P + 29}" x2="{P + 26}" y2="{P + 29}" stroke="#555" stroke-dasharray="5 4"/>',
     f'<text x="{P + 29}" y="{P + 33}">alpha F/RT = 25.3, used by 5zb to 5ze</text>']
for t in range(0, 101, 20):
    s.append(f'<text x="{P - 8}" y="{sy(t) + 4:.1f}" text-anchor="end">{t}</text>')
for i, (_, lab, col) in enumerate(SERIES):
    s.append(f'<rect x="{P + 14}" y="{P - 8 + 16 * i}" width="10" height="10" fill="{col}"/>'
             f'<text x="{P + 29}" y="{P + 2 + 16 * i}">{lab}</text>')
for g, (c, d) in enumerate(C.items()):
    xc = P + (g + 0.5) * gw
    for i, (k, _, col) in enumerate(SERIES):
        x = xc + (i - 0.5) * 22
        s.append(f'<line x1="{x:.1f}" y1="{sy(d[k + "_q25"]):.1f}" x2="{x:.1f}" y2="{sy(d[k + "_q75"]):.1f}" '
                 f'stroke="{col}" stroke-width="3"/>')
        s.append(f'<circle cx="{x:.1f}" cy="{sy(d[k]):.1f}" r="5" fill="{col}"/>')
    s.append(f'<text x="{xc:.1f}" y="{H - P + 16}" text-anchor="middle" font-size="10">{c}</text>')
    s.append(f'<text x="{xc:.1f}" y="{H - P + 30}" text-anchor="middle" font-size="10" fill="#555">lever +{d["du10_mV"]:.1f} mV, cycles 2-10</text>')
s.append("</svg>")
(HERE / "kappa.svg").write_text("\n".join(s) + "\n")
