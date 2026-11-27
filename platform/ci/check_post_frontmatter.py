#!/usr/bin/env python3
"""Fail if a blog post in docs/posts/ lacks the front matter its siblings carry.

Every post opens with `---`, then `title`, `date`, `description` and `tags`.
Five posts shipped without `tags` (2026-10-24 and 2026-10-26) and nothing
noticed, because no check read post front matter. Also checks that `date`
matches the filename's date prefix, is not in the future (77 posts were dated
up to three weeks ahead on 2026-10-25, so they topped the feed and carried a
false `datePublished`), that `tags` is a non-empty list, and that the body
never holds the literal placeholder origin the site check refuses.

    python3 platform/ci/check_post_frontmatter.py [--root DIR]   # exit 1 if any
    python3 platform/ci/check_post_frontmatter.py docs/posts/NEW.md   # just these
    python3 platform/ci/check_post_frontmatter.py --limits   # the caps, before you write
    python3 platform/ci/check_post_frontmatter.py --landed-since 2026-11-10   # posts that reached main broken
    python3 platform/ci/check_post_frontmatter.py --fix docs/posts/NEW.md   # house tag spellings, then check

Named posts are checked alone, and the cross-post checks (tag spellings,
shared descriptions, shared page titles) report only groups that include one of them. Runs kept
passing a file and getting a usage error (two friction reports, 2026-11-10).

Agent reports in docs/reports/ get `doc_index.py`'s front-matter check here
too (every report when no post is named; a named docs/reports/ file alone).
That check ran in no workflow a research or docs PR triggers, so 43 of the
131 reports added to main from 2026-11-07 to 2026-11-14 arrived without
`kind` and main_health stayed red until a later run backfilled them. This
script already runs on every PR that carries a post, which most do.
"""
import argparse
import datetime
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "platform" / "pages"))
try:
    from propose_seo_titles import cut as _cut  # noqa: E402
except ImportError:
    # Run without platform/pages beside it: prompts-ci's sparse checkout, or
    # prompts/test_promptctl.py, which copies this file alone onto a fixture.
    # Crashing there made promptctl read "no problems" and kept prompts-ci red
    # on main for 14 h (2026-11-10). This is propose_seo_titles.cut, kept in
    # step by test_check_post_frontmatter.py.
    def _cut(title, budget=70, minimum=25):
        for sep in (": ", "? "):
            i = title.find(sep)
            if i >= 0:
                head = title[:i + (1 if sep == "? " else 0)]
                if minimum <= len(head) <= budget:
                    return head
        return None


REQUIRED = ("title", "date", "description", "tags")
# Character caps, stated once so tools that name a new post can print them
# before it is written: runs learned them only when this check or the pre-push
# hook refused a first draft (nine run records on 2026-11-12 alone).
LIMITS = {"title": 110, "description": 160, "seo_title": 70}
MIN_DESCRIPTION = 60
PLACEHOLDER = "https://example.invalid"  # platform/pages/check.mjs PLACEHOLDER_ORIGIN
# build.test.mjs's "no paywall language" test runs this on the hub, which shows
# the three newest posts' title and description (home.mjs renderLatestWriting).
# A post titled "A free trial is not churn" passed every post check and turned
# PR #17115's site build red (2026-11-18). Kept in step by test_check_post_frontmatter.py.
PAYWALL = re.compile(r"\bsubscribe\b|upgrade to|paid plan|\bfree trial\b", re.I)
ENTITY = re.compile(r"&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);", re.I)  # entities.mjs DOUBLE_ESCAPED, unescaped


def limits_line():
    return (f"front matter: title <= {LIMITS['title']} chars, description {MIN_DESCRIPTION} to "
            f"{LIMITS['description']}, seo_title <= {LIMITS['seo_title']} (needed when a title over "
            f"{LIMITS['seo_title']} has no clean cut at ': '), date = `date -u +%F`, tags: [a, b]; "
            f"once written: python3 platform/ci/check_posts.py (front matter, links, near-copies)")


def over(field, value, cap):
    """The too-long message, with the words past the cap quoted, so the first
    edit cuts enough (doc_friction 2026-11-24 and 26: a 167-character
    description took two rounds because the message gave only the length)."""
    return (f"{field} is {len(value)} characters, {len(value) - cap} over; keep it to {cap} "
            f"(past the cap: \"{value[cap:]}\")")


