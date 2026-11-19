"""Build data/portal-rodents.csv from the Portal Project's public rodent census.

Inputs (CC0, weecology/PortalData on GitHub, main branch):
  Rodents/Portal_rodent.csv, Rodents/Portal_rodent_species.csv,
  SiteandMethods/Portal_plot_treatments.csv

Output: one row per plot and species, the number of distinct individual
rodents first caught on that plot in 2016-2025, with the plot's treatment
since April 2015. An individual is its `id` (tag-based) across the window, so
an animal caught many times counts once, on the plot it was first caught.
Records with no id count once each. Only rodents identified to species are
kept (the species table's rodent = 1 and unidentified = 0).

Usage: python3 -I eval/build-example.py <dir with the three files> > data/portal-rodents.csv
"""
import csv
import sys

src = sys.argv[1]
species = {r["speciescode"]: r for r in csv.DictReader(open(f"{src}/Portal_rodent_species.csv", newline=""))}
treat = {int(r["plot"]): r["Apr2015_present"] for r in csv.DictReader(open(f"{src}/Portal_plot_treatments.csv", newline=""))}
first = {}
for r in csv.DictReader(open(f"{src}/Portal_rodent.csv", newline="")):
    year = int(r["year"])
    if not 2016 <= year <= 2025:
        continue
    s = species.get(r["species"])
    if not s or s["rodent"] != "1" or s["unidentified"] != "0":
        continue
    if r["plot"] in ("", "NA") or int(r["plot"]) not in treat:
        continue
    key = r["id"] if r["id"] not in ("", "NA") else f"record-{r['recordID']}"
    when = (year, int(r["month"]), int(r["day"] or 0), int(r["recordID"]))
    if key not in first or when < first[key][0]:
        first[key] = (when, int(r["plot"]), r["species"])
counts = {}
for _, plot, sp in first.values():
    counts[(plot, sp)] = counts.get((plot, sp), 0) + 1
w = csv.writer(sys.stdout, lineterminator="\n")
w.writerow(["plot", "treatment", "species", "scientific_name", "individuals"])
for (plot, sp), c in sorted(counts.items(), key=lambda kv: (kv[0][0], -kv[1], kv[0][1])):
    w.writerow([plot, treat[plot], sp, species[sp]["scientificname"], c])
