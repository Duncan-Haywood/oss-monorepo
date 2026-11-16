"""Milestone 5zb figure: median |ln(L / L_DFN)| at cycle 99 on the fresh pools, 5y (power law on R) and the kinetic law (a line in n through R_Q), with the surface variant."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
C = json.loads((HERE / "summary.json").read_text())["conditions"]
KEYS = (("lerr_rp", "power law on R (5y)", "#2a6fdb"),
        ("lerr_q", "kinetic law, open circuit (5zb)", "#d1495b"),
        ("lerr_qs", "kinetic law, surface offset (descriptive)", "#8a8a8a"))
W, H, P = 640, 380, 60
top = max(0.4, max(d[k] for d in C.values() for k, _, _ in KEYS) * 1.1)
sy = lambda v: H - P - v / top * (H - 2 * P)
gw = (W - 2 * P) / max(1, len(C))
bw = gw / (len(KEYS) + 1)
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<line x1="{P}" y1="{H - P}" x2="{W - P}" y2="{H - P}" stroke="#333"/>',
     f'<line x1="{P}" y1="{P}" x2="{P}" y2="{H - P}" stroke="#333"/>',
     f'<text x="{W / 2}" y="24" text-anchor="middle" font-size="13">Milestone 5zb: cycle-99 lithium-loss error, fresh pools</text>',
     f'<text x="16" y="{H / 2}" text-anchor="middle" transform="rotate(-90 16 {H / 2})">median |ln(predicted / DFN)|</text>']
t = 0.0
while t <= top + 1e-9:
    s.append(f'<text x="{P - 8}" y="{sy(t) + 4:.1f}" text-anchor="end">{t:.1f}</text>')
    t += 0.1
for i, (k, lab, col) in enumerate(KEYS):
    s.append(f'<rect x="{W - P - 260}" y="{P - 8 + 16 * i}" width="10" height="10" fill="{col}"/>'
             f'<text x="{W - P - 245}" y="{P + 2 + 16 * i}">{lab}</text>')
for g, (c, d) in enumerate(C.items()):
    x0 = P + g * gw + bw / 2
    for i, (k, _, col) in enumerate(KEYS):
        s.append(f'<rect x="{x0 + i * bw:.1f}" y="{sy(d[k]):.1f}" width="{bw * 0.9:.1f}" height="{sy(0) - sy(d[k]):.1f}" fill="{col}"/>')
    s.append(f'<text x="{x0 + 1.5 * bw:.1f}" y="{H - P + 16}" text-anchor="middle">{c}</text>')
s.append("</svg>")
(HERE / "kinetic.svg").write_text("\n".join(s) + "\n")
