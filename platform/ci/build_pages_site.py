#!/usr/bin/env python3
"""Collect every browser product in `ventures/` into one GitHub Pages site.

Why this exists
---------------
As of 2026-08-26 the repo carries ~30 finished browser calculators and not one
of them has a public URL. `platform/ci/publish_surface.py` reports that no
workflow publishes anything on a push to `main`; the single Pages workflow in
the repo ships one venture's docs. So the owner flip everyone is waiting on
(`PAGES_ENABLED`, originally spelled `GITHUB_PAGES_ENABLED` -- see
`portfolio/hosting/README.md` for why that name never actually worked) would,
on its own, publish none of the products.

This builder is the missing half. It lays out

    <base-url>/<slug>/index.html          the product
    <base-url>/<slug>/<seo-page>.html     its SEO pages
    <base-url>/                           a hub listing every product

and it is the *single source of truth* for that layout. Ventures currently
disagree about where they will live -- most sitemaps say
`https://example.invalid/<slug>/`, four say
`https://duncan-haywood.github.io/oss-monorepo/ventures/<slug>/` -- because
until now nothing existed to settle it. Rather than hand-editing 30 sitemaps
(which the next session would guess at again), the build rewrites every
`<loc>` and `Sitemap:` line to the base URL it actually deploys to.

Usage:
    python3 platform/ci/build_pages_site.py                 # build into _site/
    python3 platform/ci/build_pages_site.py --check         # validate, no write
    python3 platform/ci/build_pages_site.py --base-url URL  # custom domain
"""

from __future__ import annotations

import argparse
import html
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
VENTURES_DIR = REPO_ROOT / "ventures"
DEFAULT_OUT = REPO_ROOT / "_site"

# The project-site URL for this repo. Overridable so moving to a custom domain
# (registrar A/CNAME straight to GitHub -- see portfolio/hosting/README.md) is a
# workflow input, not a code change.
DEFAULT_BASE_URL = "https://duncan-haywood.github.io/oss-monorepo"

# Static web assets a browser product can ask for. Everything else in a venture
# directory (tests, READMEs, VENTURE.yaml, fixtures) stays out of the artifact.
WEB_SUFFIXES = frozenset(
    {
        ".html",
        ".mjs",
        ".js",
        ".css",
        ".json",
        ".svg",
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".ico",
        ".webp",
        ".woff",
        ".woff2",
        ".txt",
        ".xml",
        ".webmanifest",
        ".map",
        # clonescan's browser build; GitHub Pages serves it as application/wasm.
        ".wasm",
    }
)

# Extensionless or non-web files that products nonetheless link to from their
# own footers ("License", "README"). They are not web assets by suffix, but a
# footer link that 404s is a broken product, so they ship by name.
EXTRA_ASSET_NAMES = frozenset({"LICENSE", "LICENSE.md", "LICENSE.txt", "README.md"})

# Test modules sit next to the product code in this repo (`calc.test.mjs` beside
# `calc.mjs`). They must not ship: they are dead weight over the wire and they
# leak fixture values into a public surface.
#
# `foo.test.mjs` is the house convention, not a rule -- `retainage-cashflow-calculator`
# ships its suite as bare `test.mjs`, which this pattern list did not match, so it
# was shipping to the public site undetected. `platform/pages/build.mjs` (the
# build this repo actually deploys with) hit the same gap and fixed it by widening
# the match rather than renaming the venture; mirror that here instead of adding a
# second acceptable spelling for the next venture to miss.
_TEST_MODULE_RE = re.compile(r"(^|\.)test\.(mjs|js|py)$|^test_|_test\.(mjs|js|py)$")


def _is_test_module(name: str) -> bool:
    return bool(_TEST_MODULE_RE.search(name)) or name.endswith((".spec.mjs", ".spec.js"))

