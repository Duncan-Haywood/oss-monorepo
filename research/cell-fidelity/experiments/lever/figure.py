"""Milestone 5zi figure: per pool, the exponent the measured separator-surface lever implies (25.3 x rho_path) against
the oracle kappa* the ten-cycle forecast needs, by parameter set, with the line of equality and its +-25% band."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
P = json.loads((HERE / "summary.json").read_text())["pools"]
COL = {"Chen2020": "#d1495b", "OKane2022": "#edae49", "Ai2020": "#2a6fdb", "NCA_Kim2011": "#00798c"}
W, H, M = 560, 460, 60
top = 100.0
sx = lambda v: M + v / top * (W - 2 * M)
sy = lambda v: H - M - v / top * (H - 2 * M)
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W / 2}" y="22" text-anchor="middle" font-size="13">Milestone 5zi: lever ratio against the exponent the forecast needs</text>',
     f'<polygon points="{sx(0)},{sy(0)} {sx(top / 1.25)},{sy(top)} {sx(top)},{sy(top)} {sx(top)},{sy(top * 0.75)}" fill="#eee"/>',
     f'<line x1="{sx(0)}" y1="{sy(0)}" x2="{sx(top)}" y2="{sy(top)}" stroke="#999" stroke-dasharray="4 3"/>',
     f'<line x1="{M}" y1="{H - M}" x2="{W - M}" y2="{H - M}" stroke="#333"/>',
     f'<line x1="{M}" y1="{M}" x2="{M}" y2="{H - M}" stroke="#333"/>',
     f'<text x="{W / 2}" y="{H - 18}" text-anchor="middle">pool median oracle kappa* (1/V)</text>',
     f'<text x="16" y="{H / 2}" text-anchor="middle" transform="rotate(-90 16 {H / 2})">pool median 25.3 x rho_path (1/V)</text>']
for t in range(0, 101, 20):
    s.append(f'<text x="{sx(t)}" y="{H - M + 16}" text-anchor="middle">{t}</text>')
    s.append(f'<text x="{M - 8}" y="{sy(t) + 4}" text-anchor="end">{t}</text>')
for i, (k, c) in enumerate(COL.items()):
    s.append(f'<circle cx="{M + 20}" cy="{M + 6 + 16 * i}" r="5" fill="{c}"/><text x="{M + 30}" y="{M + 10 + 16 * i}">{k}</text>')
s.append(f'<text x="{sx(72)}" y="{sy(80)}" font-size="10" fill="#777">equal, +-25%</text>')
for d in P.values():
    s.append(f'<circle cx="{sx(d["k_star"]):.1f}" cy="{sy(d["k_path"]):.1f}" r="5" fill="{COL[d["set"]]}" fill-opacity="0.85"/>')
s.append("</svg>")
(HERE / "lever.svg").write_text("\n".join(s) + "\n")
