#!/usr/bin/env python3
"""Compare the Route 53 zone with what Cloudflare serves; exit 0 only at zero differences.

Run before the nameserver change (README.md, step 5) and again after it:

    python3 platform/aws/dns/scripts/zone_diff.py \\
        --cloudflare cloudflare-export.json \\
        --route53 route53.json \\
        --planned platform/aws/dns/planned.json

  --cloudflare  cf_export.py --raw output (the Cloudflare API's records);
  --route53     `aws route53 list-resource-record-sets --hosted-zone-id Z...
                --output json`, or pass --zone-id Z... to run that here;
  --planned     records that exist in Route 53 only, on purpose.

Rules:
  - a Cloudflare record that is not proxied must exist in Route 53 with the
    same values (and the same TTL unless --ignore-ttl);
  - a proxied Cloudflare record (a Worker custom domain) must be replaced by
    a Route 53 alias A record to a CloudFront distribution (and AAAA, if
    Cloudflare had either);
  - a Route 53 record Cloudflare does not have must match planned.json's
    "add" list or an "allow" pattern (other stacks' records: certificate
    validation, SES DKIM); anything else is a difference;
  - the zone's own SOA and apex NS are ignored.

Prints one line per difference and per planned record, then a summary.
"""
import argparse
import fnmatch
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from zonelib import cf_ttl, cf_value, fqdn, norm_value  # noqa: E402


NULL_MX = "0 ."


def cloudflare_sets(raw, zone):
    sets = {}
    for rec in raw:
        t = rec["type"].upper()
        if t == "SOA" or (t == "NS" and fqdn(rec["name"], zone) == zone):
            continue
        key = (fqdn(rec["name"], zone), t)
        s = sets.setdefault(key, {"ttl": cf_ttl(rec), "values": set(), "proxied": False})
        s["ttl"] = min(s["ttl"], cf_ttl(rec))
        s["values"].add(cf_value(rec))
        s["proxied"] = s["proxied"] or bool(rec.get("proxied"))
    return sets


def route53_sets(doc, zone):
    sets = {}
    for rr in doc.get("ResourceRecordSets", []):
        t = rr["Type"].upper()
        name = fqdn(rr["Name"].replace("\\052", "*"), zone)
        if t == "SOA" or (t == "NS" and name == zone):
            continue
        s = {"ttl": rr.get("TTL"), "values": set(), "alias": None}
        if "AliasTarget" in rr:
            s["alias"] = rr["AliasTarget"]["DNSName"].rstrip(".").lower()
        for v in rr.get("ResourceRecords", []):
            s["values"].add(norm_value(t, v["Value"]))
        sets[(name, t)] = s
    return sets


def planned_values(planned, zone, name, rtype):
    """Values planned.json adds to a record set Cloudflare also has. A null
    MX ("0 .") is dropped beside real MX records (RFC 7505), as main.tf does."""
    out = set()
    for rec in planned.get("add", []):
        if fqdn(rec["name"], zone) == name and rec["type"].upper() == rtype:
            out |= {norm_value(rtype, v) for v in rec["values"]}
    return out - {NULL_MX} if rtype == "MX" else out


def planned_matches(planned, zone, name, rtype, r53):
    for rec in planned.get("add", []):
        if fqdn(rec["name"], zone) == name and rec["type"].upper() == rtype:
            want = {norm_value(rtype, v) for v in rec["values"]}
            return f"planned: {rec.get('reason', '')}" if want <= r53["values"] else None
    for pat in planned.get("allow", []):
        if fnmatch.fnmatch(name, fqdn(pat["name"], zone)) and rtype in [t.upper() for t in pat["types"]]:
            return f"owned elsewhere: {pat.get('reason', '')}"
    return None


def diff(cf, r53, planned, zone, ignore_ttl=False):
    differences, notes = [], []
    explained, aliased = set(), set()
    for (name, t), c in sorted(cf.items()):
        if c["proxied"]:
            # The CloudFront alias replaces it; check both families once per name.
            if name in aliased:
                continue
            aliased.add(name)
            for fam in ("A", "AAAA"):
                r = r53.get((name, fam))
                explained.add((name, fam))
                if r is None or not (r["alias"] or "").endswith(".cloudfront.net"):
                    differences.append(f"MISSING  {name} {fam}: Cloudflare proxies {t} here; Route 53 needs an alias to CloudFront")
                else:
                    notes.append(f"replaced {name} {fam}: Cloudflare proxied {t} -> alias {r['alias']}")
            continue
        explained.add((name, t))
        r = r53.get((name, t))
        if r is None:
            differences.append(f"MISSING  {name} {t} {sorted(c['values'])}")
            continue
        if r["alias"]:
            differences.append(f"CHANGED  {name} {t}: Cloudflare {sorted(c['values'])}, Route 53 alias {r['alias']}")
            continue
        added = planned_values(planned, zone, name, t)
        if r["values"] != c["values"] | added:
            want = sorted(c["values"] | added)
            differences.append(f"CHANGED  {name} {t}: Cloudflare + planned {want}, Route 53 {sorted(r['values'])}")
        elif not ignore_ttl and r["ttl"] != c["ttl"]:
            differences.append(f"TTL      {name} {t}: Cloudflare {c['ttl']}, Route 53 {r['ttl']}")
    for (name, t), r in sorted(r53.items()):
        if t == "MX" and NULL_MX in r["values"] and len(r["values"]) > 1:
            differences.append(f"INVALID  {name} MX: a null MX beside other MX records (RFC 7505)")
        if (name, t) in explained:
            continue
        why = planned_matches(planned, zone, name, t, r)
        if why:
            notes.append(f"extra    {name} {t} ({why})")
        else:
            shown = r["alias"] or sorted(r["values"])
            differences.append(f"EXTRA    {name} {t} {shown}: in Route 53 only and not in planned.json")
    return differences, notes


def load_route53(args):
    if args.route53:
        return json.loads(Path(args.route53).read_text())
    out = subprocess.run(
        ["aws", "route53", "list-resource-record-sets", "--hosted-zone-id", args.zone_id, "--output", "json"],
        check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--zone", default="marisstella.app")
    ap.add_argument("--cloudflare", required=True)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--route53")
    src.add_argument("--zone-id")
    ap.add_argument("--planned", default=str(Path(__file__).resolve().parent.parent / "planned.json"))
    ap.add_argument("--ignore-ttl", action="store_true", help="during the TTL-lowering phase only")
    args = ap.parse_args(argv)
    cf = cloudflare_sets(json.loads(Path(args.cloudflare).read_text()), args.zone)
    r53 = route53_sets(load_route53(args), args.zone)
    planned = json.loads(Path(args.planned).read_text())
    differences, notes = diff(cf, r53, planned, args.zone, args.ignore_ttl)
    for n in notes:
        print(n)
    for d in differences:
        print(d)
    print(f"zone_diff: {len(differences)} difference(s); {len(notes)} replaced or planned record set(s)")
    return 1 if differences else 0


if __name__ == "__main__":
    sys.exit(main())