def problems(name, text, today=None):
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return ["no front matter"]
    fields = {}
    for line in m.group(1).splitlines():
        k, sep, v = line.partition(":")
        if sep and not line.startswith(" "):
            fields[k.strip()] = v.strip()
    out = [f"missing `{k}`" for k in REQUIRED if not fields.get(k)]
    prefix = re.match(r"\d{4}-\d{2}-\d{2}", name)
    if prefix and fields.get("date") and fields["date"].strip("\"'") != prefix.group(0):
        out.append(f"date {fields['date']} != filename date {prefix.group(0)}")
    # No slack: 19 posts merged dated 2026-10-28 on the UTC day 2026-10-27, because a
    # day of leeway let runs date a post for "tomorrow". Use `date -u +%F`.
    limit = today or datetime.datetime.now(datetime.timezone.utc).date()
    if prefix and prefix.group(0) > limit.isoformat():
        out.append(f"dated {prefix.group(0)}, after today ({limit}, UTC); date a post `date -u +%F` when it is written")
    desc = fields.get("description", "").strip("\"'")
    if len(desc) > LIMITS["description"]:  # writing.mjs throws on this; PR builds fail, so say so early
        out.append(over("description", desc, LIMITS["description"]))
    # Search results cut a title near 60 characters and the longest 14 of 2,299 posts run
    # 111 to 122; posts from 2026-11-05 on keep to 110 so the part that gets cut is not the point.
    title = fields.get("title", "").strip("\"'")
    if prefix and prefix.group(0) >= "2026-11-05" and len(title) > LIMITS["title"]:
        out.append(over("title", title, LIMITS["title"]))
    if len(desc) < MIN_DESCRIPTION:  # a stub ("d", a filename) gives a search result or an answer engine nothing to quote
        out.append(f"description is {len(desc)} characters; write at least 60 so a result says what the post is")
    # writing.mjs throws on this too: three posts on 2026-10-29 broke every site build.
    seo = fields.get("seo_title", "").strip("\"'")
    if len(seo) > LIMITS["seo_title"]:
        out.append(over("seo_title", seo, LIMITS["seo_title"]))
    # propose_seo_titles.py --check failed main four times in two days because only
    # main_health ran it: a title over 70 with no seo_title and no clean cut to 70.
    if not seo and len(title) > 70 and not _cut(title):
        out.append(f"title is {len(title)} characters with no clean cut to 70; add `seo_title:` (70 max)")
    for key, value in (("title", title), ("description", desc)):
        hit = PAYWALL.search(value)
        if hit:
            out.append(f"{key} holds `{hit.group(0)}`, which the hub shows and build.test.mjs's "
                       "'no paywall language' test refuses; reword it")
    tags = fields.get("tags")
    if tags and not re.fullmatch(r"\[\s*[^\]\s][^\]]*\]", tags):
        out.append("`tags` is not a non-empty [list]")
    # platform/pages/check.mjs fails the whole site build on any served file
    # holding the placeholder origin, and the build rewrites it only in venture
    # files, never in posts: one run met it after a 7-minute local workflow
    # (run record for PR #16380, 2026-11-15). Code spans and fences count too.
    # check.mjs also fails the build on an HTML entity in a title or heading: the
    # page escapes it, so it reads as escaped twice (a red-team post titled
    # "yard&#x27;s" failed PR #16485's build, 2026-11-16). Prose may show one.
    body = text[m.end():]
    in_fence = False
    for i, line in enumerate(body.splitlines()):
        if line.lstrip().startswith(("```", "~~~")):
            in_fence = not in_fence
        heading = not in_fence and re.match(r"#{1,2}\s", line)  # check.mjs reads <title>, <h1>, <h2>
        ent = ENTITY.search(line) if heading else None
        if ent:
            out.append(f"heading `{line.strip()}` holds the entity `{ent.group(0)}`, which fails the site build (check.mjs); write the character")
    for key in ("title", "seo_title"):
        ent = ENTITY.search(fields.get(key, ""))
        if ent:
            out.append(f"{key} holds the entity `{ent.group(0)}`, which fails the site build (check.mjs); write the character")
    if PLACEHOLDER in text:
        n = text[:text.index(PLACEHOLDER)].count("\n") + 1
        out.append(f"line {n} holds `{PLACEHOLDER}`, which fails the site build (check.mjs); "
                   "write the bare host `example.invalid` or the real https://marisstella.app/")
    return out


