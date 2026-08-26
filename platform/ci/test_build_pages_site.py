#!/usr/bin/env python3
"""Tests for build_pages_site.py.

The failures that matter here are the ones nobody can see by reading a diff:
a test module shipped to the public site, a sitemap still advertising
`example.invalid` to a crawler, a product silently dropped from the hub, or a
link that resolves in the venture directory and 404s under `<base>/<slug>/`.
Most of these assert on that boundary rather than the happy path.
"""

import shutil
import tempfile
import unittest
from pathlib import Path

import build_pages_site as bp
import check_pages_links as links

MINIMAL_INDEX = """<!doctype html>
<html><head><title>Widget Fee Calculator | Know your margin</title></head>
<body><h1>Know what each sale really leaves.</h1>
<script type="module">import { calc } from "./calc.mjs";</script>
<a href="LICENSE">License</a>
</body></html>
"""


def make_venture(root: Path, slug: str, *, nested: bool = False, **files) -> Path:
    venture = root / "ventures" / slug
    web_root = venture / "site" if nested else venture
    web_root.mkdir(parents=True, exist_ok=True)

    (web_root / "index.html").write_text(files.pop("index", MINIMAL_INDEX), encoding="utf-8")
    (web_root / "calc.mjs").write_text("export const calc = () => 1;\n", encoding="utf-8")
    (web_root / "calc.test.mjs").write_text("// fixture: cost 12.34\n", encoding="utf-8")
    (venture / "LICENSE").write_text("MIT License\n", encoding="utf-8")

    for name, content in files.items():
        (web_root / name.replace("__", ".")).write_text(content, encoding="utf-8")
    return venture


class Discovery(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)

    def test_finds_a_venture_with_index_html(self):
        make_venture(self.tmp, "widget-calculator")
        found = bp.discover_products(self.tmp / "ventures")
        self.assertEqual([p.slug for p in found], ["widget-calculator"])

    def test_skips_a_venture_with_no_browser_surface(self):
        cli = self.tmp / "ventures" / "some-cli" / "src"
        cli.mkdir(parents=True)
        (cli / "main.py").write_text("print(1)\n", encoding="utf-8")
        self.assertEqual(bp.discover_products(self.tmp / "ventures"), [])

    def test_finds_a_product_nested_under_site(self):
        """`quote-margin-check` and `shopify-permission-drift` are laid out this
        way. Missing them would leave two shipped products with no URL."""
        make_venture(self.tmp, "nested-calculator", nested=True)
        found = bp.discover_products(self.tmp / "ventures")
        self.assertEqual([p.slug for p in found], ["nested-calculator"])
        self.assertEqual(found[0].source.name, "site")

    def test_title_comes_from_the_product_not_the_slug(self):
        """Slug-derived names publish "Ebay" and "Fba"; the product's own
        <title> carries the casing its niche uses."""
        make_venture(self.tmp, "widget-calculator")
        product = bp.discover_products(self.tmp / "ventures")[0]
        self.assertEqual(product.title, "Widget Fee Calculator")
        self.assertEqual(product.description, "Know what each sale really leaves.")

    def test_falls_back_to_the_slug_for_a_question_style_title(self):
        make_venture(
            self.tmp,
            "backup-check",
            index="<html><head><title>Backup shrank overnight? Compare last night</title>"
            "</head><body><h1>See what changed.</h1></body></html>",
        )
        product = bp.discover_products(self.tmp / "ventures")[0]
        self.assertEqual(product.title, "Backup Check")

    def test_does_not_print_the_title_twice_on_a_card(self):
        make_venture(
            self.tmp,
            "widget-calculator",
            index="<html><head><title>Widget Fee Calculator</title></head>"
            "<body><h1>Widget Fee Calculator</h1></body></html>",
        )
        product = bp.discover_products(self.tmp / "ventures")[0]
        self.assertNotEqual(product.description, product.title)


class UrlRewriting(unittest.TestCase):
    """Ventures hard-coded a guessed origin before any deploy existed. The
    build is what settles it, so nothing may reach the artifact still
    advertising a placeholder to a crawler."""

    def test_rewrites_the_example_invalid_placeholder(self):
        out = bp.rewrite_base_urls(
            "<loc>https://example.invalid/widget/page.html</loc>",
            "https://host.example.com/repo",
            "widget",
        )
        self.assertEqual(out, "<loc>https://host.example.com/repo/widget/page.html</loc>")

    def test_rewrites_the_ventures_prefixed_variant(self):
        """Four sitemaps guessed a `/ventures/<slug>/` layout; the build
        publishes `<slug>/`. Both must normalise to the same URL."""
        out = bp.rewrite_base_urls(
            "<loc>https://duncan-haywood.github.io/monorepo-projects/ventures/widget/</loc>",
            "https://host.example.com/repo",
            "widget",
        )
        self.assertEqual(out, "<loc>https://host.example.com/repo/widget/</loc>")

    def test_leaves_an_unrelated_absolute_url_alone(self):
        text = 'see <a href="https://www.walmart.com/help">the fee schedule</a>'
        self.assertEqual(bp.rewrite_base_urls(text, "https://host.example.com", "w"), text)


