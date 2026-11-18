"""Build data/us-state-income.csv and data/us-state-neighbors.csv.

Source: the `us_income` example bundled with libpysal 4.14.1 (BSD-3-Clause):
usjoin.csv (BEA per-capita personal income, lower 48 states, 1929-2009, a US
government work) and us48.shp (state outlines). Centroids are the planar
polygon centroids of us48.shp in longitude/latitude degrees, rounded to 4 dp.
Neighbours are queen contiguity computed by libpysal from us48.shp, and the
script asserts they equal the bundled states48.gal (which is in usjoin order).

Run: python -I eval/build-example.py <path to libpysal/examples/us_income> <out dir>
"""
import csv
import sys
import warnings

warnings.filterwarnings("ignore")
import libpysal  # noqa: E402

src, out = sys.argv[1], sys.argv[2]
dbf = libpysal.io.open(f"{src}/us48.dbf").read()
shapes = libpysal.io.open(f"{src}/us48.shp").read()
shp_names = [r[4] for r in dbf]
abbr = {r[4]: r[7] for r in dbf}
cent = {r[4]: s.centroid for r, s in zip(dbf, shapes)}

rows = list(csv.reader(open(f"{src}/usjoin.csv")))
header, body = rows[0], rows[1:]
years = header[2:]
names = [r[0] for r in body]
assert sorted(names) == sorted(shp_names) and len(names) == 48

queen = libpysal.weights.Queen.from_shapefile(f"{src}/us48.shp")
qn = {shp_names[i]: sorted(shp_names[j] for j in queen.neighbors[i]) for i in range(48)}
gal = libpysal.io.open(f"{src}/states48.gal").read()
gn = {names[int(i)]: sorted(names[int(j)] for j in gal.neighbors[i]) for i in gal.neighbors}
assert qn == gn, "queen contiguity from us48.shp differs from states48.gal"

with open(f"{out}/us-state-income.csv", "w", newline="") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["state", "abbr", "lon", "lat"] + [f"pci{y}" for y in years])
    for r in body:
        c = cent[r[0]]
        w.writerow([r[0], abbr[r[0]], f"{c[0]:.4f}", f"{c[1]:.4f}"] + r[2:])

with open(f"{out}/us-state-neighbors.csv", "w", newline="") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(["state", "neighbors"])
    for n in names:
        w.writerow([n, ";".join(qn[n])])
print("states", len(names), "years", years[0], "-", years[-1], "links", sum(len(v) for v in qn.values()))
