#!/usr/bin/env python3
"""Write app/data/literature_evidence.json: the evidence records that app/literature.js
maps to an adjustment factor, with the fields it shows the user (provenance, quote,
locator, derivation) and the flags it enforces (verified, usable_in_app, usable_withheld).
Records without a `factor` are not exported; the app never sees unverified numbers from them.

    python3 scripts/export_app_evidence.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, '..', '..', 'app', 'data', 'literature_evidence.json')
KEEP = ['id', 'factor', 'predictor', 'contrast', 'measure', 'unit', 'estimate', 'ci_low', 'ci_high', 'derivation', 'center',
        'transform', 'se_or_other', 'n', 'population', 'country', 'years', 'design', 'adjusted_for', 'citation', 'doi', 'url',
        'locator', 'quote', 'provenance', 'verified', 'usable_in_app', 'usable_withheld', 'caveats']


def main():
    ev = json.load(open(os.path.join(ROOT, 'evidence.json'), encoding='utf-8'))
    recs = [{k: r[k] for k in KEEP if k in r} | {'verification_reason': r['verification']['reason'], 'verified_on': r['verification']['date']}
            for r in ev['records'] if r.get('factor')]
    doc = {'about': 'Exported from reproducibility/literature_evidence/evidence.json by scripts/export_app_evidence.py. '
                    'Only records with an app factor are included; app/literature.js applies a record only if verified, '
                    'provenance is "primary" and usable_in_app is true.',
           'records': recs}
    json.dump(doc, open(OUT, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print(len(recs), 'records ->', os.path.normpath(OUT))


if __name__ == '__main__':
    main()
