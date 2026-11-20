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


CHROME = {
    "header": '<header class="pfs-test">site</header>',
    "topic_header": '<header class="pfs-test">site › {{TOPIC}}</header>',
    "project_header": '<header class="pfs-test">site › {{TOPIC}} › {{TITLE}}</header>',
    "footer": "<p>links</p>", "style_file": "pf-site.css"}
_BUILDS = {}


def builds():
    """The module's three builds (bare, with a base URL, with a base URL and site chrome), started
    together on first use and shared by the classes that only read them. They ran one after
    another in setUpClass until 2026-11-20, 3 x 3.5 s on a 4-core box; 2026-11-16 had already
    merged two identical bare builds into one."""
    if not _BUILDS:
        tmp = tempfile.TemporaryDirectory()
        unittest.addModuleCleanup(tmp.cleanup)
        root = Path(tmp.name)
        chrome = root / "chrome.json"
        chrome.write_text(json.dumps(CHROME))
        args = {"bare": [], "base": ["--base-url", BASE], "chrome": ["--base-url", BASE, "--site-chrome", str(chrome)]}
        procs = {}
        for name, extra in args.items():
            out = root / name / "research"
            procs[name] = (out, subprocess.Popen([sys.executable, str(BUILD), "--out", str(out), *extra],
                                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True))
        for name, (out, proc) in procs.items():
            stdout, stderr = proc.communicate()
            if proc.returncode:
                raise subprocess.CalledProcessError(proc.returncode, proc.args, stdout, stderr)
            _BUILDS[name] = out
    return _BUILDS


def bare_build():
    return builds()["bare"]


def graph(html):
    nodes = []
    for block in LD.findall(html):
        data = json.loads(block)
        nodes.extend(data.get("@graph", [data]))
    return nodes


class ResearchPublishTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.out = builds()["base"]
        cls.projects = [p for p in cls.out.iterdir() if (p / "index.html").is_file() and p.name not in ("topics", "fonts")]

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

    def test_dependency_tile_is_measured_not_typed(self):
        # The tile said "0 runtime dependencies" while 462 of 1,080 projects imported numpy,
        # matplotlib, scipy or others (2026-11-14). It must now be a count the build measured.
        html = (self.out / "index.html").read_text()
        m = re.search(r'<div class="stat"><b>([\d,]+)</b><span>need only the Python standard library</span>', html)
        self.assertIsNotNone(m)
        stdlib = int(m.group(1).replace(",", ""))
        self.assertGreater(stdlib, 0)
        self.assertLess(stdlib, len(self.projects))
        self.assertNotIn("runtime dependencies", html)
        sys.path.insert(0, str(BUILD.parent))
        try:
            import build
        finally:
            sys.path.pop(0)
        self.assertIn("numpy", build.third_party_imports("cell-fidelity"))
        self.assertNotIn("linefig", build.third_party_imports("workcell-twin"))

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


class ResearchSiteChromeTest(unittest.TestCase):
    """With the parent site's header (as platform/pages/build.mjs publishes it), a topic or project
    page carries that header and its trail only: the page's own "← All projects | GitHub" bar used
    to sit under it, 56 px repeating the trail's Research link (polish, 2026-11-15)."""

    @classmethod
    def setUpClass(cls):
        cls.out = builds()["chrome"]
        cls.bare = bare_build()

    def pages(self, root):
        topics = [t / "index.html" for t in (root / "topics").iterdir()]
        projects = [p / "index.html" for p in root.iterdir()
                    if (p / "index.html").is_file() and p.name not in ("topics", "fonts")]
        return topics, projects

    def test_site_header_replaces_the_page_bar(self):
        topics, projects = self.pages(self.out)
        self.assertGreater(len(projects), 100)
        for f in [self.out / "index.html", *topics, *projects]:
            html = f.read_text()
            self.assertEqual(html.count('<header class="pfs-test">'), 1, f)
            self.assertNotIn('<header class="topbar">', html, f)

    def test_standalone_project_bar_names_where_it_goes(self):
        topics, projects = self.pages(self.bare)
        for f in projects:
            bar = re.search(r'<header class="topbar">(.*?)</header>', f.read_text(), re.S).group(1)
            self.assertIn("← All research", bar, f)
            self.assertIn(f"/tree/main/research/{f.parent.name}\"", bar, f)


