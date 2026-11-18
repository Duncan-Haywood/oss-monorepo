"""Build the research homepage from research/_homepage/projects.json, research/README.md and research/.

    python3 research/_homepage/build.py            # writes research/_homepage/_site/index.html
    python3 research/_homepage/build.py --out DIR
    python3 research/_homepage/build.py --out DIR --base-url URL   # adds canonical + social tags
    ... --site-chrome FILE   # the parent site's shared header and footer (build.mjs passes it)

platform/pages/build.mjs runs the last form to publish the page at <site>/research/.

Card titles, abstracts and themes come from projects.json and any research/<slug>/project.json (registry.py); the one-line lede is
each project's research/README.md bullet; test counts are the `def test_` functions under
research/<slug>/. Directories under research/ starting with `_` or `.` are not projects. The build fails if any research/ project is missing from
projects.json or README.md, or if either lists a project that does not exist.
"""
import argparse
import fnmatch
import html
import os
import json
import re
import shutil
import sys
from pathlib import Path

import registry

REPO = "Duncan-Haywood/oss-monorepo"
REPO_URL = f"https://github.com/{REPO}"
HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parent


def readme_ledes():
    text = (RESEARCH / "README.md").read_text()
    ledes = {}
    for slug, lede in re.findall(r"^- \[`research/([\w-]+)`\]\([^)]*\)\s*[—-]+\s*(.+)$", text, re.M):
        # Escape (keeping the entities authors write, like &minus;), then `code` and *em*.
        lede = lede.strip()
        lede = lede[:1].upper() + lede[1:]
        ledes[slug] = md_spans(lede)
    return ledes


_TREE = None


def research_tree():
    """One walk of research/ for the three readers that each used to rglob it (2026-11-17: 2,161
    rglob walks of the 456 MB tree were a third of the build). Returns (py, dirs, files_by_slug):
    `py` is every entry anywhere under research/ whose name matches *.py, `dirs` every directory
    name below research/, and files_by_slug[slug] every file under research/<slug>/ as relative
    parts. Same match rules as Path.rglob: hidden entries included, symlinked dirs not entered."""
    global _TREE
    if _TREE is None:
        py, dirs, by_slug = [], set(), {}
        stack = [((), RESEARCH)]
        while stack:
            rel, path = stack.pop()
            try:
                with os.scandir(path) as it:
                    entries = list(it)
            except PermissionError:
                continue
            for e in entries:
                is_dir = e.is_dir(follow_symlinks=False)
                if fnmatch.fnmatchcase(e.name, "*.py"):
                    py.append(e.name)
                if is_dir:
                    dirs.add(e.name)
                    stack.append((rel + (e.name,), e.path))
                elif rel and e.is_file():
                    by_slug.setdefault(rel[0], []).append(rel[1:] + (e.name,))
        _TREE = (py, dirs, by_slug)
    return _TREE


def slug_files(slug, pattern):
    """Path.rglob(pattern) over research/<slug>/, files only, from the shared walk."""
    root = RESEARCH / slug
    return [root.joinpath(*parts) for parts in research_tree()[2].get(slug, ())
            if fnmatch.fnmatchcase(parts[-1], pattern)]


def test_count(slug):
    return sum(
        len(re.findall(r"^\s*def test_", f.read_text(errors="ignore"), re.M))
        for f in slug_files(slug, "test*.py")
    )


# A module counts as the project's own when any file or directory under research/ carries its
# name (each project's src/ packages, research/_shared helpers such as linefig). Anything else
# outside the standard library is a third-party package. Imports are read from every .py file
# outside tests/, including optional ones inside try blocks, so the count of projects needing
# none is a lower bound. It replaced a hard-coded "0 runtime dependencies" tile (2026-11-14).
IMPORT_RE = re.compile(r"^\s*(?:from\s+([A-Za-z_]\w*)[\w.]*\s+import|import\s+([A-Za-z_][\w., ]*))", re.M)
_OWN = None


def own_modules():
    global _OWN
    if _OWN is None:
        py, dirs, _ = research_tree()
        _OWN = {Path(n).stem for n in py} | dirs
    return _OWN


def third_party_imports(slug):
    std = set(sys.stdlib_module_names) | {"__future__"}
    found = set()
    root = RESEARCH / slug
    for f in slug_files(slug, "*.py"):
        parts = f.relative_to(root).parts
        if "tests" in parts or "__pycache__" in parts:
            continue
        for a, b in IMPORT_RE.findall(f.read_text(errors="ignore")):
            names = [a] if a else [n.strip().split(" ")[0].split(".")[0] for n in b.split(",")]
            found.update(n for n in names if n and n not in std)
    return found - own_modules()


def plain(s):
    return html.unescape(re.sub(r"<[^>]+>", " ", s))


# Summary paragraphs. A programme's summary grows by a milestone per run and is stored as one
# HTML string; until 2026-11-18 the page printed it as one <p>, so research/cell-fidelity showed
# 6,894 words with no break. `summary_paragraphs` breaks it where the text itself says a new part
# starts (a milestone, a step, the limits) and then splits any part still longer than PARA_WORDS
# at sentence ends. A summary that is short and has no such marker stays one paragraph.
PARA_WORDS = 110
_PARA_START = re.compile(
    r"(?:<strong>\s*)?(?:Milestone|Step|Stage|Phase|Session|Round|Part)\s+[\w.-]+\b"
    r"|(?:Limits?|Limitations?|Caveats?)\s*:")
_ABBREV = re.compile(r"(?:\b(?:e\.g|i\.e|cf|vs|al|approx|Fig|Figs|Eq|Eqs|No|Nos|Ref|Refs|St|Dr|Mr|Ms|Jr|Inc|Ltd|Co|ca|resp|incl|etc)"
                     r"|\b[A-Z])\.$")
_INLINE = {"em", "strong", "code", "sup", "sub", "a", "b", "i", "span", "abbr", "small", "mark", "var", "kbd", "q"}


def _words(s):
    return len(plain(s).split())


