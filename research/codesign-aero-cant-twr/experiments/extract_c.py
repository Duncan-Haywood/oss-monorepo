"""Read UIUC Propeller Data Site static-thrust files (Brandt and Selig 2011; Deters et al. 2018; volumes 1 and 2) and write data/propdata_c.csv:
per propeller, the median over its RPM rows (CT > 0.02) of CP/CT, and c = CP/(2 pi CT), the dimensionless factor in kappa = Q/T = c D.
Usage: extract_c.py --fetch   (downloads every *static*.txt listed on the two volume index pages to a temp dir, then reads them)
       extract_c.py DIR       (reads already downloaded files in DIR)"""
import csv, glob, math, os, re, statistics as st, sys, tempfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://m-selig.ae.illinois.edu/props/"


def fetch(dst):
    names = []
    for v in (1, 2):
        html = urllib.request.urlopen(f"{BASE}volume-{v}/propDB-volume-{v}.html", timeout=60).read().decode("latin-1")
        names += [f"volume-{v}/{m}" for m in sorted(set(re.findall(r'data/[a-z0-9_.]*static[^"]*txt', html)))]
    for n in names:
        open(os.path.join(dst, os.path.basename(n)), "wb").write(urllib.request.urlopen(BASE + n, timeout=60).read())
    return len(names)


def rows(src):
    out = []
    for f in sorted(glob.glob(os.path.join(src, "*.txt"))):
        b = os.path.basename(f)
        m = re.match(r"([a-z]+)_([0-9.]+)x([0-9.]+)_static", b)
        if not m:
            continue
        r = []
        for line in open(f):
            p = line.split()
            try:
                _, ct, cp = map(float, p[:3])
            except ValueError:
                continue
            if ct > 0.02 and cp > 0:
                r.append(cp / ct)
        if len(r) >= 3:
            ratio = st.median(r)
            out.append(dict(file=b, family=m.group(1), diameter_in=float(m.group(2)), pitch_in=float(m.group(3)), n_rpm=len(r),
                            cp_over_ct=round(ratio, 4), c=round(ratio / (2 * math.pi), 4)))
    return out


if __name__ == "__main__":
    if sys.argv[1] == "--fetch":
        src = tempfile.mkdtemp()
        print("fetched", fetch(src), "files")
    else:
        src = sys.argv[1]
    R = rows(src)
    with open(os.path.join(HERE, "..", "data", "propdata_c.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(R[0]))
        w.writeheader()
        w.writerows(R)
    print(len(R), "propellers")
