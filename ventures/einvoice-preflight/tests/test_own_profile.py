"""A PINT or ZATCA file is not judged by EU conventions in the CLI either.

Red team 2026-11-12: report.mjs dropped the EU-only INV-0xx checks on PINT and
ZATCA files, but only when it ran the official rules, and the Python CLI never
read CustomizationID at all: OpenPeppol-shaped PINT JP drew INV-022 and INV-035,
SG and A-NZ drew INV-024. These tests run the CLI on the shipped examples and
compare the profile table and the drop list with the JavaScript ones, so a
one-sided edit fails here.
"""

import contextlib
import io
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from einvoice_preflight import own_profile
from einvoice_preflight.cli import main

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / "examples"


def cli_rules(path: Path) -> list[str]:
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        main([str(path), "--format", "json"])
    report = json.loads(out.getvalue())
    return [e["rule"] for r in report["reports"] for e in r["errors"]]


class CliTest(unittest.TestCase):
    def test_pint_examples_draw_no_eu_only_findings(self):
        for name in ("pint-current-jp-invoice.xml", "pint-current-sg-invoice.xml", "pint-current-aunz-invoice.xml", "pint-sg-invoice.xml"):
            with self.subTest(name=name):
                self.assertEqual(cli_rules(EXAMPLES / name), [])

    def test_the_same_file_under_an_eu_profile_draws_them_again(self):
        xml = (EXAMPLES / "pint-current-jp-invoice.xml").read_text(encoding="utf-8")
        xml = re.sub(r"<cbc:CustomizationID>[^<]*", "<cbc:CustomizationID>urn:cen.eu:en16931:2017", xml, count=1)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "eu.xml"
            path.write_text(xml, encoding="utf-8")
            rules = cli_rules(path)
        self.assertIn("INV-022", rules)
        self.assertIn("INV-035", rules)

    def test_arithmetic_still_runs_under_pint(self):
        self.assertIn("INV-038", cli_rules(EXAMPLES / "pint-sg-invoice-with-defects.xml"))

    def test_matching_profile(self):
        self.assertEqual(own_profile.matching_profile((EXAMPLES / "pint-current-jp-invoice.xml").read_bytes()), "pint-jp-1")
        self.assertEqual(own_profile.matching_profile((EXAMPLES / "pint-sg-invoice.xml").read_bytes()), "pint-sg")
        self.assertEqual(own_profile.matching_profile("<Invoice><cbc:ProfileID>reporting:1.0</cbc:ProfileID></Invoice>"), "zatca")
        self.assertIsNone(own_profile.matching_profile("<Invoice><cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID></Invoice>"))
        cii = "<rsm:CrossIndustryInvoice><ram:ID>urn:peppol:pint:billing-1@jp-1</ram:ID></rsm:CrossIndustryInvoice>"
        self.assertIsNone(own_profile.matching_profile(cii))


class JsParityTest(unittest.TestCase):
    def test_profile_table_matches_schematron_core(self):
        text = (ROOT / "schematron-core.mjs").read_text(encoding="utf-8")
        block = text[text.index("export const PROFILES = {"):text.index("};", text.index("export const PROFILES = {"))]
        js = []
        for name, body in re.findall(r'^\s*"?([\w-]+)"?: \{(.*)\},?\s*$', block, re.M):
            match = re.search(r"match: /(.*?)/i?,", body).group(1)
            profile = re.search(r"profileId: /(.*?)/i?,", body)
            js.append((name, None if match == "(?!)" else match, profile.group(1) if profile else None))
        py = [(n, c.pattern if c else None, p.pattern if p else None) for n, c, p in own_profile.PROFILES]
        self.assertGreater(len(js), 10)
        self.assertEqual(py, js)

    @unittest.skipUnless(shutil.which("node"), "node not installed")
    def test_drop_list_matches_report_mjs(self):
        names = [n for n, _, _ in own_profile.PROFILES] + ["en16931"]
        rows = [
            [],
            [{"tax_category": "AE", "tax": 0, "tax_percent": 5}],
            [{"tax_category": "S", "tax_scheme": "AAL", "tax": 10}],
        ]
        cases = [{"sets": [n], "invoice": {"tax_breakdown": r}} for n in names for r in rows]
        script = (
            "import { ownProfileDrops } from './report.mjs';"
            "const cases = JSON.parse(process.argv[1]);"
            "console.log(JSON.stringify(cases.map((c) => [...ownProfileDrops(c.sets, c.invoice)].sort())));"
        )
        result = subprocess.run(["node", "--input-type=module", "-e", script, json.dumps(cases)], cwd=ROOT, capture_output=True, text=True, timeout=60, check=True)
        js = json.loads(result.stdout)
        for case, expected in zip(cases, js):
            with self.subTest(case=case):
                self.assertEqual(sorted(own_profile.own_profile_drops(case["sets"], case["invoice"])), expected)


if __name__ == "__main__":
    unittest.main()
