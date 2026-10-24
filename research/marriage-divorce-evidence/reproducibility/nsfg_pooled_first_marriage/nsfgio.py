"""Read selected columns of the official NSFG public-use respondent files (stdlib + pandas).

Three layouts occur across the cycles used here:
- 1995 (Cycle 5): fixed-width ASCII with a SAS setup file (`input NAME start-end ...`);
- 2002 to 2017-2019: fixed-width ASCII with a Stata dictionary (`_column(n) type NAME %wf`);
- 2022-2023: a CSV inside the official zip.

Raw files live in $NSFG_RAW (default: ./raw next to this file); `download.sh` fetches them
from ftp.cdc.gov and checks SHA256SUMS. Nothing here is committed: NSFG terms do not clearly
allow redistribution. Column names are returned upper-case.
"""
from pathlib import Path
import os, re
import numpy as np, pandas as pd

HERE = Path(__file__).resolve().parent
RAW = Path(os.environ.get('NSFG_RAW', HERE / 'raw'))

# (data file, layout file) per cycle and sex. 2022-2023 is a CSV and needs no layout.
FILES = {
    ('1995', 'F'): ('1995FemRespData.dat', '1995FemRespSetup.sas'),
    ('2002', 'F'): ('2002FemResp.dat', '2002FemResp.dct'),
    ('2002', 'M'): ('2002Male.dat', '2002Male.dct'),
    ('2006_2010', 'F'): ('2006_2010_FemResp.dat', '2006_2010_FemRespSetup.dct'),
    ('2006_2010', 'M'): ('2006_2010_Male.dat', '2006_2010_MaleSetup.dct'),
    ('2011_2013', 'F'): ('2011_2013_FemRespData.dat', '2011_2013_FemRespSetup.dct'),
    ('2011_2013', 'M'): ('2011_2013_MaleData.dat', '2011_2013_MaleSetup.dct'),
    ('2013_2015', 'F'): ('2013_2015_FemRespData.dat', '2013_2015_FemRespSetup.dct'),
    ('2013_2015', 'M'): ('2013_2015_MaleData.dat', '2013_2015_MaleSetup.dct'),
    ('2015_2017', 'F'): ('2015_2017_FemRespData.dat', '2015_2017_FemRespSetup.dct'),
    ('2015_2017', 'M'): ('2015_2017_MaleData.dat', '2015_2017_MaleSetup.dct'),
    ('2017_2019', 'F'): ('2017_2019_FemRespData.dat', '2017_2019_FemRespSetup.dct'),
    ('2017_2019', 'M'): ('2017_2019_MaleData.dat', '2017_2019_MaleSetup.dct'),
    ('2022_2023', 'F'): ('NSFG-2022-2023-FemRespPUFData.zip', None),
    ('2022_2023', 'M'): ('NSFG-2022-2023-MaleRespPUFData.zip', None),
}

DCT_LINE = re.compile(r'_column\((\d+)\)\s+(\S+)\s+(\S+)\s+%(\d+)')


def dct_layout(path):
    out = {}
    for line in open(path, encoding='latin-1'):
        m = DCT_LINE.search(line)
        if m:
            start, width = int(m[1]), int(m[4])
            out[m[3].upper()] = (start - 1, start - 1 + width)
    return out


def sas_layout(path):
    """The INPUT statement of an NCHS SAS setup file: NAME start[-end] pairs."""
    txt = open(path, encoding='latin-1').read()
    a = txt.index('input', txt.index('* SAS DATA, INFILE')) + len('input')
    body = txt[a:txt.index(';', a)]
    out = {}
    for m in re.finditer(r'([A-Za-z_][A-Za-z0-9_]*)\s+(\$\s*)?(\d+)(?:\s*-\s*(\d+))?', body):
        s = int(m[3])
        e = int(m[4]) if m[4] else s
        out[m[1].upper()] = (s - 1, e)
    return out


def read_fixed(dat, spec, names):
    missing = [n for n in names if n not in spec]
    if missing:
        raise KeyError(f'{dat}: not in layout: {missing}')
    cols = {n: [] for n in names}
    with open(dat, 'rb') as fh:
        for raw in fh:
            line = raw.decode('latin-1').rstrip('\r\n')
            if not line.strip():
                continue
            for n in names:
                a, b = spec[n]
                s = line[a:b].strip()
                cols[n].append(float(s) if s and s != '.' else np.nan)
    return pd.DataFrame(cols)


def read_csv_zip(zpath, names):
    import zipfile
    with zipfile.ZipFile(zpath) as z:
        member = [n for n in z.namelist() if n.lower().endswith('.csv')]
        assert len(member) == 1, member
        with z.open(member[0]) as fh:
            d = pd.read_csv(fh, low_memory=False)
    d.columns = [c.upper() for c in d.columns]
    missing = [n for n in names if n not in d.columns]
    if missing:
        raise KeyError(f'{zpath}: not in file: {missing}')
    return d[names].astype(float)


def load(cycle, sex, names, raw=RAW):
    names = [n.upper() for n in names]
    dat, lay = FILES[(cycle, sex)]
    if lay is None:
        return read_csv_zip(raw / dat, names)
    spec = sas_layout(raw / lay) if lay.endswith('.sas') else dct_layout(raw / lay)
    return read_fixed(raw / dat, spec, names)
