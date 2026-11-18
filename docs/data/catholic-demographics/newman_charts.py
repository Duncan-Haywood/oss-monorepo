"""Draw the Newman Guide charts from groups.csv and newman_ipeds.csv (run newman_ipeds.py first)."""
import csv, os
from svgchart import hbar

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = "Source: NCES IPEDS, fall 2023 enrolment, 2022-23 aid, fall 2023 admissions; Newman Guide list Nov 2026"
g = list(csv.DictReader(open(os.path.join(HERE, "groups.csv"))))
metrics = [("Women", "pct_women"), ("White", "pct_white"), ("Hispanic", "pct_hispanic"), ("Black", "pct_black"),
           ("Asian", "pct_asian"), ("International", "pct_international"), ("Under age 25", "pct_under_25"),
           ("Pell grant recipients", "pct_pell"), ("Admit rate", "admit_rate")]
hbar(os.path.join(HERE, "newman-vs-catholic-vs-all.svg"),
     "Newman Guide colleges vs other four-year colleges",
     "Share of undergraduates, pooled across colleges (admit rate: share of applicants admitted), %", SRC,
     [m for m, _ in metrics],
     [({"Newman Guide colleges": "Newman Guide", "All Catholic 4-year colleges": "Catholic 4-year", "All US 4-year colleges": "All US 4-year"}[r["group"]] + f" ({int(r['colleges']):,} colleges)",
       [float(r[k]) for _, k in metrics]) for r in g], vmax=100, label_w=160)

s = sorted(csv.DictReader(open(os.path.join(HERE, "newman_ipeds.csv"))), key=lambda r: -int(r["undergrads"]))
short = lambda n: n.replace("The ", "").replace(" University", " U.").replace("University of ", "U. of ").replace(" College", "").replace(" of Liberal Arts", "").replace(" and Seminary", "").replace(" Catholic U.", "")
hbar(os.path.join(HERE, "newman-undergrads.svg"), "Newman Guide colleges are small",
     "Undergraduates, fall 2023 (14 recommended US colleges with federal data)", SRC,
     [short(r["name"]) for r in s], [("Undergraduates", [int(r["undergrads"]) for r in s])], unit="", label_w=200)
s2 = [r for r in s if r["undergrads"] and int(r["undergrads"]) >= 250]
s2.sort(key=lambda r: -float(r["pct_hispanic"]))
hbar(os.path.join(HERE, "newman-race-by-college.svg"), "Who enrols: white and Hispanic shares by college",
     "Share of undergraduates, fall 2023, colleges with 250+ undergraduates", SRC,
     [short(r["name"]) for r in s2], [("White", [float(r["pct_white"]) for r in s2]), ("Hispanic", [float(r["pct_hispanic"]) for r in s2])],
     vmax=100, label_w=200)
