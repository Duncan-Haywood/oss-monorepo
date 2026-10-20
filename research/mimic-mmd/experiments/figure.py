"""Write experiments/power_vs_n.svg from results.json (never retyped): power against n, one panel per twin error.

    python experiments/figure.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
R = json.loads((HERE / "results.json").read_text())
NS = (100, 200, 400)
DET = [("mmd/raw", "#1f6fb2"), ("mmd/resid", "#2e8b57"), ("c2st/raw", "#c0392b")]
PANELS = ["coul-10%", "coul-20%", "gauss-noise", "noise-sd+25%"]
PW, PH, L, T, B = 200, 200, 40, 50, 50
W, H = L + len(PANELS) * (PW + 20), T + PH + B + 20
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Power of MMD and C2ST tests against sample size for four wrong pendulum twins">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W/2}" y="20" text-anchor="middle" font-family="sans-serif" font-size="14">Power at 5% level vs n per class (stylised pendulum twins)</text>']
for i, p in enumerate(PANELS):
    x0 = L + i * (PW + 20)
    px = lambda n: x0 + (NS.index(n) / (len(NS) - 1)) * (PW - 20) + 10
    py = lambda v: T + (1 - v) * PH
    o.append(f'<rect x="{x0}" y="{T}" width="{PW}" height="{PH}" fill="none" stroke="#999"/>')
    o.append(f'<text x="{x0+PW/2}" y="{T-8}" text-anchor="middle" font-family="sans-serif" font-size="12">{p}</text>')
    for v in (0, 0.5, 1):
        o.append(f'<line x1="{x0}" x2="{x0+PW}" y1="{py(v)}" y2="{py(v)}" stroke="#ddd"/>')
        if i == 0:
            o.append(f'<text x="{x0-4}" y="{py(v)+4}" text-anchor="end" font-family="sans-serif" font-size="10">{v:g}</text>')
    for n in NS:
        o.append(f'<text x="{px(n)}" y="{T+PH+14}" text-anchor="middle" font-family="sans-serif" font-size="10">{n}</text>')
    for d, c in DET:
        pts = " ".join(f"{px(n):.1f},{py(R[f'{n}|{d}|{p}'][0]):.1f}" for n in NS)
        o.append(f'<polyline points="{pts}" fill="none" stroke="{c}" stroke-width="2"/>')
        for n in NS:
            o.append(f'<circle cx="{px(n):.1f}" cy="{py(R[f"{n}|{d}|{p}"][0]):.1f}" r="3" fill="{c}"/>')
for j, (d, c) in enumerate(DET):
    o.append(f'<line x1="{L+j*150}" x2="{L+j*150+18}" y1="{H-12}" y2="{H-12}" stroke="{c}" stroke-width="2"/>'
             f'<text x="{L+j*150+24}" y="{H-8}" font-family="sans-serif" font-size="11">{d}</text>')
o.append("</svg>")
(HERE / "power_vs_n.svg").write_text("\n".join(o) + "\n")
