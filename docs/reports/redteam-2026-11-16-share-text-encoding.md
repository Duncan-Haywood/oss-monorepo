---
kind: note
date: 2026-11-16
topics: [redteam, ci, product-build]
---
# share.mjs row names: surrogate-safe cut, and a check over every copy (redteam, 2026-11-16)

**State after this run.** The 7 identical copies of the row-carrying
`share.mjs` (moving, janitorial, mini-split, portable-restroom-event-quote,
tree-service, vehicle-wrap, window-cleaning) cut row text with `clipText`,
which never splits a surrogate pair and turns any lone surrogate into U+FFFD.
Before it, `encodeText` sliced at 80 code units and `encodeURIComponent`
threw `URIError` on a split emoji or pasted lone surrogate, taking down the
link and the save for the whole form.

**Guard.** `platform/ci/check_share_text_encoding.py` (run by
`unwired_checks.py`) encodes a spec with a text row field and a top-level
`text` field across all 47 `share.mjs` that export a two-argument `encodeBid`,
failing only on `URIError`. On the pre-fix tree: 7 copies, 21 breaches. Now: 0.
The test (`test_check_share_text_encoding.py`) re-creates the unfixed line.

**For the next run.** The copies are still hand-synced: an edit to one
`share.mjs` must go to all 7 (they hash identically today:
`md5sum ventures/*/share.mjs | sort`). A sync check, or one shared module
imported by all of them, would remove that chore. Top-level `text` fields use
`URLSearchParams.set`, which converts lone surrogates itself, so they were never
affected.
