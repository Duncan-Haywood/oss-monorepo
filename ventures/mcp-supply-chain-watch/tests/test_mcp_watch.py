import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))
from mcp_watch import compare, load, markdown


class McpWatchTests(unittest.TestCase):
    def fixtures(self):
        root = Path(__file__).parents[1]
        return (
            load(str(root / "examples/before.json")),
            load(str(root / "examples/after.json")),
        )

    def test_fixture_reports_added_and_instruction_changes(self):
        before, after = self.fixtures()
        report = compare(before, after)
        kinds = [item["kind"] for item in report["changes"]]
        self.assertEqual(kinds, ["description_changed", "tool_added"])
        self.assertEqual(report["changes"][0]["bucket"], "instruction-bearing")
        self.assertEqual(report["changes"][1]["tool"], "delete_inventory")

    def test_removed_tool_is_an_alert(self):
        before = {
            "captured": "2026-08-20T09:00:00Z",
            "server": "inventory-mcp",
            "tools": {
                "search_inventory": {"name": "search_inventory", "description": "Search"},
                "delete_inventory": {"name": "delete_inventory", "description": "Delete"},
            },
        }
        after = {
            "captured": "2026-08-24T09:00:00Z",
            "server": "inventory-mcp",
            "tools": {"search_inventory": {"name": "search_inventory", "description": "Search"}},
        }
        report = compare(before, after)
        self.assertEqual(report["changes"][0]["kind"], "tool_removed")
        self.assertEqual(report["changes"][0]["severity"], "alert")

    def test_duplicate_names_are_rejected(self):
        import tempfile

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "duplicate.json"
            path.write_text(json.dumps({"tools": [{"name": "x"}, {"name": "x"}]}))
            with self.assertRaises(ValueError) as error:
                load(str(path))
            self.assertIn("duplicate", str(error.exception))

    def test_metadata_only_change_is_not_reported_as_a_description_change(self):
        # Same description, same inputSchema -- only an annotations field differs.
        # Regression for a bug where classify() fell through to "description
        # changed" as a catch-all even when the description text was identical.
        before = {
            "tools": {
                "search_inventory": {
                    "name": "search_inventory",
                    "description": "Search available inventory",
                    "inputSchema": {"type": "object"},
                    "annotations": {"readOnlyHint": True},
                },
            },
        }
        after = {
            "tools": {
                "search_inventory": {
                    "name": "search_inventory",
                    "description": "Search available inventory",
                    "inputSchema": {"type": "object"},
                    "annotations": {"readOnlyHint": False},
                },
            },
        }
        report = compare(before, after)
        self.assertEqual(len(report["changes"]), 1)
        change = report["changes"][0]
        self.assertEqual(change["bucket"], "metadata-change")
        self.assertNotIn("description changed", change["reason"])
        self.assertIn("annotations", change["reason"])

    def test_markdown_report_is_reviewable_without_manifest_content(self):
        before, after = self.fixtures()
        output = markdown(compare(before, after))
        self.assertIn("Observed changes: 2", output)
        self.assertIn("search_inventory", output)
        self.assertNotIn("Ignore previous instructions", output)
        self.assertNotIn("inputSchema", output)


if __name__ == "__main__":
    unittest.main()
