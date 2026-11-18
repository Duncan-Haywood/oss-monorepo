#!/usr/bin/env python3
"""Scatter of the LLM's predicted gap between source and target group against the true gap, one point
per cell, for both models (stdlib only; reads results/cells.csv, writes results/gap_scatter.svg)."""
import csv
from pathlib import Path

HERE = Path(__file__).resolve().parent
COL = {'generation': '#E69F00', 'ethnicity': '#56B4E9', 'tradition': '#009E73', 'period': '#CC79A7'}
SHAPE = {'generation': 'circle', 'ethnicity': 'square', 'tradition': 'circle', 'period': 'diamond'}


def panel(rows, x0, title, W=330, H=300, lim=0.5):
    m = 40
    sx = lambda v: x0 + m + (v + lim) / (2 * lim) * (W - m - 10)
    sy = lambda v: 20 + (lim - v) / (2 * lim) * (H - m - 20)
    o = [f'<text x="{x0 + W / 2:.0f}" y="14" text-anchor="middle" font-size="12">{title}</text>',
         f'<rect x="{sx(-lim):.1f}" y="{sy(lim):.1f}" width="{sx(lim) - sx(-lim):.1f}" height="{sy(-lim) - sy(lim):.1f}" fill="none" stroke="#888"/>',
         f'<line x1="{sx(-lim):.1f}" y1="{sy(-lim):.1f}" x2="{sx(lim):.1f}" y2="{sy(lim):.1f}" stroke="#888" stroke-dasharray="4 3"/>',
         f'<line x1="{sx(0):.1f}" y1="{sy(-lim):.1f}" x2="{sx(0):.1f}" y2="{sy(lim):.1f}" stroke="#ccc"/>',
         f'<line x1="{sx(-lim):.1f}" y1="{sy(0):.1f}" x2="{sx(lim):.1f}" y2="{sy(0):.1f}" stroke="#ccc"/>']
    for t in (-0.4, -0.2, 0, 0.2, 0.4):
        o.append(f'<text x="{sx(t):.1f}" y="{sy(-lim) + 13:.1f}" text-anchor="middle" font-size="9">{t * 100:+.0f}</text>')
        o.append(f'<text x="{sx(-lim) - 4:.1f}" y="{sy(t) + 3:.1f}" text-anchor="end" font-size="9">{t * 100:+.0f}</text>')
    o.append(f'<text x="{x0 + m + (W - m) / 2:.0f}" y="{H - 2}" text-anchor="middle" font-size="10">true gap, target &#8722; source (points)</text>')
    o.append(f'<text transform="translate({x0 + 10},{20 + (H - m) / 2:.0f}) rotate(-90)" text-anchor="middle" font-size="10">LLM-predicted gap (points)</text>')
    for r in rows:
        x, y = float(r['true_gap']), float(r['pred_gap'])
        x, y = max(-lim, min(lim, x)), max(-lim, min(lim, y))
        k = r['kind']
        if SHAPE[k] == 'square':
            o.append(f'<rect x="{sx(x) - 3:.1f}" y="{sy(y) - 3:.1f}" width="6" height="6" fill="{COL[k]}" fill-opacity="0.8"/>')
        elif SHAPE[k] == 'diamond':
            o.append(f'<path d="M{sx(x):.1f} {sy(y) - 4:.1f}l4 4l-4 4l-4 -4z" fill="{COL[k]}" fill-opacity="0.8"/>')
        else:
            o.append(f'<circle cx="{sx(x):.1f}" cy="{sy(y):.1f}" r="3" fill="{COL[k]}" fill-opacity="0.8"/>')
    return o


def main():
    rows = list(csv.DictReader(open(HERE / 'results' / 'cells.csv')))
    W = 700
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="330" font-family="sans-serif">',
         '<rect width="100%" height="100%" fill="white"/>']
    o += panel([r for r in rows if r['estimator'] == 'LLM05'], 0, 'Qwen2.5-0.5B-Instruct')
    o += panel([r for r in rows if r['estimator'] == 'LLM15'], 350, 'Qwen2.5-1.5B-Instruct')
    for i, k in enumerate(COL):
        x = 60 + i * 110
        mark = {'square': f'<rect x="{x - 3}" y="319" width="6" height="6" fill="{COL[k]}"/>',
                'diamond': f'<path d="M{x} 318l4 4l-4 4l-4 -4z" fill="{COL[k]}"/>'}.get(SHAPE[k], f'<circle cx="{x}" cy="322" r="4" fill="{COL[k]}"/>')
        o.append(mark + f'<text x="{x + 8}" y="326" font-size="10">{k}</text>')
    o.append('</svg>')
    (HERE / 'results' / 'gap_scatter.svg').write_text('\n'.join(o) + '\n')


if __name__ == '__main__':
    main()
