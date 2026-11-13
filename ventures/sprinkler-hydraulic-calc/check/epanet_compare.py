"""Run the seeded networks from cases.mjs through EPANET 2.2 and store the
node pressures and pipe flows it reports, for hydraulics.test.mjs to compare.

  node check/cases.mjs > /tmp/cases.json
  python -I check/epanet_compare.py /tmp/cases.json check/epanet-results.json

Needs wntr (EPANET 2.2's toolkit library ships inside it). Each sprinkler is an
EPANET emitter with coefficient K and exponent 0.5; the source is a reservoir
whose head gives the case's source pressure. Units GPM, headloss H-W.
"""
import json
import os
import sys
import tempfile

from wntr.epanet import toolkit

ID = {
    'sch40': {'1': 1.049, '1-1/4': 1.380, '1-1/2': 1.610, '2': 2.067, '2-1/2': 2.469, '3': 3.068, '4': 4.026, '6': 6.065, '8': 7.981},
    'sch10': {'1': 1.097, '1-1/4': 1.442, '1-1/2': 1.682, '2': 2.157, '2-1/2': 2.635, '3': 3.260, '4': 4.260, '6': 6.357, '8': 8.329},
}
PSI_PER_FT = 0.4333
# Parameter codes from EPANET 2.2's epanet2_enums.h.
EN_PRESSURE = 11
EN_FLOW = 8


def inp(case):
    src = case['source']
    lines = ['[TITLE]', case['name'], '[JUNCTIONS]']
    for n in case['nodes']:
        if n['id'] != src:
            lines.append(f"{n['id']} {n['elevationFt']} {n.get('demandGpm', 0)}")
    s = next(n for n in case['nodes'] if n['id'] == src)
    lines += ['[RESERVOIRS]', f"{src} {case['sourcePsi'] / PSI_PER_FT + s['elevationFt']!r}", '[PIPES]']
    for p in case['pipes']:
        d = p.get('idIn') or ID[p.get('schedule', 'sch40')][p['size']]
        lines.append(f"{p['id']} {p['from']} {p['to']} {p['lengthFt'] + p.get('fittingsFt', 0)} {d} {p['c']} 0 Open")
    lines.append('[EMITTERS]')
    for n in case['nodes']:
        if n.get('k'):
            lines.append(f"{n['id']} {n['k']}")
    lines += ['[OPTIONS]', 'Units GPM', 'Headloss H-W', 'Emitter Exponent 0.5', 'Accuracy 0.00000001', 'Trials 500', 'Specific Gravity 1.0', '[END]']
    return '\n'.join(lines) + '\n'


def run(case, tmp):
    path = os.path.join(tmp, case['name'] + '.inp')
    with open(path, 'w') as f:
        f.write(inp(case))
    en = toolkit.ENepanet(version=2.2)
    en.ENopen(path, os.path.join(tmp, case['name'] + '.rpt'), '')
    en.ENsolveH()
    pressures = {}
    for n in case['nodes']:
        i = en.ENgetnodeindex(n['id'])
        pressures[n['id']] = en.ENgetnodevalue(i, EN_PRESSURE)
    flows = {}
    for p in case['pipes']:
        i = en.ENgetlinkindex(p['id'])
        flows[p['id']] = en.ENgetlinkvalue(i, EN_FLOW)
    en.ENclose()
    return {'name': case['name'], 'sourcePsi': case['sourcePsi'], 'pressurePsi': pressures, 'flowGpm': flows}


def main(src, dst):
    cases = json.load(open(src))
    with tempfile.TemporaryDirectory() as tmp:
        results = [run(c, tmp) for c in cases]
    json.dump({'engine': 'EPANET 2.2 toolkit via wntr', 'cases': results}, open(dst, 'w'), indent=0, sort_keys=True)
    print(f'{len(results)} cases written to {dst}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
