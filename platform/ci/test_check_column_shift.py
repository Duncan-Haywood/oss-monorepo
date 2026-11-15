import tempfile
import unittest
from pathlib import Path

import check_column_shift as c

HEAD = "Date,ID,Description,Credit,Debit,Currency,Balance,Status"
SAMPLE = f"{HEAD}\\n2026-10-04,tx-1,Fee,,1.40,EUR,157.10,Completed\\n2026-10-03,tx-2,Payment,500.00,,EUR,158.50,Completed"

# Reads columns by header position, skips rows whose status is not "Completed" with an info note.
QUIET = """
export const sampleReport = () => "%s";
export function parseStatement(text) {
  const [h, ...rows] = text.split("\\n"); const head = h.split(",");
  const findings = [];
  for (const r of rows) {
    const c = r.split(",");
    if (c.length > head.length && GUARD) { findings.push({ severity: "error", title: "too many fields" }); continue; }
    if (c[head.indexOf("Status")] !== "Completed") findings.push({ severity: "info", title: "skipped" });
  }
  return { findings };
}
"""


def venture(root, name, guard):
    d = root / "ventures" / name
    d.mkdir(parents=True)
    (d / "calc.mjs").write_text(QUIET.replace("%s", SAMPLE).replace("GUARD", "true" if guard else "false"))


class ColumnShift(unittest.TestCase):
    def test_silent_parser_fails_and_guarded_one_passes(self):
        with tempfile.TemporaryDirectory() as t:
            root = Path(t)
            venture(root, "quiet-to-journal", guard=False)
            venture(root, "loud-to-journal", guard=True)
            rows = {r["file"]: r["status"] for r in c.probe(root)}
            self.assertEqual(rows["ventures/quiet-to-journal/calc.mjs"], "silent")
            self.assertEqual(rows["ventures/loud-to-journal/calc.mjs"], "flagged")
            self.assertEqual(c.main(["--root", t]), 1)

    def test_guarded_only_passes(self):
        with tempfile.TemporaryDirectory() as t:
            venture(Path(t), "loud-to-journal", guard=True)
            self.assertEqual(c.main(["--root", t]), 0)

    def test_repository_is_green(self):
        self.assertEqual(c.main([]), 0)


if __name__ == "__main__":
    unittest.main()
