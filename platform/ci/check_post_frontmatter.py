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
    # One day of slack covers a writer whose clock is ahead of UTC.
    limit = (today or datetime.datetime.now(datetime.timezone.utc).date()) + datetime.timedelta(days=1)
    if prefix and prefix.group(0) > limit.isoformat():
        out.append(f"dated {prefix.group(0)}, after today ({limit - datetime.timedelta(days=1)}); date a post when it is written")
    desc = fields.get("description", "").strip("\"'")
    if len(desc) > 160:  # writing.mjs throws on this; PR builds fail, so say so early
        out.append(f"description is {len(desc)} characters; keep it to 160")
    tags = fields.get("tags")
    if tags and not re.fullmatch(r"\[\s*[^\]\s][^\]]*\]", tags):
        out.append("`tags` is not a non-empty [list]")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(ROOT))
    args = ap.parse_args(argv)
    bad = 0
    for f in sorted((Path(args.root) / "docs" / "posts").glob("*.md")):
        for p in problems(f.name, f.read_text(encoding="utf-8")):
            print(f"{f.name}: {p}")
            bad += 1
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