class ResearchIndexLengthTest(unittest.TestCase):
    """The index stays a page a phone can scroll: logs and theme previews are capped,
    and nothing they cap loses its link (2026-11-12: 44,050 px at 390 px wide)."""

    @classmethod
    def setUpClass(cls):
        cls.out = bare_build()

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


    def test_no_page_shows_an_escaped_entity_or_raw_emphasis(self):
        # Authors type &minus; and *word* in LOG.md and README ledes; the page must show
        # "−" and italics, not "&minus;" or literal asterisks (1,075 did before 2026-11-14).
        # Only a real entity name counts: "A&S;" (Abramowitz & Stegun, then a semicolon) is
        # text, and escaping it to &amp;S; is what makes the page show it as typed.
        import html.entities
        bad = re.compile(r"&amp;(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);")
        hits = [f"{p.relative_to(self.out)}: {m.group(0)}" for p in sorted(self.out.rglob("*.html"))
                for m in bad.finditer(p.read_text())
                if m.group(1).startswith("#") or m.group(1) + ";" in html.entities.html5]
        self.assertEqual(hits[:5], [], f"{len(hits)} double-escaped entities")
        page = (self.out / "abstention-scoring" / "index.html").read_text()
        self.assertNotIn("Eliciting drift *variance*", page)


class InlineMarkdownTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import importlib.util
        spec = importlib.util.spec_from_file_location("research_homepage_build", BUILD)
        cls.b = importlib.util.module_from_spec(spec)
        sys.path.insert(0, str(BUILD.parent))
        try:
            spec.loader.exec_module(cls.b)
        finally:
            sys.path.remove(str(BUILD.parent))

    def test_entities_survive_and_markup_is_escaped(self):
        self.assertEqual(self.b.md_spans("r &lt; &minus;0.2 &#8722; <b>"), "r &lt; &minus;0.2 &#8722; &lt;b&gt;")
        self.assertEqual(self.b.md_spans("AT&T & co"), "AT&amp;T &amp; co")

    def test_emphasis_only_around_words(self):
        self.assertEqual(self.b.md_spans("drift *variance* here"), "drift <em>variance</em> here")
        self.assertEqual(self.b.md_spans("(η*=0.25) and 10*32*3"), "(η*=0.25) and 10*32*3")
        self.assertEqual(self.b.md_spans("a *b and c* d"), "a <em>b and c</em> d")
        self.assertEqual(self.b.md_spans("at **&mu;* = 0.855** (x)"), "at <strong>&mu;* = 0.855</strong> (x)")

    def test_code_spans_keep_asterisks_and_links_are_opt_in(self):
        self.assertEqual(self.b.md_spans("`a*b*c` *x*"), "<code>a*b*c</code> <em>x</em>")
        self.assertEqual(self.b.md_spans("[t](https://e.x)"), "[t](https://e.x)")
        self.assertEqual(self.b.inline_md("[t](https://e.x)"), '<a href="https://e.x">t</a>')


