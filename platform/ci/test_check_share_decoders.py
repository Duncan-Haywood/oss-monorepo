import tempfile
import unittest
from pathlib import Path

import check_share_decoders as csd

# Reads a field off whatever JSON.parse returned: crashes on a payload of null.
CRASHES = """export function decodeShare(hash) {
  let d; try { d = JSON.parse(decodeURIComponent(String(hash).replace(/^#/, ''))); } catch { return null; }
  return { rate: d.rate };
}
"""
GUARDED = CRASHES.replace("return { rate", "if (!d || typeof d !== 'object') return null;\n  return { rate")
# Throwing its own Error is a decision the page catches, not a crash.
OWN_ERROR = """export function parseLink(s) { throw new Error('Invalid shared calculation link'); }
export function restoreShare(spec) { return spec.numbers.length; }
"""


def tree(files):
    tmp = Path(tempfile.mkdtemp())
    for rel, text in files.items():
        path = tmp / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return tmp


class ShareDecoders(unittest.TestCase):
    def test_flags_a_decoder_that_reads_a_field_off_json_null(self):
        root = tree({"ventures/a/share.mjs": CRASHES, "ventures/b/site/share.mjs": GUARDED})
        n, out = csd.run(root)
        self.assertEqual((n, out["decoders"]), (2, 2))
        self.assertEqual([Path(c[0]).parts[-2] for c in out["crashes"]], ["a"])
        self.assertIn("TypeError", out["crashes"][0][3])
        self.assertEqual(csd.main(["--root", str(root)]), 1)

    def test_passes_guarded_decoders_and_their_own_errors(self):
        root = tree({"ventures/b/share.mjs": GUARDED, "ventures/c/share.mjs": OWN_ERROR})
        self.assertEqual(csd.main(["--root", str(root)]), 0)

    def test_an_unloadable_module_fails(self):
        root = tree({"ventures/d/share.mjs": "export function decodeX( {"})
        self.assertEqual(csd.main(["--root", str(root)]), 1)


if __name__ == "__main__":
    unittest.main()