def summary_paragraphs(summary, limit=PARA_WORDS):
    """The summary as a list of HTML paragraphs (inner HTML, no <p>). Breaks are only placed
    outside tags, outside any open inline element and outside parentheses, so no paragraph
    splits a <code> run or an aside."""
    s = summary.strip()
    if re.search(r"<(?:p|ul|ol|li|table|div|h\d|blockquote|pre)\b", s, re.I):
        return [s]  # already structured: leave it alone
    hard, soft = set(), []  # character offsets where a paragraph may start
    depth, parens, i, n = 0, 0, 0, len(s)
    prev_end = False  # the text before this point ends a sentence
    while i < n:
        if s.startswith("<br", i):
            j = s.index(">", i) + 1
            while True:  # a run of <br>s and spaces is one break
                k = j
                while k < n and s[k].isspace():
                    k += 1
                if s.startswith("<br", k):
                    j = s.index(">", k) + 1
                else:
                    break
            hard.add(("br", i, k))
            i, prev_end = k, False
            continue
        if s[i] == "<":
            j = s.find(">", i)
            if j < 0:
                break
            m = re.match(r"<(/?)(\w+)", s[i:j + 1])
            if m and m.group(2).lower() in _INLINE:
                if depth == 0 and parens == 0 and not m.group(1) and prev_end and _PARA_START.match(s, i):
                    hard.add(("at", i, i))
                depth += -1 if m.group(1) else 1
                depth = max(depth, 0)
            i = j + 1
            continue
        c = s[i]
        if c == "(":
            parens += 1
        elif c == ")":
            parens = max(parens - 1, 0)
        if depth == 0 and parens == 0 and c == " " and i > 0:
            before = s[:i].rstrip()
            ends = before.endswith((".", "!", "?", ".)", ".&rdquo;", '."')) and not _ABBREV.search(before)
            if ends:
                k = i
                while k < n and s[k] == " ":
                    k += 1
                if k < n and (s[k].isupper() or s[k].isdigit() and _PARA_START.match(s, k) or s[k] == "<"):
                    if _PARA_START.match(s, k):
                        hard.add(("at", k, k))
                    elif s[k] != "<":
                        soft.append(k)
                    prev_end = True
                    i = k
                    continue
            prev_end = False
        elif not c.isspace():
            prev_end = False
        i += 1
    # cut at the hard breaks
    parts, last = [], 0
    for kind, a, b in sorted(hard, key=lambda h: h[1]):
        if a > last:
            parts.append((last, a))
        last = b
    parts.append((last, n))
    out = []
    for a, b in parts:
        chunk = s[a:b].strip()
        if not chunk:
            continue
        cuts = [k for k in soft if a < k < b]
        if _words(chunk) <= limit or not cuts:
            out.append(chunk)
            continue
        # greedy: start a new paragraph at the first sentence end past ~limit*0.7 words, but
        # never leave a tail shorter than a third of the limit
        start = a
        for k in cuts:
            if _words(s[start:k]) >= limit * 0.7 and _words(s[k:b]) >= limit / 3:
                out.append(s[start:k].strip())
                start = k
        out.append(s[start:b].strip())
    return [p for p in out if p] or [s]


LEDE_WORDS = 90  # the project page's header line
LEDE_CARD_WORDS = 60  # a lede on a card that links to the page


def short_lede(lede, limit=LEDE_WORDS):
    """A lede cut to at most `limit` words at a clause boundary (a "; " or a sentence end outside
    tags and parentheses), marked with an ellipsis; a lede already that short is returned as is.
    A programme's README bullet grows a clause per milestone (research/buildbot-sheathing's had
    2,209 words on 2026-11-18) and was printed whole in its page header and in the cards on its
    neighbours' pages. If the first clause alone is over twice the limit, the lede is left whole
    rather than cut mid-claim."""
    if _words(lede) <= limit:
        return lede
    cuts, depth, parens, i = [], 0, 0, 0
    while i < len(lede):
        c = lede[i]
        if c == "<":
            j = lede.find(">", i)
            if j < 0:
                break
            m = re.match(r"<(/?)(\w+)", lede[i:j + 1])
            if m and m.group(2).lower() in _INLINE:
                depth = max(depth + (-1 if m.group(1) else 1), 0)
            i = j + 1
            continue
        if c == "(":
            parens += 1
        elif c == ")":
            parens = max(parens - 1, 0)
        elif c == " " and depth == 0 and parens == 0 and (lede[i - 1] == ";" or (
                lede[i - 1] == "." and not _ABBREV.search(lede[:i]))):
            cuts.append(i - 1)
        i += 1
    fits = [k for k in cuts if _words(lede[:k]) <= limit]
    if fits:
        k = fits[-1]
    elif cuts and _words(lede[:cuts[0]]) <= 2 * limit:
        k = cuts[0]
    else:
        return lede
    return lede[:k].rstrip(" ;,:.") + "&hellip;"


# A summary past SUMMARY_FOLD words shows its first SUMMARY_OPEN words and folds the rest into a
# <details> (still in the HTML, so search engines and answer engines read all of it).
SUMMARY_FOLD = 700
SUMMARY_OPEN = 300


def summary_html(summary, indent="  ", fold=False):
    ps = summary_paragraphs(summary)
    lines = [f"{indent}<p>{p}</p>" for p in ps]
    total = sum(_words(p) for p in ps)
    if not fold or total <= SUMMARY_FOLD:
        return "\n".join(lines)
    shown, words = 0, 0
    while shown < len(ps) - 1 and words < SUMMARY_OPEN:
        words += _words(ps[shown])
        shown += 1
    rest = total - words
    return "\n".join(lines[:shown] + [
        f'{indent}<details class="summary-more"><summary>Show the rest of the summary '
        f'({len(ps) - shown} more paragraph{"s" if len(ps) - shown != 1 else ""}, {rest:,} words)</summary>']
        + lines[shown:] + [f"{indent}</details>"])


def duplicate_bullets():
    text = (RESEARCH / "README.md").read_text()
    slugs = re.findall(r"^- \[`research/([\w-]+)`\]", text, re.M)
    return sorted({s for s in slugs if slugs.count(s) > 1})