class BuildArtifact(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        make_venture(
            self.tmp,
            "widget-calculator",
            sitemap__xml='<?xml version="1.0"?><urlset>'
            "<url><loc>https://example.invalid/widget-calculator/</loc></url></urlset>",
            robots__txt="User-agent: *\nSitemap: "
            "https://example.invalid/widget-calculator/sitemap.xml\n",
        )
        make_venture(self.tmp, "nested-calculator", nested=True)

        self.out = self.tmp / "_site"
        self.result = self._build()

    def _build(self):
        return bp.build(
            out_dir=self.out,
            base_url="https://host.example.com/repo",
            ventures_dir=self.tmp / "ventures",
        )

    def test_publishes_every_product_under_its_slug(self):
        self.assertTrue((self.out / "widget-calculator" / "index.html").is_file())
        self.assertTrue((self.out / "nested-calculator" / "index.html").is_file())

    def test_nested_layout_flattens_to_the_same_url_shape(self):
        """A visitor must not need to know a product was authored under
        `site/`."""
        self.assertFalse((self.out / "nested-calculator" / "site").exists())

    def test_never_ships_a_test_module(self):
        self.assertEqual(list(self.out.rglob("*.test.mjs")), [])

    def test_no_placeholder_url_survives_into_the_artifact(self):
        for path in self.out.rglob("*"):
            if path.is_file() and path.suffix in {".xml", ".txt", ".html"}:
                self.assertNotIn("example.invalid", path.read_text(encoding="utf-8"))

    def test_rewrites_a_products_own_sitemap_and_robots(self):
        sitemap = (self.out / "widget-calculator" / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("https://host.example.com/repo/widget-calculator/", sitemap)
        robots = (self.out / "widget-calculator" / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("https://host.example.com/repo/widget-calculator/sitemap.xml", robots)

    def test_hub_links_every_product(self):
        hub = (self.out / "index.html").read_text(encoding="utf-8")
        self.assertIn('href="widget-calculator/"', hub)
        self.assertIn('href="nested-calculator/"', hub)

    def test_hub_carries_the_required_disclaimers(self):
        """PRODUCT_PLAYBOOK.md §5b requires the no-warranty and no-SLA copy on
        every hosted surface."""
        hub = (self.out / "index.html").read_text(encoding="utf-8")
        self.assertIn("No warranty", hub)
        self.assertIn("no SLA", hub)
        self.assertIn("sponsors", hub)

    def test_writes_a_sitemap_index_and_root_robots(self):
        index = (self.out / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("sitemapindex", index)
        self.assertIn("https://host.example.com/repo/widget-calculator/sitemap.xml", index)
        self.assertIn(
            "https://host.example.com/repo/sitemap.xml",
            (self.out / "robots.txt").read_text(encoding="utf-8"),
        )

    def test_disables_jekyll(self):
        """Pages runs Jekyll by default, which drops underscore-prefixed paths."""
        self.assertTrue((self.out / ".nojekyll").is_file())

    def test_ships_a_favicon_so_every_page_view_is_not_a_404(self):
        ico = (self.out / "favicon.ico").read_bytes()
        self.assertEqual(ico[:4], b"\x00\x00\x01\x00")
        self.assertEqual(ico[22:26], b"\x89PNG")
        self.assertTrue((self.out / "favicon.svg").is_file())

    def test_ships_the_licence_a_product_footer_links_to(self):
        self.assertTrue((self.out / "widget-calculator" / "LICENSE").is_file())
        self.assertTrue((self.out / "LICENSE").is_file())
        # The nested product keeps its LICENSE above its web root.
        self.assertTrue((self.out / "nested-calculator" / "LICENSE").is_file())

    def test_the_built_artifact_has_no_broken_local_link(self):
        self.assertEqual(links.check_site(self.out), [])

    def test_rebuilding_does_not_accumulate_stale_files(self):
        stale = self.out / "removed-product" / "index.html"
        stale.parent.mkdir(parents=True)
        stale.write_text("gone", encoding="utf-8")
        self._build()
        self.assertFalse(stale.exists())


class LinkChecking(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)

    def test_flags_a_reference_to_a_file_that_did_not_ship(self):
        (self.tmp / "p").mkdir()
        (self.tmp / "p" / "index.html").write_text(
            '<a href="./missing.mjs">x</a>', encoding="utf-8"
        )
        self.assertEqual(len(links.check_site(self.tmp)), 1)

    def test_flags_a_module_import_that_did_not_ship(self):
        """The calculators load `calc.mjs` as an ES module; a dropped import is
        a blank page, not a missing image."""
        (self.tmp / "p").mkdir()
        (self.tmp / "p" / "index.html").write_text(
            '<script type="module">import { c } from "./calc.mjs";</script>',
            encoding="utf-8",
        )
        self.assertEqual(len(links.check_site(self.tmp)), 1)

    def test_accepts_a_directory_reference_served_by_its_index(self):
        (self.tmp / "p").mkdir()
        (self.tmp / "p" / "index.html").write_text("ok", encoding="utf-8")
        (self.tmp / "index.html").write_text('<a href="p/">x</a>', encoding="utf-8")
        self.assertEqual(links.check_site(self.tmp), [])

    def test_ignores_external_and_in_page_targets(self):
        (self.tmp / "index.html").write_text(
            '<a href="https://example.com/x">a</a><a href="#top">b</a>'
            '<a href="mailto:x@example.com">c</a>',
            encoding="utf-8",
        )
        self.assertEqual(links.check_site(self.tmp), [])


class DescriptionTrimming(unittest.TestCase):
    def test_trims_a_changelog_description_on_a_word_boundary(self):
        """VENTURE.yaml descriptions grow a clause per shipped feature -- the
        eBay one is over 2,000 characters."""
        long = "A calculator that does " + "a thing and ".join(str(i) for i in range(80))
        trimmed = bp._first_sentence(long, limit=60)
        self.assertLessEqual(len(trimmed), 62)
        self.assertTrue(trimmed.endswith("…"))
        self.assertFalse(trimmed[:-1].endswith(" "))


if __name__ == "__main__":
    unittest.main()
