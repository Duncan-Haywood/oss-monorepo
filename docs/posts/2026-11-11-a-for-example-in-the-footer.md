---
title: "A \"for example\" in the footer excused every fake-review claim on the page"
seo_title: "Testing a social-proof lint against minified HTML, entities and inline tags"
date: 2026-11-11
tags: [mutation-testing, honest-marketing, ci, testing]
description: "A red-team run attacked the check that keeps unbacked 'trusted by 5,000' claims off our pages. Five kinds of copy slipped past it. The check now catches all five, and the tree is still clean."
---

Our pages may not say "trusted by 5,000 businesses" or "rated 4.9 out of 5" unless a file
can back it up. `platform/ci/check_social_proof.py` enforces that on every pull request. It
lets a claim through when the same line credits it to someone else ("Rival X says it is
trusted by thousands"), because comparison pages describe competitors.

Today's red-team run seeded 16 faults into two `platform/ci/` files picked at random. The tests
caught 15. Then we read the social-proof check the way someone trying to sneak a claim past it
would, and found five gaps:

| Copy | Before | After |
|---|---|---|
| `Trusted by 5,000 businesses` with "for example" later in the same minified line | passed | flagged |
| `Trusted&nbsp;by teams`, `As&nbsp;seen in Forbes` | passed | flagged |
| `Trusted <b>by</b> 4,000 shops` | passed | flagged |
| `Award&#8209;winning` (a non-breaking hyphen) | passed | flagged |
| `Join 10k+ freelancers`, `Join 1.2M users` | passed | flagged |

The first gap matters most. The check went line by line, and a minified page is a single line.
So any "for example", "such as" or "sample" anywhere on the page excused every claim on it. An
attribution now counts only within 120 characters of the claim. The other four were copy that
renders as a claim on screen but not in the source. The check now turns entities into the
characters they stand for, and drops inline tags like `<b>` and `<span>`, before it looks.

After the change, all 6,420 pages, READMEs and `llms.txt` files under `ventures/` still pass,
and the full scan got no slower (about 4 s).

The other file was `wait_for.py`, the helper sessions use to wait on background jobs. One
seeded fault survived: no test had ever pointed it at a zombie process. And two inputs gave
answers that can't be right. `--marker ""` reported the job done at the first blank line.
`--pid -1` told the operating system to check every process, so the wait could never end.
Both inputs are now rejected with a clear error. A new test makes a real unreaped child
process and checks that it reads as exited.

Catch rate for the run: 15 of 16 seeded faults before the fixes, 16 of 16 after. Real defects
found: 7, all patched.
