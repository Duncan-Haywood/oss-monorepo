#!/usr/bin/env python3
"""Fail if a blog post links or embeds a relative file that does not exist.

Skips fenced code blocks and inline code (examples), external URLs, anchors
and site-absolute paths. Percent-encoding is decoded before the lookup.
Usage: python3 platform/ci/check_post_links.py [posts_dir | post.md ...]
A file argument checks just that post (runs kept passing one and got a
NotADirectoryError, 2026-11-10).
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
    names = sorted(n for n in os.listdir(posts_dir) if n.endswith('.md'))
    return broken_in([os.path.join(posts_dir, n) for n in names])


def broken_in(paths):
    out = []
    for path in paths:
        posts_dir = os.path.dirname(path) or '.'
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
    args = argv[1:] or ['docs/posts']
    bad = []
    for a in args:
        if os.path.isdir(a):
            bad += broken(a)
        elif os.path.isfile(a):
            bad += broken_in([a])
        else:
            bad.append((a, '(no such file or directory)'))
    for path, url in bad:
        print(f'{path}: missing {url}')
    print(f'{len(bad)} broken relative link(s)')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
