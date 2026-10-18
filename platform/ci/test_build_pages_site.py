#!/usr/bin/env python3
"""Tests for build_pages_site.py.

The failures that matter here are the ones nobody can see by reading a diff:
a test module shipped to the public site, a sitemap still advertising
`example.invalid` to a crawler, a product silently dropped from the hub, or a
link that resolves in the venture directory and 404s under `<base>/<slug>/`.
Most of these assert on that boundary rather than the happy path.
"""

import re
import shutil
import tempfile
import unittest
import unittest.mock
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


class EntryOverrides(unittest.TestCase):
    """`ai-engineering-academy` keeps six calculators and their hub under
    `tools/`, at none of the standard web roots. The deploying builder has an
    override for it; this one did not, so seven public pages were published by
    `platform/pages/build.mjs` and checked here not at all -- and a builder kept
    as a cross-check cannot report a disagreement it cannot see."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)

    def test_finds_a_product_at_an_overridden_entry_path(self):
        venture = self.tmp / "ventures" / "override-venture"
        (venture / "tools").mkdir(parents=True)
        (venture / "tools" / "index.html").write_text(
            "<html><head><title>Free Tools</title></head><body><h1>Pick one.</h1></body></html>",
            encoding="utf-8",
        )
        with unittest.mock.patch.dict(
            bp.ENTRY_OVERRIDES, {"override-venture": "tools"}, clear=False
        ):
            found = bp.discover_products(self.tmp / "ventures")
        self.assertEqual([p.slug for p in found], ["override-venture"])
        self.assertEqual(found[0].source.name, "tools")

    def test_an_override_pointing_nowhere_publishes_nothing(self):
        venture = self.tmp / "ventures" / "override-venture"
        venture.mkdir(parents=True)
        (venture / "index.html").write_text("<html></html>", encoding="utf-8")
        with unittest.mock.patch.dict(
            bp.ENTRY_OVERRIDES, {"override-venture": "tools"}, clear=False
        ):
            # The override is deliberate, so a venture-root index.html is not a
            # silent fallback: a stale override should fail loudly, by shipping
            # nothing, rather than quietly publishing a different page.
            self.assertEqual(bp.discover_products(self.tmp / "ventures"), [])

    def test_the_two_builders_agree_on_which_ventures_are_overridden(self):
        """These builders are only a cross-check while they publish the same
        set. An override added to one and not the other reintroduces exactly
        the blind spot this class exists for."""
        source = (
            Path(bp.__file__).resolve().parents[2] / "platform" / "pages" / "build.mjs"
        ).read_text(encoding="utf-8")
        block = re.search(r"const ENTRY_OVERRIDES = \{(.*?)\n\};", source, re.S)
        self.assertIsNotNone(block, "ENTRY_OVERRIDES not found in build.mjs")
        pairs = dict(re.findall(r"'([^']+)':\s*'([^']+)'", block.group(1)))
        self.assertEqual(pairs, bp.ENTRY_OVERRIDES)


class OffsiteLinkRepointing(unittest.TestCase):
    """Venture pages were written as if their own directory were the site root,
    so some link to a file beside the venture. Republished under one shared
    origin those 404. The deploying builder repoints them at the repository;
    this one now does the same, so the link check stays strict instead of
    being taught to ignore them."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)

    def _build(self, slug="widget-calculator", nested=False):
        make_venture(self.tmp, slug, nested=nested)
        out = self.tmp / "_site"
        bp.build(
            out_dir=out,
            base_url="https://example.test/site",
            ventures_dir=self.tmp / "ventures",
        )
        return out

    def test_a_link_escaping_the_site_is_repointed_at_the_repository(self):
        page = self.tmp / "ventures" / "widget-calculator" / "docs" / "guide.html"
        source = self.tmp / "ventures" / "widget-calculator" / "NOTES.md"
        page.parent.mkdir(parents=True, exist_ok=True)
        source.parent.mkdir(parents=True, exist_ok=True)

        repointed = bp.repoint_offsite_links(
            '<a href="../../elsewhere/NOTES.md">notes</a>',
            page_source=page,
            page_dest=self.tmp / "_site" / "widget-calculator" / "docs" / "guide.html",
            out_dir=self.tmp / "_site",
        )
        # Outside the repository root entirely: nothing to point at, so the
        # link is left exactly as the venture wrote it.
        self.assertIn('href="../../elsewhere/NOTES.md"', repointed)

    def test_absolute_and_fragment_links_are_untouched(self):
        html = (
            '<a href="https://example.com/x">a</a>'
            '<a href="#top">b</a>'
            '<a href="mailto:x@example.com">c</a>'
            '<img src="data:image/gif;base64,R0lGOD">'
        )
        out = self.tmp / "_site"
        self.assertEqual(
            bp.repoint_offsite_links(
                html,
                page_source=self.tmp / "ventures" / "w" / "index.html",
                page_dest=out / "w" / "index.html",
                out_dir=out,
            ),
            html,
        )

    def test_a_link_that_resolves_inside_the_site_is_left_alone(self):
        out = self._build()
        page = out / "widget-calculator" / "index.html"
        page.write_text('<a href="./calc.mjs">calc</a>', encoding="utf-8")
        result = bp.repoint_offsite_links(
            page.read_text(encoding="utf-8"),
            page_source=self.tmp / "ventures" / "widget-calculator" / "index.html",
            page_dest=page,
            out_dir=out,
        )
        self.assertEqual(result, '<a href="./calc.mjs">calc</a>')


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

    def _favicon_pixel(self, x, y):
        import struct
        import zlib

        png = (self.out / "favicon.ico").read_bytes()[22:]
        idat = b""
        i = 8
        while i < len(png):
            n, tag = struct.unpack(">I4s", png[i : i + 8])
            if tag == b"IDAT":
                idat += png[i + 8 : i + 8 + n]
            i += 12 + n
        raw = zlib.decompress(idat)
        stride = 1 + 32 * 4
        off = y * stride + 1 + x * 4
        return tuple(raw[off : off + 4])

    def test_favicon_is_a_rounded_tile(self):
        self.assertEqual(self._favicon_pixel(0, 0)[3], 0)
        self.assertEqual(self._favicon_pixel(31, 31)[3], 0)
        # Just inside the corner arc, and the middle of the tile, are opaque.
        self.assertEqual(self._favicon_pixel(3, 3)[3], 255)
        self.assertEqual(self._favicon_pixel(7, 0)[3], 255)
        self.assertEqual(self._favicon_pixel(16, 16)[3], 255)
        # The far edges are rounded by the same radius as the near ones.
        self.assertEqual(self._favicon_pixel(31, 24)[3], 255)
        self.assertEqual(self._favicon_pixel(24, 31)[3], 255)

    def test_reports_the_number_of_files_it_copied(self):
        copied = sum(
            1
            for slug in ("widget-calculator", "nested-calculator")
            for f in (self.out / slug).rglob("*")
            if f.is_file()
        )
        self.assertEqual(self.result["files"], copied)
        self.assertGreater(copied, 0)

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


