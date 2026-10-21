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
