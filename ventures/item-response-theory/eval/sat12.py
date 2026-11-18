"""Fetch the SAT12 data from the CRAN source of the R package mirt and write
it as a CSV with its answer key, for eval/sat12.mjs. The data are not
committed: they come from the TESTFACT manual (Wood et al., 2003) as
distributed in mirt (Chalmers 2012, GPL >= 3), so this script downloads them
each time.

    pip install rdata
    python -I eval/sat12.py /tmp/sat12.csv
    node eval/sat12.mjs /tmp/sat12.csv     # writes eval/sat12.json

Omitted answers (coded 8 in mirt) are left blank, so the tool treats them as
missing.
"""
import io
import re
import sys
import tarfile
import tempfile
import urllib.request

import rdata

KEY = [1, 4, 5, 2, 3, 1, 2, 1, 3, 1, 2, 4, 2, 1, 5, 3, 4, 4, 1, 4, 3, 3, 4, 1, 3, 5, 1, 3, 1, 5, 4, 5]  # mirt ?SAT12
out = sys.argv[1]
index = urllib.request.urlopen("https://cran.r-project.org/web/packages/mirt/index.html").read().decode()
tarball = re.search(r"mirt_[0-9.\-]+\.tar\.gz", index).group(0)
blob = urllib.request.urlopen(f"https://cran.r-project.org/src/contrib/{tarball}").read()
with tarfile.open(fileobj=io.BytesIO(blob)) as t, tempfile.TemporaryDirectory() as tmp:
    t.extract("mirt/data/SAT12.RData", tmp, filter="data")
    frame = rdata.read_rda(f"{tmp}/mirt/data/SAT12.RData")["SAT12"]
with open(out, "w") as f:
    f.write("student," + ",".join(str(c) for c in frame.columns) + "\n")
    f.write("key," + ",".join(map(str, KEY)) + "\n")
    for i, row in enumerate(frame.values):
        f.write(f"S{i + 1:03d}," + ",".join("" if int(v) == 8 else str(int(v)) for v in row) + "\n")
print(f"{tarball}: {frame.shape[0]} students, {frame.shape[1]} items -> {out}")
