"""Draw figure.svg from results.json: median gap to the best-known mass against FE evaluations, limit u30, four methods
(8 seeds). Stdlib only."""
import json, os, statistics
HERE = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(HERE, 'results.json')))
LIM = 'u30'
ref = [x for x in r['runs'] if x['limit'] == LIM and x['method'] == 'long'][0]['trace'][-1]
series = [('random', '#888888'), ('es', '#c0392b'), ('assisted_float', '#1f6fb2'), ('assisted_qat6', '#2e8b57')]
names = {'random': 'random search', 'es': 'FE-only ES', 'assisted_float': 'assisted, float surrogate', 'assisted_qat6': 'assisted, 6-bit QAT surrogate'}
W, H, x0, y0, pw, ph, top, nmax = 640, 340, 60, 40, 560, 220, 30.0, r['budget']
out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" font-family="sans-serif" font-size="13">' % (W, H),
       '<rect width="100%" height="100%" fill="#fff"/>',
       '<text x="10" y="22" font-size="14" font-weight="bold">Median gap to best-known mass (%) vs FE evaluations, limit u30</text>',
       '<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#222"/><line x1="%d" y1="%d" x2="%d" y2="%d" stroke="#222"/>' % (x0, y0, x0, y0 + ph, x0, y0 + ph, x0 + pw, y0 + ph)]
for t in (0, 10, 20, 30):
    y = y0 + ph - ph * t / top
    out.append('<text x="%d" y="%.1f" text-anchor="end" fill="#222">%d</text>' % (x0 - 6, y + 4, t))
for n in (30, 60, 90, 120, 150):
    out.append('<text x="%.1f" y="%d" text-anchor="middle" fill="#222">%d</text>' % (x0 + pw * n / nmax, y0 + ph + 18, n))
out.append('<text x="%d" y="%d" text-anchor="middle" fill="#222">FE evaluations</text>' % (x0 + pw // 2, y0 + ph + 36))
for i, (m, c) in enumerate(series):
    runs = [x['trace'] for x in r['runs'] if x['limit'] == LIM and x['method'] == m]
    pts = []
    for n in range(30, nmax + 1):
        v = [t[n - 1] / ref - 1 for t in runs if t[n - 1] is not None]
        if len(v) == len(runs):
            pts.append('%.1f,%.1f' % (x0 + pw * n / nmax, y0 + ph - ph * min(100 * statistics.median(v), top) / top))
    out.append('<polyline fill="none" stroke="%s" stroke-width="2" points="%s"/>' % (c, ' '.join(pts)))
    lx, ly = 70 + (i % 2) * 280, 300 + (i // 2) * 18
    out.append('<rect x="%d" y="%d" width="12" height="12" fill="%s"/><text x="%d" y="%d" fill="#222">%s</text>' % (lx, ly, c, lx + 18, ly + 11, names[m]))
out.append('</svg>')
open(os.path.join(HERE, 'figure.svg'), 'w').write('\n'.join(out) + '\n')
