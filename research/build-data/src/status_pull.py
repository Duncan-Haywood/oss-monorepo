"""Session 95: the close-out status of every dated completion, keyed by permit and completion day.

Session 94 (`label_audit.py`) found that 0.04% (SF), 0.40% (Seattle) and 1.49% (Austin) of dated completions
issued 2010 to 2022 belong to permits the status calls dead (expired, void, withdrawn, ... or, in Seattle, a
description that says "Closed as Incomplete"), and that those dates sit in the long tail. Every model in this
programme reads the completion date as the end of the build. This pulls, for each feed, the permit id, the
completion day and the status of every permit with a completion date (Seattle also the marker boolean, computed
by the API; no description text is fetched or stored) and writes DATA_DIR/<city>_status.csv, which
`rounds.py`'s cpin_es3_nc5_clean variant joins on (permit_id, completed) to drop the dead ones.

Statuses are as on the pull day. For a dated completion the status is set at close-out, so a permit closed
before the decision date D almost always had the same status on D; the leak this leaves is disclosed in LOG.md.
Run: python3 src/status_pull.py DATA_DIR [--cities sf seattle austin]
"""
import argparse, csv, io, os, sys, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import label_audit as la  # noqa: E402  (FEEDS, group, get, day)

PID = {"sf": "permit_number", "seattle": "permitnum", "austin": "permit_number"}


def url(city, offset, page=la.PAGE):
    f = la.FEEDS[city]
    sel = ",".join([PID[city], f["completed"], f["status"]]) + (f",{f['marker']} as cai" if "marker" in f else "")
    q = {"$select": sel, "$where": f"{f['completed']} IS NOT NULL", "$order": f["order"], "$limit": page,
         "$offset": offset}
    return f"https://{f['host']}/resource/{f['dataset']}.csv?" + urllib.parse.urlencode(q)


def row(city, r):
    """(permit_id, completed day ISO, status, cai, group) from one API row."""
    f = la.FEEDS[city]
    d = la.day(r.get(f["completed"]))
    cai = str(r.get("cai", "")).lower() == "true"
    st = (r.get(f["status"]) or "").strip()
    return ((r.get(PID[city]) or "").strip(), d.isoformat() if d else "", st, int(cai), la.group(st, cai))


def pull(city, out_dir):
    path = os.path.join(out_dir, f"{city}_status.csv")
    n, off = 0, 0
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["permit_id", "completed", "status", "cai", "group"])
        while True:
            page = list(csv.DictReader(io.StringIO(la.get(url(city, off)))))
            for r in page:
                w.writerow(row(city, r))
            n += len(page)
            if len(page) < la.PAGE:
                return n
            off += la.PAGE


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--cities", nargs="+", default=["sf", "seattle", "austin"])
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)  # session 100: a fresh session's first pull crashed here
    for c in a.cities:
        print(c, pull(c, a.out), flush=True)