def tag_key(tag):
    """Spelling-insensitive form of a tag: case, hyphens and a trailing plural s or es dropped."""
    k = re.sub(r"[^a-z0-9]", "", tag.lower())
    if k.endswith("es") and len(k) > 4 and k[-3] in "xzh":  # taxes -> tax; not "cases"
        return k[:-2]
    return k[:-1] if k.endswith("s") and len(k) > 3 else k


def tag_uses(texts):
    """{tag_key: {spelling: [post names]}} over every post ({name: post text})."""
    uses = {}
    for name, text in texts.items():
        m = re.search(r"^tags:\s*\[(.*?)\]", text, re.M)
        for t in (m.group(1).split(",") if m else []):
            t = t.strip().strip("\"'")
            if t:
                uses.setdefault(tag_key(t), {}).setdefault(t, []).append(name)
    return uses


def tag_variants(texts):
    """Groups of tag spellings that mean one thing ({name: post text}); each splits the blog's tag filter."""
    return [sorted(v) for v in tag_uses(texts).values() if len(v) > 1]


def tag_fix(spellings, limit=5):
    """One line saying which posts to edit, or None on a tie (no spelling is the house one).

    Runs reported (2026-11-11) that "tag spelled 2 ways: benchmark, benchmarks"
    did not say which file to change; with 40 posts on one spelling and 1 on
    the other, the answer is the one post.
    """
    counts = sorted(((len(posts), s) for s, posts in spellings.items()), reverse=True)
    if len(counts) < 2 or counts[0][0] == counts[1][0]:
        return None
    keep = counts[0][1]
    edit = sorted(p for s, posts in spellings.items() if s != keep for p in posts)
    more = f" and {len(edit) - limit} more" if len(edit) > limit else ""
    return (f"  `{keep}` is on {counts[0][0]} posts; change the other spelling in: "
            f"{', '.join(edit[:limit])}{more}")


def house_tags(text, others):
    """(new text, [(old, new)]): the post's tags respelled the way the other posts spell them.

    A tag's spelling can only be learned from the 4,900 posts already there,
    so it was the one front-matter problem a run could not avoid by reading
    the caps first: 14 run records in three days (friction_rank.py, 2026-11-15)
    met "tag spelled 2 ways" and edited by hand. A tag nobody else uses, or
    one whose spellings tie, is left alone.
    """
    m = re.search(r"^tags:\s*\[(.*?)\]", text, re.M)
    if not m:
        return text, []
    uses = tag_uses(others)
    tags, changed = [], []
    for raw in m.group(1).split(","):
        t = raw.strip().strip("\"'")
        if not t:
            continue
        counts = sorted(((len(v), s) for s, v in uses.get(tag_key(t), {}).items()), reverse=True)
        if counts and (len(counts) == 1 or counts[0][0] > counts[1][0]) and counts[0][1] != t:
            changed.append((t, counts[0][1]))
            t = counts[0][1]
        if t not in tags:
            tags.append(t)
    if not changed:
        return text, []
    return text[:m.start(1)] + ", ".join(tags) + text[m.end(1):], changed


def duplicate_descriptions(texts):
    """Groups of posts sharing one description ({name: post text}); search results show them as copies."""
    seen = {}
    for name, text in texts.items():
        m = re.search(r"^description:\s*(.*)$", text, re.M)
        d = m.group(1).strip().strip("\"'") if m else ""
        if d:
            seen.setdefault(d, []).append(name)
    return [v for v in seen.values() if len(v) > 1]


SITE_NAME = "Maris Stella Labs"  # platform/pages/site-nav.mjs


_YAML_ESCAPES = {'"': '"', "\\": "\\", "/": "/", "n": "\n", "t": "\t", "r": "\r", "0": "\0"}


