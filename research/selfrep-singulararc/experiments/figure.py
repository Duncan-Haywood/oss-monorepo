"""Redraw experiments/figure.png (u(t): closed form vs DP, c = 1000) from the committed results.txt only."""
import os
import re
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
H = os.path.dirname(os.path.abspath(__file__))
rows = []
for line in open(os.path.join(H, 'results.txt')):
    m = re.match(r't=\s*(\d+) h\s+closed-form u=\s*([\d.]+) \(n=\s*([\d.]+)\)\s+DP u=\s*([\d.]+)', line)
    if m:
        rows.append(tuple(float(g) for g in m.groups()))
assert rows, 'no table-3 rows found in results.txt'
t, uc, _, ud = zip(*rows)
fig, ax = plt.subplots(figsize=(7, 4))
ax.plot(t, uc, 'o-', color='#1b6ca8', label='closed form (Pontryagin candidate)')
ax.plot(t, ud, 's--', color='#d95f02', label='dynamic-programming policy')
ax.set_xlabel('time (h)')
ax.set_ylabel('share of output reinvested, u(t)')
ax.set_title('selfrep-singulararc: reinvestment share, market capacity c = 1000, no failures', fontsize=9)
ax.legend(fontsize=8)
ax.grid(alpha=.3)
fig.tight_layout()
fig.savefig(os.path.join(H, 'figure.png'), dpi=130)
