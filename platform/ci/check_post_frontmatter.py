#!/usr/bin/env python3
"""Fail if a blog post in docs/posts/ lacks the front matter its siblings carry.

Every post opens with `---`, then `title`, `date`, `description` and `tags`.
Five posts shipped without `tags` (2026-10-24 and 2026-10-26) and nothing
noticed, because no check read post front matter. Also checks that `date`
matches the filename's date prefix, is not in the future (77 posts were dated
up to three weeks ahead on 2026-10-25, so they topped the feed and carried a
false `datePublished`) and that `tags` is a non-empty list.

    python3 platform/ci/check_post_frontmatter.py [--root DIR]   # exit 1 if any
    python3 platform/ci/check_post_frontmatter.py docs/posts/NEW.md   # just these
    python3 platform/ci/check_post_frontmatter.py --limits   # the caps, before you write

Named posts are checked alone, and the cross-post checks (tag spellings,
shared descriptions) report only groups that include one of them. Runs kept
passing a file and getting a usage error (two friction reports, 2026-11-10).
"""
import argparse
import datetime
import re
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


def limits_line():
    return (f"front matter: title <= {LIMITS['title']} chars, description {MIN_DESCRIPTION} to "
            f"{LIMITS['description']}, seo_title <= {LIMITS['seo_title']} (needed when a title over "
            f"{LIMITS['seo_title']} has no clean cut at ': '), date = `date -u +%F`, tags: [a, b]")


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
        out.append(f"description is {len(desc)} characters; keep it to {LIMITS['description']}")
    # Search results cut a title near 60 characters and the longest 14 of 2,299 posts run
    # 111 to 122; posts from 2026-11-05 on keep to 110 so the part that gets cut is not the point.
    title = fields.get("title", "").strip("\"'")
    if prefix and prefix.group(0) >= "2026-11-05" and len(title) > LIMITS["title"]:
        out.append(f"title is {len(title)} characters; keep it to {LIMITS['title']}")
    if len(desc) < MIN_DESCRIPTION:  # a stub ("d", a filename) gives a search result or an answer engine nothing to quote
        out.append(f"description is {len(desc)} characters; write at least 60 so a result says what the post is")
    # writing.mjs throws on this too: three posts on 2026-10-29 broke every site build.
    seo = fields.get("seo_title", "").strip("\"'")
    if len(seo) > LIMITS["seo_title"]:
        out.append(f"seo_title is {len(seo)} characters; keep it to {LIMITS['seo_title']}")
    # propose_seo_titles.py --check failed main four times in two days because only
    # main_health ran it: a title over 70 with no seo_title and no clean cut to 70.
    if not seo and len(title) > 70 and not _cut(title):
        out.append(f"title is {len(title)} characters with no clean cut to 70; add `seo_title:` (70 max)")
    tags = fields.get("tags")
    if tags and not re.fullmatch(r"\[\s*[^\]\s][^\]]*\]", tags):
        out.append("`tags` is not a non-empty [list]")
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


def duplicate_descriptions(texts):
    """Groups of posts sharing one description ({name: post text}); search results show them as copies."""
    seen = {}
    for name, text in texts.items():
        m = re.search(r"^description:\s*(.*)$", text, re.M)
        d = m.group(1).strip().strip("\"'") if m else ""
        if d:
            seen.setdefault(d, []).append(name)
    return [v for v in seen.values() if len(v) > 1]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT))
    ap.add_argument("posts", nargs="*", help="check only these posts (default: every post)")
    ap.add_argument("--limits", action="store_true", help="print the front-matter limits and exit")
    args = ap.parse_args(argv)
    if args.limits:
        print(limits_line())
        return 0
    bad, own = 0, False
    texts = {f.name: f.read_text(encoding="utf-8") for f in sorted((Path(args.root) / "docs" / "posts").glob("*.md"))}
    named = set()
    for p in args.posts:
        f = Path(p)
        if not f.is_file():
            print(f"{p}: no such file")
            bad += 1
            continue
        texts[f.name] = f.read_text(encoding="utf-8")
        named.add(f.name)
    for name, text in texts.items():
        if named and name not in named:
            continue
        for p in problems(name, text):
            print(f"{name}: {p}")
            bad += 1
            own = True
    own_tags = set()
    for name in named:
        m = re.search(r"^tags:\s*\[(.*?)\]", texts[name], re.M)
        own_tags |= {t.strip().strip("\"'") for t in (m.group(1).split(",") if m else [])}
    for spellings in tag_uses(texts).values():
        group = sorted(spellings)
        if len(group) < 2 or (named and not own_tags & set(group)):
            continue
        print(f"tag spelled {len(group)} ways: {', '.join(group)}; pick one")
        fix = tag_fix(spellings)
        if fix:
            print(fix)
        bad += 1
    for group in duplicate_descriptions(texts):
        if named and not named & set(group):
            continue
        print(f"one description on {len(group)} posts: {', '.join(group)}; word each for its own post")
        bad += 1
    if own:  # a post's own field failed: show every cap, so one rewrite fixes them all
        print(limits_line())
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
