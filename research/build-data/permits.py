"""Loaders and the one schema for build-data (stdlib only).

Pulls three public permit feeds through their Socrata SoQL APIs, maps each to
the common schema below, and writes gzip CSVs under data/ (gitignored) plus a
row-count manifest (manifest.json, in git).

    python3 permits.py pull chicago sf austin     # network, minutes
    python3 permits.py manifest                    # rewrite manifest.json from data/
"""
import csv, gzip, hashlib, json, sys, time, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data"
SCHEMA = ["permit_id", "city", "permit_type", "work_class", "description",
          "est_cost", "applied", "issued", "completed", "status", "area",
          "units", "contractor_hash"]

# city -> host, dataset, field map (schema name -> source column), date columns
FEEDS = {
    "chicago": dict(host="data.cityofchicago.org", ds="ydr8-5enu",
        map=dict(permit_id="permit_", permit_type="permit_type", work_class="work_type",
                 description="work_description", est_cost="reported_cost",
                 applied="application_start_date", issued="issue_date",
                 status="permit_status", area="community_area",
                 units="residential_unit_change")),
    "sf": dict(host="data.sf.gov", ds="i98e-djp9",
        map=dict(permit_id="permit_number", permit_type="permit_type_definition",
                 work_class="primary_priority", description="description",
                 est_cost="estimated_cost", applied="filed_date",
                 issued="issued_date", completed="completed_date", status="status",
                 area="neighborhoods_analysis_boundaries", units="proposed_units")),
    "austin": dict(host="data.austintexas.gov", ds="3syk-w9eu",
        map=dict(permit_id="permit_number", permit_type="permit_type_desc",
                 work_class="work_class", description="description",
                 est_cost="total_job_valuation", applied="applieddate",
                 issued="issue_date", completed="completed_date",
                 status="status_current", area="council_district",
                 units="housing_units", contractor="contractor_company_name")),
}

def day(v):
    """ISO timestamp -> 'YYYY-MM-DD', or '' when missing or not a plausible date."""
    if not v:
        return ""
    s = v[:10]
    try:
        d = date.fromisoformat(s)
    except ValueError:
        return ""
    return s if 1990 <= d.year <= 2100 else ""   # year-0001 style sentinels are nulls

def hash_contractor(v):
    v = " ".join((v or "").upper().split())
    return hashlib.sha256(v.encode()).hexdigest()[:12] if v else ""

def to_row(city, rec):
    m = FEEDS[city]["map"]
    g = lambda k: (rec.get(m[k]) or "").strip() if k in m else ""
    row = {k: g(k) for k in SCHEMA if k != "contractor_hash"}
    row["city"] = city
    for k in ("applied", "issued", "completed"):
        row[k] = day(g(k))
    row["contractor_hash"] = hash_contractor(rec.get(m["contractor"], "")) if "contractor" in m else ""
    return row

def fetch(url, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(2 ** (i + 1))

def pull(city, page=50000, limit=None):
    f = FEEDS[city]
    cols = sorted(set(f["map"].values()) | ({f["map"]["contractor"]} if "contractor" in f["map"] else set()))
    DATA.mkdir(exist_ok=True)
    out, n, off = DATA / f"{city}.csv.gz", 0, 0
    with gzip.open(out, "wt", newline="") as fh:
        w = csv.DictWriter(fh, SCHEMA); w.writeheader()
        while True:
            q = urllib.parse.urlencode({"$select": ",".join(cols), "$order": ":id",
                                        "$limit": page, "$offset": off})
            recs = fetch(f"https://{f['host']}/resource/{f['ds']}.json?{q}")
            if not recs:
                break
            for r in recs:
                w.writerow(to_row(city, r)); n += 1
            off += page
            if limit and n >= limit:
                break
    return n

def summarise(city):
    n = iss = comp = app = 0
    with gzip.open(DATA / f"{city}.csv.gz", "rt") as fh:
        for r in csv.DictReader(fh):
            n += 1; app += bool(r["applied"]); iss += bool(r["issued"]); comp += bool(r["completed"])
    return dict(rows=n, with_applied=app, with_issued=iss, with_completed=comp)

def manifest():
    mp = HERE / "manifest.json"
    man = json.loads(mp.read_text()) if mp.exists() else {}
    for city in FEEDS:
        if (DATA / f"{city}.csv.gz").exists():
            man[city] = dict(host=FEEDS[city]["host"], dataset=FEEDS[city]["ds"],
                             pulled=date.today().isoformat(), **summarise(city))
    mp.write_text(json.dumps(man, indent=1, sort_keys=True) + "\n")
    return man

if __name__ == "__main__":
    cmd, *rest = sys.argv[1:] or ["manifest"]
    if cmd == "pull":
        for c in rest:
            print(c, pull(c), flush=True)
    manifest()
    print(manifest())