EXCLUDED_DIRS = frozenset(
    # `tests` matches platform/pages/build.mjs; `target` is cargo's build output.
    {"node_modules", ".git", "dist", "build", "coverage", "__pycache__", ".pytest_cache", "tests", "target"}
)

# Hosts the ventures currently point their sitemaps at. Each is a guess made
# before a deploy existed; all of them get rewritten to the real base.
PLACEHOLDER_URL_RE = re.compile(
    r"https?://(?:example\.invalid|duncan-haywood\.github\.io)"
    r"(?:/oss-monorepo|/monorepo-projects)?(?:/ventures)?",
)


@dataclass(frozen=True)
class Product:
    """One browser product that will get a public URL."""

    slug: str
    source: Path  # the directory holding index.html
    venture: Path  # the venture directory, which may be source's parent
    title: str
    description: str

    @property
    def url(self) -> str:
        return f"{self.slug}/"


def _read_venture_field(venture_yaml: Path, field: str) -> str:
    """Pull one top-level scalar out of VENTURE.yaml.

    Deliberately not PyYAML: this script runs in CI with a bare Python and the
    repo has no runtime Python dependencies. Only `name:` and `description:` are
    needed, both of which are plain top-level scalars that may be folded across
    continuation lines.
    """
    if not venture_yaml.is_file():
        return ""
    lines = venture_yaml.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        if not line.startswith(f"{field}:"):
            continue
        value = line[len(field) + 1 :].strip()
        # A folded scalar continues on indented lines until the next key.
        for continuation in lines[i + 1 :]:
            if not continuation.strip():
                break
            if not continuation.startswith((" ", "\t")):
                break
            value += " " + continuation.strip()
        return value.strip().strip('"').strip("'")
    return ""


def _humanise(slug: str) -> str:
    """Last-resort display name. Mangles acronyms (`fba` -> `Fba`), which is why
    it is only reached when a product declares no <title> of its own."""
    return slug.replace("-", " ").replace("_", " ").title()


_TAG_RE = re.compile(r"<(title|h1)\b[^>]*>(.*?)</\1>", re.IGNORECASE | re.DOTALL)
_INNER_TAG_RE = re.compile(r"<[^>]+>")


def _extract_tag(markup: str, tag: str) -> str:
    for match in _TAG_RE.finditer(markup):
        if match.group(1).lower() == tag:
            return html.unescape(_INNER_TAG_RE.sub("", match.group(2))).strip()
    return ""


def product_title(index_html: Path, slug: str) -> str:
    """The product's own name, taken from its <title>.

    Each product authored an SEO title of the form `Name | subtitle`, with the
    brand casing its niche actually uses -- "eBay Fee & Profit Calculator",
    "Amazon FBA vs FBM Profit Calculator", "3PL Cost Calculator". Deriving the
    name from the slug instead would publish "Ebay", "Fba", and "3Pl" on the
    hub, which reads as careless to exactly the sellers being courted.
    """
    if index_html.is_file():
        title = _extract_tag(index_html.read_text(encoding="utf-8", errors="replace"), "title")
        name = title.split("|")[0].split("—")[0].strip()
        # A few products lead with a search query rather than a name
        # ("Backup size dropped overnight? Compare last night's run"). That is
        # right for a search result and wrong for a hub card, so fall back to
        # the slug, which at least names the thing.
        if name and "?" not in name and len(name) <= 52:
            return name
    return _humanise(slug)


def product_tagline(index_html: Path, slug: str) -> str:
    """The one-line promise the product leads with, from its <h1>.

    Preferred over the VENTURE.yaml description, which grows a clause per
    shipped feature (eBay's is over 2,000 characters) and reads as a changelog
    rather than a reason to click.
    """
    if index_html.is_file():
        heading = _extract_tag(index_html.read_text(encoding="utf-8", errors="replace"), "h1")
        if heading:
            return heading
    return ""


