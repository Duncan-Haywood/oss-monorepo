"""Write data/fredmd-vintages/<SERIES>.csv from AQLT/turningPointsDetection's per-series FRED-MD vintage files.

FRED-MD (McCracken and Ng, St. Louis Fed) publishes a monthly snapshot of ~130 US series as they stood that
month; its historical vintages run from 1999-08. stlouisfed.org refused this session's proxy (2026-11-24), so the
vintages are read from a public research repository that saved them per series as R objects:

    git clone --depth 1 --filter=blob:none https://github.com/AQLT/turningPointsDetection
    (commit 40a5d111bfd5f90be0562d449455a3a542f5d806; data/byseries_nber/<SERIES>.RDS, made by
    R_fred_nber/0-download_files.R from FRED-MD's Historical_FRED-MD.zip and FRED_MD.zip)

Each RDS is a named list: one log-level monthly series per vintage, named by its last observed month, starting
1959-01 (W875RX1's
early vintages from 1967-01; one, to 1999-10, holds only 1992-01 on: R's na.contiguous kept the stretch after a
gap); a vintage that added no new month for the series was dropped there (the first one to reach a month is
kept). Values are written back as levels at the source's own precision (PAYEMS whole thousands, W875RX1 one
decimal, INDPRO four), which exp() recovers to within 1e-9 of a round number on every cell (checked below).

Output, one file per series: a row per vintage, `last,first,from,values` where `last` is the vintage's last
month, `first` its first, `from` the first month whose value differs from the previous row (or that is new; `first` when the first month moved), and `values` the
`;`-separated levels from `from` to `last`. Reading the rows in order rebuilds every vintage exactly
(eval/fredmd-vintages.mjs).

usage: pip install rdata numpy; python3 eval/fredmd-vintages.py <turningPointsDetection checkout> [out dir]
"""
import sys
from fractions import Fraction
import warnings
from pathlib import Path

import numpy as np
import rdata

DIGITS = {'PAYEMS': 0, 'W875RX1': 1, 'INDPRO': 4}


def label(k):
    return f"{k // 12}-{k % 12 + 1:02d}"


def main(src, out):
    warnings.filterwarnings('ignore')
    out.mkdir(parents=True, exist_ok=True)
    for s, d in DIGITS.items():
        o = rdata.conversion.convert(rdata.parser.parse_file(src / 'data' / 'byseries_nber' / f'{s}.RDS'))
        prev, pstart, rows = [], None, []
        for key, v in o.items():
            last = round(float(key) * 12)
            x = np.exp(np.asarray(v.values, dtype=float)) * 10 ** d
            r = np.round(x)
            assert np.abs(x - r).max() < 1e-6, (s, key)
            vals = [int(z) for z in r]
            start = round(Fraction(str(v.index[0])) * 12)
            assert start + len(vals) - 1 == last, (s, key, len(vals))
            i = 0
            if start == pstart:
                while i < min(len(prev), len(vals)) and prev[i] == vals[i]:
                    i += 1
            fmt = (lambda z: str(z)) if d == 0 else (lambda z: f"{z / 10 ** d:.{d}f}")
            rows.append(f"{label(last)},{label(start)},{label(start + i)},{';'.join(fmt(z) for z in vals[i:])}")
            prev, pstart = vals, start
        (out / f'{s}.csv').write_text('last,first,from,values\n' + '\n'.join(rows) + '\n')
        print(s, len(rows), 'vintages')


if __name__ == '__main__':
    here = Path(__file__).resolve().parent.parent
    main(Path(sys.argv[1]), Path(sys.argv[2]) if len(sys.argv) > 2 else here / 'data' / 'fredmd-vintages')
