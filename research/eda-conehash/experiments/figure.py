"""Write experiments/cones.svg: changed-sink count (log scale) per survivor, grouped by Yosys verdict. Stdlib only."""
import math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_conehash import score as S  # noqa: E402

rows = S.load()
COL = {"equivalent": "#2a7f62", "undecided": "#c0612b", "killed": "#6a3d9a"}
W, H, L, B, T = 640, 340, 70, 50, 40
ys = lambda v: H - B - (H - B - T) * math.log10(v + 1) / math.log10(220)
s = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="white"/>',
     f'<text x="{L}" y="22" font-size="14" font-weight="bold">Sinks whose fan-in cone changed, per simulation survivor</text>']
for v in (0, 1, 10, 100):
    s.append(f'<line x1="{L}" x2="{W-10}" y1="{ys(v):.1f}" y2="{ys(v):.1f}" stroke="#ddd"/>'
             f'<text x="{L-8}" y="{ys(v)+4:.1f}" text-anchor="end">{v}</text>')
for gi, lab in enumerate(COL):
    g = sorted((r for r in rows if r["formal"] == lab), key=lambda r: r["n_changed"])
    x0 = L + gi * 190
    s.append(f'<text x="{x0}" y="{H-14}" fill="{COL[lab]}">{lab} (n={len(g)})</text>')
    for j, r in enumerate(g):
        s.append(f'<circle cx="{x0+8+j*11}" cy="{ys(r["n_changed"]):.1f}" r="4.5" fill="{COL[lab]}" fill-opacity="0.8"/>')
s.append(f'<text x="14" y="{H/2}" transform="rotate(-90 14 {H/2})" text-anchor="middle">changed sinks (of 196)</text></svg>')
open(os.path.join(HERE, "cones.svg"), "w").write("\n".join(s))