def validate(data, ledes):
    projects = {p.name for p in RESEARCH.iterdir() if p.is_dir() and p.name[0] not in "_."}
    listed = [p["slug"] for t in data["themes"] for p in t["projects"]]
    errors = list(data.get("registry_errors", []))
    errors += [f"projects.json: missing research/{s}" for s in sorted(projects - set(listed))]
    errors += [f"projects.json: nonexistent research/{s}" for s in sorted(set(listed) - projects)]
    errors += [f"projects.json: research/{s} listed twice" for s in sorted({s for s in listed if listed.count(s) > 1})]
    errors += [f"research/README.md: research/{s} has more than one bullet" for s in duplicate_bullets()]
    errors += [f"research/README.md: missing bullet for research/{s}" for s in sorted(projects - set(ledes))]
    errors += [f"research/README.md: bullet for nonexistent research/{s}" for s in sorted(set(ledes) - projects)]
    errors += [f"projects.json: featured research/{s} not listed" for s in data["featured"] if s not in listed]
    errors += [f"research/{TOPICS_DIR}/ holds the topic pages, so it cannot be a project" for s in listed if s == TOPICS_DIR]
    ids = [t["id"] for t in data["themes"]]
    errors += [f"projects.json: theme id {i} used twice" for i in sorted({i for i in ids if ids.count(i) > 1})]
    for t in data["themes"]:
        for p in t["projects"]:
            for k in ("slug", "title", "summary"):
                if not p.get(k):
                    errors.append(f"projects.json: research/{p.get('slug')} has no {k}")
            errors += [f"research/{p.get('slug')}: {e}" for e in card_text_errors(p.get("summary", ""))]
    return errors


# A sed replacement containing `&` expands each `&` to the matched text, which
# turned "4&ndash;5" into "4<old phrase>ndash;5" in 11 summaries and pasted
# 70 KB of other cards into one (quality audit 2026-11-17, ambient-startcount).
BARE_ENTITY_RE = re.compile(r"(?<=[\w)%])(?:nbsp|ndash|mdash|minus|times|thinsp|plusmn|rsquo|radic|le|ge|lt|gt);(?=\S)")


def card_text_errors(summary):
    """Signs of a corrupted card summary: an HTML entity whose `&` was eaten,
    or other cards' markup pasted in."""
    errs = []
    m = BARE_ENTITY_RE.search(summary)
    if m:
        errs.append(f"summary has an entity without its '&' near {summary[max(0, m.start() - 40):m.end() + 10]!r}")
    if "<h2>" in summary:
        errs.append(f"summary holds page markup ({len(summary)} characters)")
    return errs


# One page per theme at research/topics/<id>/: the level between the index and a project.
TOPICS_DIR = "topics"
# How many sibling projects a project page lists under "More in <topic>".
MORE_IN_TOPIC = 6

IMAGE_EXTS = (".png", ".svg", ".jpg", ".jpeg", ".webp")


def find_figure(slug):
    """First image the project itself produced (experiments/ first), or None."""
    base = RESEARCH / slug
    for sub in ("experiments", "results", "figures", "."):
        d = base / sub
        if d.is_dir():
            found = sorted(f for f in (d.iterdir() if sub != "." else d.glob("*")) if f.suffix.lower() in IMAGE_EXTS and f.is_file())
            if found:
                return found[0]
    return None

SITE_NAME = "Maris Stella Labs"

# Self-hosted, not Google Fonts. Every research page used to block its first
# paint on a stylesheet from fonts.googleapis.com and then fetch the faces from
# fonts.gstatic.com, which hands every reader's IP address to Google on a site
# whose pitch is that nothing you do leaves your hands. These are the same
# variable faces (latin subset, SIL Open Font License, fonts/README.md), served
# from the site itself with `font-display: swap`.
FONT_FILES = ("Inter.woff2", "Newsreader.woff2", "JetBrainsMono.woff2")


def font_faces(prefix):
    """The @font-face rules for a page `prefix` levels below research/ ('' for the index)."""
    url = f"{prefix}fonts/"
    latin = ("U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, "
             "U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD")
    faces = [("Inter", "Inter.woff2", "100 900", ""), ("Newsreader", "Newsreader.woff2", "200 800", ""),
             ("JetBrains Mono", "JetBrainsMono.woff2", "100 800", "")]
    rules = "".join(
        f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:swap;"
        f"src:url({url}{file}) format('woff2');unicode-range:{latin}}}"
        for fam, file, w, _ in faces)
    return (f'<link rel="preload" href="{url}Inter.woff2" as="font" type="font/woff2" crossorigin>\n'
            f"<style>{rules}</style>\n")


def json_ld(data):
    """A JSON-LD <script> block. `</` is escaped so a title can never close the script early."""
    return ('<script type="application/ld+json">'
            + json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
            + "</script>\n")


def site_root(base_url):
    return base_url.rstrip("/") + "/"


def breadcrumbs(base_url, trail):
    """trail: [(name, path under the site root)], after the site itself."""
    root = site_root(base_url)
    items = [(SITE_NAME, root)] + [(n, root + p) for n, p in trail]
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i, "name": n, "item": u} for i, (n, u) in enumerate(items, 1)]}


def project_ld(p, theme, base_url):
    """A project page as a ScholarlyArticle: what a search engine needs to show it as research
    (title, abstract, topic, licence, where the code lives), and nothing the page does not state."""
    root = site_root(base_url)
    slug = p["slug"]
    return json_ld({
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "ScholarlyArticle",
                "headline": text(p["title"])[:110],
                "name": text(p["title"]),
                "abstract": plain(p["summary"]),
                "url": f"{root}research/{slug}/",
                "inLanguage": "en",
                "isAccessibleForFree": True,
                "license": f"{REPO_URL}/blob/main/LICENSE",
                "about": {"@type": "Thing", "name": text(theme["name"])},
                "isPartOf": {"@type": "CollectionPage", "name": text(theme["name"]),
                             "url": f"{root}research/{TOPICS_DIR}/{theme['id']}/"},
                "publisher": {"@type": "Organization", "name": SITE_NAME, "url": root},
                "isBasedOn": {"@type": "SoftwareSourceCode", "name": f"research/{slug}",
                              "codeRepository": f"{REPO_URL}/tree/main/research/{slug}"},
            },
            breadcrumbs(base_url, [("Research", "research/"),
                                   (text(theme["name"]), f"research/{TOPICS_DIR}/{theme['id']}/"),
                                   (text(p["title"]), f"research/{slug}/")]),
        ],
    })


