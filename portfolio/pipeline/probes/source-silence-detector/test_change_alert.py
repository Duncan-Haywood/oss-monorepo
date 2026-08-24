"""Tests for the subscriber-facing register-change alert.

The load-bearing ones are not about formatting. Step 2 of
``public-record-watch``'s first experiment is "write the alert as it
would be sent, with the source link". The liability position is that
the product quotes a register and never becomes a claim about a
person, a filing, or a determination that the subscriber is affected.

    python3 -m unittest test_change_alert
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path

import change_alert as ca

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / "fixtures" / "kev-change-log4j.json"
SAMPLE = HERE / "sample-change-alert-2026-08-24.md"
CVE = "CVE-2021-44228"
GENERATED_AT = "2026-08-24T00:00:00Z"

# Words that would turn a register quote into a warranty or a filing.
FORBIDDEN_CLAIMS = (
    "compliant",
    "compliance",
    "you are affected",
    "your product is affected",
    "you should apply",
    "we have filed",
    "we submitted",
    "you are now",
)


def _catalog() -> dict:
    return json.loads(FIXTURE.read_text())


def _alert(**overrides):
    kwargs = {"catalog": _catalog(), "cve_id": CVE, "generated_at": GENERATED_AT}
    kwargs.update(overrides)
    return ca.build_alert(**kwargs)


class CatalogSlice(unittest.TestCase):
    def test_fixture_is_the_live_log4j_row_from_catalog_2026_08_21(self):
        catalog = _catalog()
        self.assertEqual(catalog["catalogVersion"], "2026.08.21")
        self.assertEqual(catalog["count"], 1)
        row = catalog["vulnerabilities"][0]
        self.assertEqual(row["cveID"], CVE)
        self.assertEqual(row["dateAdded"], "2021-12-10")
        self.assertEqual(row["vendorProject"], "Apache")
        self.assertEqual(row["product"], "Log4j2")


class Build(unittest.TestCase):
    def test_alert_is_json_serialisable_and_stamped(self):
        alert = _alert()
        json.loads(ca.to_json(alert))
        self.assertEqual(alert["generated_at"], GENERATED_AT)
        self.assertEqual(alert["kind"], "register-change-alert")
        self.assertEqual(alert["tool"]["name"], "source-silence-detector")

    def test_no_clock_is_read(self):
        first = ca.to_json(_alert())
        second = ca.to_json(_alert())
        self.assertEqual(first, second)

    def test_generated_at_is_required(self):
        with self.assertRaises(ValueError):
            _alert(generated_at="")

    def test_unknown_cve_is_a_hard_miss_not_an_invented_row(self):
        with self.assertRaises(ValueError) as ctx:
            _alert(cve_id="CVE-0000-0000")
        self.assertIn("not in this catalog slice", str(ctx.exception))

    def test_source_document_url_is_mandatory(self):
        register = dict(ca.REGISTER)
        register["source_document_url"] = ""
        with self.assertRaises(ValueError):
            _alert(register=register)

    def test_every_catalog_field_is_quoted_or_marked_unknown(self):
        alert = _alert()
        self.assertEqual(set(alert["quoted"]), set(ca.CATALOG_FIELDS))
        for key, cell in alert["quoted"].items():
            self.assertIn(cell["state"], {"from register", ca.UNKNOWN})
            if cell["state"] == ca.UNKNOWN:
                self.assertIsNone(cell["value"])

    def test_missing_field_stays_unknown(self):
        catalog = _catalog()
        del catalog["vulnerabilities"][0]["notes"]
        alert = _alert(catalog=catalog)
        self.assertEqual(alert["quoted"]["notes"]["state"], ca.UNKNOWN)
        self.assertIsNone(alert["quoted"]["notes"]["value"])

    def test_entry_url_is_taken_from_notes_not_constructed(self):
        alert = _alert()
        self.assertEqual(
            alert["source_entry_url"],
            "https://nvd.nist.gov/vuln/detail/CVE-2021-44228",
        )
        catalog = _catalog()
        catalog["vulnerabilities"][0]["notes"] = "see vendor advisory"
        stripped = _alert(catalog=catalog)
        self.assertIsNone(stripped["source_entry_url"])


class LiabilityPosition(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.alert = _alert()
        cls.md = ca.to_markdown(cls.alert)

    def test_source_document_is_in_the_alert_and_the_markdown(self):
        url = ca.REGISTER["source_document_url"]
        self.assertEqual(self.alert["source_document_url"], url)
        self.assertIn(url, self.md)
        self.assertIn("**Source document:**", self.md)

    def test_required_action_is_labelled_as_federal_catalog_text(self):
        self.assertIn("US-federal catalog", self.md)
        self.assertIn("not instructions to the subscriber", self.md)
        self.assertIn(
            self.alert["quoted"]["requiredAction"]["value"],
            self.md,
        )

    def test_forbidden_claims_do_not_appear(self):
        low = self.md.lower()
        for phrase in FORBIDDEN_CLAIMS:
            self.assertNotIn(phrase, low, phrase)

    def test_does_not_score_or_rank_anyone(self):
        self.assertIn("score or ranking of any person", self.md)
        # The words may appear in the refusal. They must not appear as
        # a computed rating attached to a vendor or person.
        self.assertNotRegex(self.md, r"\b(score|rank):\s*\d")

    def test_does_not_claim_the_subscriber_is_affected(self):
        self.assertIn(
            "not a finding about you",
            self.md.lower(),
        )
        self.assertIn(
            "A determination that your product, network, or customers are affected.",
            self.alert["what_this_is_not"],
        )

    def test_incentive_to_over_notify_is_disclosed(self):
        self.assertIn("Over-notifying", self.md)
        self.assertIn("the error that would pay us", self.md)
        self.assertIn(self.alert["incentive_note"], self.md)

    def test_change_accuracy_is_not_the_silence_figure(self):
        """0.35 is real, and it describes the other surface."""
        self.assertIn("Change-detection accuracy is not measured", self.md)
        self.assertIn("6-of-17 (0.35)", self.md)
        self.assertIn("silence detector", self.md)
        self.assertIn("different surface", self.md)

    def test_licensing_vertical_is_named_as_unreached(self):
        self.assertIn("licensing and disciplinary", self.md.lower())
        self.assertIn("egress-denied", self.md)
        self.assertIn(self.alert["vertical_note"], self.md)


class SamplePinned(unittest.TestCase):
    def test_committed_sample_matches_the_renderer(self):
        rendered = ca.render_from_path(str(FIXTURE), CVE, GENERATED_AT)
        self.assertEqual(SAMPLE.read_text(), rendered)

    def test_sample_carries_the_historical_addition_date(self):
        text = SAMPLE.read_text()
        self.assertIn("2021-12-10", text)
        self.assertIn(CVE, text)
        self.assertIn(ca.REGISTER["source_document_url"], text)


if __name__ == "__main__":
    unittest.main()
