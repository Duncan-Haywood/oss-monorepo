"""Plot results.txt sweeps 2 and 3 (peak lip force and lip-contact share against approach speed and sensing delay) as SVG, stdlib only."""
import os
here = os.path.dirname(__file__)
lines = open(os.path.join(here, "results.txt")).read().splitlines()

def block(title):
    i = next(k for k, l in enumerate(lines) if l.startswith(title)) + 2
    rows = []
    while i < len(lines) and lines[i].strip():
        t = lines[i].split()
        # label ends with the swept value; columns after it: amp fed safe touch peak_mean peak_max time
        nums = t[-7:]
        key = float(t[-9] if "delay" in lines[i] or "m/s" in lines[i] else 0)
        rows.append((key, float(nums[3]), float(nums[4])))
        i += 1
    return rows

panels = [("Approach speed (m/s), 30 mm sway", block("# Sweep 2")), ("Sensing delay (s), 0.10 m/s, 30 mm sway", block("# Sweep 3"))]
cols = ["#1b6ca8", "#c0392b"]; names = ["mean peak lip force (N)", "share of trials touching the lips"]
W, H, M = 760, 330, 55
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">', '<rect width="100%" height="100%" fill="white"/>']
for p, (title, rows) in enumerate(panels):
    x0 = 50 + p * 370; w = 300; y0 = 40; h = H - y0 - M
    xs = sorted(r[0] for r in rows)
    px = lambda i: x0 + w * i / (len(xs) - 1)
    out.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="none" stroke="#999"/>')
    out.append(f'<text x="{x0}" y="{y0-12}">{title}</text>')
    for k in range(0, 3):
        yy = y0 + h * (1 - k / 2)
        out.append(f'<text x="{x0-8}" y="{yy+4}" text-anchor="end">{k/2:g}</text>')
    for i, x in enumerate(xs):
        out.append(f'<text x="{px(i)}" y="{y0+h+16}" text-anchor="middle" font-size="10">{x:g}</text>')
    for c, idx in enumerate((2, 1)):
        vals = [min(r[idx], 1.0) for r in sorted(rows)]
        pts = [(px(i), y0 + h * (1 - v)) for i, v in enumerate(vals)]
        out.append(f'<polyline fill="none" stroke="{cols[c]}" stroke-width="2" points="{" ".join(f"{a:.1f},{b:.1f}" for a, b in pts)}"/>')
        for a, b in pts: out.append(f'<circle cx="{a:.1f}" cy="{b:.1f}" r="3" fill="{cols[c]}"/>')
out.append(f'<text x="14" y="{H/2}" transform="rotate(-90 14 {H/2})" text-anchor="middle">N (blue, clipped at 1) or share (red)</text>')
for c in range(2):
    out.append(f'<rect x="{150+c*230}" y="{H-24}" width="14" height="4" fill="{cols[c]}"/><text x="{170+c*230}" y="{H-18}">{names[c]}</text>')
out.append('</svg>')
open(os.path.join(here, "force_sweeps.svg"), "w").write("\n".join(out))
