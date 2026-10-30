#!/usr/bin/env python3
"""Fail if a blog post in docs/posts/ lacks the front matter its siblings carry.

Every post opens with `---`, then `title`, `date`, `description` and `tags`.
Five posts shipped without `tags` (2026-10-24 and 2026-10-26) and nothing
noticed, because no check read post front matter. Also checks that `date`
matches the filename's date prefix, is not in the future (77 posts were dated
up to three weeks ahead on 2026-10-25, so they topped the feed and carried a
false `datePublished`) and that `tags` is a non-empty list.

    python3 platform/ci/check_post_frontmatter.py [--root DIR]   # exit 1 if any
"""
import argparse
import datetime
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = ("title", "date", "description", "tags")


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
    if len(desc) > 160:  # writing.mjs throws on this; PR builds fail, so say so early
        out.append(f"description is {len(desc)} characters; keep it to 160")
    # writing.mjs throws on this too: three posts on 2026-10-29 broke every site build.
    seo = fields.get("seo_title", "").strip("\"'")
    if len(seo) > 70:
        out.append(f"seo_title is {len(seo)} characters; keep it to 70")
    tags = fields.get("tags")
    if tags and not re.fullmatch(r"\[\s*[^\]\s][^\]]*\]", tags):
        out.append("`tags` is not a non-empty [list]")
    return out


def tag_key(tag):
    """Spelling-insensitive form of a tag: case, hyphens and a trailing plural s dropped."""
    k = re.sub(r"[^a-z0-9]", "", tag.lower())
    return k[:-1] if k.endswith("s") and len(k) > 3 else k


def tag_variants(texts):
    """Groups of tag spellings that mean one thing ({name: post text}); each splits the blog's tag filter."""
    spellings = {}
    for text in texts.values():
        m = re.search(r"^tags:\s*\[(.*?)\]", text, re.M)
        for t in (m.group(1).split(",") if m else []):
            t = t.strip().strip("\"'")
            if t:
                spellings.setdefault(tag_key(t), set()).add(t)
    return [sorted(v) for v in spellings.values() if len(v) > 1]


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
    args = ap.parse_args(argv)
    bad = 0
    texts = {f.name: f.read_text(encoding="utf-8") for f in sorted((Path(args.root) / "docs" / "posts").glob("*.md"))}
    for name, text in texts.items():
        for p in problems(name, text):
            print(f"{name}: {p}")
            bad += 1
    for group in tag_variants(texts):
        print(f"tag spelled {len(group)} ways: {', '.join(group)}; pick one")
        bad += 1
    for group in duplicate_descriptions(texts):
        print(f"one description on {len(group)} posts: {', '.join(group)}; word each for its own post")
        bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
