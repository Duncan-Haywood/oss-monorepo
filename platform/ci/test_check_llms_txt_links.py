import tempfile
import unittest
from pathlib import Path

import check_llms_txt_links as c


class DeadLinks(unittest.TestCase):
    def test_finds_only_dead_links(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            v = root / "ventures" / "foo"
            v.mkdir(parents=True)
            (v / "guide.html").write_text("x")
            (v / "README.md").write_text("x")
            (v / "llms.txt").write_text(
                "- [ok](https://duncan-haywood.github.io/oss-monorepo/foo/guide.html)\n"
                "- [ok2](https://example.invalid/foo/)\n"
                "- [ok3](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/foo/README.md#x)\n"
                "- [bad](https://duncan-haywood.github.io/oss-monorepo/foo/gone.html)\n"
                "- [bad2](https://duncan-haywood.github.io/oss-monorepo/nope/)\n"
                "- [bad3](https://github.com/o/oss-monorepo/tree/main/ventures/foo/missing)\n"
                "- [other](https://creativecommons.org/licenses/by-sa/4.0/)\n"
            )
            bad = c.dead_links(root)
            self.assertEqual(
                sorted(u.rsplit("/", 2)[-2] + "/" + u.rsplit("/", 1)[-1] for _, u, _ in bad),
                ["foo/gone.html", "foo/missing", "nope/"],
            )


if __name__ == "__main__":
    unittest.main()
