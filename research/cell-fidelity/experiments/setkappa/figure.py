"""Milestone 5zg figure: median cycle-99 lithium-loss error per fresh pool for the physical plating exponent
(alpha F / RT = 25.3 /V) and for the per-set exponents calibrated on earlier 100-cycle runs (med, line)."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
C = json.loads((HERE / "summary.json").read_text())["conditions"]
SERIES = (("phys", "alpha F/RT = 25.3 (5zd)", "#888888"),
          ("med", "per-set median kappa* (primary)", "#2a6fdb"),
          ("line", "per-set kappa* line in current", "#d1495b"))
W, H, P = 640, 380, 60
top = max(max(d["err"][k] for k, _, _ in SERIES) for d in C.values()) * 1.25
sy = lambda v: H - P - v / top * (H - 2 * P)
gw = (W - 2 * P) / max(1, len(C))
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<line x1="{P}" y1="{H - P}" x2="{W - P}" y2="{H - P}" stroke="#333"/>',
     f'<line x1="{P}" y1="{P}" x2="{P}" y2="{H - P}" stroke="#333"/>',
     f'<text x="{W / 2}" y="24" text-anchor="middle" font-size="13">Milestone 5zg: one plating exponent per parameter set, fresh pools</text>',
     f'<text x="16" y="{H / 2}" text-anchor="middle" transform="rotate(-90 16 {H / 2})">median |ln(L_pred(99)/L_DFN(99))|</text>']
for i in range(6):
    t = top * i / 5
    s.append(f'<text x="{P - 8}" y="{sy(t) + 4:.1f}" text-anchor="end">{t:.3f}</text>')
for i, (_, lab, col) in enumerate(SERIES):
    s.append(f'<rect x="{P + 14}" y="{P - 18 + 16 * i}" width="10" height="10" fill="{col}"/>'
             f'<text x="{P + 29}" y="{P - 8 + 16 * i}">{lab}</text>')
bw = 22
for g, (c, d) in enumerate(C.items()):
    xc = P + (g + 0.5) * gw
    for i, (k, _, col) in enumerate(SERIES):
        x = xc + (i - 1.5) * bw + 1.5
        v = d["err"][k]
        s.append(f'<rect x="{x:.1f}" y="{sy(v):.1f}" width="{bw - 3}" height="{H - P - sy(v):.1f}" fill="{col}"/>')
        s.append(f'<text x="{x + (bw - 3) / 2:.1f}" y="{sy(v) - 4:.1f}" text-anchor="middle" font-size="9">{v:.3f}</text>')
    s.append(f'<text x="{xc:.1f}" y="{H - P + 16}" text-anchor="middle" font-size="10">{c}</text>')
    s.append(f'<text x="{xc:.1f}" y="{H - P + 30}" text-anchor="middle" font-size="10" fill="#555">'
             f'kappa {d["kappa"]["med"]:.1f} / {d["kappa"]["line"]:.1f}</text>')
s.append("</svg>")
(HERE / "setkappa.svg").write_text("\n".join(s) + "\n")
