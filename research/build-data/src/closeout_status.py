"""Session 92: what the never-completed permits are, in each feed's own status field.

Session 91 found 23 to 39% of SF's and Seattle's issued permits carry no completion date, and SF's status
field said most were never closed out ("issued" or "expired" years later). This asks the same of Seattle
(`statuscurrent`) and Austin (`status_current`), by SoQL group-by on the live feeds, so a cure-fraction or
competing-risk model (session 91's "Next") knows which outcome labels each source can give it:

  by_status_never_completed   issued, no completion date: count per status
  by_status_completed         issued and completed: count per status (what "done" reads as)
  by_year_status_never        the never-completed, per issue year since 2010 and status

Counts are as the API returns them on the day; they are descriptive and enter no model.
Run: python3 src/closeout_status.py   (writes results/closeout_status.json)
"""
import datetime, json, os, urllib.parse, urllib.request

FEEDS = {
    "sf": dict(host="data.sf.gov", dataset="i98e-djp9", status="status", issued="issued_date",
               completed="completed_date"),
    "seattle": dict(host="data.seattle.gov", dataset="76t5-zqzr", status="statuscurrent", issued="issueddate",
                    completed="completeddate"),
    "austin": dict(host="data.austintexas.gov", dataset="3syk-w9eu", status="status_current", issued="issue_date",
                   completed="completed_date"),
}


def queries(f):
    st, iss, comp = f["status"], f["issued"], f["completed"]
    never = f"{iss} IS NOT NULL AND {comp} IS NULL"
    return {
        "by_status_never_completed": {"$select": f"{st},count(*) as n", "$where": never, "$group": st,
                                      "$order": "n DESC"},
        "by_status_completed": {"$select": f"{st},count(*) as n", "$where": f"{iss} IS NOT NULL AND {comp} IS NOT NULL",
                                "$group": st, "$order": "n DESC"},
        "by_year_status_never": {"$select": f"date_extract_y({iss}) as y,{st},count(*) as n",
                                 "$where": f"{never} AND {iss} >= '2010-01-01'", "$group": f"y,{st}",
                                 "$order": f"y,{st}", "$limit": "5000"},
    }


def url(f, q):
    return f"https://{f['host']}/resource/{f['dataset']}.json?" + urllib.parse.urlencode(q)


def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "build-data-research"}),
                                timeout=300) as r:
        return json.load(r)


def summarise(rows, status_key):
    """Shares of the never-completed by status (lower-cased), largest first."""
    tot = sum(int(r["n"]) for r in rows)
    out = {}
    for r in rows:
        k = str(r.get(status_key, "")).strip().lower() or "(blank)"
        out[k] = out.get(k, 0) + int(r["n"])
    return dict(total=tot, share={k: v / tot for k, v in sorted(out.items(), key=lambda kv: -kv[1])})


def by_year(rows, status_key):
    """Per issue year: the never-completed count and each status's share (lower-cased)."""
    out = {}
    for r in rows:
        y, k = str(int(float(r["y"]))), str(r.get(status_key, "")).strip().lower() or "(blank)"
        out.setdefault(y, {})
        out[y][k] = out[y].get(k, 0) + int(r["n"])
    return {y: dict(n=sum(v.values()), share={k: x / sum(v.values()) for k, x in sorted(v.items(), key=lambda kv: -kv[1])})
            for y, v in sorted(out.items())}


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    res = dict(note=__doc__.strip().split("\n")[0],
               queried=datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
               cities={})
    for c, f in FEEDS.items():
        qs = queries(f)
        out = dict(queries={k: url(f, q) for k, q in qs.items()}, results={})
        for k, q in qs.items():
            out["results"][k] = get(url(f, q))
        out["never_completed"] = summarise(out["results"]["by_status_never_completed"], f["status"])
        out["completed"] = summarise(out["results"]["by_status_completed"], f["status"])
        out["never_completed_by_year"] = by_year(out["results"]["by_year_status_never"], f["status"])
        res["cities"][c] = out
        print(c, out["never_completed"]["total"], {k: round(v, 3) for k, v in list(out["never_completed"]["share"].items())[:6]},
              "| completed:", {k: round(v, 3) for k, v in list(out["completed"]["share"].items())[:4]}, flush=True)
    json.dump(res, open(os.path.join(here, "..", "results", "closeout_status.json"), "w"), indent=1)