def collection_ld(base_url, name, path, description, items, trail):
    """A topic page or the research index: a CollectionPage whose ItemList names what it links."""
    root = site_root(base_url)
    return json_ld({
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                "name": name,
                "url": root + path,
                "description": description,
                "isPartOf": {"@type": "WebSite", "name": SITE_NAME, "url": root},
                "mainEntity": {"@type": "ItemList", "numberOfItems": len(items), "itemListElement": [
                    {"@type": "ListItem", "position": i, "name": n, "url": root + u} for i, (n, u) in enumerate(items, 1)]},
            },
            breadcrumbs(base_url, trail),
        ],
    })


def image_size(path):
    """(width, height) of a PNG or SVG figure, or None, so the page reserves its box before it loads."""
    try:
        if path.suffix.lower() == ".png":
            head = path.read_bytes()[:24]
            if head[:8] == b"\x89PNG\r\n\x1a\n":
                return int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big")
        if path.suffix.lower() == ".svg":
            tag = re.search(r"<svg\b[^>]*>", path.read_text(errors="ignore")[:4000])
            if not tag:
                return None
            vb = re.search(r'viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)', tag.group(0))
            if vb:
                return round(float(vb.group(1))), round(float(vb.group(2)))
            w = re.search(r'\bwidth="([\d.]+)(?:px)?"', tag.group(0))
            h = re.search(r'\bheight="([\d.]+)(?:px)?"', tag.group(0))
            if w and h:
                return round(float(w.group(1))), round(float(h.group(1)))
    except (OSError, ValueError):
        return None
    return None


def project_links(slug):
    base, url = RESEARCH / slug, f"{REPO_URL}/tree/main/research/{slug}"
    links = [(f"{url}#readme", "README and method", True)]
    if (base / "app" / "index.html").is_file():
        links.insert(0, ("app/", "Open the interactive app", True))
    for sub, label in (("paper", "White paper"), ("experiments", "Experiments and results"), ("src", "Code"), ("tests", "Tests")):
        if (base / sub).is_dir():
            links.append((f"{url}/{sub}", label, False))
    return links


# An HTML entity an author typed (&minus;, &times;, &#8722;) survives escaping as itself, so the
# page shows "−" rather than the literal text "&minus;" (157 log lines and ledes did, 2026-11-14).
ENTITY = re.compile(r"&amp;(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});")
# *em* only around a word: "η*=0.25" or "a*b and c*d" stay as typed.
EM = re.compile(r"(?<![\w*])\*(?=[^\s*])([^*]*?[^\s*])\*(?![\w*])")
STRONG = re.compile(r"(?<![\w*])\*\*(?=\S)(.+?)(?<=\S)\*\*(?![\w*])")


# A code span is a run of backticks closed by a run of the same length, so ``` `` `x` `` ``` shows
# `x` with its backticks (CommonMark; one space either side is trimmed). Single runs only before
# 2026-11-14, which left double-backtick spans as raw text.
CODE = re.compile(r"(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)")
# [text](target): http(s) kept; a relative path is a file in the project, linked on GitHub.
LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")


def md_spans(text, links=False, slug=None):
    """Escape (keeping typed entities), then `code`, **bold**, *em* and, with links, [text](url).

    Code spans are set aside first so an asterisk or bracket inside one stays literal. With
    `slug`, a relative link ("paper/draft.md") goes to that file in research/<slug>/ on GitHub;
    without it a relative link shows its text only (it used to show as raw "[...](...)": three
    sensing-selfcal log lines did until 2026-11-14)."""
    t = ENTITY.sub(r"&\1;", html.escape(text, quote=False))
    codes = []

    def keep(m):
        code = m.group(2)
        if len(code) > 2 and code[0] == " " and code[-1] == " " and code.strip():
            code = code[1:-1]
        codes.append(f"<code>{code}</code>")
        return f"\x00{len(codes) - 1}\x00"

    t = CODE.sub(keep, t)
    t = STRONG.sub(r"<strong>\1</strong>", t)
    t = EM.sub(r"<em>\1</em>", t)
    if links:
        def link(m):
            label, href = m.group(1), html.unescape(m.group(2))
            if re.match(r"https?://", href):
                return f'<a href="{html.escape(href)}">{label}</a>'
            if slug and not re.match(r"[a-z][a-z0-9+.-]*:", href, re.I) and not href.startswith(("/", "#")) and ".." not in href:
                return f'<a href="{REPO_URL}/blob/main/research/{slug}/{html.escape(href.lstrip("./"))}">{label}</a>'
            return label
        t = LINK.sub(link, t)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], t)


def inline_md(text, slug=None):
    """The four inline forms a log uses: `code`, **bold**, *em* and [text](url)."""
    return md_spans(text, links=True, slug=slug)


def read_log(slug):
    """Entries of research/<slug>/LOG.md, newest first as written: [(heading, [(kind, text)])].

    An ongoing project keeps a log; each `## <date> · <title>` heading is one entry, and its
    body is bullets (`- `) and paragraphs. Text before the first entry is the file's own intro."""
    f = RESEARCH / slug / "LOG.md"
    if not f.is_file():
        return []
    entries = []
    for line in f.read_text().splitlines():
        if line.startswith("## "):
            entries.append((line[3:].strip(), []))
        elif entries and line.strip():
            body = entries[-1][1]
            if line.startswith("- "):
                body.append(("li", line[2:].strip()))
            elif line.startswith("  ") and body:
                body[-1] = (body[-1][0], body[-1][1] + " " + line.strip())
            else:
                body.append(("p", line.strip()))
    return entries


# A research log shows its newest entry, and more while the open part stays under LOG_OPEN_WORDS;
# older entries fold, one <details> each. Until 2026-11-18 every entry was printed open:
# research/cell-fidelity's 116 entries (75,919 words) made a 350,000 px phone page.
LOG_OPEN_WORDS = 500


