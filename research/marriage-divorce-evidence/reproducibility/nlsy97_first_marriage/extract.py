"""Stream selected columns out of the NLSY97 all-variables CSV inside the official zip (never unzips)."""
import sys, zipfile, io, csv
zp, varfile, out = sys.argv[1:4]
want = {}
for line in open(varfile):
    ref, name = line.split()
    want[ref.replace('.', '')] = name
z = zipfile.ZipFile(zp)
f = io.TextIOWrapper(z.open('nlsy97_all_1997-2023.csv'), newline='')
r = csv.reader(f)
hdr = next(r)
idx = [i for i, h in enumerate(hdr) if h in want]
print('matched', len(idx), 'of', len(want), file=sys.stderr)
with open(out, 'w', newline='') as fo:
    w = csv.writer(fo)
    w.writerow([want[hdr[i]] for i in idx])
    n = 0
    for row in r:
        w.writerow([row[i] for i in idx]); n += 1
print('rows', n, file=sys.stderr)
