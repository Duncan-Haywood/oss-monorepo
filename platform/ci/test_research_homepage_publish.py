"""What research/_homepage/build.py publishes for search engines and readers.

Builds the real research site into a temporary directory (about a second) and
checks the published form: structured data on every page, no third-party font
request, the self-hosted fonts beside it, sized figures, and an index that
does not carry every abstract.
"""
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "research" / "_homepage" / "build.py"
BASE = "https://example.test/site/"
LD = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)


def graph(html):
    nodes = []
    for block in LD.findall(html):
        data = json.loads(block)
        nodes.extend(data.get("@graph", [data]))
    return nodes


class ResearchPublishTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        subprocess.run([sys.executable, str(BUILD), "--out", str(cls.out), "--base-url", BASE],
                       check=True, capture_output=True, text=True)
        cls.projects = [p for p in cls.out.iterdir() if (p / "index.html").is_file() and p.name not in ("topics", "fonts")]

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_every_project_page_is_a_scholarly_article_at_its_own_url(self):
        self.assertGreater(len(self.projects), 100)
        for d in self.projects:
            nodes = graph((d / "index.html").read_text())
            article = [n for n in nodes if n.get("@type") == "ScholarlyArticle"]
            self.assertEqual(len(article), 1, d.name)
            self.assertEqual(article[0]["url"], f"{BASE}research/{d.name}/")
            self.assertTrue(article[0]["abstract"].strip(), d.name)
            self.assertLessEqual(len(article[0]["headline"]), 110)
            crumbs = [n for n in nodes if n.get("@type") == "BreadcrumbList"]
            self.assertEqual(crumbs[0]["itemListElement"][-1]["item"], f"{BASE}research/{d.name}/")

    def test_topic_pages_and_the_index_list_what_they_link(self):
        topics = list((self.out / "topics").iterdir())
        self.assertGreater(len(topics), 5)
        for t in topics:
            html = (t / "index.html").read_text()
            page = [n for n in graph(html) if n.get("@type") == "CollectionPage"][0]
            listed = {i["url"] for i in page["mainEntity"]["itemListElement"]}
            linked = {f"{BASE}research/{s}/" for s in re.findall(r'<a href="\.\./\.\./([^"/]+)/"', html)}
            self.assertTrue(listed, t.name)
            self.assertLessEqual(listed, linked | listed)  # every listed project is a real page
            for url in listed:
                self.assertTrue((self.out / url[len(BASE) + len("research/"):] / "index.html").is_file(), url)
        index = [n for n in graph((self.out / "index.html").read_text()) if n.get("@type") == "CollectionPage"][0]
        self.assertEqual(index["mainEntity"]["numberOfItems"], len(topics))

    def test_no_page_requests_fonts_from_a_third_party(self):
        for page in self.out.rglob("index.html"):
            self.assertNotIn("fonts.googleapis.com", page.read_text(), page)
        for name in ("Inter.woff2", "Newsreader.woff2", "JetBrainsMono.woff2"):
            self.assertTrue((self.out / "fonts" / name).is_file(), name)

    def test_figures_reserve_their_box(self):
        imgs = 0
        for d in self.projects:
            for tag in re.findall(r"<figure><img [^>]*>", (d / "index.html").read_text()):
                imgs += 1
                self.assertRegex(tag, r'width="\d+" height="\d+"', d.name)
        self.assertGreater(imgs, 0)

    def test_the_index_does_not_carry_every_abstract(self):
        html = (self.out / "index.html").read_text()
        self.assertNotIn('class="abstract"', html)
        # Generous: 825 projects came to about 1.1 MB once the abstracts left.
        self.assertLess(len(html), 2_000 * len(self.projects))


if __name__ == "__main__":
    unittest.main()


class ResearchIndexLengthTest(unittest.TestCase):
    """The index stays a page a phone can scroll: logs and theme previews are capped,
    and nothing they cap loses its link (2026-11-12: 44,050 px at 390 px wide)."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        subprocess.run([sys.executable, str(BUILD), "--out", str(cls.out)], check=True, capture_output=True, text=True)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_logs_newest_cards_then_every_log_listed(self):
        index = (self.out / "index.html").read_text()
        logs = index[index.index('id="logs"'):index.index('id="projects"')]
        cards = re.findall(r'<a class="feat [^"]*" href="([\w-]+)/#log">.*?<p>Latest: (\d{4}-\d{2}-\d{2})?', logs, re.S)
        self.assertLessEqual(len(cards), 6)
        dates = [d for _, d in cards if d]
        self.assertEqual(dates, sorted(dates, reverse=True), "cards are the newest logs, newest first")
        linked = set(re.findall(r'href="([\w-]+)/#log"', logs))
        # A log is a LOG.md with at least one `## <date> · <title>` entry (build.read_log).
        with_log = {p.name for p in (ROOT / "research").iterdir()
                    if (p / "LOG.md").is_file() and (self.out / p.name).is_dir()
                    and any(l.startswith("## ") for l in (p / "LOG.md").read_text().splitlines())}
        self.assertEqual(linked, with_log, "every project with a LOG.md is linked from the index")
        if len(with_log) > 6:
            self.assertIn('<details class="log-more">', logs)

    def test_phone_preview_is_undone_by_show_all(self):
        index = (self.out / "index.html").read_text()
        self.assertIn("main:not(.all) .theme .grid>.card:nth-child(n+2){display:none}", index)
        self.assertIn("classList.add('all')", index)


    def test_topic_pages_show_every_project_compactly(self):
        """2026-11-12: research/topics/twins/ was 68,158 px at 390 px (164 cards, every lede in
        full). Each card keeps its question, link and full result text in the page once; the
        result is clamped until "Result and abstract" opens; the filter needs script to show."""
        page = (self.out / "topics" / "twins" / "index.html").read_text()
        cards = re.findall(r'<article class="proj" id="([\w-]+)">(.*?)</article>', page, re.S)
        self.assertGreater(len(cards), 50)
        for slug, body in cards:
            self.assertIn(f'href="../../{slug}/"', body)
            self.assertEqual(body.count('<p class="res">'), 1, slug)
            self.assertIn("<details><summary>Result and abstract</summary>", body)
        self.assertIn("-webkit-line-clamp:2", page)
        self.assertIn(".proj:has(details[open]) .res{display:block", page)
        self.assertIn('<form class="find" role="search" hidden', page)
        self.assertIn(".find[hidden]{display:none}", page)

    def test_empty_topic_filter_hands_its_words_to_the_index_search(self):
        """A filter that matches nothing in its topic links to the index search with the same words,
        and the index fills its search box from ?q= (the 2026-11-12 topic-pages report, item 3)."""
        page = (self.out / "topics" / "twins" / "index.html").read_text()
        self.assertIn('<p class="none" hidden>', page)
        self.assertIn("'../../index.html' + (raw ? '?q=' + encodeURIComponent(raw) : '')", page)
        index = (self.out / "index.html").read_text()
        self.assertIn("new URLSearchParams(location.search).get('q')", index)


class LogFormatTest(unittest.TestCase):
    """A research LOG.md with no `## <date> · <title>` entry is silently dropped from its project page
    and from the index (2026-11-12: research/marine-colregs fell out that way)."""

    def test_every_log_has_an_entry(self):
        empty = [p.parent.name for p in sorted((ROOT / "research").glob("*/LOG.md"))
                 if not p.parent.name.startswith(("_", "."))
                 and not any(l.startswith("## ") for l in p.read_text().splitlines())]
        self.assertEqual(empty, [], "these LOG.md files need `## <date> · <title>` entry headings")
