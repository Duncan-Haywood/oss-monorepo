import shutil
import tempfile
import unittest
from pathlib import Path

import check_share_text_encoding as cste

ROOT = Path(__file__).resolve().parents[2]
REAL = (ROOT / "ventures/moving-bid-calculator/share.mjs").read_text()
# The pre-2026-11-16 encoder: cut by code units, no surrogate repair.
UNFIXED = REAL.replace("const raw = clipText(String(value ?? '').trim());",
                       "const raw = String(value ?? '').trim().slice(0, MAX_TEXT);", 1)
OTHER_DESIGN = """export function encodeBid(input) { return encodeURIComponent(JSON.stringify(input)); }
export function decodeBid(raw) { return JSON.parse(decodeURIComponent(raw)); }
"""


def tree(files):
    tmp = Path(tempfile.mkdtemp())
    for rel, text in files.items():
        path = tmp / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return tmp


class ShareTextEncoding(unittest.TestCase):
    def check(self, files):
        root = tree(files)
        self.addCleanup(shutil.rmtree, root)
        return root, cste.run(root)

    def test_the_real_copy_passes_and_another_design_is_skipped(self):
        root, out = self.check({"ventures/a/share.mjs": REAL, "ventures/b/share.mjs": OTHER_DESIGN})
        self.assertEqual((out["checked"], out["breaches"]), (1, []))
        self.assertEqual(cste.main(["--root", str(root)]), 0)

    def test_the_unfixed_encoder_is_a_breach(self):
        self.assertNotEqual(UNFIXED, REAL, "fixture no longer applies: update it")
        root, out = self.check({"ventures/a/site/share.mjs": UNFIXED})
        found = sorted(what for _, what in out["breaches"])
        self.assertIn("encodeBid threw URIError on an emoji at the length cut", found)
        self.assertIn("encodeBid threw URIError on a stray high surrogate", found)
        self.assertEqual(cste.main(["--root", str(root)]), 1)


if __name__ == "__main__":
    unittest.main()