def log_html(slug):
    entries = read_log(slug)
    if not entries:
        return ""
    out = ['  <h2 id="log">Research log</h2>',
           f'  <p class="log-intro">Ongoing: each run adds a batch and an entry, newest first. Source: <a href="{REPO_URL}/blob/main/research/{slug}/LOG.md">LOG.md</a>.</p>']
    words = [sum(_words(inline_md(t)) for _, t in body) for _, body in entries]
    shown = 1  # the newest entry is always open; more while the open part stays short
    while shown < len(entries) and sum(words[:shown + 1]) <= LOG_OPEN_WORDS:
        shown += 1
    if len(entries) - shown < 2:  # folding one entry away saves nothing
        shown = len(entries)
    for i, (head, body) in enumerate(entries):
        if i == shown:  # the older entries fold, one <details> each, inside one more
            older = len(entries) - shown
            out.append(f'  <details class="log-older"><summary>Show {older} earlier entr{"ies" if older != 1 else "y"}</summary>')
        if i < shown:
            out.append(f'  <article class="log-entry"><h3>{inline_md(head, slug)}</h3>')
        else:
            out.append(f'  <details class="log-entry"><summary><h3>{inline_md(head, slug)}</h3></summary>')
        items, paras = [], []
        for kind, text in body:
            if kind == "li":
                items.append(f"<li>{inline_md(text, slug)}</li>")
            else:
                if items:
                    paras.append("<ul>" + "".join(items) + "</ul>")
                    items = []
                paras.append(f"<p>{inline_md(text, slug)}</p>")
        if items:
            paras.append("<ul>" + "".join(items) + "</ul>")
        out.append("    " + "\n    ".join(paras) + ("\n  </article>" if i < shown else "\n  </details>"))
    if len(entries) > shown:
        out.append("  </details>")
    return "\n".join(out)




def with_site_chrome(page, chrome, root, replace_topbar, header_key="header", fill=None):
    """Give a page the parent site's shared header, stylesheet and footer links.

    `chrome` is the JSON platform/pages/build.mjs writes from site-nav.mjs, so the
    markup is defined once, in JavaScript, for every page on the site. On the
    research index, a topic page and a project page the site header replaces the
    page's own top bar. (Until 2026-11-15 topic and project pages kept the bar under
    the header as a "← All projects | GitHub" row: 56 px that repeated the trail's
    Research link, led to the topic index rather than a project list, and pointed
    GitHub at the whole repository. The project's own code links sit in "Links".)

    Topic and project pages take the breadcrumb variants (`topic_header`, `project_header`);
    `fill` supplies their other placeholders as already-escaped text."""
    header_key = header_key if header_key in chrome else "header"
    header = chrome[header_key].replace("{{ROOT}}", root)
    for key, val in (fill or {}).items():
        header = header.replace("{{" + key + "}}", val)
    footer = chrome["footer"].replace("{{ROOT}}", root)
    link = f'<link rel="stylesheet" href="{root}{chrome["style_file"]}">\n'
    page = page.replace("</head>", link + "</head>", 1)
    if replace_topbar:
        page, n = re.subn(r'<header class="topbar">.*?</header>', lambda m: header, page, count=1, flags=re.S)
    else:
        page, n = re.subn(r'<header class="topbar">', lambda m: header + "\n" + m.group(0), page, count=1)
    if n != 1:
        raise ValueError("no top bar to attach the site header to")
    page, n = re.subn(r"</footer>", lambda m: f'<div class="wrap">{footer}</div></footer>', page, count=1)
    if n != 1:
        raise ValueError("no footer to attach the site links to")
    return page


def title_tag(title, limit=48):
    """The <title> text: a result snippet shows about 60 characters, and many
    projects are titled with a whole question (up to 246). Cut at a word."""
    if len(title) <= limit:
        return title
    cut = title[:limit - 1].rsplit(" ", 1)[0].rstrip(",:;-– ")
    return cut + "\u2026"


def text(s):
    """HTML (a title with entities or <em>) as escaped plain text, for <title>, attributes and crumbs."""
    return html.escape(plain(s).strip(), quote=True)


def title_index(themes):
    """({title: slugs}, {clipped <title> text: slugs}) over every project in `themes`.

    Built once per build and handed to each project page. Until 2026-11-16 each of the 1,080
    pages re-clipped every other project's title to compare (1.16 M `plain` calls), about
    half of a build; tests build the site four times
    (docs/history/ci-perf-2026-11-16-research-title-index.md)."""
    full, clipped = {}, {}
    for t in themes:
        for q in t["projects"]:
            full.setdefault(q["title"], set()).add(q["slug"])
            clipped.setdefault(title_tag(plain(q["title"])), set()).add(q["slug"])
    return full, clipped


def shared_title(p, themes, index=None):
    """Whether another project has the same title, so the page title needs the slug to be unique."""
    full, _ = index or title_index(themes)
    return bool(full.get(p["title"], set()) - {p["slug"]})


def clipped_title_taken(p, themes, index=None):
    """True when another project's <title> clips to the same text as this one's."""
    _, clipped = index or title_index(themes)
    return bool(clipped.get(title_tag(plain(p["title"])), set()) - {p["slug"]})


def topic_chips(themes, current, root):
    """Every topic, with its project count, as links; the current one marked."""
    return "".join(
        f'<a href="{root}{TOPICS_DIR}/{t["id"]}/"{" aria-current=page" if t["id"] == current else ""}>'
        f'{t["name"]}<small>{len(t["projects"])}</small></a>'
        for t in themes
    )


def pager(theme, i):
    """Previous and next project within the same topic, in the order the topic lists them."""
    ps = theme["projects"]
    links = []
    if i > 0:
        links.append(f'<a class="prev" href="../{ps[i - 1]["slug"]}/" rel="prev"><small>← Previous</small>{ps[i - 1]["title"]}</a>')
    if i < len(ps) - 1:
        links.append(f'<a class="next" href="../{ps[i + 1]["slug"]}/" rel="next"><small>Next →</small>{ps[i + 1]["title"]}</a>')
    if not links:
        return ""
    return f'  <nav class="pager" aria-label="More in {text(theme["name"])}">{"".join(links)}</nav>'


