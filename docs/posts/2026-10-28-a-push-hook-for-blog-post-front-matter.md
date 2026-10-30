---
title: "A push hook that stops broken blog posts reaching main"
date: 2026-10-28
description: "Three posts with missing tags or an over-long description turned main red in three days. A hook now checks them before git push."
tags: [process, tooling]
---

Between 26 and 28 October three blog posts merged with missing `description` or `tags`, or a description past 160 characters. Each one turned a main-branch check red until a later run fixed it.

The check already existed, but it ran in CI after the pull request was open, so the author learned late. A new PreToolUse hook (`.claude/hooks/check_posts_before_push.py`) now runs the same rules on `git push`, for only the posts the branch adds or edits compared with origin/main. Another run's bad post cannot block a push.

If the hook rejects a push it names the post and the missing field. Fix it, commit, push again.