def _unquote(value):
    """writing.mjs unquoteYamlScalar: a quoted title loses its quotes and escapes as the page shows it."""
    if len(value) >= 2 and value[0] == value[-1] == '"':
        return re.sub(r"\\(.)", lambda m: _YAML_ESCAPES.get(m.group(1), m.group(0)), value[1:-1])
    if len(value) >= 2 and value[0] == value[-1] == "'":
        return value[1:-1].replace("''", "'")
    return value


def page_title(text):
    """The post's <title> as writing.mjs builds it (loadPost's seoTitle, then postPageTitle), or None."""
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return None
    fields = {}
    for line in m.group(1).splitlines():
        kv = re.match(r"([A-Za-z_][\w-]*):\s*(.*)$", line)
        if kv:
            fields[kv.group(1)] = _unquote(kv.group(2).strip())
    title, seo = fields.get("title", ""), fields.get("seo_title", "")
    head = seo or (_cut(title) if len(title) > LIMITS["seo_title"] else None) or title
    if not head:
        return None
    full = f"{head} · {SITE_NAME}"
    return full if len(full) <= LIMITS["seo_title"] else head


def duplicate_page_titles(texts):
    """{page title: [post names]} for titles two posts would share ({name: post text}).

    check.mjs fails a pull request's site build on a duplicate <title>, and
    the build renames a post only when it clashes with a tool page, never
    with another post. Runs met it after the ~10-minute local build: a
    seo_title copied from a same-day sibling post (run record for PR #16945,
    2026-11-17). This catches it from the files, in a second.
    """
    seen = {}
    for name, text in texts.items():
        t = page_title(text)
        if t:
            seen.setdefault(t, []).append(name)
    return {t: v for t, v in seen.items() if len(v) > 1}


def landed_broken(since, ref="origin/main", root=ROOT):
    """[(commit line, post name, problems)] for posts that failed this check in the commit that added them.

    Measures whether the guards before a merge work: a broken post on main
    fails writing.mjs, so the site build and deploy stay red until another
    run fixes it forward (#15454 on 2026-11-13 merged seconds before its CI
    started; #15451 fixed it 11 minutes later). The date check is judged
    against the commit's own UTC day. The shallow-clone boundary commit,
    which git reports as adding every post, is skipped.
    """
    git = lambda *a: subprocess.run(["git", *a], cwd=root, capture_output=True, text=True).stdout
    shallow_file = Path(root) / git("rev-parse", "--git-path", "shallow").strip()
    shallow = set(shallow_file.read_text().split()) if shallow_file.is_file() else set()
    log = git("log", ref, "--first-parent", f"--since={since}", "--diff-filter=A", "--name-only",
              "--format=@%H %cI %s", "--", "docs/posts/*.md")
    out, head, skip = [], None, False
    for line in log.splitlines():
        if line.startswith("@"):
            head, skip = line[1:], line[1:].split()[0] in shallow
            continue
        if not line.strip() or skip or not head:
            continue
        sha, stamp = head.split()[:2]
        day = datetime.datetime.fromisoformat(stamp).astimezone(datetime.timezone.utc).date()
        name = line.rsplit("/", 1)[-1]
        found = problems(name, git("show", f"{sha}:{line}"), today=day)
        if found:
            out.append((f"{sha[:9]} {stamp[:10]} {head.split(None, 2)[2][:90]}", name, found))
    return out