def _first_sentence(text: str, limit: int = 240) -> str:
    """Trim a VENTURE.yaml description down to something a hub card can show.

    The descriptions in this repo grow one clause per shipped feature -- the eBay
    one is over 2,000 characters -- so the hub takes the leading sentence and
    truncates on a word boundary.
    """
    if not text:
        return ""
    sentence = text.split(". ")[0].strip().rstrip(".")
    if len(sentence) <= limit:
        return sentence
    clipped = sentence[:limit].rsplit(" ", 1)[0]
    return clipped + "…"


# Where a venture keeps its browser surface. Most put `index.html` at the
# venture root; `quote-margin-check` and `shopify-permission-drift` nest theirs
# under `site/`. Both are shipped products, so both layouts are supported rather
# than moving files (which would conflict with whatever else is in flight on
# those ventures).
WEB_ROOT_CANDIDATES = (".", "site", "public")

# Ventures whose entry point is at none of the paths above, mirroring
# `ENTRY_OVERRIDES` in `platform/pages/build.mjs`.
#
# This map is the reason the override exists rather than being inferred. These
# two builders are kept as independent implementations precisely so that a
# disagreement about what `ventures/` contains surfaces a bug in one of them
# (see `portfolio/hosting/README.md`) -- but a venture only *this* builder
# cannot see produces no disagreement to read. It produces silence.
# `ai-engineering-academy` sat in exactly that blind spot: six free electronics
# calculators behind their own hub, published by the deploying builder, checked
# by this one not at all.
#
# Keep the two maps in step. `test_build_pages_site` asserts they match.
ENTRY_OVERRIDES = {
    # Six electronics calculators behind their own hub page.
    "ai-engineering-academy": "tools",
}


def find_web_root(venture: Path) -> Path | None:
    """The directory holding a venture's `index.html`, or None if it has none."""
    override = ENTRY_OVERRIDES.get(venture.name)
    if override is not None:
        root = venture / override
        return root if (root / "index.html").is_file() else None
    for candidate in WEB_ROOT_CANDIDATES:
        root = venture if candidate == "." else venture / candidate
        if (root / "index.html").is_file():
            return root
    return None


def discover_products(ventures_dir: Path | None = None) -> list[Product]:
    """Every venture that has a browser surface a stranger could open.

    An `index.html` is that signal. Ventures that are CLIs, libraries, or
    research directories have none and are skipped.
    """
    # Resolved at call time, not bound as a default, so a caller (and the test
    # suite) can point the build at a different tree.
    ventures_dir = ventures_dir or VENTURES_DIR

    products: list[Product] = []
    if not ventures_dir.is_dir():
        return products

    for venture in sorted(p for p in ventures_dir.iterdir() if p.is_dir()):
        web_root = find_web_root(venture)
        if web_root is None:
            continue
        index_html = web_root / "index.html"
        title = product_title(index_html, venture.name)

        # Some products headline with their own name, which would print the card
        # title twice. Prefer the VENTURE.yaml sentence in that case.
        tagline = product_tagline(index_html, venture.name)
        lead, name = tagline.casefold(), title.casefold()
        if lead and name and (lead.startswith(name) or name.startswith(lead)):
            tagline = ""
        description = tagline or _first_sentence(
            _read_venture_field(venture / "VENTURE.yaml", "description")
        )

        products.append(
            Product(
                slug=venture.name,
                source=web_root,
                venture=venture,
                title=title,
                description=description,
            )
        )
    return products


def _is_web_asset(path: Path) -> bool:
    if _is_test_module(path.name):
        return False
    if path.name in EXTRA_ASSET_NAMES:
        return True
    return path.suffix.lower() in WEB_SUFFIXES


def _iter_web_assets(root: Path):
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in EXCLUDED_DIRS for part in path.relative_to(root).parts):
            continue
        if _is_web_asset(path):
            yield path


# Where a link that escapes the published site still resolves. Mirrors
# `SOURCE_URL_PREFIX` in `platform/pages/build.mjs`.
SOURCE_URL_PREFIX = "https://github.com/Duncan-Haywood/monorepo-projects/blob/main/"

