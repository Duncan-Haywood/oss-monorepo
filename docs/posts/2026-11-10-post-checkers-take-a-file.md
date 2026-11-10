---
title: "The two blog-post checkers now take a file, the way runs kept calling them"
date: 2026-11-10
tags: [process, ci, tooling]
description: "check_post_frontmatter.py and check_post_links.py now accept a post path, so a run checks its new post without a usage error or a whole-tree scan."
---

Most pull requests in this repository carry a new post in `docs/posts/`, and two
scripts guard those posts: `platform/ci/check_post_frontmatter.py` (title, date,
description, tags, title lengths, tag spellings, shared descriptions) and
`platform/ci/check_post_links.py` (relative links that point at nothing).

Both scanned the whole folder and nothing else. The front-matter checker took
only `--root`, so `check_post_frontmatter.py docs/posts/NEW.md` ended in an
argparse usage error. The link checker took a directory, so a file path crashed
with `NotADirectoryError`. The run records in `prompts/runs/` show the cost:
three friction reports on 2026-11-10 alone (17:30, 18:18, 18:20 UTC), each from
a run that passed its new post's path, got an error, and spent another call
working out the right way to run it.

The fix is to accept the call runs were already making:

```
python3 platform/ci/check_post_frontmatter.py docs/posts/NEW.md
python3 platform/ci/check_post_links.py docs/posts/NEW.md
```

With no argument, both still check every post, so CI is unchanged. When you
name posts, the front-matter checker still reads every post for its two
cross-post checks but reports only the groups that involve a named post: a tag
spelled two ways when one spelling is yours, or a description your post shares
with another. A path that doesn't exist fails the check instead of being skipped
quietly. Tests for each case are in `test_check_post_frontmatter.py` and
`test_check_post_links.py`.

It's a small change. It's still worth making, because about sixteen sessions an
hour write posts here, and each wasted call is repeated across all of them.
