"""Build the GitHub Pages homepage from site/projects.json, README.md and research/.

    python site/build.py            # writes _site/index.html
    python site/build.py --out DIR

Card titles, abstracts and themes come from site/projects.json; the one-line lede is
each project's README.md bullet; test counts are the `def test_` functions under
research/<slug>/. The build fails if any research/ project is missing from
projects.json or README.md, or if either lists a project that does not exist.
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

REPO = "Duncan-Haywood/oss-research-monorepo"
REPO_URL = f"https://github.com/{REPO}"
ROOT = Path(__file__).resolve().parent.parent


def readme_ledes():
    text = (ROOT / "README.md").read_text()
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
        for f in (ROOT / "research" / slug).rglob("test*.py")
    )


def plain(s):
    return html.unescape(re.sub(r"<[^>]+>", " ", s))


def validate(data, ledes):
    projects = {p.name for p in (ROOT / "research").iterdir() if p.is_dir()}
    listed = [p["slug"] for t in data["themes"] for p in t["projects"]]
    errors = []
    errors += [f"site/projects.json: missing research/{s}" for s in sorted(projects - set(listed))]
    errors += [f"site/projects.json: nonexistent research/{s}" for s in sorted(set(listed) - projects)]
    errors += [f"site/projects.json: research/{s} listed twice" for s in sorted({s for s in listed if listed.count(s) > 1})]
    errors += [f"README.md: missing bullet for research/{s}" for s in sorted(projects - set(ledes))]
    errors += [f"README.md: bullet for nonexistent research/{s}" for s in sorted(set(ledes) - projects)]
    errors += [f"site/projects.json: featured research/{s} not listed" for s in data["featured"] if s not in listed]
    for t in data["themes"]:
        for p in t["projects"]:
            for k in ("slug", "title", "summary"):
                if not p.get(k):
                    errors.append(f"site/projects.json: research/{p.get('slug')} has no {k}")
    return errors


def card(p, theme, lede, tests):
    url = f"{REPO_URL}/tree/main/research/{p['slug']}"
    search = html.escape(" ".join([p["slug"], plain(p["title"]), plain(lede), plain(p["summary"]), theme["name"]]).lower())
    badge = f'<span class="tests">{tests} tests</span>' if tests else ""
    return f"""    <article class="card" id="{p['slug']}" data-search="{search}">
      <div class="card-top"><span class="slug">{p['slug']}</span>{badge}</div>
      <h3><a href="{url}">{p['title']}</a></h3>
      <p class="lede">{lede}</p>
      <details><summary><span>Abstract <svg class="chev" width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></span><a href="{url}">Code &amp; paper →</a></summary>
        <p class="abstract">{p['summary']}</p></details>
    </article>"""


def build(out):
    data = json.loads((ROOT / "site" / "projects.json").read_text())
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
    sections = "\n".join(
        f"""<section class="theme t-{t['id']}" id="{t['id']}">
  <div class="theme-head"><span class="theme-num">{i:02d}</span><h2>{t['name']}</h2><p>{t['blurb']}</p></div>
  <div class="grid">
{chr(10).join(card(p, t, ledes[p['slug']], tests[p['slug']]) for p in t['projects'])}
  </div>
</section>"""
        for i, t in enumerate(data["themes"], 1)
    )

    page = (ROOT / "site" / "template.html").read_text()
    for key, val in {
        "THEME_VARS": theme_vars, "MAP": rmap, "CHIPS": chips, "FEATURED": featured, "SECTIONS": sections,
        "PROJECT_COUNT": str(len(by_slug)), "TEST_COUNT": f"{sum(tests.values()):,}",
        "THEME_COUNT": str(len(data["themes"])), "REPO_URL": REPO_URL, "REPO": REPO,
    }.items():
        page = page.replace("{{" + key + "}}", val)
    leftover = re.findall(r"\{\{\w+\}\}", page)
    if leftover:
        sys.exit(f"unfilled template placeholders: {leftover}")

    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(page)
    print(f"ok: {len(by_slug)} projects, {sum(tests.values())} tests -> {out / 'index.html'}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=ROOT / "_site")
    build(ap.parse_args().out)
