"""Loaders that map three open permit feeds onto one schema.

Stdlib only. Pull: `python3 src/permits.py pull --out DATA_DIR [--max-rows N]`.
Each city is fetched with paginated SoQL CSV requests, restricted to the columns
the schema needs, and written to DATA_DIR/<city>.csv (outside git). A manifest of
row counts and the pull date goes to results/manifest.json (in git).
"""
import argparse, csv, datetime, io, json, os, sys, time, urllib.parse, urllib.request

# schema column -> source column (None: the feed has no such field; cell stays empty)
FEEDS = {
    "chicago": dict(host="data.cityofchicago.org", dataset="ydr8-5enu", order="id",
        map=dict(permit_id="permit_", permit_type="permit_type", work_class="review_type",
                 estimated_cost="reported_cost", applied="application_start_date",
                 issued="issue_date", completed=None, area="community_area",
                 description="work_description")),
    "sf": dict(host="data.sf.gov", dataset="i98e-djp9", order="permit_number",
        map=dict(permit_id="permit_number", permit_type="permit_type_definition", work_class=None,
                 estimated_cost="estimated_cost", applied="filed_date",
                 issued="issued_date", completed="completed_date", area="zipcode",
                 description="description")),
    "austin": dict(host="data.austintexas.gov", dataset="3syk-w9eu", order="permit_number",
        map=dict(permit_id="permit_number", permit_type="permit_type_desc", work_class="work_class",
                 estimated_cost=None, applied="applieddate",
                 issued="issue_date", completed="completed_date", area="original_zip",
                 description="description")),
}
SCHEMA = ["city", "permit_id", "permit_type", "work_class", "estimated_cost", "applied",
          "issued", "completed", "area", "description_len"]


def url(city, limit, offset):
    f = FEEDS[city]
    cols = sorted({c for c in f["map"].values() if c})
    q = {"$select": ",".join(cols), "$order": f["order"], "$limit": limit, "$offset": offset}
    return f"https://{f['host']}/resource/{f['dataset']}.csv?" + urllib.parse.urlencode(q)


def day(s):
    """ISO timestamp -> date string, or '' when absent or unparseable."""
    s = (s or "").strip()
    if not s:
        return ""
    try:
        return datetime.date.fromisoformat(s[:10]).isoformat()
    except ValueError:
        return ""


def to_schema(city, row):
    m = FEEDS[city]["map"]
    g = lambda k: (row.get(m[k]) or "").strip() if m[k] else ""
    cost = g("estimated_cost")
    try:
        cost = repr(float(cost)) if cost else ""
    except ValueError:
        cost = ""
    return dict(city=city, permit_id=g("permit_id"), permit_type=g("permit_type").lower(),
                work_class=g("work_class").lower(), estimated_cost=cost,
                applied=day(g("applied")), issued=day(g("issued")), completed=day(g("completed")),
                area=g("area"), description_len=str(len(g("description"))))


def fetch(u, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(u, timeout=120) as r:
                return r.read().decode("utf-8")
        except Exception:
            if k == tries - 1:
                raise
            time.sleep(2 ** (k + 1))


def pull(city, out_dir, max_rows=None, page=50000):
    path = os.path.join(out_dir, f"{city}.csv")
    n = 0
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, SCHEMA)
        w.writeheader()
        off = 0
        while max_rows is None or off < max_rows:
            lim = page if max_rows is None else min(page, max_rows - off)
            rows = list(csv.DictReader(io.StringIO(fetch(url(city, lim, off)))))
            for r in rows:
                w.writerow(to_schema(city, r))
            n += len(rows)
            if len(rows) < lim:
                break
            off += lim
    return n


def summarise(path):
    """Counts the manifest reports, from the written CSV."""
    c = dict(rows=0, applied=0, issued=0, completed=0, cost=0, both_applied_issued=0,
             negative_issue_lag=0, negative_build_time=0)
    with open(path, newline="") as fh:
        for r in csv.DictReader(fh):
            c["rows"] += 1
            a, i, d = r["applied"], r["issued"], r["completed"]
            c["applied"] += bool(a); c["issued"] += bool(i); c["completed"] += bool(d)
            c["cost"] += bool(r["estimated_cost"])
            if a and i:
                c["both_applied_issued"] += 1
                c["negative_issue_lag"] += i < a
            if i and d:
                c["negative_build_time"] += d < i
    return c


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("cmd", choices=["pull"])
    p.add_argument("--out", required=True)
    p.add_argument("--max-rows", type=int)
    p.add_argument("--cities", nargs="*", default=list(FEEDS))
    a = p.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    man = dict(pulled=datetime.date.today().isoformat(), max_rows=a.max_rows, cities={})
    for city in a.cities:
        n = pull(city, a.out, a.max_rows)
        man["cities"][city] = dict(dataset=FEEDS[city]["dataset"], host=FEEDS[city]["host"],
                                   **summarise(os.path.join(a.out, f"{city}.csv")))
        print(city, man["cities"][city], flush=True)
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "..", "results", "manifest.json"), "w") as fh:
        json.dump(man, fh, indent=1)


if __name__ == "__main__":
    main()