def more_in_topic(theme, i, ledes):
    """The next MORE_IN_TOPIC projects after this one in its topic, wrapping round, so each project
    is linked from several neighbours and not only from the 700-card index."""
    ps = theme["projects"]
    picks = [ps[(i + k) % len(ps)] for k in range(1, min(MORE_IN_TOPIC, len(ps) - 1) + 1)]
    return "\n".join(
        f'    <li><a href="../{q["slug"]}/">{q["title"]}</a><span>{short_lede(ledes[q["slug"]], LEDE_CARD_WORDS)}</span></li>' for q in picks
    )


def project_page(p, theme, lede, tests, tokens, theme_vars, tmpl, out, base_url=None, chrome=None,
                 themes=(), index=0, ledes=None, titles=None):
    slug = p["slug"]
    if not (RESEARCH / slug / "README.md").is_file():
        raise ValueError(f"research/{slug} has no README.md")
    d = out / slug
    d.mkdir(parents=True, exist_ok=True)
    fig = find_figure(slug)
    figure = ""
    if fig:
        shutil.copyfile(fig, d / fig.name)
        size = image_size(fig)
        dims = f' width="{size[0]}" height="{size[1]}"' if size else ""
        figure = (f'  <h2>A figure from its own output</h2>\n  <figure><img src="{html.escape(fig.name)}" alt="Figure produced by research/{slug}: {html.escape(fig.stem)}"{dims} loading="lazy">'
                  f'<figcaption>{html.escape(str(fig.relative_to(RESEARCH)))}, written by the project\'s own experiment code.</figcaption></figure>')
    app = RESEARCH / slug / "app"
    if (app / "index.html").is_file():
        # A project's static browser app is published as-is under <slug>/app/.
        shutil.copytree(app, d / "app", dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("tests", "tools", "*.md", "*_testvectors.json", "__pycache__"))
        page_file = d / "app" / "index.html"
        app_page = page_file.read_text()
        if base_url:  # canonical and share-card tags on whichever origin the site is built for
            base = html.escape(base_url.rstrip("/") + "/")
            url = f"{base}research/{slug}/app/"
            app_page = app_page.replace("</head>", (
                f'<link rel="canonical" href="{url}">\n<meta property="og:url" content="{url}">\n'
                f'<meta property="og:image" content="{base}social-card.png">\n'
                '<meta name="twitter:card" content="summary_large_image">\n</head>'), 1)
        if chrome:  # the site header (with its link home) above the app's own page
            header = chrome["header"].replace("{{ROOT}}", "../../../")
            link = f'<link rel="stylesheet" href="../../../{chrome["style_file"]}">\n'
            app_page = app_page.replace("</head>", link + "</head>", 1)
            app_page = re.sub(r"<body([^>]*)>", lambda m: m.group(0) + "\n" + header, app_page, count=1)
        page_file.write_text(app_page)
    stats = f'<span>{tests} tests</span>' if tests else ""
    links = "\n".join(f'    <li><a{" class=primary" if prim else ""} href="{u}">{l}</a></li>' for u, l, prim in project_links(slug))
    page = tmpl
    for key, val in {
        "FONTS": font_faces("../"),
        "TOKENS": tokens, "THEME_VARS": theme_vars, "SLUG": slug, "TITLE": p["title"], "LEDE": short_lede(lede), "SUMMARY": summary_html(p["summary"], fold=True),
        "DESC": html.escape(plain(p["summary"])[:240]), "THEME_ID": theme["id"], "THEME_NAME": theme["name"],
        "STATS": stats, "FIGURE": figure, "LOG": log_html(slug), "LINKS": links, "REPO_URL": REPO_URL, "REPO": REPO,
        "TITLE_TEXT": text(p["title"]) + (f" (research/{slug})" if shared_title(p, themes, titles) else ""),
        "TITLE_TAG": html.escape(title_tag(plain(p["title"]))) + (f" (research/{slug})" if shared_title(p, themes, titles) or clipped_title_taken(p, themes, titles) else ""), "THEME_COUNT": str(len(theme["projects"])),
        "PAGER": pager(theme, index), "MORE": more_in_topic(theme, index, ledes or {}),
        "TOPICS": topic_chips(themes, theme["id"], "../"),
    }.items():
        page = page.replace("{{" + key + "}}", val)
    leftover = re.findall(r"\{\{\w+\}\}", page)
    if leftover:
        raise ValueError(f"research/{slug}: unfilled placeholders {leftover}")
    if base_url:
        page = published_page(page, slug, base_url, chrome is None)
        page = page.replace("</head>", project_ld(p, theme, base_url) + "</head>", 1)
    if chrome:
        page = with_site_chrome(page, chrome, "../../", replace_topbar=True, header_key="project_header",
                                fill={"TOPIC_ID": theme["id"], "TOPIC": text(theme["name"]), "TITLE": text(p["title"])})
    (d / "index.html").write_text(page)


def topic_card(p, lede, tests):
    """One project on its topic page. The lede (the result) is clamped to two lines by the template
    until "Result and abstract" is opened, which unclamps it; the text is in the page once, in full."""
    count = f" · {tests} tests" if tests else ""
    return (f'  <article class="proj" id="{p["slug"]}"><h2><a href="../../{p["slug"]}/">{p["title"]}</a></h2>'
            f'<p class="meta">research/{p["slug"]}{count}</p><p class="res">{lede}</p>'
            f'<details><summary>Result and abstract</summary>{summary_html(p["summary"], "")}</details></article>')


def topic_page(theme, themes, ledes, tests, tokens, theme_vars, tmpl, out, base_url=None, chrome=None):
    """research/topics/<id>/: every project in one theme, each linking its own page."""
    d = out / TOPICS_DIR / theme["id"]
    d.mkdir(parents=True, exist_ok=True)
    page = tmpl
    for key, val in {
        "FONTS": font_faces("../../"),
        "TOKENS": tokens, "THEME_VARS": theme_vars, "THEME_ID": theme["id"], "THEME_NAME": theme["name"],
        "THEME_NAME_TEXT": text(theme["name"]), "THEME_COUNT": str(len(theme["projects"])), "BLURB": theme["blurb"],
        "DESC": text(theme["blurb"]), "TOPICS": topic_chips(themes, theme["id"], "../../"),
        "PROJECTS": "\n".join(topic_card(p, ledes[p["slug"]], tests[p["slug"]]) for p in theme["projects"]),
        "REPO_URL": REPO_URL, "REPO": REPO,
    }.items():
        page = page.replace("{{" + key + "}}", val)
    leftover = re.findall(r"\{\{\w+\}\}", page)
    if leftover:
        raise ValueError(f"unfilled placeholders {leftover}")
    if base_url:
        page = published_page(page, f"{TOPICS_DIR}/{theme['id']}", base_url, hub_link=False)
        page = page.replace("</head>", collection_ld(
            base_url, text(theme["name"]), f"research/{TOPICS_DIR}/{theme['id']}/", text(theme["blurb"]),
            [(text(p["title"]), f"research/{p['slug']}/") for p in theme["projects"]],
            [("Research", "research/"), (text(theme["name"]), f"research/{TOPICS_DIR}/{theme['id']}/")]) + "</head>", 1)
    if chrome:
        page = with_site_chrome(page, chrome, "../../../", replace_topbar=True, header_key="topic_header",
                                fill={"TOPIC": text(theme["name"])})
    (d / "index.html").write_text(page)


