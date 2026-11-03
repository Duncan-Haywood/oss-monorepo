"""Undergraduate demographics of Newman Guide colleges from federal IPEDS data.

Usage: python3 newman_ipeds.py <ipeds_dir>

<ipeds_dir> holds the unzipped NCES files (https://nces.ed.gov/ipeds/datacenter/data/):
HD2024.csv (directory), IC2024.csv (religious affiliation), ef2023a.csv (fall 2023
enrolment by race and sex), ef2023b.csv (fall 2023 enrolment by age),
sfa2223.csv (2022-23 Pell grants), adm2023.csv (fall 2023 admissions).

Compares three groups: the US Newman Guide colleges in newman_colleges.csv
(those with an IPEDS UNITID), every degree-granting four-year college whose
IPEDS religious affiliation is Roman Catholic (RELAFFIL 30), and every
degree-granting four-year college. Group shares are enrolment-weighted
(pooled students), so a big school counts for more than a small one.
Writes newman_ipeds.csv (one row per Newman college) and groups.csv.
"""

import csv
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def rows(path):
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        for r in csv.DictReader(f):  # some IPEDS files pad codes with spaces
            yield {k.strip(): (v or "").strip() for k, v in r.items() if k}


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main(d):
    hd = {r["UNITID"]: r for r in rows(os.path.join(d, "HD2024.csv"))}
    ic = {r["UNITID"]: r for r in rows(os.path.join(d, "IC2024.csv"))}
    four_year = {u for u, r in hd.items() if r["ICLEVEL"] == "1" and r["DEGGRANT"] == "1" and r["CYACTIVE"] == "1"}
    catholic = {u for u in four_year if ic.get(u, {}).get("RELAFFIL") == "30"}

    newman = list(csv.DictReader(open(os.path.join(HERE, "newman_colleges.csv"))))
    newman_ids = {r["unitid"] for r in newman if r.get("unitid")}

    race = {}
    for r in rows(os.path.join(d, "ef2023a.csv")):
        if r["EFALEVEL"] == "2":  # all undergraduates
            race[r["UNITID"]] = {k: num(r[k]) or 0 for k in (
                "EFTOTLT", "EFTOTLW", "EFTOTLM", "EFWHITT", "EFHISPT", "EFBKAAT", "EFASIAT",
                "EF2MORT", "EFNRALT", "EFAIANT", "EFNHPIT", "EFUNKNT")}
    age = {}
    for r in rows(os.path.join(d, "ef2023b.csv")):
        if r["LSTUDY"] == "2" and r["EFBAGE"] in ("1", "2"):  # undergrad: all ages, under 25
            age.setdefault(r["UNITID"], {})[r["EFBAGE"]] = num(r["EFAGE09"]) or 0
    pell = {r["UNITID"]: (num(r["UPGRNTN"]), num(r["SCUGRAD"])) for r in rows(os.path.join(d, "sfa2223.csv"))}
    adm = {r["UNITID"]: (num(r["ADMSSN"]), num(r["APPLCN"])) for r in rows(os.path.join(d, "adm2023.csv"))}

    def metrics(ids):
        t = {k: 0.0 for k in ("ug", "w", "white", "hisp", "black", "asian", "multi", "intl", "other", "unkn",
                             "age_all", "u25", "pell", "pell_base", "admit", "apply")}
        n = 0
        for u in ids:
            e = race.get(u)
            if not e or not e["EFTOTLT"]:
                continue
            n += 1
            t["ug"] += e["EFTOTLT"]
            t["w"] += e["EFTOTLW"]
            t["white"] += e["EFWHITT"]
            t["hisp"] += e["EFHISPT"]
            t["black"] += e["EFBKAAT"]
            t["asian"] += e["EFASIAT"]
            t["multi"] += e["EF2MORT"]
            t["intl"] += e["EFNRALT"]
            t["other"] += e["EFAIANT"] + e["EFNHPIT"]
            t["unkn"] += e["EFUNKNT"]
            a = age.get(u, {})
            if a.get("1"):
                t["age_all"] += a["1"]
                t["u25"] += a.get("2", 0)
            p, base = pell.get(u, (None, None))
            if p is not None and base:
                t["pell"] += p
                t["pell_base"] += base
            ad, ap = adm.get(u, (None, None))
            if ad is not None and ap:
                t["admit"] += ad
                t["apply"] += ap
        pct = lambda a, b: round(100 * a / b, 1) if b else None
        return {
            "colleges": n,
            "undergrads": int(t["ug"]),
            "median_size": None,
            "pct_women": pct(t["w"], t["ug"]),
            "pct_white": pct(t["white"], t["ug"]),
            "pct_hispanic": pct(t["hisp"], t["ug"]),
            "pct_black": pct(t["black"], t["ug"]),
            "pct_asian": pct(t["asian"], t["ug"]),
            "pct_multiracial": pct(t["multi"], t["ug"]),
            "pct_international": pct(t["intl"], t["ug"]),
            "pct_other_race": pct(t["other"], t["ug"]),
            "pct_race_unknown": pct(t["unkn"], t["ug"]),
            "pct_under_25": pct(t["u25"], t["age_all"]),
            "pct_pell": pct(t["pell"], t["pell_base"]),
            "admit_rate": pct(t["admit"], t["apply"]),
        }

    def median_size(ids):
        s = sorted(race[u]["EFTOTLT"] for u in ids if u in race and race[u]["EFTOTLT"])
        return int(s[len(s) // 2]) if s else None

    groups = [("Newman Guide colleges", newman_ids), ("All Catholic 4-year colleges", catholic), ("All US 4-year colleges", four_year)]
    with open(os.path.join(HERE, "groups.csv"), "w", newline="") as f:
        out = None
        for name, ids in groups:
            m = {"group": name, **metrics(ids)}
            m["median_size"] = median_size(ids)
            if out is None:
                out = csv.DictWriter(f, fieldnames=list(m))
                out.writeheader()
            out.writerow(m)
            print(m)

    with open(os.path.join(HERE, "newman_ipeds.csv"), "w", newline="") as f:
        out = None
        for r in newman:
            u = r.get("unitid")
            if not u:
                continue
            m = {"unitid": u, "name": hd.get(u, {}).get("INSTNM", r["name"]), "state": hd.get(u, {}).get("STABBR", ""),
                 "ipeds_catholic": ic.get(u, {}).get("RELAFFIL") == "30", **metrics({u})}
            for k in ("colleges", "median_size"):
                m.pop(k)
            if out is None:
                out = csv.DictWriter(f, fieldnames=list(m))
                out.writeheader()
            out.writerow(m)


if __name__ == "__main__":
    main(sys.argv[1])
