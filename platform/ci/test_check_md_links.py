import tempfile
import unittest
from pathlib import Path

import check_md_links as c


class LinksIn(unittest.TestCase):
    def targets(self, text):
        return [t for _, t in c.links_in(text)]

    def test_plain_image_and_titled(self):
        self.assertEqual(sorted(self.targets('[a](x.md) ![i](p.png) [b](y.md "t")')), ["p.png", "x.md", "y.md"])

    def test_code_ignored(self):
        self.assertEqual(self.targets("`[a](x.md)` and ``[`b`](y.md)``"), [])
        self.assertEqual(self.targets("```\n[a](x.md)\n```\n[b](z.md)"), ["z.md"])


class DeadLinks(unittest.TestCase):
    def test_dead_vs_live(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "sub").mkdir()
            (root / "real.md").write_text("x")
            doc = root / "sub" / "a.md"
            doc.write_text(
                "[ok](../real.md#h) [bad](nope.md) [web](https://x.y) [anc](#a) [site](/page)\n"
            )
            self.assertEqual([t for _, t in c.dead_links(doc, root)], ["nope.md"])


if __name__ == "__main__":
    unittest.main()
