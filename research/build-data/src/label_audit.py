"""Session 94: is a feed's completion date a finished build, or a closure?

Session 93 read Seattle's 10,000-odd permits whose status says "Completed" but which carry no completion date as
finished builds with a missing date, and its "Next" asked whether another field could date them. A look at three of
them (while finding the feed's columns) showed descriptions that open "Closed as Incomplete - Expired Permit". This
audit asks, on the live feeds, how far that goes and whether the reverse also holds: completion dates on permits the
status says are dead (Austin's "void" and "expired" are 4.6% and 2.5% of its dated completions in session 93's
`closeout_status.json`), which would put administrative closures into the issue-to-completion label every model
since session 1 trains and scores on.

Per city (SF, Seattle, Austin), permits issued 2010-01-01 to 2022-12-31, pulled with only the columns needed
(status, issued, completed, permit type; for Seattle a boolean from the description, computed in memory and never
stored, since descriptions can name people and addresses):

  groups        dated completions by status group (done / dead / other): count, share, median, p90 days issued
                to completed; and undated permits by group
  seattle_cai   Seattle's "closed as incomplete" description marker by status and dated/undated
  cure          issue years 2010-2020, per permit type with >= 1,000 permits: share closing (done with a date),
                dead (dead status, or Seattle's marker), and still open at the pull

Statuses are the statuses on the pull day, not on any decision date: descriptive, they enter no model here.
Run: python3 src/label_audit.py [--out results/label_audit.json]
"""
import argparse, csv, datetime, io, json, os, re, statistics, urllib.parse, urllib.request

FEEDS = {
    "sf": dict(host="data.sf.gov", dataset="i98e-djp9", status="status", issued="issued_date",
               completed="completed_date", ptype="permit_type_definition", order="permit_number"),
    "seattle": dict(host="data.seattle.gov", dataset="76t5-zqzr", status="statuscurrent", issued="issueddate",
                    completed="completeddate", ptype="permittypedesc", order="permitnum",
                    marker="upper(description) like '%CLOSED AS INCOMPLETE%'"),
    "austin": dict(host="data.austintexas.gov", dataset="3syk-w9eu", status="status_current", issued="issue_date",
                   completed="completed_date", ptype="permit_type_desc", order="permit_number"),
}
DONE = {"complete", "completed", "final", "inspections completed", "approved to occupy"}
DEAD_RE = re.compile(r"^(expired|void|withdrawn|cancell?ed|revoked|aborted|disapproved|denied|rejected)")
LO, HI, CURE_HI = "2010-01-01", "2022-12-31", 2020
PAGE = 50000


def group(status, marker=False):
    s = (status or "").strip().lower()
    if marker:
        return "dead"
    if s in DONE:
        return "done"
    if DEAD_RE.match(s):
        return "dead"
    return "other"


def url(f, offset):
    cols = [f["status"], f["issued"], f["completed"], f["ptype"]]
    sel = ",".join(cols) + (f",{f['marker']} as cai" if "marker" in f else "")
    q = {"$select": sel, "$where": f"{f['issued']} >= '{LO}' AND {f['issued']} <= '{HI}T23:59:59'",
         "$order": f["order"], "$limit": PAGE, "$offset": offset}
    return f"https://{f['host']}/resource/{f['dataset']}.csv?" + urllib.parse.urlencode(q)


def get(u, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "build-data-research"}),
                                        timeout=300) as r:
                return r.read().decode()
        except Exception:
            if k == tries - 1:
                raise


def day(s):
    s = (s or "").strip()
    try:
        return datetime.date.fromisoformat(s[:10]) if s else None
    except ValueError:
        return None


def pull(f):
    rows, off = [], 0
    while True:
        txt = get(url(f, off))
        page = list(csv.DictReader(io.StringIO(txt)))
        for r in page:
            iss, comp = day(r.get(f["issued"])), day(r.get(f["completed"]))
            rows.append((r.get(f["status"], ""), iss, comp, (r.get(f["ptype"]) or "").strip() or "(blank)",
                         str(r.get("cai", "")).lower() == "true"))
        if len(page) < PAGE:
            return rows
        off += PAGE


def q(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))] if xs else None


def audit(rows):
    out = dict(n=len(rows), groups={}, undated={}, by_status_dated={}, seattle_cai={}, cure={})
    dated = {}
    for st, iss, comp, pt, cai in rows:
        g = group(st, cai)
        s = (st or "").strip().lower() or "(blank)"
        if comp and iss and comp >= iss:
            dated.setdefault(g, []).append((comp - iss).days)
            out["by_status_dated"][s] = out["by_status_dated"].get(s, 0) + 1
        elif not comp:
            out["undated"][g] = out["undated"].get(g, 0) + 1
        key = f"{s}|{'dated' if comp else 'undated'}"
        if cai:
            out["seattle_cai"][key] = out["seattle_cai"].get(key, 0) + 1
    nd = sum(len(v) for v in dated.values())
    for g, v in sorted(dated.items()):
        out["groups"][g] = dict(n=len(v), share=len(v) / nd, median_days=statistics.median(v), p90_days=q(v, 0.9))
    # status counts for the seattle marker's denominators
    out["status_dated_undated"] = {}
    for st, iss, comp, pt, cai in rows:
        key = f"{(st or '').strip().lower() or '(blank)'}|{'dated' if comp else 'undated'}"
        out["status_dated_undated"][key] = out["status_dated_undated"].get(key, 0) + 1
    by_type = {}
    for st, iss, comp, pt, cai in rows:
        if iss and iss.year <= CURE_HI:
            g = group(st, cai)
            g = "closes" if (g == "done" and comp) else ("dead" if g == "dead" else "open_or_other")
            d = by_type.setdefault(pt, {"closes": 0, "dead": 0, "open_or_other": 0})
            d[g] += 1
    for pt, d in sorted(by_type.items(), key=lambda kv: -sum(kv[1].values())):
        n = sum(d.values())
        if n >= 1000:
            out["cure"][pt] = dict(n=n, **{k: v / n for k, v in d.items()})
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--out", default=os.path.join(here, "..", "results", "label_audit.json"))
    ap.add_argument("--cities", nargs="+", default=list(FEEDS))
    a = ap.parse_args()
    res = dict(note=__doc__.strip().split("\n")[0], issued_window=[LO, HI], cure_years=[2010, CURE_HI],
               pulled=datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
               done_statuses=sorted(DONE), dead_pattern=DEAD_RE.pattern, cities={})
    for c in a.cities:
        rows = pull(FEEDS[c])
        res["cities"][c] = audit(rows)
        print(c, len(rows), {g: (v["n"], round(v["share"], 4), v["median_days"]) for g, v in res["cities"][c]["groups"].items()},
              flush=True)
    json.dump(res, open(a.out, "w"), indent=1)
