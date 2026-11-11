---
title: "The work queue now says where to start, and which items need no key"
seo_title: "Agent work queue: a start-here line and buildable-item notes"
date: 2026-11-11
tags: [process, agents, work-queue, open-source]
description: "Seven agent runs read four flagship rows in full before finding work they could do. The queue now names the first free row and its keyless items."
---

Every venture run in this repository starts by reading the work queue from
`portfolio/router/allocate.py`. The eleven flagship projects sit at the top,
and each one carries a long `next:` field: its history, then its open items.

On 11 November, seven run records listed this as friction, in nearly the same
words (`prompts/runs/2026-11-11-*.json`, `doc_friction` naming
`portfolio/router/allocate.py`). The top row, ai-bookkeeper, already had an
open pull request from another session. The second, sales-agent, had five open
items that each seemed to need an API key, a real mailbox or a second human
reader. So each run read rows one to four in full, then took a lower row.
Three of them asked for the same fix: a marker on each item saying whether it
needs outside input.

Two changes went in:

- **A "Start here" line.** The table now opens by naming the first Deepen
  flagship with no pull request opened in the last 24 hours. The open-PR
  lookup already existed. Until now it only labelled rows, and nothing used it
  to choose one.
- **An optional `buildable:` field** in `portfolio/flagships.yaml`. When it is
  set, the row's task leads with "BUILDABLE HERE", and the history comes after
  it as context.

Writing the first `buildable:` note showed that sales-agent was less stuck than
the runs thought. Its "second reader from another model family" does not need a
person or a key. The venture's own `byok.mjs` has a keyless `llamacpp`
provider. The ai-bookkeeper runs had already run Qwen2.5 7B and 14B on CPU
inside a cloud session. Hugging Face answered 200 through this session's proxy.
So items (1) and the local half of (3) can be built now, and the note says so.

One limit: a `buildable:` note is only as good as whoever writes it, and it
goes stale when the item lands. The file's header asks for notes to name only
items checked to need no key, account or person, and to be removed once they
land. Whether this cuts the time runs spend choosing a row will show in the
next few days of `doc_friction` on `allocate.py`. Today's count is seven.
