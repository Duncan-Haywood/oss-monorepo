"""Redraw bfp.png (cepstral error vs signal level: fixed shift schedules and block floating point) from results.json only."""
import json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
H = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(H, 'results.json')))
fig, ax = plt.subplots(figsize=(7, 4.2))
for name in dict.fromkeys(x['scheme'] for x in r['rows']):
    pts = [x for x in r['rows'] if x['scheme'] == name]
    ax.semilogy([p['level_dbfs'] for p in pts], [p['rel_err'] for p in pts], marker='o', lw=3 if 'block' in name else 1.2, label=name)
ax.set_xlabel('signal level (dBFS RMS), -61 dBFS microphone noise floor')
ax.set_ylabel('RMS cepstral error / cepstral spread')
ax.set_title('accel-frontendbfp: block floating point vs fixed FFT shifts (synthetic voiced frames)', fontsize=9)
ax.legend(fontsize=7); ax.grid(alpha=.3, which='both'); fig.tight_layout(); fig.savefig(os.path.join(H, 'bfp.png'), dpi=130)
