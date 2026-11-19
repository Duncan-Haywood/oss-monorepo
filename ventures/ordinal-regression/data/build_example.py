"""Build data/red-wine-quality.csv from the UCI Wine Quality archive.

Source: Cortez, Cerdeira, Almeida, Matos & Reis (2009), Wine Quality, UCI
Machine Learning Repository, doi:10.24432/C56S3T, CC BY 4.0 (data/SOURCE.md).

    curl -o wine.zip https://archive.ics.uci.edu/static/public/186/wine+quality.zip
    unzip wine.zip winequality-red.csv
    python3 data/build_example.py winequality-red.csv > data/red-wine-quality.csv

Keeps the quality score and six of the eleven physicochemical columns,
unchanged; renames them to snake_case; switches the delimiter from ";" to ",".
Uses only the standard library.
"""

import csv
import sys

KEEP = ["quality", "alcohol", "volatile_acidity", "sulphates", "total_sulfur_dioxide", "chlorides", "pH"]


def main(path):
    with open(path, newline="") as f:
        rows = list(csv.reader(f, delimiter=";"))
    header = [h.strip().replace(" ", "_") for h in rows[0]]
    idx = [header.index(k) for k in KEEP]
    out = csv.writer(sys.stdout, lineterminator="\n")
    out.writerow(KEEP)
    for r in rows[1:]:
        if r:
            out.writerow([r[i] for i in idx])


if __name__ == "__main__":
    main(sys.argv[1])
