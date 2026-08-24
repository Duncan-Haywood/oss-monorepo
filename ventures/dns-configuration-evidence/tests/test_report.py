import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from dns_evidence.report import build_report, classify_email_auth, load_snapshot, markdown_report


def snapshot(observations):
    return {"authorized": True, "domain": "example.test", "captured_at": "2026-08-24T12:00:00Z", "observations": observations}


def observation(name, answers=None, status=None, resolver="resolver-a"):
    result = {"name": name, "type": "TXT", "resolver": resolver, "observed_at": "2026-08-24T12:00:00Z"}
    result["answers" if answers is not None else "status"] = answers if answers is not None else status
    return result


class ReportTests(unittest.TestCase):
    def test_changed_unchanged_and_inconclusive_are_distinct(self):
        before = snapshot([observation("a", ["one"]), observation("same", ["x"]), observation("broken", status="timeout")])
        after = snapshot([observation("a", ["two"]), observation("same", ["x"]), observation("broken", ["later"])])
        report = build_report(before, after)
        self.assertEqual(report["finding_counts"], {"changed": 1, "unchanged": 1, "inconclusive": 1})
        self.assertEqual(next(item for item in report["findings"] if item["name"] == "broken")["status"], "inconclusive")

    def test_resolver_is_part_of_observation_identity(self):
        report = build_report(snapshot([observation("a", ["one"], resolver="a")]), snapshot([observation("a", ["one"], resolver="b")]))
        self.assertEqual(report["finding_counts"], {"inconclusive": 2})

    def test_unauthorized_input_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.json"
            path.write_text(json.dumps({"authorized": False}), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_snapshot(path)

    def test_markdown_discloses_limits(self):
        output = markdown_report(build_report(snapshot([observation("a", ["one"])]), snapshot([observation("a", ["two"])])))
        self.assertIn("not a security, deliverability, or compliance warranty", output)
        self.assertIn("Inconclusive observations are not reported as unchanged", output)

    def test_duplicate_observations_are_rejected(self):
        duplicate = observation("a", ["one"])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.json"
            path.write_text(json.dumps(snapshot([duplicate, duplicate])), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                load_snapshot(path)

    def test_invalid_timestamp_is_rejected(self):
        invalid = observation("a", ["one"])
        invalid["observed_at"] = "yesterday"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.json"
            path.write_text(json.dumps(snapshot([invalid])), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "ISO 8601"):
                load_snapshot(path)

    def test_classify_email_auth_recognises_dmarc_by_name(self):
        self.assertEqual(classify_email_auth("_dmarc.example.test", "TXT", "example.test", None), "DMARC")
        self.assertEqual(classify_email_auth("_dmarc.example.test.", "TXT", "example.test", None), "DMARC")

    def test_classify_email_auth_recognises_dkim_by_selector_name(self):
        self.assertEqual(
            classify_email_auth("selector1._domainkey.example.test", "TXT", "example.test", None), "DKIM"
        )

    def test_classify_email_auth_recognises_spf_by_apex_content(self):
        self.assertEqual(
            classify_email_auth("example.test", "TXT", "example.test", ("v=spf1 -all",)), "SPF"
        )

    def test_classify_email_auth_does_not_flag_unrelated_apex_txt(self):
        self.assertIsNone(
            classify_email_auth("example.test", "TXT", "example.test", ("google-site-verification=abc",))
        )

    def test_classify_email_auth_ignores_non_txt_records(self):
        self.assertIsNone(classify_email_auth("_dmarc.example.test", "MX", "example.test", None))

    def test_classify_email_auth_ignores_unrelated_names(self):
        self.assertIsNone(classify_email_auth("www.example.test", "TXT", "example.test", ("v=spf1 -all",)))

    def test_report_flags_a_changed_spf_record(self):
        before = snapshot([observation("example.test", ["v=spf1 include:old.example.test ~all"])])
        after = snapshot([observation("example.test", ["v=spf1 include:new.example.test ~all"])])
        report = build_report(before, after)
        self.assertEqual(report["email_auth_changed_count"], 1)
        finding = report["findings"][0]
        self.assertEqual(finding["email_auth"], "SPF")
        self.assertEqual(finding["status"], "changed")

    def test_report_does_not_count_an_unchanged_email_auth_record(self):
        before = snapshot([observation("_dmarc.example.test", ["v=DMARC1; p=reject"])])
        after = snapshot([observation("_dmarc.example.test", ["v=DMARC1; p=reject"])])
        report = build_report(before, after)
        self.assertEqual(report["email_auth_changed_count"], 0)
        self.assertEqual(report["findings"][0]["email_auth"], "DMARC")
        self.assertEqual(report["findings"][0]["status"], "unchanged")

    def test_report_does_not_flag_an_ordinary_changed_record(self):
        before = snapshot([observation("example.test")])
        before["observations"][0]["type"] = "A"
        before["observations"][0]["answers"] = ["192.0.2.1"]
        after = snapshot([observation("example.test")])
        after["observations"][0]["type"] = "A"
        after["observations"][0]["answers"] = ["192.0.2.2"]
        report = build_report(before, after)
        self.assertEqual(report["email_auth_changed_count"], 0)
        self.assertIsNone(report["findings"][0]["email_auth"])

    def test_markdown_calls_out_a_changed_email_auth_record(self):
        before = snapshot([observation("selector1._domainkey.example.test", ["p=oldkey"])])
        after = snapshot([observation("selector1._domainkey.example.test", ["p=newkey"])])
        output = markdown_report(build_report(before, after))
        self.assertIn("email-authentication record(s) changed", output)
        self.assertIn("DKIM", output)

    def test_markdown_omits_the_callout_when_nothing_email_auth_changed(self):
        output = markdown_report(build_report(snapshot([observation("a", ["one"])]), snapshot([observation("a", ["two"])])))
        self.assertNotIn("email-authentication record(s) changed", output)


if __name__ == "__main__":
    unittest.main()
