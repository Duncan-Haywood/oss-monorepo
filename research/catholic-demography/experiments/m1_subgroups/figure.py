#!/usr/bin/env python3
"""Draw retention.svg and fertility_gap.svg from the committed CSV tables (stdlib only)."""
import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
COL = {'NH white': '#1f6fb2', 'Hispanic': '#c0392b', 'All': '#555555'}


def rows(name):
    with open(HERE / name) as f:
        return list(csv.DictReader(f))


def dotplot(fname, title, ylabel, cats, series, ylo, yhi, hline=None, fmt='{:.0%}'):
    W, H, L, R, T, B = 640, 380, 70, 150, 50, 60
    pw, ph = W - L - R, H - T - B
    X = lambda i, k: L + pw * (i + 0.5) / len(cats) + (k - (len(series) - 1) / 2) * 14
    Y = lambda v: T + ph * (1 - (v - ylo) / (yhi - ylo))
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="sans-serif" font-size="12">',
         f'<title>{title}</title><rect width="{W}" height="{H}" fill="white"/>',
         f'<text x="{L}" y="24" font-size="15" font-weight="bold">{title}</text>']
    for j in range(6):
        v = ylo + (yhi - ylo) * j / 5
        o.append(f'<line x1="{L}" x2="{L+pw}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="#ddd"/>'
                 f'<text x="{L-6}" y="{Y(v)+4:.1f}" text-anchor="end">{fmt.format(v)}</text>')
    if hline is not None:
        o.append(f'<line x1="{L}" x2="{L+pw}" y1="{Y(hline):.1f}" y2="{Y(hline):.1f}" stroke="#333" stroke-dasharray="4 3"/>')
    for i, c in enumerate(cats):
        o.append(f'<text x="{L + pw*(i+0.5)/len(cats):.1f}" y="{T+ph+20}" text-anchor="middle">{c}</text>')
    o.append(f'<text transform="translate(16,{T+ph/2}) rotate(-90)" text-anchor="middle">{ylabel}</text>')
    for k, (name, pts) in enumerate(series):
        col = COL.get(name, '#2e8b57')
        prev = None
        for i, c in enumerate(cats):
            if c not in pts:
                continue
            e, lo, hi = pts[c]
            x = X(i, k)
            o.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{Y(lo):.1f}" y2="{Y(hi):.1f}" stroke="{col}" stroke-width="2"/>'
                     f'<circle cx="{x:.1f}" cy="{Y(e):.1f}" r="4.5" fill="{col}"/>')
            if prev:
                o.append(f'<line x1="{prev[0]:.1f}" y1="{prev[1]:.1f}" x2="{x:.1f}" y2="{Y(e):.1f}" stroke="{col}" stroke-opacity="0.5"/>')
            prev = (x, Y(e))
        o.append(f'<circle cx="{L+pw+18}" cy="{T+10+k*20}" r="5" fill="{col}"/><text x="{L+pw+28}" y="{T+14+k*20}">{name}</text>')
    o.append(f'<text x="{L}" y="{H-8}" fill="#666" font-size="10">GSS 1972-2024 (NORC), weighted (wtssps); bars: 95% design-based intervals.</text></svg>')
    (HERE / fname).write_text('\n'.join(o) + '\n')


def main():
    cats = ['Born 1925-44', 'Born 1945-64', 'Born 1965-80', 'Born 1981-96']
    t3 = rows('t3_retention.csv')
    ser = []
    for g in ['NH white', 'Hispanic']:
        ser.append((g, {r['cohort']: tuple(float(r[k]) for k in ('estimate', 'lo', 'hi')) for r in t3 if r['group'] == g}))
    dotplot('retention.svg', 'Raised Catholic, still Catholic (surveys 2000-2024)', 'share still Catholic',
            [c.replace('Born ', '') for c in cats], [(n, {k.replace('Born ', ''): v for k, v in p.items()}) for n, p in ser], 0.4, 0.9)
    t2 = rows('t2_fertility_contrasts.csv')
    ser = [('NH white', {r['cohort'].replace('Born ', ''): tuple(float(r[k]) for k in ('estimate', 'lo', 'hi'))
                         for r in t2 if r['group'] == 'NH white' and r['contrast'] == 'Catholic - Protestant' and r['cohort'] != 'All cohorts'})]
    dotplot('fertility_gap.svg', 'Children ever born: Catholic minus Protestant (ages 45-89)', 'children (difference)',
            [c.replace('Born ', '') for c in cats[:3]], ser, -0.6, 0.4, hline=0.0, fmt='{:+.1f}')


if __name__ == '__main__':
    main()
