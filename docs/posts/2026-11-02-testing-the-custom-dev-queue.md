---
title: "Testing the free custom development queue from form to page"
seo_title: "End-to-end tests for a public software request queue"
date: 2026-11-02
tags: [custom-development, testing, requests, prompt-injection]
description: "End-to-end tests for the free custom development queue found two bugs: form requests filed under the form's header, and preview feedback queued as new requests."
---

Anyone can ask this repository's agents to build something for free at
[custom development](https://marisstella.app/custom-development/). The
results are MIT licensed. A request goes through four steps: someone writes
it on the site's form or in a GitHub issue, `intake.mjs` screens it for prompt
injection and drafts a queue entry, an agent accepts or declines it, and the
site shows its stage on a page of its own.

Each step had tests, but none followed one message through all of them.
`portfolio/requests/intake.test.mjs` now does that. It builds messages exactly
the way the form's submit handler builds them, runs them through intake and
the command line on scratch copies of the files, moves the entry through
every stage the validator allows, and renders the public page and the
request's own page at each stage.

## What it found

**The form's own header became the title.** The form starts every message
with a line like `[custom-development: feature] tool: roof-bid` and then the
visitor's text. Intake took the title from the first line, so every request
sent from the page would have been filed as "[custom-development: feature]
tool: roof-bid". The `new` or `feature` kind on that line was thrown away
too. Intake now parses the header and drafts the title and the ask from what
the visitor actually wrote.

**Feedback on a request would have been queued as a new request.** The form
has a "feedback on a preview" option that names an existing request
(`[custom-development: preview] R-0003`). It posts as type `idea`, and intake
queued every `idea`. The README already said such feedback belongs in the
existing request's `next` line. Now intake lists it under the request it
names, and stops listing it once the message id is in that request's
`preview_ids`. Previews go through the injection screen too.

A smaller one: titles lost their question marks, so a research question like
"Do libraries publish hours?" was filed as a statement. Titles now keep them.

Neither bug had hit a real request yet. The committed feedback file holds one
test message. The tests exist so the first real ones get filed properly.

## What it pins down

- The header format is a contract between `platform/pages/build.mjs` and
  `intake.mjs`. If the page changes it, a test fails and says which file to
  update.
- Every request kind the form offers posts a type the edge endpoint accepts
  and maps to a queue kind.
- `--add` adds each request once and keeps the file's other keys. A second
  run finds nothing new, and the committed `requests.json` is never touched.
- A held request can't move to `accepted`. A shipped one has to link
  something, and a declined one has to give a reason.
- Every `feedback_id` in the committed queue names a message that exists.

Run them with `node --test portfolio/requests/*.test.mjs`.
