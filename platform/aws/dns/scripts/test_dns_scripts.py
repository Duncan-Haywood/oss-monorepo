"""Tests for cf_export.py and zone_diff.py with recorded API shapes, no network.

    python3 -m unittest discover -s platform/aws/dns/scripts -p 'test_*.py'
"""
import io
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cf_export  # noqa: E402
import zone_diff  # noqa: E402
from zonelib import norm_value, unquote_txt  # noqa: E402

ZONE = "marisstella.app"
HERE = Path(__file__).resolve().parent
PLANNED = json.loads((HERE.parent / "planned.json").read_text())

# Shapes as the Cloudflare v4 API returns them (dns_records list).
CF_RAW = [
    {"name": "marisstella.app", "type": "AAAA", "content": "100::", "proxied": True, "ttl": 1,
     "comment": "Worker custom domain"},
    {"name": "grants.marisstella.app", "type": "AAAA", "content": "100::", "proxied": True, "ttl": 1},
    {"name": "marisstella.app", "type": "MX", "content": "route1.mx.cloudflare.net", "priority": 13, "ttl": 1, "proxied": False},
    {"name": "marisstella.app", "type": "MX", "content": "route2.mx.cloudflare.net", "priority": 86, "ttl": 1, "proxied": False},
    {"name": "marisstella.app", "type": "TXT", "content": "\"v=spf1 include:_spf.mx.cloudflare.net ~all\"", "ttl": 1, "proxied": False},
    {"name": "marisstella.app", "type": "TXT", "content": "google-site-verification=abc", "ttl": 3600, "proxied": False},
    {"name": "cf2024-1._domainkey.marisstella.app", "type": "TXT", "content": "v=DKIM1; h=sha256; k=rsa; p=" + "A" * 300, "ttl": 1, "proxied": False},
    {"name": "docs.marisstella.app", "type": "CNAME", "content": "example.github.io", "ttl": 300, "proxied": False},
    {"name": "_sip._tcp.marisstella.app", "type": "SRV", "content": "5 5060 sip.example.com", "priority": 10,
     "data": {"priority": 10, "weight": 5, "port": 5060, "target": "sip.example.com"}, "ttl": 300, "proxied": False},
    {"name": "marisstella.app", "type": "NS", "content": "x.ns.cloudflare.com", "ttl": 86400, "proxied": False},
]


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def fake_opener(pages):
    calls = []

    def opener(req, timeout=None):
        calls.append(req.full_url)
        assert req.headers["Authorization"] == "Bearer TEST"
        if "/zones?" in req.full_url:
            return FakeResponse(json.dumps({"success": True, "result": [{"id": "Z1"}]}).encode())
        page = int(req.full_url.rsplit("page=", 1)[1])
        return FakeResponse(json.dumps({
            "success": True, "result": pages[page - 1],
            "result_info": {"page": page, "total_pages": len(pages)},
        }).encode())
    opener.calls = calls
    return opener


def r53_from(records_doc):
    """What Route 53 would list after the dns and site stacks apply."""
    rrs = [{"Name": f"{ZONE}.", "Type": "SOA", "TTL": 900, "ResourceRecords": [{"Value": "x"}]},
           {"Name": f"{ZONE}.", "Type": "NS", "TTL": 172800, "ResourceRecords": [{"Value": "ns-1.awsdns-00.com."}]}]
    sets = {}
    for r in records_doc["records"] + PLANNED["add"]:
        if r.get("replaced_by"):
            continue
        key = (r["name"], r["type"])
        s = sets.setdefault(key, {"ttl": r["ttl"], "values": []})
        s["ttl"] = min(s["ttl"], r["ttl"])
        s["values"] += [v for v in r["values"] if v not in s["values"]]
    for (name, t), s in sets.items():
        if t == "MX" and len(s["values"]) > 1:
            s["values"] = [v for v in s["values"] if v != "0 ."]  # as main.tf does
        fq = ZONE if name == "@" else f"{name}.{ZONE}"
        vals = [f'"{v}"' if t == "TXT" else v for v in s["values"]]
        rrs.append({"Name": fq + ".", "Type": t, "TTL": s["ttl"], "ResourceRecords": [{"Value": v} for v in vals]})
    for host in (ZONE, f"www.{ZONE}", f"grants.{ZONE}"):
        for fam in ("A", "AAAA"):
            rrs.append({"Name": host + ".", "Type": fam,
                        "AliasTarget": {"DNSName": "d111111abcdef8.cloudfront.net.", "HostedZoneId": "Z2FDTNDATAQYW2"}})
    return {"ResourceRecordSets": rrs}


class Normalise(unittest.TestCase):
    def test_txt(self):
        self.assertEqual(unquote_txt('"a" "b"'), "ab")
        self.assertEqual(unquote_txt('"v=spf1 -all"'), "v=spf1 -all")
        self.assertEqual(unquote_txt("plain text"), "plain text")

    def test_hosts_and_priorities(self):
        self.assertEqual(norm_value("MX", "10 Mail.Example.com."), "10 mail.example.com")
        self.assertEqual(norm_value("MX", "0 ."), "0 .")
        self.assertEqual(norm_value("CNAME", "X.example.COM."), "x.example.com")
        self.assertEqual(norm_value("AAAA", "2001:0db8::0001"), "2001:db8::1")
        self.assertEqual(norm_value("CAA", '0 ISSUE "amazon.com"'), '0 issue "amazon.com"')


