"""Check the downloaded PUMF files against frequencies printed in Statistics Canada's own
documentation (codebooks / user guides on Borealis). Writes count_checks.csv; exits 1 on any
mismatch. Run after `sh download.sh`.

Documented values (unweighted counts; weighted population totals where printed):
  1995 main file codebook (gssc10m95cbk1.txt): 10,749 records, WGHTFNL total 23,267,125;
       M1END 1:1,462 2:24 3:992 4:18 6:4,602 7:355; M1CURREN 1:4,957 2:2,511
  1995 union codebook (gssc10u95cbk1.txt): 10,938 records; UNIONTYP 1:6,753 2:1,493 3:2,692
  1995 child codebook (gssc10c95cbk1.txt): CHDTYPE 1:18,303 2:371 3:864 9:4
  2006 user guide (c20gid-ver3-eng.pdf), Appendix C: 23,608 records, weights 26,551,748;
       EVER_LEGMARR 1:16,476 2:7,098; MARSTAT 1:10,942 2:2,142 3:2,042 4:856 5:1,989 6:5,621
  2011 user guide (userguide_eng.pdf), Appendix C: 22,435 records, weights 28,354,630;
       EVER_LEGMARR 1:16,407; MA1_Q170 1:3,857 2:69 3:2,138 4:141 5:10; MARSTAT 4:681 5:1,805
  2017 data dictionary (c31pumf_families_codebook_E.pdf): 20,602 records, weights 30,302,287;
       EVERMAR 1:14,365 2:6,230; MA1_170 1:3,513 2:67 3:1,736 4:111 5:21;
       MARSTAT 1:9,501 2:2,075 3:1,899 4:643 5:1,767 6:4,710
"""
from pathlib import Path
import sys
import pandas as pd

RAW = Path(__file__).resolve().parent / 'raw'
CHECKS = [
    ('gss1995_main.csv', None, 'records', 10749), ('gss1995_main.csv', 'WGHTFNL', 'sum', 23267125),
    *[('gss1995_main.csv', 'M1END', k, v) for k, v in {1: 1462, 2: 24, 3: 992, 4: 18, 6: 4602, 7: 355}.items()],
    *[('gss1995_main.csv', 'M1CURREN', k, v) for k, v in {1: 4957, 2: 2511}.items()],
    ('gss1995_union.csv', None, 'records', 10938),
    *[('gss1995_union.csv', 'UNIONTYP', k, v) for k, v in {1: 6753, 2: 1493, 3: 2692}.items()],
    *[('gss1995_child.csv', 'CHDTYPE', k, v) for k, v in {1: 18303, 2: 371, 3: 864, 9: 4}.items()],
    ('gss2006.csv', None, 'records', 23608), ('gss2006.csv', 'WGHT_PER', 'sum', 26551748),
    *[('gss2006.csv', 'EVER_LEGMARR', k, v) for k, v in {1: 16476, 2: 7098}.items()],
    *[('gss2006.csv', 'MARSTAT', k, v) for k, v in {1: 10942, 2: 2142, 3: 2042, 4: 856, 5: 1989, 6: 5621}.items()],
    ('gss2011.csv', None, 'records', 22435), ('gss2011.csv', 'WGHT_PER', 'sum', 28354630),
    ('gss2011.csv', 'EVER_LEGMARR', 1, 16407),
    *[('gss2011.csv', 'MA1_Q170', k, v) for k, v in {1: 3857, 2: 69, 3: 2138, 4: 141, 5: 10}.items()],
    *[('gss2011.csv', 'MARSTAT', k, v) for k, v in {4: 681, 5: 1805}.items()],
    ('gss2017.csv', None, 'records', 20602), ('gss2017.csv', 'WGHT_PER', 'sum', 30302287),
    *[('gss2017.csv', 'EVERMAR', k, v) for k, v in {1: 14365, 2: 6230}.items()],
    *[('gss2017.csv', 'MA1_170', k, v) for k, v in {1: 3513, 2: 67, 3: 1736, 4: 111, 5: 21}.items()],
    *[('gss2017.csv', 'MARSTAT', k, v) for k, v in {1: 9501, 2: 2075, 3: 1899, 4: 643, 5: 1767, 6: 4710}.items()],
]


def main():
    cache, rows = {}, []
    for f, col, what, doc in CHECKS:
        key = (f, col)
        if key not in cache:
            cache[key] = pd.read_csv(RAW / f, usecols=[col] if col else [0]).iloc[:, 0]
        s = cache[key]
        got = len(s) if what == 'records' else (round(float(s.sum())) if what == 'sum' else int((s == what).sum()))
        ok = abs(got - doc) <= (1 if what == 'sum' else 0)
        rows.append(dict(file=f, variable=col or '', code=what, documented=doc, in_file=got, match=ok))
    df = pd.DataFrame(rows)
    df.to_csv(Path(__file__).resolve().parent / 'count_checks.csv', index=False)
    print(df.to_string(index=False))
    sys.exit(0 if df.match.all() else 1)


if __name__ == '__main__':
    main()
