"""Draw heldout.svg from results.txt (stdlib only): held-out prediction error of the fitted twin per input, beside the condition number."""
import os, re
HERE = os.path.dirname(os.path.abspath(__file__))
cond, ho = {}, {}
sec = ""
for l in open(os.path.join(HERE, "results.txt")):
    if l.startswith("=="):
        sec = l[3]
        continue
    p = l.split()
    if len(p) > 5 and p[1] == "|":
        if sec == "A":
            cond[p[0]] = float(p[5])
        elif sec == "B":
            ho[p[0]] = float(p[11])
names = list(ho)
W, H, L, T = 640, 300, 70, 40
mx = max(ho.values())
bw = (W - L - 20) / len(names)
o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
     '<rect width="100%" height="100%" fill="#fff"/>',
     f'<text x="10" y="18" font-weight="bold">Held-out RMSE of the fitted twin (mean of 100 fits) and Fisher condition number</text>',
     f'<line x1="{L}" y1="{H-50}" x2="{W-10}" y2="{H-50}" stroke="#444"/>']
for i, n in enumerate(names):
    h = ho[n] / mx * (H - 50 - T - 10)
    x = L + bw * i + bw * .2
    o.append(f'<rect x="{x}" y="{H-50-h}" width="{bw*.6}" height="{h}" fill="#1f6fb2"/>')
    o.append(f'<text x="{x+bw*.3}" y="{H-54-h}" text-anchor="middle">{ho[n]:.5f}</text>')
    o.append(f'<text x="{x+bw*.3}" y="{H-32}" text-anchor="middle">{n.replace("_", " ")}</text>')
    o.append(f'<text x="{x+bw*.3}" y="{H-16}" text-anchor="middle" fill="#c0392b">cond {cond[n]:.0f}</text>')
o.append('</svg>')
open(os.path.join(HERE, "heldout.svg"), "w").write("\n".join(o))
