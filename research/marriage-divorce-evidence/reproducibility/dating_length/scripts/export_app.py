"""Write app/data/dating_length.json from this folder's aggregate outputs and the verified
literature records on premarital relationship length (stdlib only).

    python3 scripts/export_app.py
"""
import csv
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
EVIDENCE = OUT.parent / 'literature_evidence' / 'evidence.json'
APP = OUT.parent.parent / 'app' / 'data' / 'dating_length.json'
LIT_IDS = ['FTM2015_dated1to2', 'FTM2015_dated3plus']
KEEP = ['id', 'predictor', 'contrast', 'measure', 'estimate', 'ci_low', 'ci_high', 'n', 'population', 'years', 'design',
        'adjusted_for', 'citation', 'doi', 'locator', 'quote', 'provenance', 'verified', 'usable_in_app', 'caveats']


def num(v):
    try:
        return round(float(v), 5)
    except (TypeError, ValueError):
        return v if v not in ('', None) else None


def read(name):
    with open(OUT / name, newline='') as f:
        return [{k: num(v) if k not in ('model', 'inputs', 'band') else v for k, v in r.items()} for r in csv.DictReader(f)]


def main():
    ev = json.loads(EVIDENCE.read_text(encoding='utf-8'))
    recs = [{k: r[k] for k in KEEP if k in r} for r in ev['records'] if r['id'] in LIT_IDS]
    assert len(recs) == len(LIT_IDS) and all(r['verified'] for r in recs)
    audit = json.loads((OUT / 'sample_audit.json').read_text())
    doc = dict(
        about='Dating length before marriage. HCMST 2009 married couples (held-out test, ../reproducibility/dating_length/) and verified published estimates. Built by reproducibility/dating_length/scripts/export_app.py; aggregates only.',
        grade=dict(design='retrospective_observational', label='retrospective surveys; held-out test null',
                   applied=False,
                   reason='Not applied to any lens number: HCMST shows no held-out gain, and the only verified hazard ratios come from an opt-in online retrospective survey that the evidence review marks not usable in the app.'),
        hcmst_bands=read('dating_bands.csv'),
        heldout=read('heldout_comparison.csv'),
        audit=audit,
        literature=recs,
    )
    APP.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')
    print('wrote', APP)


if __name__ == '__main__':
    main()
