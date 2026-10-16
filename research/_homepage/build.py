"""Build the research homepage from research/_homepage/projects.json, research/README.md and research/.

    python3 research/_homepage/build.py            # writes research/_homepage/_site/index.html
    python3 research/_homepage/build.py --out DIR
    python3 research/_homepage/build.py --out DIR --base-url URL   # adds canonical + social tags

platform/pages/build.mjs runs the last form to publish the page at <site>/research/.

Card titles, abstracts and themes come from projects.json; the one-line lede is
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
    errors = []
    errors += [f"projects.json: missing research/{s}" for s in sorted(projects - set(listed))]
    errors += [f"projects.json: nonexistent research/{s}" for s in sorted(set(listed) - projects)]
    errors += [f"projects.json: research/{s} listed twice" for s in sorted({s for s in listed if listed.count(s) > 1})]
    errors += [f"research/README.md: research/{s} has more than one bullet" for s in duplicate_bullets()]
    errors += [f"research/README.md: missing bullet for research/{s}" for s in sorted(projects - set(ledes))]
    errors += [f"research/README.md: bullet for nonexistent research/{s}" for s in sorted(set(ledes) - projects)]
    errors += [f"projects.json: featured research/{s} not listed" for s in data["featured"] if s not in listed]
    for t in data["themes"]:
        for p in t["projects"]:
            for k in ("slug", "title", "summary"):
                if not p.get(k):
                    errors.append(f"projects.json: research/{p.get('slug')} has no {k}")
    return errors


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


def project_links(slug):
    base, url = RESEARCH / slug, f"{REPO_URL}/tree/main/research/{slug}"
    links = [(f"{url}#readme", "README and method", True)]
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




def project_page(p, theme, lede, tests, tokens, theme_vars, tmpl, out, base_url=None):
    slug = p["slug"]
    if not (RESEARCH / slug / "README.md").is_file():
        raise ValueError(f"research/{slug} has no README.md")
    d = out / slug
    d.mkdir(parents=True, exist_ok=True)
    fig = find_figure(slug)
    figure = ""
    if fig:
        shutil.copyfile(fig, d / fig.name)
        figure = (f'  <h2>A figure from its own output</h2>\n  <figure><img src="{html.escape(fig.name)}" alt="Figure produced by research/{slug}: {html.escape(fig.stem)}" loading="lazy">'
                  f'<figcaption>{html.escape(str(fig.relative_to(RESEARCH)))}, written by the project\'s own experiment code.</figcaption></figure>')
    stats = f'<span>{tests} tests</span>' if tests else ""
    links = "\n".join(f'    <li><a{" class=primary" if prim else ""} href="{u}">{l}</a></li>' for u, l, prim in project_links(slug))
    page = tmpl
    for key, val in {
        "TOKENS": tokens, "THEME_VARS": theme_vars, "SLUG": slug, "TITLE": p["title"], "LEDE": lede, "SUMMARY": p["summary"],
        "DESC": html.escape(plain(p["summary"])[:240]), "THEME_ID": theme["id"], "THEME_NAME": theme["name"],
        "STATS": stats, "FIGURE": figure, "LOG": log_html(slug), "LINKS": links, "REPO_URL": REPO_URL, "REPO": REPO,
    }.items():
        page = page.replace("{{" + key + "}}", val)
    leftover = re.findall(r"\{\{\w+\}\}", page)
    if leftover:
        raise ValueError(f"research/{slug}: unfilled placeholders {leftover}")
    if base_url:
        page = published_page(page, slug, base_url)
    (d / "index.html").write_text(page)


def card(p, theme, lede, tests):
    url = f"{REPO_URL}/tree/main/research/{p['slug']}"
    search = html.escape(" ".join([p["slug"], plain(p["title"]), plain(lede), plain(p["summary"]), theme["name"]]).lower())
    badge = f'<span class="tests">{tests} tests</span>' if tests else ""
    return f"""    <article class="card" id="{p['slug']}" data-search="{search}">
      <div class="card-top"><span class="slug">{p['slug']}</span>{badge}</div>
      <h3><a href="{url}">{p['title']}</a></h3>
      <p class="lede">{lede}</p>
      <details><summary><span>Abstract <svg class="chev" width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></span><a href="{p['slug']}/">Project page →</a></summary>
        <p class="abstract">{p['summary']}</p></details>
    </article>"""


def published_page(page, slug, base_url):
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


def build(out, base_url=None):
    data = json.loads((HERE / "projects.json").read_text())
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
  <div class="theme-head"><span class="theme-num">{i:02d}</span><h2>{t['name']}</h2><p>{t['blurb']}</p></div>
  <div class="grid">
{chr(10).join(card(p, t, ledes[p['slug']], tests[p['slug']]) for p in t['projects'])}
  </div>
</section>"""
        for i, t in enumerate(data["themes"], 1)
    )

    page = (HERE / "template.html").read_text()
    for key, val in {
        "THEME_VARS": theme_vars, "MAP": rmap, "CHIPS": chips, "FEATURED": featured, "LOGS": log_section, "SECTIONS": sections,
        "PROJECT_COUNT": str(len(by_slug)), "TEST_COUNT": f"{sum(tests.values()):,}",
        "THEME_COUNT": str(len(data["themes"])), "SOCIAL_META": social_meta(base_url), "REPO_URL": REPO_URL, "REPO": REPO,
    }.items():
        page = page.replace("{{" + key + "}}", val)
    leftover = re.findall(r"\{\{\w+\}\}", page)
    if leftover:
        sys.exit(f"unfilled template placeholders: {leftover}")

    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(page)
    # One home page per project: _site/<slug>/index.html. Any failure fails the build.
    tmpl = (HERE / "project.html").read_text()
    head = (HERE / "template.html").read_text()
    tokens = head[head.index("<style>") + len("<style>"):head.index("*{box-sizing")].strip()
    failures = []
    for slug, (p, t) in by_slug.items():
        try:
            project_page(p, t, ledes[slug], tests[slug], tokens, theme_vars, tmpl, out, base_url)
        except Exception as e:  # noqa: BLE001
            failures.append(f"project page for research/{slug}: {e}")
    if failures:
        sys.exit("\n".join(failures))
    print(f"ok: {len(by_slug)} projects, {sum(tests.values())} tests -> {out / 'index.html'}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=HERE / "_site")
    ap.add_argument("--base-url", help="published site root; the page lives at <base-url>research/")
    args = ap.parse_args()
    build(args.out, args.base_url)