class TitleIndexTest(unittest.TestCase):
    """title_index (2026-11-16) replaced a scan of every other project per page; the
    answers must match that scan on the real registry and on made-up clashes."""

    @classmethod
    def setUpClass(cls):
        InlineMarkdownTest.setUpClass.__func__(cls)

    def check(self, themes, without_index=False):
        b = self.b
        # The old answer: compare with every other project (each clipped title computed once here).
        every = [(q["slug"], q["title"], b.title_tag(b.plain(q["title"]))) for t in themes for q in t["projects"]]
        index = b.title_index(themes)
        for t in themes:
            for p in t["projects"]:
                clip = b.title_tag(b.plain(p["title"]))
                old = (any(s != p["slug"] and title == p["title"] for s, title, _ in every),
                       any(s != p["slug"] and c == clip for s, _, c in every))
                got = (b.shared_title(p, themes, index), b.clipped_title_taken(p, themes, index))
                self.assertEqual(got, old, p["slug"])
                if without_index:
                    self.assertEqual((b.shared_title(p, themes), b.clipped_title_taken(p, themes)), old)

    def test_matches_the_pairwise_scan_on_the_registry(self):
        sys.path.insert(0, str(BUILD.parent))
        try:
            import registry
            themes = registry.load(ROOT / "research")["themes"]
        finally:
            sys.path.remove(str(BUILD.parent))
        self.check(themes)

    def test_matches_the_pairwise_scan_on_clashes(self):
        long = "Does a very long question title clip to the same forty-eight characters"
        self.check([
            {"projects": [{"slug": "a", "title": "Same"}, {"slug": "b", "title": "Same"},
                          {"slug": "c", "title": long + " here?"}, {"slug": "d", "title": long + " there?"}]},
            {"projects": [{"slug": "a", "title": "Same"}, {"slug": "e", "title": "<em>Alone</em> &amp; unique"}]},
        ], without_index=True)


class LogFormatTest(unittest.TestCase):
    """A research LOG.md with no `## <date> · <title>` entry is silently dropped from its project page
    and from the index (2026-11-12: research/marine-colregs fell out that way)."""

    def test_every_log_has_an_entry(self):
        empty = [p.parent.name for p in sorted((ROOT / "research").glob("*/LOG.md"))
                 if not p.parent.name.startswith(("_", "."))
                 and not any(l.startswith("## ") for l in p.read_text().splitlines())]
        self.assertEqual(empty, [], "these LOG.md files need `## <date> · <title>` entry headings")


class ResearchTreeTest(unittest.TestCase):
    """research_tree (2026-11-17) replaced 2,161 Path.rglob walks of research/ with one;
    the three readers must see the same files the rglob calls saw."""

    @classmethod
    def setUpClass(cls):
        InlineMarkdownTest.setUpClass.__func__(cls)

    def test_matches_rglob_on_a_made_up_tree(self):
        b = self.b
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for rel in ("alpha/src/pkg/core.py", "alpha/tests/test_core.py", "alpha/test_top.py",
                        "alpha/__pycache__/core.cpython-311.py", "alpha/.hidden/secret.py",
                        "alpha/data/notes.txt", "alpha/deep/a/b/c/leaf.py", "beta/run.py",
                        "beta/test_x.PY", "_shared/linefig.py", "top.py", "README.md"):
                f = root / rel
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text("import numpy\nfrom pkg import x\ndef test_a():\n    pass\n")
            (root / "empty").mkdir()
            saved = b.RESEARCH, b._TREE, b._OWN
            b.RESEARCH, b._TREE, b._OWN = root, None, None
            try:
                for slug in ("alpha", "beta", "_shared", "empty", "missing"):
                    for pattern in ("*.py", "test*.py"):
                        self.assertEqual(sorted(b.slug_files(slug, pattern)),
                                         sorted(f for f in (root / slug).rglob(pattern) if f.is_file()),
                                         (slug, pattern))
                self.assertEqual(b.own_modules(),
                                 {f.stem for f in root.rglob("*.py")} | {d.name for d in root.rglob("*") if d.is_dir()})
                self.assertEqual(b.test_count("alpha"), 2)
                self.assertEqual(b.third_party_imports("alpha"), {"numpy"})
            finally:
                b.RESEARCH, b._TREE, b._OWN = saved


if __name__ == "__main__":
    unittest.main()
