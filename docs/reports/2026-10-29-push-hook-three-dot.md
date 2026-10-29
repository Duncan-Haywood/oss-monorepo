---
title: Push hook now diffs from the merge base
description: The pre-push post check flagged posts main had already fixed; a three-dot diff limits it to posts this branch changed.
---
`.claude/hooks/check_posts_before_push.py` diffed `origin/main` against `HEAD`
(two-dot). When main fixed another session's bad post after the branch forked,
the branch's stale copy showed as modified and blocked the push (doc_friction,
2026-10-29T01:09 and 01:11). It now uses `origin/main...HEAD`, so only posts
this branch changed are checked. Verified: hook exits 0 on a clean branch;
`promptctl validate` passes. Not covered: a compound `commit && push` still
blocks as one call, so run the fix and the push separately.
