"""Redraw experiments/fpga.png (LCs and Fmax against hidden width) from results.json only."""
import json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
H = os.path.dirname(os.path.abspath(__file__))
r = json.load(open(os.path.join(H, 'results.json')))['rows']
fig, (a, b) = plt.subplots(1, 2, figsize=(9, 3.8))
col = {2: '#1b9e77', 4: '#1b6ca8', 8: '#d95f02'}
for wb in (2, 4, 8):
    rs = [x for x in r if x['wbits'] == wb]
    hs = [x['H'] for x in rs]
    a.plot(hs, [x['up5k']['pnr_lc'] if x['up5k']['fits'] else None for x in rs], 'o-', c=col[wb], label=f'{wb}-bit weights')
    b.plot(hs, [x['up5k']['fmax'] for x in rs], 'o-', c=col[wb], label=f'up5k, {wb}-bit')
    b.plot(hs, [x['hx8k']['fmax'] for x in rs], 's--', c=col[wb], alpha=.6, label=f'hx8k, {wb}-bit')
a.axhline(5280, c='k', ls=':'); a.text(8, 5000, 'UP5K: 5,280 LCs', fontsize=7, va='top')
a.set_xscale('log', base=2); a.set_xlabel('hidden width H'); a.set_ylabel('logic cells after place and route'); a.legend(fontsize=7)
b.set_xscale('log', base=2); b.set_xlabel('hidden width H'); b.set_ylabel('nextpnr max clock (MHz, median of 3 seeds)'); b.legend(fontsize=6, ncol=2)
fig.suptitle('accel-fpga: kws_engine on iCE40 (random weights, ROMs on-chip)', fontsize=9)
for x in (a, b): x.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(H, 'fpga.png'), dpi=130)