# Research logs on the index: the newest few as cards, every one in a compact list.
# With all 32 logs as cards the block was 10,300 px tall on a 390 px phone.
LOG_CARDS = 6
LOG_DATE = re.compile(r"^(\d{4}-\d{2}-\d{2})\s*[·:-]?\s*(.*)$")


def latest_logs(by_slug):
    """[(slug, date, rest_of_heading)] for every project with a LOG.md, newest entry first
    (ties keep registry order); a heading with no leading date sorts last."""
    out = []
    for s in by_slug:
        entries = read_log(s)
        if not entries:
            continue
        m = LOG_DATE.match(entries[0][0])
        out.append((s, m.group(1) if m else "", m.group(2) if m else entries[0][0]))
    return sorted(out, key=lambda e: e[1], reverse=True)


def logs_section(by_slug, ledes=None):
    logs = latest_logs(by_slug)
    if not logs:
        return ""
    def head(date, rest):
        return f"{date} · {inline_md(rest)}" if date else inline_md(rest)
    cards = "\n".join(
        f'    <a class="feat t-{by_slug[s][1]["id"]}" href="{s}/#log"><span class="theme-tag">Ongoing · {s}</span>'
        f'<h3>{by_slug[s][0]["title"]}</h3><p>Latest: {head(d, r)}</p><span class="go">Read the log →</span></a>'
        for s, d, r in logs[:LOG_CARDS]
    )
    rest = logs[LOG_CARDS:]
    listing = ""
    if rest:
        items = "\n".join(
            f'      <li class="t-{by_slug[s][1]["id"]}"><a href="{s}/#log">{by_slug[s][0]["title"]}</a>'
            f'<span>{d + " · " if d else ""}{s}</span></li>'
            for s, d, r in rest
        )
        listing = (f'\n  <details class="log-more"><summary>{len(rest)} more research logs</summary>\n'
                   f'    <ul class="log-list">\n{items}\n    </ul>\n  </details>')
    return f'''<section class="featured" id="logs"><div class="wrap">
  <h2 class="label">Research logs: the {min(LOG_CARDS, len(logs))} most recent of {len(logs)}</h2>
  <div class="feat-grid">
{cards}
  </div>{listing}
</div></section>'''


# Cards per theme on the index page itself; the rest load on demand.
INDEX_CARDS = 2


def card(p, theme, lede, tests):
    url = f"{REPO_URL}/tree/main/research/{p['slug']}"
    # The index carries a card per project, 800+ of them, so each card is the
    # question and its one-line answer: the abstract lives on the project page
    # and its topic page. With the abstract here three times over (the search
    # text, a collapsed <details>, and the page it links to) the index was
    # 2.4 MB of HTML; search still matches the slug, title, lede and theme.
    search = html.escape(" ".join([p["slug"], plain(p["title"]), plain(lede), theme["name"]]).lower())
    badge = f'<span class="tests">{tests} tests</span>' if tests else ""
    return f"""    <article class="card" id="{p['slug']}" data-search="{search}">
      <div class="card-top"><span class="slug">{p['slug']}</span>{badge}</div>
      <h3><a href="{p['slug']}/">{p['title']}</a></h3>
      <p class="lede">{short_lede(lede, LEDE_CARD_WORDS)}</p>
      <div class="card-foot"><a href="{p['slug']}/">Abstract and results →</a><a href="{url}">Code →</a></div>
    </article>"""


def published_page(page, slug, base_url, hub_link=True):
    """When published under a parent site (--base-url): a canonical URL and share-card tags, and a
    link back to the site's front page (two levels up), as every page on that site carries."""
    base = html.escape(base_url.rstrip("/") + "/")
    url = f"{base}research/{slug}/"
    meta = (
        f'<link rel="canonical" href="{url}">\n'
        f'<meta property="og:url" content="{url}">\n'
        f'<meta property="og:image" content="{base}social-card.png">\n'
        '<meta name="twitter:card" content="summary_large_image">\n'
    )
    page = page.replace("</head>", meta + "</head>", 1)
    # Search results and share cards show at most 160 characters of a description.
    def shorten(m):
        text = html.unescape(m.group(2))
        if len(text) > 160:
            text = text[:159].rsplit(" ", 1)[0].rstrip(" ,;:") + "…"
        return m.group(1) + html.escape(text) + '"'
    page = re.sub(r'(<meta (?:name="description"|property="og:description") content=")([^"]*)"', shorten, page)
    if not hub_link:  # the site header links home instead
        return page
    return page.replace('<a href="../index.html">', '<a href="../../" data-pf-to="hub">All tools</a><a href="../index.html">', 1)


def social_meta(base_url):
    if not base_url:
        return ""
    base = html.escape(base_url.rstrip("/") + "/")
    url = f"{base}research/"
    return (
        f'<link rel="canonical" href="{url}">\n'
        f'<meta property="og:url" content="{url}">\n'
        f'<meta property="og:image" content="{base}social-card.png">\n'
        '<meta name="twitter:card" content="summary_large_image">\n'
    )


