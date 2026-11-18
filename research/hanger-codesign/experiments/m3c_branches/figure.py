"""Seed scatter of the Cusick drape coefficient at each fabric's sourced stiffness, by lattice.

    python3 experiments/m3c_branches/figure.py    (reads results.json; stdlib only)

One dot per seed (converged end states only), labelled with its fold count; a bar marks each
group's seed mean. Numbers come from the committed results.json, never retyped.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
rows = [r for r in json.loads((HERE / "results.json").read_text()) if r["part"] == 1 and r["conv"]]
GROUPS = [(f, ea, a) for f, eas in (("A", (254.0, 369.0)), ("D", (1341.0, 1896.0)))
          for ea in eas for a in (0.00375, 0.0025)]
COL = {0.00375: "#1f6fb2", 0.0025: "#c0392b"}

W, H, T, B = 820, 420, 50, 70
PANELS = (("A", 70, 400), ("D", 480, 810))     # fabric, left and right x of each panel
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
     f'role="img" aria-label="Drape coefficient of each seed at sourced stiffness, by fabric, EA and lattice">',
     f'<rect width="{W}" height="{H}" fill="#ffffff"/>',
     f'<text x="{W/2}" y="22" text-anchor="middle" font-family="sans-serif" font-size="15">'
     'Seed spread of the simulated Cusick drape at sourced stiffness (7 seeds; label = fold count)</text>']
for fab, L, Rx in PANELS:
    groups = [g for g in GROUPS if g[0] == fab]
    ys = [r["dc"] for r in rows if (r["f"], r["ea"], r["a"]) in groups]
    lo, hi = min(ys) - 0.01, max(ys) + 0.01
    Y = lambda v: T + (hi - v) / (hi - lo) * (H - T - B)
    gw = (Rx - L) / len(groups)
    k = round(lo + 0.01 - lo % 0.01, 2)
    while k < hi:
        o.append(f'<line x1="{L}" x2="{Rx}" y1="{Y(k):.1f}" y2="{Y(k):.1f}" stroke="#e5e5e5"/>'
                 f'<text x="{L-6}" y="{Y(k)+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{k:.2f}</text>')
        k = round(k + 0.01, 2)
    o.append(f'<text x="{L-45}" y="{(T+H-B)/2}" transform="rotate(-90 {L-45} {(T+H-B)/2})" text-anchor="middle" '
             f'font-family="sans-serif" font-size="12">drape coefficient, fabric {fab}</text>')
    for i, (f, ea, a) in enumerate(groups):
        cx = L + gw * (i + 0.5)
        g = sorted((r for r in rows if (r["f"], r["ea"], r["a"]) == (f, ea, a)), key=lambda r: r["seed"])
        for j, r in enumerate(g):
            x = cx + (j - (len(g) - 1) / 2) * 9
            o.append(f'<circle cx="{x:.1f}" cy="{Y(r["dc"]):.1f}" r="3.5" fill="{COL[a]}" fill-opacity="0.8"/>'
                     f'<text x="{x:.1f}" y="{Y(r["dc"])-6:.1f}" text-anchor="middle" font-family="sans-serif" '
                     f'font-size="8">{r["folds"]}</text>')
        if g:
            m = sum(r["dc"] for r in g) / len(g)
            o.append(f'<line x1="{cx-gw*0.4:.1f}" x2="{cx+gw*0.4:.1f}" y1="{Y(m):.1f}" y2="{Y(m):.1f}" '
                     f'stroke="#333" stroke-width="1.5"/>')
        o.append(f'<text x="{cx:.1f}" y="{H-B+18}" text-anchor="middle" font-family="sans-serif" font-size="11">'
                 f'{f}, {ea:g}</text><text x="{cx:.1f}" y="{H-B+32}" text-anchor="middle" font-family="sans-serif" '
                 f'font-size="11" fill="{COL[a]}">{a*1000:g} mm</text>')
o.append(f'<text x="{W/2}" y="{H-12}" text-anchor="middle" font-family="sans-serif" font-size="12">'
         'fabric, EA (N/m) and triangle side; bar = seed mean</text></svg>')
(HERE / "dc_seeds_sourced.svg").write_text("\n".join(o) + "\n")
print("wrote", HERE / "dc_seeds_sourced.svg")
