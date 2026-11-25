---
kind: note
topics: [security-alerts, ci]
date: 2026-11-25
---
# The 1,243-alert security queue is one scan behind the backlog fix

Date: 2026-11-25, about 02:40 UTC. For the next session that reads `QUEUE.md` on the
`security-alerts` branch.

## What the queue showed

1,243 open alerts (1,183 high, 60 medium), headed by `py/clear-text-storage-sensitive-data`.
PR 18676 reported the same backlog cut from 1,231 to 40 the day before, so the two disagree.

## Why

- The only CodeQL run on `main` that has **finished** is run 11, at commit `e98ec5cbb`
  (started 00:54 UTC, done 01:58 UTC: about an hour). Every later push run (runs 15 to 150)
  was cancelled while pending, because the concurrency group keeps one running run and one
  pending run, and each new push replaces the pending one. That is by design for push runs:
  a scan still completes about once an hour.
- PR 18676 merged at `1070ed690` (01:12 UTC), after `e98ec5cbb`. So every alert in the queue
  comes from the code *before* the fix.
- Of the 748 files the queue names, 726 were changed by PR 18676. The other 22 are the
  documented false positives in `2026-11-24-codeql-backlog-cleared.md`, plus the few fixed or
  reviewed here.
- Run 116 (commit `5f857bb`, after the fix) started at 01:57 and should finish around 03:00;
  the hourly queue job then drops what it closed.

## Check before fixing an alert

`security_alerts.py` now writes the analysed commit into `QUEUE.md` and each alert file
(the alerts API's `most_recent_instance.commit_sha`). With it:
`git diff --stat <commit> origin/main -- <path>`. A changed file may already be fixed; its line
numbers may have moved. Wait for the next main scan rather than re-fixing it.

## Fixed here (files PR 18676 did not touch)

| Alert | File | What it was |
|---|---|---|
| #997 `js/prototype-polluting-assignment` | `platform/aws/stacks/site/deploy/emulate.mjs` | Real. The CloudFront emulator built the query object with `qs[k]` on a plain `{}`: `?__proto__=a&__proto__=b` set `multiValue` on `Object.prototype` for the whole process, and a lone `?toString=1` was misread as a repeat. Now grouped in a `Map` and built with `Object.fromEntries` (own properties only). Test added. |
| #574 `js/bad-tag-filter` | `platform/distribution/webext.mjs` | Real. `</script >` (valid HTML) did not end a script, so the packager's network and inline-handler checks read the wrong span. The end tag now allows `\b[^>]*`. Test added. |
| #274 `js/incomplete-multi-character-sanitization` | same | The inline-handler check stripped scripts once; it now repeats until nothing changes. |
| #275 same rule | same, the rewrite at line 59 | Probably a false positive: that `replace` is a transform that keeps `<script` tags on purpose, not a sanitiser, over our own built pages. If the next scan still reports it, dismiss it. |

## Looked at, left for the next scan to confirm

- #94 `js/insecure-download`, `ventures/source-map-leak-check/probe.mjs`: the tool reads a site the
  user names, `http://` included, to report source-map leaks; it executes nothing it downloads.
  False positive.
- #1065, #1069 to #1072, #1075 to #1079 `js/incomplete-hostname-regexp` in test data
  (`sshd-config-check`, `subpath-robots-check`, `einvoice-preflight`) and `audio-cdn.mjs`'s
  `CDN_ORIGIN`: none of the flagged strings reaches a `RegExp` in the code read here
  (`sshd-config-check` escapes globs; `subpath-robots-check` uses fixed patterns and the host is
  the subject; `CDN_ORIGIN` is only concatenated). Without a local CodeQL run (the CLI download
  was not allowed in this session) the flow could not be traced, so no code was changed.
  The claim branches for these were pushed and could not be deleted through the proxy; they
  expire after 48 hours (`branch_cleanup.py`).
- `platform/security/risk_review.py` (#7, #42, #43): CODEOWNERS, and the gate itself; not touched.
