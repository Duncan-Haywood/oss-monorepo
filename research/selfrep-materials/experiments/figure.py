"""Redraw experiments/figure.png (imported kg per printer copy, recycling off vs on) from results.txt only."""
import os
import re
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
H = os.path.dirname(os.path.abspath(__file__))
sections, cur, label = {}, None, None
for line in open(os.path.join(H, 'results.txt')):
    if line.startswith('== recycling'):
        cur = 'off' if 'OFF' in line else 'on'
        sections[cur] = []
    elif line.startswith('=='):
        cur = None
    elif cur and not line.startswith(' '):
        m = re.match(r'(\S+)\s+\[(\w+)\] total ([\d.]+) kg', line)
        label = f'{m.group(1)} [{m.group(2)}]' if m else None
        if m:
            sections[cur].append([label, float(m.group(3)), {}])
    elif cur and sections[cur]:
        for k, v in re.findall(r'([A-Za-z/ ()]+?) ([\d.]+)(?:,|$)', line.strip()):
            sections[cur][-1][2][k.strip()] = float(v)
assert sections.get('off') and sections.get('on'), 'tables not found in results.txt'
fig, axes = plt.subplots(1, 2, figsize=(9, 4), sharey=True)
for ax, key in zip(axes, ('off', 'on')):
    rs = sections[key]
    names = sorted({k for r in rs for k in r[2]}, key=lambda k: -max(r[2].get(k, 0) for r in rs))
    bottom = [0] * len(rs)
    for n in names:
        vals = [r[2].get(n, 0) for r in rs]
        ax.bar(range(len(rs)), vals, bottom=bottom, label=n)
        bottom = [b + v for b, v in zip(bottom, vals)]
    ax.set_xticks(range(len(rs)))
    ax.set_xticklabels([r[0].replace('printer+', '+') for r in rs], rotation=30, ha='right', fontsize=6)
    ax.set_title(f'recycling {key.upper()}', fontsize=9)
axes[0].set_ylabel('imported kg per printer copy')
axes[1].legend(fontsize=6)
fig.suptitle('selfrep-materials: imported mass per copy (assumed parameters)', fontsize=9)
fig.tight_layout()
fig.savefig(os.path.join(H, 'figure.png'), dpi=130)
