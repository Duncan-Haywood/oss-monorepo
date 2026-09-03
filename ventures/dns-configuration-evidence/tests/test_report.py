import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from dns_evidence.report import build_report, load_snapshot, markdown_report


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
        self.assertIn("`one`", output)
        self.assertIn("`two`", output)

    def test_markdown_marks_missing_answers_as_uncertain(self):
        output = markdown_report(build_report(snapshot([observation("a", status="timeout")]), snapshot([observation("a", ["one"])])))
        self.assertIn("timeout (not observed)", output)

    def test_markdown_escapes_answers_for_table_cells(self):
        output = markdown_report(build_report(
            snapshot([observation("a", ["v|1", "quoted`value", "line\nbreak"])]),
            snapshot([observation("a", ["v|1", "quoted`value", "line\nbreak"])]),
        ))
        self.assertIn("v&#124;1", output)
        self.assertIn("quoted&#96;value", output)
        self.assertIn("line<br>break", output)

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


if __name__ == "__main__":
    unittest.main()
