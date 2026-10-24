"""Redraw fidelity.png (cepstral error vs signal level, three FFT shift schedules) from results.json only."""
import json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
H = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(H, 'results.json')))
fig, ax = plt.subplots(figsize=(7, 4.2))
for name in dict.fromkeys(x['schedule'] for x in r['fidelity']):
    pts = [x for x in r['fidelity'] if x['schedule'] == name]
    ax.plot([p['level_dbfs'] for p in pts], [p['rel_to_spread'] for p in pts], marker='o', label='%s, peak %d to %d bits' % (name, min(p['bits'] for p in pts), max(p['bits'] for p in pts)))
ax.set_xlabel('signal level (dBFS RMS), -61 dBFS microphone noise floor')
ax.set_ylabel('RMS cepstral error / cepstral spread')
ax.set_title('accel-frontend: 16-bit FFT scaling vs error (synthetic voiced frames)', fontsize=9)
ax.legend(fontsize=7); ax.grid(alpha=.3); fig.tight_layout(); fig.savefig(os.path.join(H, 'fidelity.png'), dpi=130)
