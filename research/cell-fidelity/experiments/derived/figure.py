"""Milestone 5x figure: the pool's fitted self-limiting slope against the slope the plating law predicts (stdlib)."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
C = json.loads((HERE / "summary.json").read_text())["conditions"]
W, H, P = 520, 400, 60
lo, hi = -0.1, 0.9
sx = lambda v: P + (v - lo) / (hi - lo) * (W - 2 * P)
sy = lambda v: H - P - (v - lo) / (hi - lo) * (H - 2 * P)
col = {"Ai2020": "#2a6fdb", "NCA_Kim2011": "#d1495b", "Chen2020": "#3a9d5d", "OKane2022": "#8e6bbf"}
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<line x1="{sx(lo)}" y1="{sy(lo)}" x2="{sx(hi)}" y2="{sy(hi)}" stroke="#999" stroke-dasharray="4 3"/>',
     f'<line x1="{P}" y1="{H - P}" x2="{W - P}" y2="{H - P}" stroke="#333"/>',
     f'<line x1="{P}" y1="{P}" x2="{P}" y2="{H - P}" stroke="#333"/>']
for t in (0, 0.2, 0.4, 0.6, 0.8):
    s.append(f'<text x="{sx(t)}" y="{H - P + 16}" text-anchor="middle">{t:.1f}</text>')
    s.append(f'<text x="{P - 8}" y="{sy(t) + 4}" text-anchor="end">{t:.1f}</text>')
s.append(f'<text x="{W / 2}" y="{H - 18}" text-anchor="middle">slope derived from the plating law (no fit)</text>')
s.append(f'<text x="16" y="{H / 2}" text-anchor="middle" transform="rotate(-90 16 {H / 2})">slope fitted to 100-cycle DFN</text>')
s.append(f'<text x="{W / 2}" y="24" text-anchor="middle" font-size="13">Milestone 5x: ten pools, dashed line = equal</text>')
for i, (c, d) in enumerate(col.items()):
    s.append(f'<circle cx="{P + 20}" cy="{P + 10 + 16 * i}" r="5" fill="{d}"/><text x="{P + 30}" y="{P + 14 + 16 * i}">{c}</text>')
for c, d in C.items():
    s.append(f'<circle cx="{sx(d["s_der"]):.1f}" cy="{sy(d["s_true"]):.1f}" r="6" fill="{col[c.split("@")[0]]}" fill-opacity="0.8"/>')
s.append("</svg>")
(HERE / "derived.svg").write_text("\n".join(s) + "\n")
