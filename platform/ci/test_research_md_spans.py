"""research/_homepage/build.py's inline Markdown: code runs, links in a project's log.

Until 2026-11-14 a log line's relative link showed as "[`paper/draft.md`](paper/draft.md)" and a
double-backtick span as raw text (raw-markdown.mjs in platform/pages checks the built site)."""
import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "research" / "_homepage"))
spec = importlib.util.spec_from_file_location("research_build", ROOT / "research" / "_homepage" / "build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class MdSpansTest(unittest.TestCase):
    def test_relative_link_goes_to_the_project_file(self):
        out = build.inline_md("[`paper/draft.md`](paper/draft.md), a draft", "sensing-selfcal")
        self.assertEqual(out, f'<a href="{build.REPO_URL}/blob/main/research/sensing-selfcal/paper/draft.md">'
                              '<code>paper/draft.md</code></a>, a draft')

    def test_relative_link_without_a_project_keeps_its_text(self):
        self.assertEqual(build.inline_md("see [NEXT.md](NEXT.md)"), "see NEXT.md")

    def test_unsafe_targets_are_dropped(self):
        self.assertNotIn("href", build.inline_md("[x](javascript:alert)", "p"))
        self.assertNotIn("href", build.inline_md("[x](../other/README.md)", "p"))

    def test_http_link_kept(self):
        self.assertEqual(build.inline_md("[a](https://e.org/x)"), '<a href="https://e.org/x">a</a>')

    def test_double_backtick_span(self):
        self.assertEqual(build.md_spans("`` `qual-*` `` and `x`"), "<code>`qual-*`</code> and <code>x</code>")


if __name__ == "__main__":
    unittest.main()