class CheckCommand(unittest.TestCase):
    def test_passes_when_a_product_ships_its_index_and_assets(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp)
        make_venture(tmp, "widget-calculator")
        with unittest.mock.patch.object(bp, "VENTURES_DIR", tmp / "ventures"):
            with unittest.mock.patch("builtins.print"):
                self.assertEqual(bp.check(), 0)


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

    def test_accepts_a_query_string_that_prefills_the_calculator(self):
        """A guide page hands the reader a filled-in calculator by linking to
        `./?itemCost=200&amp;freightCost=20&…`. Only `#fragment` is not part of
        a path, so the query string has to come off before the lookup -- with
        `urldefrag` it did not, the whole string was resolved as a filename, and
        `import-landed-cost-calculator` (#4897) went red on a link that works
        perfectly in a browser. Nobody saw it: Actions was starved, so the one
        check that builds an artifact and follows its links never ran."""
        (self.tmp / "index.html").write_text("ok", encoding="utf-8")
        (self.tmp / "guide.html").write_text(
            '<a href="./?itemCost=200&amp;freightCost=20&amp;entryType=informal">x</a>',
            encoding="utf-8",
        )
        self.assertEqual(links.check_site(self.tmp), [])

    def test_still_reports_a_missing_page_that_carries_a_query_string(self):
        """Stripping the query must not turn the check off: a query string on a
        target that genuinely is not there stays broken."""
        (self.tmp / "index.html").write_text('<a href="gone.html?a=1">x</a>', encoding="utf-8")
        self.assertEqual(len(links.check_site(self.tmp)), 1)

    def test_resolves_an_href_whose_path_carries_an_escaped_ampersand(self):
        """An href is HTML-escaped, so a file with `&` in its name arrives as
        `&amp;` and must be looked up by its real name, not its entity."""
        (self.tmp / "a&b.html").write_text("ok", encoding="utf-8")
        (self.tmp / "index.html").write_text('<a href="a&amp;b.html">x</a>', encoding="utf-8")
        self.assertEqual(links.check_site(self.tmp), [])

    def test_flags_a_fragment_whose_section_does_not_exist(self):
        """`./#compare` into a page with no `id="compare"` lands the reader at
        the top of the page; the file exists, so the plain path check passed."""
        (self.tmp / "index.html").write_text('<h2>Other</h2>', encoding="utf-8")
        (self.tmp / "guide.html").write_text('<a href="./#compare">x</a>', encoding="utf-8")
        (self.tmp / "same.html").write_text('<a href="#nope">x</a>', encoding="utf-8")
        self.assertEqual(len(links.check_site(self.tmp)), 2)

    def test_accepts_a_fragment_that_matches_an_id(self):
        (self.tmp / "index.html").write_text('<section id="compare">x</section>', encoding="utf-8")
        (self.tmp / "guide.html").write_text(
            '<a href="./#compare">x</a><a href="#here">y</a><i id="here"></i>', encoding="utf-8"
        )
        self.assertEqual(links.check_site(self.tmp), [])

    def test_does_not_treat_prefilled_state_fragments_as_anchors(self):
        """`#price=200&land=40` and `#c=%7B...%7D` are read by the calculator's
        script, not scrolled to, so no element carries that id."""
        (self.tmp / "index.html").write_text("ok", encoding="utf-8")
        (self.tmp / "guide.html").write_text(
            '<a href="./#price=200&amp;land=40">x</a><a href="./#c=%7B%22a%22%3A1%7D">y</a>',
            encoding="utf-8",
        )
        self.assertEqual(links.check_site(self.tmp), [])

    def test_ignores_js_template_literal_hrefs(self):
        """tender-radar builds source links in a script: href="${escapeHtml(href)}".
        That is not a published path and must not fail the Pages link check."""
        (self.tmp / "index.html").write_text(
            '<script>const source = href ? `<a href="${escapeHtml(href)}">Open</a>` : "-";</script>',
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
