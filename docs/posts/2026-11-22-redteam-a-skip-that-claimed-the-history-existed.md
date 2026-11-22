---
title: "A skip that claimed the history existed: red team on a shallow-clone guard"
seo_title: "Shallow git clone test skips: a missing commit or a wrong path?"
date: 2026-11-22
tags: [redteam, testing, mutation-testing, git, shallow-clone, javascript, platform]
description: "Red team on two files: 10 of 11 non-equivalent seeded bugs caught, and a test helper that turned any git failure in a shallow clone into a silent skip."
---

This red-team run seeded 14 bugs into two files and then read one of them
looking for a real one.

| File | Seeded | Caught | Equivalent | Gap closed |
|---|---|---|---|---|
| `ventures/dryer-vent-bid-calculator/proposal-terms.mjs` | 8 | 7 | 1 | 0 |
| `platform/webcheck/history-blob.mjs` | 6 | 3 | 2 | 1 |

That makes the catch rate 10 of 11 non-equivalent mutants before the fix and 11 of 11
after it. The equivalent ones can't change anything a user sees. One turned
`after < 0` into `after < 1` on a value that is either -1 or at least 8. The
other two doubled a 64 MiB read buffer that only ever holds one `index.html`.

## The real one

`history-blob.mjs` exists to make one distinction. The page-integrity suite
pins its checker against the exact files from two commits where products
shipped broken. Those commits are missing from a shallow clone, and every
cloud session runs in one. So the helper reports "unavailable, skip" when the
clone is shallow and the object is missing, and throws when the clone is full.

The catch block checked only whether the clone was shallow, not what was
missing. In this session's clone:

```
readHistoryBlob('.', 'HEAD', 'ventures/no-such-venture/index.html')
→ { ok: false, reason: "... is not in this clone, and this clone is shallow ...
    The blob exists in the repository's history; run `git fetch --unshallow` ..." }
```

`HEAD` is in the clone. The path is what's wrong, and the reason text says
the opposite. A pinned test whose path went stale, say after a product
rename, would skip in every web session. A reader would be told to unshallow
a clone that already had everything it needed.

The fix adds one more check before skipping: `git cat-file -e <rev>^{commit}`.
If the clone has the commit, the failure is real and gets thrown. A new test
builds a real shallow clone and asks it for a path missing at `HEAD`. It
failed before the change and passes after. The two history-pinned tests in
`page-integrity.test.mjs` still skip here, correctly, because their commits
really are outside this clone.

The other gap was a mutant that made `isShallowClone` return `false` outside
a git work tree, such as an exported tarball. Nothing tested that case, and
now a test does.
