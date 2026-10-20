"""Scatter of hang cost against fold cost for the synthetic population -> hang_or_fold.svg (stdlib only)."""
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
pop = json.load(open(HERE / "population.json"))["population"]
COL = {"tee": "#2a7ab9", "shirt": "#d9822b", "linen": "#7b4fa3", "fleece": "#3a9a5b", "sweater": "#c0392b"}
W, H, L, R, T, B = 640, 460, 64, 20, 40, 56
LO, HI = 0.05, 12.0


def sx(v):
    return L + (math.log10(max(v, LO)) - math.log10(LO)) / (math.log10(HI) - math.log10(LO)) * (W - L - R)


def sy(v):
    return H - B - (math.log10(max(v, LO)) - math.log10(LO)) / (math.log10(HI) - math.log10(LO)) * (H - T - B)


o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     f'<rect width="{W}" height="{H}" fill="#fff"/>',
     f'<text x="{W/2}" y="22" text-anchor="middle" font-size="14">Hang or fold? Each dot is a simulated garment</text>']
for v in (0.1, 0.3, 1, 3, 10):
    o.append(f'<line x1="{sx(v)}" y1="{T}" x2="{sx(v)}" y2="{H-B}" stroke="#e5e5e5"/>')
    o.append(f'<line x1="{L}" y1="{sy(v)}" x2="{W-R}" y2="{sy(v)}" stroke="#e5e5e5"/>')
    o.append(f'<text x="{sx(v)}" y="{H-B+16}" text-anchor="middle" fill="#444">{v:g}</text>')
    o.append(f'<text x="{L-8}" y="{sy(v)+4}" text-anchor="end" fill="#444">{v:g}</text>')
o.append(f'<line x1="{sx(LO)}" y1="{sy(LO)}" x2="{sx(HI)}" y2="{sy(HI)}" stroke="#222" stroke-dasharray="5 4"/>')
o.append(f'<text x="{sx(2.2)}" y="{sy(3.6)}" fill="#222" transform="rotate(-27 {sx(2.2)} {sy(3.6)})">equal cost</text>')
o.append(f'<text x="{L+8}" y="{T+16}" fill="#444">below the line: hanging leaves less (hang)</text>')
o.append(f'<text x="{W-R-8}" y="{H-B-8}" text-anchor="end" fill="#444">above the line: fold</text>')
for p in pop:
    o.append(f'<circle cx="{sx(p["fold"]):.1f}" cy="{sy(p["hang"]):.1f}" r="3" fill="{COL[p["name"]]}" fill-opacity="0.65"/>')
for i, (k, c) in enumerate(COL.items()):
    x = L + 12 + i * 86
    o.append(f'<circle cx="{x}" cy="{H-14}" r="5" fill="{c}"/><text x="{x+9}" y="{H-10}">{k}</text>')
o.append(f'<text x="{(L+W-R)/2}" y="{H-B+36}" text-anchor="middle">cost of folding (cm shape-error equivalent, log scale; values below 0.05 plotted at 0.05)</text>')
o.append(f'<text transform="translate(16 {(T+H-B)/2}) rotate(-90)" text-anchor="middle">cost of hanging (cm, log)</text>')
o.append('</svg>')
(HERE / "hang_or_fold.svg").write_text("\n".join(o) + "\n")