_LOCAL_REF_RE = re.compile(r'((?:href|src)=")([^"]+)(")')
_ABSOLUTE_REF_RE = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//|#)")


def repoint_offsite_links(text: str, page_source: Path, page_dest: Path, out_dir: Path) -> str:
    """Rewrite links that leave the published site to point at the repository.

    Every venture page was written as if its own directory were the site root,
    so some link to a file beside the venture (`../README.md`) rather than
    inside it. Republished under one shared origin those are 404s, and the
    answer is not to edit another venture's product copy: the file still exists
    in the public repository, still renders there, and still answers the
    question the link was there to answer.

    Links that resolve inside the built site are left exactly as written. This
    mirrors `repairLinks()` in `platform/pages/build.mjs`; the two builders are
    only a useful cross-check while they agree about what ships.
    """

    # Callers may pass a relative --out; every containment test below compares
    # resolved paths, so resolve the root once rather than per-link.
    site_root = out_dir.resolve()

    def replace(match: re.Match[str]) -> str:
        whole, opener, ref, closer = match.group(0), *match.groups()
        if not ref or _ABSOLUTE_REF_RE.match(ref):
            return whole
        path_part = re.split(r"[#?]", ref, maxsplit=1)[0]
        if not path_part:
            return whole

        resolved = (page_dest.resolve().parent / path_part).resolve()
        target = resolved / "index.html" if path_part.endswith("/") else resolved
        inside = target == site_root or site_root in target.parents
        if inside and target.exists():
            return whole

        in_repo = (page_source.resolve().parent / path_part).resolve()
        if REPO_ROOT not in in_repo.parents or not in_repo.exists():
            return whole
        return f"{opener}{SOURCE_URL_PREFIX}{in_repo.relative_to(REPO_ROOT).as_posix()}{closer}"

    return _LOCAL_REF_RE.sub(replace, text)


def rewrite_base_urls(text: str, base_url: str, slug: str) -> str:
    """Point a venture's absolute self-references at where it actually deploys.

    Ventures hard-code a guessed origin in `sitemap.xml` and `robots.txt`. Since
    the layout is `<base>/<slug>/...`, and the placeholders already carry the
    slug in their path, replacing just the origin-and-prefix portion leaves the
    per-page path intact.
    """
    return PLACEHOLDER_URL_RE.sub(base_url.rstrip("/"), text)


def _copy_product(product: Product, out_dir: Path, base_url: str) -> int:
    """Copy one product's web assets, rewriting absolute URLs on the way."""
    dest_root = out_dir / product.slug
    copied = 0
    for src in _iter_web_assets(product.source):
        rel = src.relative_to(product.source)
        dest = dest_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)

        if src.suffix.lower() in {".xml", ".txt", ".html"}:
            try:
                text = src.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                shutil.copy2(src, dest)
                copied += 1
                continue
            dest.write_text(rewrite_base_urls(text, base_url, product.slug), encoding="utf-8")
        else:
            shutil.copy2(src, dest)
        copied += 1

    # A nested-layout product (`ventures/<slug>/site/`) keeps its LICENSE and
    # README one level above its web root, so they are outside the copy above
    # while its footer still links to them.
    if product.source != product.venture:
        for name in sorted(EXTRA_ASSET_NAMES):
            extra = product.venture / name
            dest = dest_root / name
            if extra.is_file() and not dest.exists():
                shutil.copy2(extra, dest)
                copied += 1

    return copied


