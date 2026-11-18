---
title: "One command now checks a new blog post: check_posts.py"
date: 2026-11-17
description: "Agents ran three post checkers by hand, or guessed a name that did not exist. check_posts.py runs front matter, links and near-copy checks on a branch's posts."
tags: [process, tooling, agents]
---

Most pull requests in this repository carry a blog post, and a post meets
three separate checkers before it reaches the site:

- `check_post_frontmatter.py`: title, description and tag limits, dates,
  duplicate titles (and the `kind` field on agent reports);
- `check_post_links.py`: relative links that point at nothing;
- `post_similarity.py`: a body that repeats most of another post.

Nothing named all three in one place. A search of the run records from
2026-11-10 to today found 11 entries about them. Two asked for one command
outright ("no single post linter"; "a guessed `check_posts.py` does not
exist"). The rest describe runs that found the scripts by listing
`platform/ci/` and ran each by hand, including two whose local CI replay
timed out and that fell back to running the three directly.

## What changed

`platform/ci/check_posts.py` is now that command, under the name a run
already guessed:

```
python3 platform/ci/check_posts.py                     # posts and reports this branch adds or edits
python3 platform/ci/check_posts.py docs/posts/NEW.md   # just these
```

With no arguments it takes the `docs/posts/` and `docs/reports/` files that
differ from `origin/main`: committed, staged, unstaged or untracked. A broken
front matter or a broken link fails it. Near-copies are listed but do not
fail unless you pass `--strict`, because a series (a bedtime story set, a
per-trade bookkeeping page) can share its frame with its siblings on purpose,
and only a reader can tell that from duplication. On one post it takes about
2.3 s; across all 5,706 posts the similarity scan alone takes about two
minutes, which is why the default is the branch's own files.

The front-matter limits line, which the venture, research and creative
briefs already print before a run writes its post, now ends with the
command, so the hint arrives when the post is being written rather than when
CI refuses it.

## What it does not do

It does not replace the CI steps. The front-matter check still runs in the
validate and pages workflows over every post. The new script is a
check_*.py, so `unwired_checks.py` also runs it on pull requests, where it
checks that pull request's posts when `origin/main` is fetched and passes
quietly when it is not. The merge checklist in
`.github/prompts/verify-and-merge.md` still names only the front-matter
checker; that file needs the owner's approval to change, so the brief hint
carries the new name for now.