def build(out, base_url=None, chrome=None):
    data = registry.load(RESEARCH)
    ledes = readme_ledes()
    errors = validate(data, ledes)
    if errors:
        print("\n".join(errors))
        sys.exit(1)

    tests = {p["slug"]: test_count(p["slug"]) for t in data["themes"] for p in t["projects"]}
    by_slug = {p["slug"]: (p, t) for t in data["themes"] for p in t["projects"]}

    theme_vars = "\n".join(f".t-{t['id']}{{--c:var(--t-{t['id']})}}" for t in data["themes"])
    chips = "\n".join(
        f'    <a class="chip t-{t["id"]}" href="#{t["id"]}"><i></i>{t["name"]} <small>{len(t["projects"])}</small></a>'
        for t in data["themes"]
    )
    most = max(len(t["projects"]) for t in data["themes"])
    rmap = "\n".join(
        f'    <a class="t-{t["id"]}" href="#{t["id"]}"><span class="name">{t["name"]}</span><span class="n">{len(t["projects"])}</span>'
        f'<span class="bar"><i style="width:{100 * len(t["projects"]) / most:.0f}%"></i></span></a>'
        for t in data["themes"]
    )
    featured = "\n".join(
        f"""    <a class="feat t-{t['id']}" href="#{s}"><span class="theme-tag">{t['name']}</span>
      <h3>{p['title']}</h3><p>{short_lede(ledes[s], LEDE_CARD_WORDS)}</p><span class="go">Read more →</span></a>"""
        for s in data["featured"] for p, t in [by_slug[s]]
    )
    log_section = logs_section(by_slug, ledes)
    # The index shows the first INDEX_CARDS projects of each theme; the rest are
    # in more-cards.json, which the page fetches when someone searches or asks
    # for them (and each theme's topic page lists them all, no script needed).
    # 1,065 cards in one document made this page 1.4 MB.
    extra = {}
    def theme_section(i, t):
        shown, rest = t["projects"][:INDEX_CARDS], t["projects"][INDEX_CARDS:]
        if rest:
            extra[t["id"]] = [card(p, t, ledes[p["slug"]], tests[p["slug"]]) for p in rest]
        more = (f'<p class="showall"><button type="button" class="btn" data-showall>Show all {len(t["projects"])} in this theme</button> '
                f'<a href="{TOPICS_DIR}/{t["id"]}/">or open the topic page →</a></p>') if rest else ""
        return f"""<section class="theme t-{t['id']}" id="{t['id']}">
  <div class="theme-head"><span class="theme-num">{i:02d}</span><h2><a href="{TOPICS_DIR}/{t['id']}/">{t['name']}</a></h2><p>{t['blurb']} <a href="{TOPICS_DIR}/{t['id']}/">Topic page →</a></p></div>
  <div class="grid">
{chr(10).join(card(p, t, ledes[p['slug']], tests[p['slug']]) for p in shown)}
  </div>
  {more}
</section>"""
    sections = "\n".join(theme_section(i, t) for i, t in enumerate(data["themes"], 1))

    page = (HERE / "template.html").read_text()
    for key, val in {
        "FONTS": font_faces(""),
        "THEME_VARS": theme_vars, "MAP": rmap, "CHIPS": chips, "FEATURED": featured, "LOGS": log_section, "SECTIONS": sections,
        "PROJECT_COUNT": f"{len(by_slug):,}", "TEST_COUNT": f"{sum(tests.values()):,}",
        "STDLIB_COUNT": f"{sum(1 for s in by_slug if not third_party_imports(s)):,}",
        "THEME_COUNT": str(len(data["themes"])), "SOCIAL_META": social_meta(base_url), "REPO_URL": REPO_URL, "REPO": REPO,
    }.items():
        page = page.replace("{{" + key + "}}", val)
    leftover = re.findall(r"\{\{\w+\}\}", page)
    if leftover:
        sys.exit(f"unfilled template placeholders: {leftover}")

    if base_url:
        # The index lists the topics, not every project: each topic page carries its own list.
        page = page.replace("</head>", collection_ld(
            base_url, f"Open research: {len(by_slug)} reproducible projects", "research/",
            f"{len(by_slug):,} open-source research projects in {len(data['themes'])} topics, each with its code, tests and results.",
            [(text(t["name"]), f"research/{TOPICS_DIR}/{t['id']}/") for t in data["themes"]],
            [("Research", "research/")]) + "</head>", 1)
    if chrome:
        page = with_site_chrome(page, chrome, "../", replace_topbar=True)
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(page)
    (out / "more-cards.json").write_text(json.dumps(extra, separators=(",", ":")))
    (out / "fonts").mkdir(exist_ok=True)
    for name in FONT_FILES:
        shutil.copyfile(HERE / "fonts" / name, out / "fonts" / name)
    # One home page per project: _site/<slug>/index.html. Any failure fails the build.
    tmpl = (HERE / "project.html").read_text()
    head = (HERE / "template.html").read_text()
    tokens = head[head.index("<style>") + len("<style>"):head.index("*{box-sizing")].strip()
    failures = []
    titles = title_index(data["themes"])
    for t in data["themes"]:
        for i, p in enumerate(t["projects"]):
            try:
                project_page(p, t, ledes[p["slug"]], tests[p["slug"]], tokens, theme_vars, tmpl, out, base_url, chrome,
                             data["themes"], i, ledes, titles)
            except Exception as e:  # noqa: BLE001
                failures.append(f"project page for research/{p['slug']}: {e}")
    # One page per topic: research/topics/<id>/index.html.
    topic_tmpl = (HERE / "topic.html").read_text()
    for t in data["themes"]:
        try:
            topic_page(t, data["themes"], ledes, tests, tokens, theme_vars, topic_tmpl, out, base_url, chrome)
        except Exception as e:  # noqa: BLE001
            failures.append(f"topic page for {t['id']}: {e}")
    if failures:
        sys.exit("\n".join(failures))
    print(f"ok: {len(by_slug)} projects, {len(data['themes'])} topics, {sum(tests.values())} tests -> {out / 'index.html'}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=HERE / "_site")
    ap.add_argument("--base-url", help="published site root; the page lives at <base-url>research/")
    ap.add_argument("--site-chrome", type=Path,
                    help="JSON with the parent site's header and footer (written by platform/pages/build.mjs)")
    args = ap.parse_args()
    build(args.out, args.base_url, json.loads(args.site_chrome.read_text()) if args.site_chrome else None)
