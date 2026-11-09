#!/usr/bin/env python3
"""Fail if a blog post links or embeds a relative file that does not exist.

Skips fenced code blocks and inline code (examples), external URLs, anchors
and site-absolute paths. Percent-encoding is decoded before the lookup.
Usage: python3 platform/ci/check_post_links.py [posts_dir]
"""
import os
import re
import sys
from urllib.parse import unquote

# Products are mounted at /<slug>/, never /ventures/<slug>/ (build.mjs, "A
# venture's sitemap"): a post that links the latter hands readers a 404.
WRONG_MOUNT = re.compile(r'https?://marisstella\.app/ventures/')

LINK = re.compile(r'!?\[[^\]]*\]\(([^)\s]+)')
SKIP = re.compile(r'^(https?:|mailto:|tel:|#|/)')


def strip_code(text):
    text = re.sub(r'```.*?```', '', text, flags=re.S)
    return re.sub(r'`[^`\n]*`', '', text)


def broken(posts_dir):
    out = []
    for name in sorted(os.listdir(posts_dir)):
        if not name.endswith('.md'):
            continue
        path = os.path.join(posts_dir, name)
        with open(path, encoding='utf8') as fh:
            text = strip_code(fh.read())
        for m in WRONG_MOUNT.finditer(text):
            out.append((path, text[m.start():m.start() + 60].split(')')[0]))
        for m in LINK.finditer(text):
            url = m.group(1)
            if SKIP.match(url):
                continue
            rel = unquote(url.split('#')[0].split('?')[0])
            if rel and not os.path.exists(os.path.normpath(os.path.join(posts_dir, rel))):
                out.append((path, url))
    return out


def main(argv):
    bad = broken(argv[1] if len(argv) > 1 else 'docs/posts')
    for path, url in bad:
        print(f'{path}: missing {url}')
    print(f'{len(bad)} broken relative link(s)')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
