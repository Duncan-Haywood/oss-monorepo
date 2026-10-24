"""Read selected columns of an NSFG fixed-width file using its Stata .dct dictionary (stdlib only)."""
import gzip, re

LINE = re.compile(r'_column\((\d+)\)\s+(\S+)\s+(\S+)\s+%(\d+)')


def layout(dct_path):
    out = {}
    for line in open(dct_path, encoding='latin-1'):
        m = LINE.search(line)
        if m:
            start, kind, name, width = int(m[1]), m[2], m[3], int(m[4])
            out[name] = (start - 1, start - 1 + width, kind)
    return out


def read(dat_path, dct_path, names):
    spec = layout(dct_path)
    missing = [n for n in names if n not in spec]
    if missing:
        raise KeyError(f'not in dictionary: {missing}')
    opener = gzip.open if str(dat_path).endswith('.gz') else open
    rows = []
    with opener(dat_path, 'rt', encoding='latin-1') as fh:
        for line in fh:
            r = {}
            for n in names:
                a, b, kind = spec[n]
                s = line[a:b].strip()
                if not s:
                    r[n] = None
                elif kind.startswith('str'):
                    r[n] = s
                elif kind in ('float', 'double'):
                    r[n] = float(s)
                else:
                    r[n] = int(s)
            rows.append(r)
    return rows
