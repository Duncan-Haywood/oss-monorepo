#!/usr/bin/env python3
"""Propose `seo_title:` values for posts whose headline is over the 70-character title budget.

A headline of the form "Question or claim: detail" usually works as a title
with the detail cut off. This lists those cuts (default) or writes them into
the front matter (--apply, at most --limit posts). Posts with no clean cut are
left for a person to title. `writing.mjs` still enforces the budget.
"""
import argparse, glob, os, re

BUDGET, MIN = 70, 25
POSTS = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'posts')


def cut(title):
    for sep in (': ', '? '):
        i = title.find(sep)
        if i >= 0:
            head = title[:i + (1 if sep == '? ' else 0)]
            if MIN <= len(head) <= BUDGET:
                return head
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--limit', type=int, default=1000)
    a = ap.parse_args()
    done = 0
    skipped = []
    for f in sorted(glob.glob(os.path.join(POSTS, '*.md')), reverse=True):
        text = open(f, encoding='utf-8').read()
        m = re.match(r'---\n(.*?)\n---\n', text, re.S)
        if not m or re.search(r'^seo_title:', m.group(1), re.M):
            continue
        tm = re.search(r'^title:\s*(.+)$', m.group(1), re.M)
        if not tm:
            continue
        title = tm.group(1).strip()
        if title[:1] in '"\'' and title[-1:] == title[:1]:
            title = title[1:-1]
        if len(title) <= BUDGET:
            continue
        new = cut(title)
        if not new:
            skipped.append((os.path.basename(f), len(title), title))
            continue
        if done >= a.limit:
            break
        done += 1
        print(f'{os.path.basename(f)}\n  {title}\n  -> {new}')
        if a.apply:
            q = '"' + new.replace('\\', '\\\\').replace('"', '\\"') + '"'
            text = text[:m.start(1) + tm.end(0)] + f'\nseo_title: {q}' + text[m.start(1) + tm.end(0):]
            open(f, 'w', encoding='utf-8').write(text)
    for name, n, title in skipped:
        print(f'NO CLEAN CUT: {name} ({n} chars)\n  {title}')
    print(f'{done} proposed{" and written" if a.apply else ""}, {len(skipped)} with no clean cut')


main()