def report_problems(root, names=None):
    """doc_index's front-matter problems for docs/reports/ (all, or just `names`); [] when it cannot run."""
    try:
        import doc_index  # beside this file; absent when prompts' tests copy this file alone
        tax, slugs = doc_index.load_taxonomy(root), doc_index.project_slugs(root)
    except (ImportError, OSError, ValueError, KeyError):
        return []
    files = [Path(n) for n in names] if names is not None else doc_index.report_files(root)
    out = []
    for f in files:
        out += doc_index.report_problems(root, f, tax, slugs)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("posts", nargs="*", help="check only these posts (default: every post)")
    ap.add_argument("--limits", action="store_true", help="print the front-matter limits and exit")
    ap.add_argument("--landed-since", metavar="DATE",
                    help="list posts that failed this check in the main commit that added them (exit 0: a report)")
    ap.add_argument("--fix", action="store_true",
                    help="respell the named posts' tags the way other posts spell them, then check")
    args = ap.parse_args(argv)
    if args.fix and not args.posts:
        ap.error("--fix rewrites only the posts you name")
    if args.landed_since:
        found = landed_broken(args.landed_since, root=args.root)
        for commit, name, ps in found:
            print(f"{commit}\n    {name}: {'; '.join(ps)}")
        print(f"{len(found)} post(s) reached main failing this check since {args.landed_since}")
        return 0
    if args.limits:
        print(limits_line())
        return 0
    bad, own, owned = 0, False, []
    texts = {f.name: f.read_text(encoding="utf-8") for f in sorted((Path(args.root) / "docs" / "posts").glob("*.md"))}
    named, reports = set(), []
    for p in args.posts:
        f = Path(p)
        if not f.is_file():
            print(f"{p}: no such file")
            bad += 1
            continue
        if f.resolve().parent.name == "reports" and f.resolve().parent.parent.name == "docs":
            reports.append(f.resolve())
            continue
        texts[f.name] = f.read_text(encoding="utf-8")
        named.add(f.name)
    if args.fix:
        others = {n: t for n, t in texts.items() if n not in named}
        for p in args.posts:
            f = Path(p)
            if f.name not in named:
                continue
            new, changed = house_tags(texts[f.name], others)
            if changed:
                f.write_text(new, encoding="utf-8")
                texts[f.name] = new
                print(f"{f.name}: tags respelled " + ", ".join(f"{a} -> {b}" for a, b in changed))
    for name, text in texts.items():
        if args.posts and name not in named:
            continue
        for p in problems(name, text):
            print(f"{name}: {p}")
            owned.append(f"{name}: {p}")
            bad += 1
            own = True
    own_tags = set()
    for name in named:
        m = re.search(r"^tags:\s*\[(.*?)\]", texts[name], re.M)
        own_tags |= {t.strip().strip("\"'") for t in (m.group(1).split(",") if m else [])}
    for spellings in tag_uses(texts).values():
        group = sorted(spellings)
        if len(group) < 2 or (args.posts and not own_tags & set(group)):
            continue
        print(f"tag spelled {len(group)} ways: {', '.join(group)}; pick one")
        fix = tag_fix(spellings)
        if fix:
            print(fix)
        if args.posts and not args.fix:
            print("  `--fix <post>` respells a named post's tags the way the other posts do")
        bad += 1
    for group in duplicate_descriptions(texts):
        if args.posts and not named & set(group):
            continue
        print(f"one description on {len(group)} posts: {', '.join(group)}; word each for its own post")
        bad += 1
    for title, group in duplicate_page_titles(texts).items():
        if args.posts and not named & set(group):
            continue
        print(f"one page title on {len(group)} posts, which fails the site build (check.mjs): \"{title}\" "
              f"on {', '.join(group)}; give the newer post its own `seo_title:` ({LIMITS['seo_title']} max)")
        bad += 1
    for line in report_problems(Path(args.root), reports if args.posts else None):
        print(line)
        bad += 1
    if own:  # a post's own field failed: show every cap, so one rewrite fixes them all
        print(limits_line())
        # The caps line alone was last, so `| tail -1` showed the limits but
        # not which field failed (run-record doc friction, 2026-11-15: two
        # fix-and-rerun rounds). End on the count and the field problems, all
        # of them: naming only the first left a second (seo_title length) for
        # a rerun (run-record doc friction, 2026-11-16).
        shown = " | ".join(owned[:4]) + (f" | +{len(owned) - 4} more above" if len(owned) > 4 else "")
        print(f"FAIL: {bad} problem(s): {shown}")
    if not bad:
        # A clean pass printed nothing, so in a tail it looked like a run that
        # never started (run-record doc friction, 2026-11-14; one re-run).
        n = len(named) if args.posts else len(texts)
        what = [f"{n} post{'s' if n != 1 else ''}"] if n or not reports else []
        what += [f"{len(reports)} report{'s' if len(reports) != 1 else ''}"] if reports else []
        print(f"ok: front matter clean on {' and '.join(what)}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