class Export(unittest.TestCase):
    def test_fetch_paginates_and_sends_token(self):
        opener = fake_opener([CF_RAW[:4], CF_RAW[4:]])
        raw = cf_export.fetch(ZONE, "TEST", opener)
        self.assertEqual(len(raw), len(CF_RAW))
        self.assertEqual(len(opener.calls), 3)

    def test_convert(self):
        doc = cf_export.convert(CF_RAW, ZONE)
        by = {(r["name"], r["type"]): r for r in doc["records"]}
        self.assertTrue(doc["verified"])
        self.assertNotIn(("@", "NS"), by)
        self.assertEqual(by[("@", "AAAA")]["replaced_by"], "site")
        self.assertEqual(by[("grants", "AAAA")]["replaced_by"], "site")
        self.assertEqual(by[("@", "MX")]["values"], ["13 route1.mx.cloudflare.net", "86 route2.mx.cloudflare.net"])
        self.assertEqual(by[("@", "MX")]["ttl"], 300)
        self.assertEqual(set(by[("@", "TXT")]["values"]),
                         {"v=spf1 include:_spf.mx.cloudflare.net ~all", "google-site-verification=abc"})
        self.assertEqual(by[("_sip._tcp", "SRV")]["values"], ["10 5 5060 sip.example.com"])
        self.assertEqual(by[("docs", "CNAME")]["values"], ["example.github.io"])

    def test_unknown_proxied_and_apex_cname_need_a_decision(self):
        doc = cf_export.convert([
            {"name": "shop.marisstella.app", "type": "A", "content": "192.0.2.1", "proxied": True, "ttl": 1},
            {"name": "marisstella.app", "type": "CNAME", "content": "x.example.com", "proxied": False, "ttl": 1},
        ], ZONE)
        self.assertEqual({r["replaced_by"] for r in doc["records"]}, {"needs-decision"})

    def test_seed_file_is_marked_unverified(self):
        seed = json.loads((HERE.parent / "records.json").read_text())
        self.assertFalse(seed["verified"], "records.json is a seed until cf_export.py replaces it")
        self.assertIn("UNVERIFIED", seed["source"])


class Diff(unittest.TestCase):
    def run_diff(self, r53_doc, ignore_ttl=False):
        cf = zone_diff.cloudflare_sets(CF_RAW, ZONE)
        r53 = zone_diff.route53_sets(r53_doc, ZONE)
        return zone_diff.diff(cf, r53, PLANNED, ZONE, ignore_ttl)

    def test_export_applied_gives_zero_differences(self):
        doc = cf_export.convert(CF_RAW, ZONE)
        differences, notes = self.run_diff(r53_from(doc))
        self.assertEqual(differences, [])
        self.assertTrue(any(n.startswith("replaced marisstella.app A") for n in notes))
        self.assertTrue(any("_dmarc" in n and "planned" in n for n in notes))

    def test_missing_changed_extra_and_ttl_are_reported(self):
        doc = cf_export.convert(CF_RAW, ZONE)
        r53 = r53_from(doc)
        rrs = r53["ResourceRecordSets"]
        rrs[:] = [r for r in rrs if not r["Name"].startswith("docs.")]
        for r in rrs:
            if r["Name"].startswith("_sip."):
                r["ResourceRecords"] = [{"Value": "10 5 5061 sip.example.com."}]
            if r["Name"] == f"{ZONE}." and r["Type"] == "MX":
                r["TTL"] = 3600
        rrs.append({"Name": f"stray.{ZONE}.", "Type": "A", "TTL": 60, "ResourceRecords": [{"Value": "192.0.2.9"}]})
        rrs[:] = [r for r in rrs if not (r["Name"] == f"grants.{ZONE}." and r["Type"] == "AAAA")]
        differences, _ = self.run_diff(r53)
        text = "\n".join(differences)
        self.assertIn("MISSING  docs.marisstella.app CNAME", text)
        self.assertIn("CHANGED  _sip._tcp.marisstella.app SRV", text)
        self.assertIn("EXTRA    stray.marisstella.app A", text)
        self.assertIn("MISSING  grants.marisstella.app AAAA", text)
        self.assertIn("TTL      marisstella.app MX", text)
        for r in rrs:
            if r["Name"] == f"{ZONE}." and r["Type"] == "MX":
                r["ResourceRecords"].append({"Value": "0 ."})
        self.assertIn("INVALID  marisstella.app MX", "\n".join(self.run_diff(r53)[0]))
        ttl_only = [d for d in self.run_diff(r53, ignore_ttl=True)[0] if d.startswith("TTL")]
        self.assertEqual(ttl_only, [])

    def test_seed_plus_planned_is_clean_against_seed_shaped_cloudflare(self):
        # Cloudflare as the seed describes it: two proxied names, no mail.
        cf_raw = [{"name": ZONE, "type": "A", "content": "104.21.17.112", "proxied": True, "ttl": 1},
                  {"name": f"grants.{ZONE}", "type": "A", "content": "104.21.17.112", "proxied": True, "ttl": 1}]
        seed = json.loads((HERE.parent / "records.json").read_text())
        cf = zone_diff.cloudflare_sets(cf_raw, ZONE)
        r53 = zone_diff.route53_sets(r53_from(seed), ZONE)
        differences, notes = zone_diff.diff(cf, r53, PLANNED, ZONE)
        self.assertEqual(differences, [])
        self.assertTrue(any("www.marisstella.app A" in n for n in notes))

    def test_cli_exit_codes(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            cf_path, r53_path = Path(d, "cf.json"), Path(d, "r53.json")
            cf_path.write_text(json.dumps(CF_RAW))
            r53_path.write_text(json.dumps({"ResourceRecordSets": []}))
            out = io.StringIO()
            sys_stdout, sys.stdout = sys.stdout, out
            try:
                code = zone_diff.main(["--cloudflare", str(cf_path), "--route53", str(r53_path)])
            finally:
                sys.stdout = sys_stdout
            self.assertEqual(code, 1)
            self.assertIn("difference(s)", out.getvalue())


if __name__ == "__main__":
    unittest.main()
