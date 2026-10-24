"""Write the compact public extract the in-browser trainer (worker.js) learns from.

One row per woman's first marriage from the NSFG 1995-2023 pooled lens
(../../reproducibility/nsfg_pooled_first_marriage): months from the wedding to dissolution or
interview, the event flag (divorce, annulment or separation), the cycle-normalised survey
weight, the person-held-out fold (the same seeded assignment train_pooled.py uses), and the
lens's 18 inputs fixed at or before the wedding. Nothing measured at interview, no cycle, no
design variables, no identifiers. Times and ages are stored in whole months; the build checks
that this loses nothing.

Licence: NSFG public-use files are works of the U.S. Government (NCHS), not subject to
copyright (17 U.S.C. 105; https://www.cdc.gov/other/agencymaterials.html). The NCHS data-use
terms (https://www.cdc.gov/nchs/data_access/restrictions.htm) apply to this subset as to the
source: statistical reporting and analysis only, no attempt to identify anyone, no linkage to
other data. Written into the file's `licence` field.

Run from the repository root after the lens's `sh download.sh` (raw files in $NSFG_RAW):
    NSFG_RAW=... python3 research/marriage-divorce-evidence/app/train/tools/build_extract.py
Needs numpy, pandas, scikit-learn 1.7.2 (imported by train_pooled.py).
"""
from pathlib import Path
import gzip, hashlib, json, sys
import numpy as np

HERE = Path(__file__).resolve().parent.parent          # app/train
LENS = HERE.parent.parent / 'reproducibility' / 'nsfg_pooled_first_marriage'
sys.path.insert(0, str(LENS))
import train_pooled as T  # noqa: E402

OUT = HERE / 'nsfg_pooled_women.json.gz'
NUM = [c for c in T.WOMEN_NUM if c != 'marriage_years']


def months(x):
    """Whole months, or None; asserts the value was already on a month grid."""
    out = []
    for v in x:
        if v is None or not np.isfinite(v):
            out.append(None)
            continue
        m = round(v * 12)
        assert abs(m - v * 12) < 1e-6, v
        out.append(int(m))
    return out


def main():
    people, _ = T.people_table()
    women = T.normalise_weights(people[people.sex == 'F']).reset_index(drop=True)
    rng = np.random.default_rng(T.SEED)               # train_pooled._cv's fold assignment
    perm = rng.permutation(len(women))
    fold = np.empty(len(women), int)
    fold[perm] = np.arange(len(women)) % 5
    cols = {'months': [int(m) for m in women.months], 'event': [int(e) for e in women.event],
            'weight': [float(f'{w:.6g}') for w in women.weight], 'fold': [int(f) for f in fold]}
    numeric = []
    for c in NUM:
        if c == 'wedding_year':
            assert women[c].notna().all() and (women[c] == women[c].round()).all()
            cols[c] = [int(v) for v in women[c]]
            numeric.append({'name': c, 'unit': 'year', 'scale': 1})
        else:
            cols[c] = months(women[c].astype(float).to_numpy())
            numeric.append({'name': c, 'unit': 'months', 'scale': 12})
    categorical = []
    for c in T.WOMEN_CAT:
        s = women[c].astype(str)
        levels = sorted(s.unique())
        code = {v: i for i, v in enumerate(levels)}
        cols[c] = [code[v] for v in s]
        categorical.append({'name': c, 'levels': levels})
    doc = {
        'format': 'nsfg-pooled-women-extract/1',
        'about': ("Women's first marriages, NSFG 1995-2023 (8 cycles), one row per marriage: months from the wedding to "
                  "dissolution (divorce, annulment or separation; event=1) or to the interview/widowhood (event=0). "
                  "Inputs fixed at or before the wedding only. weight: NCHS final weight / its mean. fold: the "
                  "person-held-out fold of reproducibility/nsfg_pooled_first_marriage/train_pooled.py (seed 20261020)."),
        'source': 'https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NSFG/ (checksums: reproducibility/nsfg_pooled_first_marriage/SHA256SUMS)',
        'licence': ("Derived from NSFG public-use files, works of the U.S. Government (NCHS) not subject to copyright "
                    "(17 U.S.C. 105). NCHS data-use terms apply: use for statistical reporting and analysis only; make no "
                    "attempt to learn the identity of any person; do not link with other data. "
                    "https://www.cdc.gov/nchs/data_access/restrictions.htm"),
        'citation': 'National Center for Health Statistics. National Survey of Family Growth, 1995-2023 public-use files.',
        'n': len(women), 'events': int(women.event.sum()),
        'numeric': numeric, 'categorical': categorical, 'columns': cols,
    }
    raw = json.dumps(doc, separators=(',', ':')).encode()
    OUT.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
    print(f'{OUT.name}: {len(women)} marriages, {doc["events"]} dissolutions, {len(raw)} bytes JSON, '
          f'{OUT.stat().st_size} bytes gzip, sha256 {hashlib.sha256(OUT.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    main()