def render_hub(products: list[Product], base_url: str) -> str:
    """The page a stranger lands on: every product, one click away.

    Self-contained (no external CSS or fonts), theme-aware, and carrying the
    no-warranty + no-SLA copy that PRODUCT_PLAYBOOK.md §5b requires on every
    hosted surface.
    """
    cards = []
    for product in products:
        description = (
            f'<p class="desc">{html.escape(product.description)}</p>'
            if product.description
            else ""
        )
        cards.append(
            f"""      <li class="card">
        <a class="card-link" href="{html.escape(product.url)}">
          <h2>{html.escape(product.title)}</h2>
          {description}
          <span class="open">Open the tool &rarr;</span>
        </a>
      </li>"""
        )

    listing = "\n".join(cards)
    count = len(products)
    json_ld_items = ",\n".join(
        f"""      {{
        "@type": "ListItem",
        "position": {i},
        "url": "{base_url.rstrip('/')}/{p.slug}/",
        "name": "{html.escape(p.title, quote=True)}"
      }}"""
        for i, p in enumerate(products, start=1)
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Free calculators for sellers, trades, and freelancers</title>
<meta name="description" content="{count} free browser calculators that price a job, check a fee, or settle a keep-or-drop decision. No signup, no upload — every number stays in your browser.">
<link rel="canonical" href="{base_url.rstrip('/')}/">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="favicon.ico" sizes="32x32">
<meta property="og:title" content="Free calculators for sellers, trades, and freelancers">
<meta property="og:description" content="{count} free browser calculators. Nothing you type leaves your device.">
<meta property="og:type" content="website">
<meta property="og:url" content="{base_url.rstrip('/')}/">
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "Free calculators for sellers, trades, and freelancers",
  "description": "{count} free browser calculators. Every number stays in the visitor's browser.",
  "url": "{base_url.rstrip('/')}/",
  "mainEntity": {{
    "@type": "ItemList",
    "numberOfItems": {count},
    "itemListElement": [
{json_ld_items}
    ]
  }}
}}
</script>
<style>
  :root {{
    color-scheme: light dark;
    --bg: #fbfbfa;
    --fg: #1a1a19;
    --muted: #5c5c58;
    --card: #ffffff;
    --border: #e2e2dd;
    --accent: #1c5d3a;
  }}
  @media (prefers-color-scheme: dark) {{
    :root {{
      --bg: #17181a;
      --fg: #ececeb;
      --muted: #a3a39e;
      --card: #202124;
      --border: #34353a;
      --accent: #6fcf97;
    }}
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }}
  .wrap {{ max-width: 68rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }}
  header p.lede {{ font-size: 1.075rem; color: var(--muted); max-width: 46rem; }}
  h1 {{ font-size: 1.9rem; line-height: 1.2; margin: 0 0 .5rem; }}
  ul.grid {{
    list-style: none; padding: 0; margin: 2rem 0 0;
    display: grid; gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
  }}
  .card {{
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
  }}
  .card-link {{
    display: block; padding: 1.1rem 1.15rem; height: 100%;
    color: inherit; text-decoration: none;
  }}
  .card-link:hover, .card-link:focus-visible {{ border-radius: 10px; outline: 2px solid var(--accent); }}
  .card h2 {{ font-size: 1.03rem; margin: 0 0 .4rem; }}
  .card .desc {{ font-size: .89rem; color: var(--muted); margin: 0 0 .75rem; }}
  .card .open {{ font-size: .85rem; color: var(--accent); font-weight: 600; }}
  footer {{
    margin-top: 3rem; padding-top: 1.5rem;
    border-top: 1px solid var(--border);
    font-size: .85rem; color: var(--muted);
  }}
  footer h2 {{ font-size: .9rem; color: var(--fg); margin: 1.25rem 0 .4rem; }}
  footer a {{ color: var(--accent); }}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Free calculators for sellers, trades, and freelancers</h1>
    <p class="lede">
      {count} small tools that price a job, check a marketplace fee, or settle a
      keep-or-drop decision. Each one runs entirely in your browser: no signup,
      no upload, and nothing you type is sent anywhere.
    </p>
  </header>

  <main>
    <ul class="grid">
{listing}
    </ul>
  </main>

  <footer>
    <h2>No warranty</h2>
    <p>
      These tools are provided free and as-is, without warranty of any kind,
      express or implied. They are not legal, tax, or financial advice, and they
      do not replace a qualified professional. <strong>You are responsible for
      reviewing and verifying their output before relying on it</strong>, and for
      meeting any obligation they help you prepare for. To the maximum extent
      permitted by law, the authors accept no liability for any loss or damage
      arising from their use.
    </p>

    <h2>Best-effort hosting, no SLA</h2>
    <p>
      These tools are free, experimental, and may be slow, broken, moved, or
      taken offline without notice. We do not promise uptime, backups of anything
      you type, or that a URL will keep working. Do not use this as a system of
      record. If a tool needs to survive, export your inputs and run it yourself.
    </p>

    <h2>Privacy</h2>
    <p>
      Every calculation happens in your browser. Your figures are never
      transmitted to a server. Some tools keep an anonymous count of how often a
      feature was used in your own browser's local storage; that count holds no
      figures you typed, never leaves your device, and is skipped when your
      browser sends Do Not Track or Global Privacy Control.
    </p>

    <p>
      Free to use and free to keep. If one of these saved you money, you can
      <a href="https://github.com/sponsors/Duncan-Haywood">sponsor on GitHub</a> or
      <a href="https://buymeacoffee.com/duncanhaywood">buy me a coffee</a> —
      entirely optional, and nothing here is gated behind it.
    </p>
  </footer>
