import unittest

from check_start_here import main, problems

HUB = "2026-10-29-start-here.md"


def post(tag_list, body=""):
    return f'---\ntitle: "T"\ndate: 2026-10-29\ndescription: "d"\ntags: [{tag_list}]\n---\n{body}\n'


class T(unittest.TestCase):
    def test_linked_both_ways(self):
        posts = {
            HUB: post("start-here", "[a](2026-10-30-start-here-a.md)"),
            "2026-10-30-start-here-a.md": post("start-here, x", f"[hub]({HUB})"),
        }
        self.assertEqual(problems(posts), [])

    def test_missing_from_hub(self):
        posts = {HUB: post("start-here"), "2026-10-30-start-here-a.md": post("start-here", f"[hub]({HUB})")}
        self.assertEqual(problems(posts), [f"2026-10-30-start-here-a.md: not linked from the hub {HUB}"])

    def test_no_link_back(self):
        posts = {HUB: post("start-here", "[a](2026-10-30-start-here-a.md)"), "2026-10-30-start-here-a.md": post("start-here")}
        self.assertEqual(problems(posts), [f"2026-10-30-start-here-a.md: does not link back to the hub {HUB}"])

    def test_broken_sibling_link(self):
        posts = {HUB: post("start-here", "[gone](2026-10-29-start-here-gone.md)")}
        self.assertEqual(problems(posts), [f"{HUB}: links to 2026-10-29-start-here-gone.md, which is not in docs/posts/"])

    def test_untagged_posts_ignored(self):
        posts = {HUB: post("start-here"), "2026-10-30-other.md": post("news")}
        self.assertEqual(problems(posts), [])

    def test_repository_passes(self):
        self.assertEqual(main([]), 0)


if __name__ == "__main__":
    unittest.main()
