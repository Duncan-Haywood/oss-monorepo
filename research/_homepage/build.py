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
import html
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
        # Escape, then turn `code` spans into <code>.
        lede = lede.strip()
        lede = lede[:1].upper() + lede[1:]
        ledes[slug] = re.sub(r"`([^`]+)`", r"<code>\1</code>", html.escape(lede, quote=False))
    return ledes


def test_count(slug):
    return sum(
        len(re.findall(r"^\s*def test_", f.read_text(errors="ignore"), re.M))
        for f in (RESEARCH / slug).rglob("test*.py")
    )


def plain(s):
    return html.unescape(re.sub(r"<[^>]+>", " ", s))


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
    return errors


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

SITE_NAME = "Open Tools and Research"

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


def inline_md(text):
    """Escape, then the four inline forms a log uses: `code`, **bold**, *em* and [text](url)."""
    t = html.escape(text, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", t)
    return re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', t)


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


def log_html(slug):
    entries = read_log(slug)
    if not entries:
        return ""
    out = ['  <h2 id="log">Research log</h2>',
           f'  <p class="log-intro">Ongoing: each run adds a batch and an entry, newest first. Source: <a href="{REPO_URL}/blob/main/research/{slug}/LOG.md">LOG.md</a>.</p>']
    for head, body in entries:
        out.append(f'  <article class="log-entry"><h3>{inline_md(head)}</h3>')
        items, paras = [], []
        for kind, text in body:
            if kind == "li":
                items.append(f"<li>{inline_md(text)}</li>")
            else:
                if items:
                    paras.append("<ul>" + "".join(items) + "</ul>")
                    items = []
                paras.append(f"<p>{inline_md(text)}</p>")
        if items:
            paras.append("<ul>" + "".join(items) + "</ul>")
        out.append("    " + "\n    ".join(paras) + "\n  </article>")
    return "\n".join(out)




def with_site_chrome(page, chrome, root, replace_topbar, header_key="header", fill=None):
    """Give a page the parent site's shared header, stylesheet and footer links.

    `chrome` is the JSON platform/pages/build.mjs writes from site-nav.mjs, so the
    markup is defined once, in JavaScript, for every page on the site. On the
    research index the site header replaces this page's own top bar; on a project
    page it sits above it, and the bar stays as the "← All projects" sub-nav.

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


def shared_title(p, themes):
    """Whether another project has the same title, so the page title needs the slug to be unique."""
    return any(q["title"] == p["title"] and q["slug"] != p["slug"] for t in themes for q in t["projects"])


def clipped_title_taken(p, themes):
    """True when another project's <title> clips to the same text as this one's."""
    mine = title_tag(plain(p["title"]))
    return any(title_tag(plain(q["title"])) == mine and q["slug"] != p["slug"] for t in themes for q in t["projects"])


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
        f'    <li><a href="../{q["slug"]}/">{q["title"]}</a><span>{ledes[q["slug"]]}</span></li>' for q in picks
    )


def project_page(p, theme, lede, tests, tokens, theme_vars, tmpl, out, base_url=None, chrome=None,
                 themes=(), index=0, ledes=None):
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
        "TOKENS": tokens, "THEME_VARS": theme_vars, "SLUG": slug, "TITLE": p["title"], "LEDE": lede, "SUMMARY": p["summary"],
        "DESC": html.escape(plain(p["summary"])[:240]), "THEME_ID": theme["id"], "THEME_NAME": theme["name"],
        "STATS": stats, "FIGURE": figure, "LOG": log_html(slug), "LINKS": links, "REPO_URL": REPO_URL, "REPO": REPO,
        "TITLE_TEXT": text(p["title"]) + (f" (research/{slug})" if shared_title(p, themes) else ""),
        "TITLE_TAG": html.escape(title_tag(plain(p["title"]))) + (f" (research/{slug})" if shared_title(p, themes) or clipped_title_taken(p, themes) else ""), "THEME_COUNT": str(len(theme["projects"])),
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
        page = with_site_chrome(page, chrome, "../../", replace_topbar=False, header_key="project_header",
                                fill={"TOPIC_ID": theme["id"], "TOPIC": text(theme["name"]), "TITLE": text(p["title"])})
    (d / "index.html").write_text(page)


def topic_card(p, lede, tests):
    count = f" · {tests} tests" if tests else ""
    return (f'  <article class="proj" id="{p["slug"]}"><h2><a href="../../{p["slug"]}/">{p["title"]}</a></h2>'
            f'<p class="meta">research/{p["slug"]}{count}</p><p>{lede}</p>'
            f'<details><summary>Abstract</summary><p>{p["summary"]}</p></details></article>')


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
        page = with_site_chrome(page, chrome, "../../../", replace_topbar=False, header_key="topic_header",
                                fill={"TOPIC": text(theme["name"])})
    (d / "index.html").write_text(page)


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
      <p class="lede">{lede}</p>
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
      <h3>{p['title']}</h3><p>{ledes[s]}</p><span class="go">Read more →</span></a>"""
        for s in data["featured"] for p, t in [by_slug[s]]
    )
    logs = [(s, read_log(s)[0][0]) for s in by_slug if read_log(s)]
    log_items = "\n".join(
        f'    <a class="feat t-{by_slug[s][1]["id"]}" href="{s}/#log"><span class="theme-tag">Ongoing · {s}</span>'
        f'<h3>{by_slug[s][0]["title"]}</h3><p>Latest: {inline_md(head)}</p><span class="go">Read the log →</span></a>'
        for s, head in logs
    )
    log_section = (f'''<section class="featured" id="logs"><div class="wrap">
  <p class="label">Research logs</p>
  <div class="feat-grid">
{log_items}
  </div>
</div></section>''' if logs else "")
    sections = "\n".join(
        f"""<section class="theme t-{t['id']}" id="{t['id']}">
  <div class="theme-head"><span class="theme-num">{i:02d}</span><h2><a href="{TOPICS_DIR}/{t['id']}/">{t['name']}</a></h2><p>{t['blurb']} <a href="{TOPICS_DIR}/{t['id']}/">Topic page →</a></p></div>
  <div class="grid">
{chr(10).join(card(p, t, ledes[p['slug']], tests[p['slug']]) for p in t['projects'])}
  </div>
</section>"""
        for i, t in enumerate(data["themes"], 1)
    )

    page = (HERE / "template.html").read_text()
    for key, val in {
        "FONTS": font_faces(""),
        "THEME_VARS": theme_vars, "MAP": rmap, "CHIPS": chips, "FEATURED": featured, "LOGS": log_section, "SECTIONS": sections,
        "PROJECT_COUNT": str(len(by_slug)), "TEST_COUNT": f"{sum(tests.values()):,}",
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
            f"{len(by_slug)} open-source research projects in {len(data['themes'])} topics, each with its code, tests and results.",
            [(text(t["name"]), f"research/{TOPICS_DIR}/{t['id']}/") for t in data["themes"]],
            [("Research", "research/")]) + "</head>", 1)
    if chrome:
        page = with_site_chrome(page, chrome, "../", replace_topbar=True)
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(page)
    (out / "fonts").mkdir(exist_ok=True)
    for name in FONT_FILES:
        shutil.copyfile(HERE / "fonts" / name, out / "fonts" / name)
    # One home page per project: _site/<slug>/index.html. Any failure fails the build.
    tmpl = (HERE / "project.html").read_text()
    head = (HERE / "template.html").read_text()
    tokens = head[head.index("<style>") + len("<style>"):head.index("*{box-sizing")].strip()
    failures = []
    for t in data["themes"]:
        for i, p in enumerate(t["projects"]):
            try:
                project_page(p, t, ledes[p["slug"]], tests[p["slug"]], tokens, theme_vars, tmpl, out, base_url, chrome,
                             data["themes"], i, ledes)
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
