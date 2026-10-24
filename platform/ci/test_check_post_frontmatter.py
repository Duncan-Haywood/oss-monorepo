import unittest

from check_post_frontmatter import problems

GOOD = '---\ntitle: "T"\ndate: 2026-10-24\ndescription: "d"\ntags: [a, b]\n---\nbody\n'


class T(unittest.TestCase):
    def test_good(self):
        self.assertEqual(problems("2026-10-24-x.md", GOOD), [])

    def test_missing_tags(self):
        t = GOOD.replace("tags: [a, b]\n", "")
        self.assertEqual(problems("2026-10-24-x.md", t), ["missing `tags`"])

    def test_empty_tags(self):
        t = GOOD.replace("[a, b]", "[]")
        self.assertEqual(problems("2026-10-24-x.md", t), ["`tags` is not a non-empty [list]"])

    def test_date_mismatch(self):
        self.assertEqual(len(problems("2026-10-25-x.md", GOOD)), 1)

    def test_no_front_matter(self):
        self.assertEqual(problems("x.md", "# hi\n"), ["no front matter"])


if __name__ == "__main__":
    unittest.main()
