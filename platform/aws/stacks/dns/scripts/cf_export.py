#!/usr/bin/env python3
"""Export the marisstella.app zone from Cloudflare into the dns stack's records.json.

Reads every DNS record through the Cloudflare API and writes:

  --raw FILE   the API's records, unchanged (zone_diff.py compares against it);
  --out FILE   records.json for platform/aws/stacks/dns: one entry per (name, type),
               Route 53 spellings, marked verified.

    CLOUDFLARE_API_TOKEN=... python3 platform/aws/stacks/dns/scripts/cf_export.py \\
        --raw cloudflare-export.json --out platform/aws/stacks/dns/records.json

The token needs only Zone -> DNS -> Read (and Zone -> Zone -> Read to find
the zone by name, or set CLOUDFLARE_ZONE_ID). It is read from the
environment and never written anywhere. The raw export holds nothing secret
(it is what public DNS serves), but keep it out of the tree: records.json is
the reviewed copy.

Cloudflare-proxied records (orange cloud: the Worker custom domains) answer
with Cloudflare's own addresses, which cannot be copied. Those on a host the
site stack serves (--site-hosts, default @ www grants) are written with
"replaced_by": "site" (the site stack's CloudFront aliases replace them);
any other proxied record, and a CNAME at the apex (Route 53 cannot hold
one), is written with "replaced_by": "needs-decision", which the dns stack
refuses to apply until someone decides.
"""
import argparse
import fnmatch
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from zonelib import cf_ttl, cf_value, relative  # noqa: E402

API = "https://api.cloudflare.com/client/v4"
SKIP_TYPES = {"SOA"}


def get(path, token, opener=urllib.request.urlopen):
    req = urllib.request.Request(API + path, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "User-Agent": "dns-export",
    })
    with opener(req, timeout=30) as r:
        body = json.loads(r.read().decode("utf-8"))
    if not body.get("success", False):
        raise SystemExit(f"Cloudflare API error on {path}: {body.get('errors')}")
    return body


def zone_id(zone, token, opener=urllib.request.urlopen):
    if os.environ.get("CLOUDFLARE_ZONE_ID"):
        return os.environ["CLOUDFLARE_ZONE_ID"]
    body = get("/zones?" + urllib.parse.urlencode({"name": zone}), token, opener)
    if len(body["result"]) != 1:
        raise SystemExit(f"expected one Cloudflare zone named {zone}, found {len(body['result'])}")
    return body["result"][0]["id"]


def fetch(zone, token, opener=urllib.request.urlopen):
    zid = zone_id(zone, token, opener)
    out, page = [], 1
    while True:
        body = get(f"/zones/{zid}/dns_records?per_page=100&page={page}", token, opener)
        out.extend(body["result"])
        info = body.get("result_info") or {}
        if page >= int(info.get("total_pages", 1)):
            return out
        page += 1


PLANNED = Path(__file__).resolve().parent.parent / "planned.json"


def owner_of(name, rtype, allow):
    """The stack that owns (name, type) per planned.json's allow list, or None."""
    for a in allow:
        if fnmatch.fnmatch(name, a["name"]) and rtype in [t.upper() for t in a["types"]]:
            return a.get("owner")
    return None


def convert(raw, zone, site_hosts=("@", "www", "grants"), now=None, allow=()):
    """Cloudflare API records -> records.json document. Records on a name
    another stack owns (planned.json `allow`) are kept, for the diff and the
    record, but marked replaced_by that stack so this one never writes them."""
    grouped = {}
    for rec in raw:
        rtype = rec["type"].upper()
        if rtype in SKIP_TYPES:
            continue
        name = relative(rec["name"], zone)
        if rtype == "NS" and name == "@":
            continue  # the zone's own delegation; Route 53 writes its own
        key = (name, rtype)
        g = grouped.setdefault(key, {"name": name, "type": rtype, "ttl": cf_ttl(rec), "values": [], "comments": []})
        g["ttl"] = min(g["ttl"], cf_ttl(rec))
        val = cf_value(rec)
        if val not in g["values"]:
            g["values"].append(val)
        if rec.get("comment"):
            g["comments"].append(rec["comment"])
        if rec.get("proxied"):
            g["proxied"] = True
    records = []
    for (name, rtype), g in sorted(grouped.items()):
        r = {"name": name, "type": rtype, "ttl": g["ttl"], "values": sorted(g["values"])}
        if g.get("proxied"):
            r["proxied"] = True
            r["replaced_by"] = "site" if name in site_hosts else "needs-decision"
        elif rtype == "CNAME" and name == "@":
            r["replaced_by"] = "needs-decision"
        elif owner_of(name, rtype, allow):
            r["replaced_by"] = owner_of(name, rtype, allow)
        if g["comments"]:
            r["comment"] = "; ".join(sorted(set(g["comments"])))
        records.append(r)
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "zone": zone,
        "source": f"cloudflare-export {stamp} (platform/aws/stacks/dns/scripts/cf_export.py)",
        "verified": True,
        "records": records,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--zone", default="marisstella.app")
    ap.add_argument("--raw", help="write the API's records here")
    ap.add_argument("--out", help="write records.json here")
    ap.add_argument("--site-hosts", nargs="*", default=["@", "www", "grants"])
    args = ap.parse_args(argv)
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not token:
        print("cf_export: set CLOUDFLARE_API_TOKEN (Zone DNS Read) in the environment", file=sys.stderr)
        return 2
    raw = fetch(args.zone, token)
    if args.raw:
        Path(args.raw).write_text(json.dumps(raw, indent=2, sort_keys=True) + "\n")
    allow = json.loads(PLANNED.read_text()).get("allow", [])
    doc = convert(raw, args.zone, tuple(args.site_hosts), allow=allow)
    text = json.dumps(doc, indent=2) + "\n"
    if args.out:
        Path(args.out).write_text(text)
    else:
        sys.stdout.write(text)
    undecided = [f'{r["name"]} {r["type"]}' for r in doc["records"] if r.get("replaced_by") == "needs-decision"]
    print(f"cf_export: {len(raw)} Cloudflare records -> {len(doc['records'])} record sets", file=sys.stderr)
    for u in undecided:
        print(f"cf_export: NEEDS A DECISION: {u} (proxied or apex CNAME; see README)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
