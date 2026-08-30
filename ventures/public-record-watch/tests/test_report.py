import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from public_record_watch.report import build_report, load_snapshot, markdown_report


def snapshot(records):
    return {"authorized": True, "register": "state-license-board", "source_url": "https://example.test/register", "records": records}


class ReportTests(unittest.TestCase):
    def test_added_removed_changed_and_unchanged(self):
        before = snapshot([{"id": "a", "status": "active"}, {"id": "b", "status": "active"}, {"id": "gone", "status": "active"}])
        after = snapshot([{"id": "a", "status": "active"}, {"id": "b", "status": "restricted"}, {"id": "new", "status": "active"}])
        report = build_report(before, after)
        self.assertEqual(report["finding_counts"], {"unchanged": 1, "changed": 1, "removed": 1, "added": 1})

    def test_register_mismatch_rejected(self):
        with self.assertRaisesRegex(ValueError, "same register"):
            build_report(snapshot([]), {**snapshot([]), "register": "other"})

    def test_source_mismatch_rejected(self):
        with self.assertRaisesRegex(ValueError, "same source_url"):
            build_report(snapshot([]), {**snapshot([]), "source_url": "https://other.test/register"})

    def test_duplicate_and_unauthorized_inputs_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.json"
            path.write_text(json.dumps({**snapshot([{"id": "a"}, {"id": "a"}]), "authorized": True}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                load_snapshot(path)
            path.write_text(json.dumps({**snapshot([]), "authorized": False}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "authorized"):
                load_snapshot(path)

    def test_invalid_source_and_non_string_id_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.json"
            path.write_text(json.dumps({**snapshot([{"id": 4}])}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "each record"):
                load_snapshot(path)
            path.write_text(json.dumps({**snapshot([]), "source_url": "javascript:alert(1)"}), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "http"):
                load_snapshot(path)

    def test_markdown_keeps_source_and_limits_visible(self):
        output = markdown_report(build_report(snapshot([]), snapshot([])))
        self.assertIn("https://example.test/register", output)
        self.assertIn("not a suitability or compliance determination", output)

    def test_markdown_escapes_untrusted_table_values(self):
        tricky_url = "https://example.test/register?q=[x]"
        before = {**snapshot([{"id": "a|b", "status": "active"}]), "source_url": tricky_url}
        after = {**snapshot([]), "source_url": tricky_url}
        output = markdown_report(build_report(before, after))
        self.assertIn("a\\|b", output)
        self.assertNotIn("[x]", output)


if __name__ == "__main__":
    unittest.main()