</div>
</body>
</html>
"""


def render_sitemap_index(products: list[Product], base_url: str) -> str:
    """A sitemap index pointing at each product's own sitemap.

    Search engines and AI crawlers get one file to fetch at the site root
    instead of needing to guess 30 per-product paths.
    """
    base = base_url.rstrip("/")
    entries = "\n".join(
        f"  <sitemap><loc>{base}/{p.slug}/sitemap.xml</loc></sitemap>"
        for p in products
        if (p.source / "sitemap.xml").is_file()
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n"
        "</sitemapindex>\n"
    )


def render_robots(base_url: str) -> str:
    base = base_url.rstrip("/")
    return f"User-agent: *\nAllow: /\n\nSitemap: {base}/sitemap.xml\n"


FAVICON_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    '<rect width="32" height="32" rx="7" fill="#1c5d3a"/>'
    '<rect x="8" y="9" width="16" height="4" rx="1.5" fill="#ffffff"/>'
    '<rect x="8" y="16" width="16" height="2.5" rx="1.25" fill="#8fd6ad"/>'
    '<rect x="8" y="21.5" width="10" height="2.5" rx="1.25" fill="#8fd6ad"/>'
    "</svg>\n"
)


def _png_bytes(pixels: list[list[tuple[int, int, int, int]]]) -> bytes:
    """Encode RGBA pixel rows as a PNG. Pure stdlib -- CI has no image library."""
    import struct
    import zlib

    height = len(pixels)
    width = len(pixels[0])

    raw = b"".join(
        b"\x00" + b"".join(struct.pack("BBBB", *px) for px in row) for row in pixels
    )

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def favicon_ico() -> bytes:
    """A 32x32 icon matching FAVICON_SVG, wrapped as a PNG-payload ICO.

    Browsers request `/favicon.ico` at the origin root for any page that does
    not declare its own icon. The 164 product pages inherited from the ventures
    do not declare one, so without this file every single page view on the live
    site logs a 404. Shipping one icon at the root fixes all of them without
    editing a single venture page.
    """
    import struct

    size = 32
    bg = (28, 93, 58, 255)
    white = (255, 255, 255, 255)
    mint = (143, 214, 173, 255)
    clear = (0, 0, 0, 0)

    def bar(x, y, w, h):
        return lambda px, py: x <= px < x + w and y <= py < y + h

    bars = [(bar(8, 9, 16, 4), white), (bar(8, 16, 16, 3), mint), (bar(8, 22, 10, 3), mint)]
    radius = 7

    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            # Round the corners so the mark reads as a tile, not a block.
            cx = min(max(x, radius), size - 1 - radius)
            cy = min(max(y, radius), size - 1 - radius)
            if (x - cx) ** 2 + (y - cy) ** 2 > radius**2:
                row.append(clear)
                continue
            pixel = bg
            for hit, colour in bars:
                if hit(x, y):
                    pixel = colour
                    break
            row.append(pixel)
        rows.append(row)

    png = _png_bytes(rows)
    header = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(png), 22)
    return header + entry + png


def build(
    out_dir: Path = DEFAULT_OUT,
    base_url: str = DEFAULT_BASE_URL,
    ventures_dir: Path | None = None,
) -> dict:
    products = discover_products(ventures_dir)
    if not products:
        raise SystemExit("no publishable product found under ventures/")

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    files = 0
    for product in products:
        files += _copy_product(product, out_dir, base_url)

    # After every product is in place, and not before: whether a link resolves
    # inside the site can only be answered once the whole site exists.
    for product in products:
        for dest in sorted((out_dir / product.slug).rglob("*.html")):
            source = product.source / dest.relative_to(out_dir / product.slug)
            text = dest.read_text(encoding="utf-8", errors="replace")
            repointed = repoint_offsite_links(text, source, dest, out_dir)
            if repointed != text:
                dest.write_text(repointed, encoding="utf-8")

    (out_dir / "index.html").write_text(render_hub(products, base_url), encoding="utf-8")
    (out_dir / "sitemap.xml").write_text(
        render_sitemap_index(products, base_url), encoding="utf-8"
    )
    (out_dir / "robots.txt").write_text(render_robots(base_url), encoding="utf-8")
    # Every venture ships the same MIT text. Publishing one at the site root
    # both states the licence for the site as a whole and gives a product page
    # linking `../LICENSE` something real to resolve to.
    root_license = next(
        (p.venture / "LICENSE" for p in products if (p.venture / "LICENSE").is_file()),
        None,
    )
    if root_license is not None:
        shutil.copy2(root_license, out_dir / "LICENSE")

    (out_dir / "favicon.svg").write_text(FAVICON_SVG, encoding="utf-8")
    (out_dir / "favicon.ico").write_bytes(favicon_ico())
    # GitHub Pages runs Jekyll by default, which silently drops files and
    # directories beginning with an underscore. Opt out.
    (out_dir / ".nojekyll").write_text("", encoding="utf-8")

    return {"products": products, "files": files, "out_dir": out_dir}


def check() -> int:
    """Validate what a deploy would publish, without writing an artifact."""
    products = discover_products()
    if not products:
        print("FAIL: no publishable product found under ventures/")
        return 1

    problems: list[str] = []
    for product in products:
        assets = list(_iter_web_assets(product.source))
        if not any(a.name == "index.html" for a in assets):
            problems.append(f"{product.slug}: index.html is not a shippable web asset")
        leaked = [a.name for a in assets if _is_test_module(a.name)]
        if leaked:
            problems.append(f"{product.slug}: test modules would ship: {leaked}")

    print(f"{len(products)} product(s) would be published:\n")
    for product in products:
        pages = sum(1 for a in _iter_web_assets(product.source) if a.suffix == ".html")
        print(f"  /{product.slug}/  ({pages} page(s))")

    if problems:
        print("\nproblems:")
        for problem in problems:
            print(f"  - {problem}")
        return 1

    print("\nOK")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate what would be published; write nothing",
    )
    args = parser.parse_args(argv)

    if args.check:
        return check()

    result = build(out_dir=args.out, base_url=args.base_url)
    print(
        f"built {len(result['products'])} product(s), "
        f"{result['files']} file(s) into {result['out_dir']}"
    )
    print(f"hub: {args.base_url.rstrip('/')}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
