import shutil
import tempfile
import unittest
from pathlib import Path

import check_share_storage_contract as cssc

ROOT = Path(__file__).resolve().parents[2]
REAL = (ROOT / "ventures/moving-bid-calculator/share.mjs").read_text()
# The two mutants that escaped moving-bid-calculator's own suite on 2026-11-16.
KEYLESS_WRITES = REAL.replace("if (!storage || !spec?.key) return false;\n  try {\n    storage.setItem",
                              "if (!storage && !spec?.key) return false;\n  try {\n    storage.setItem", 1)
CLEAR_LIES = REAL.replace("storage.removeItem(spec.key);\n    return true;",
                          "storage.removeItem(spec.key);\n    return false;", 1)
# A different design (no spec argument) is not this contract's business.
OTHER_DESIGN = """export function saveBid(storage, values) { return false; }
export function loadBid(storage) { return {}; }
export function clearBid(storage) { return false; }
"""


def tree(files):
    tmp = Path(tempfile.mkdtemp())
    for rel, text in files.items():
        path = tmp / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return tmp


class ShareStorageContract(unittest.TestCase):
    def setUp(self):
        self.assertNotEqual(KEYLESS_WRITES, REAL, "mutant 1 no longer applies: update the fixture")
        self.assertNotEqual(CLEAR_LIES, REAL, "mutant 2 no longer applies: update the fixture")

    def check(self, files):
        root = tree(files)
        self.addCleanup(shutil.rmtree, root)
        return root, cssc.run(root)

    def test_the_real_copy_passes_and_another_design_is_skipped(self):
        root, out = self.check({"ventures/a/share.mjs": REAL, "ventures/b/share.mjs": OTHER_DESIGN})
        self.assertEqual((out["checked"], out["skipped"], out["breaches"]), (1, 1, []))
        self.assertEqual(cssc.main(["--root", str(root)]), 0)

    def test_saveBid_writing_under_a_missing_key_is_a_breach(self):
        root, out = self.check({"ventures/a/share.mjs": KEYLESS_WRITES})
        self.assertTrue(any("key-less spec wrote" in what for _, what in out["breaches"]), out)
        self.assertEqual(cssc.main(["--root", str(root)]), 1)

    def test_clearBid_reporting_failure_after_clearing_is_a_breach(self):
        root, out = self.check({"ventures/a/site/share.mjs": CLEAR_LIES})
        self.assertEqual([what for _, what in out["breaches"]],
                         ["clearBid did not return true on a working store"])

    def test_a_copy_node_cannot_import_fails(self):
        root, out = self.check({"ventures/a/share.mjs": "export function saveBid(a, b, c) { return ; \n"})
        self.assertEqual(len(out["unloadable"]), 1)
        self.assertEqual(cssc.main(["--root", str(root)]), 1)


if __name__ == "__main__":
    unittest.main()
