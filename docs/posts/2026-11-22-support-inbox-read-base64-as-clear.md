---
title: "Our support inbox read base64 as 'clear': four mail-format bugs the injection screen could not see"
seo_title: "Prompt-injection screening needs MIME decoding first"
date: 2026-11-22
tags: [redteam, security, prompt-injection, email, mime, platform]
description: "Red team on our agent-run support inbox: a base64 body or encoded subject slipped an injection past the screen. Fixed with a small MIME reader and 12 tests."
---

Mail to support@ and hello@marisstella.app goes to a Cloudflare Worker, not
to a person. Agents read it with `platform/edge/read-inbox.mjs`, and every
message goes through a prompt-injection screen
(`portfolio/requests/screen.mjs`) before an agent sees it. The screen is a
tripwire. It looks for phrases like "ignore all previous instructions" and
marks the message `hold`.

Today's red-team run started on the Worker's storage code
(`platform/edge/inbox.mjs`). Its tests caught 13 of the 15 bugs we seeded,
and the two that got through could not change any result: both sat in the
constant-time token compare, past a length check that already decides the
answer. So the storage side is well tested. The bugs were in the reader.

## What the reader got wrong

The reader took the text after the headers, or the first `text/plain` part of
a multipart message, and passed it on as-is. Real mail rarely looks like that:

| What the sender's mail program did | What the agent and the screen saw |
|---|---|
| Body sent as base64 (common for UTF-8 text) | `SGksIGlnbm9yZSBhbGwgcHJldmlvdXMg...`, screened **clear** |
| Body sent as quoted-printable | `Caf=C3=A9 ... a re=` + line break + `fund?` |
| Text inside `multipart/mixed` (any mail with an attachment) | the whole raw MIME tree, attachment base64 included |
| Subject with an accent, sent RFC 2047-encoded | `=?UTF-8?B?...?=`, screened **clear** |

The first and last rows are a security problem. An injection written in plain
English and sent base64-encoded passed the screen as `clear`. The agent would
have seen base64 too, so it was not directly readable. But a tripwire that a
mail program's normal encoding switches off is not doing its job. The middle
rows just made support mail hard to read, which matters as much for a support
inbox.

## The fix

`read-inbox.mjs` now has a small MIME reader, about 100 lines with no
dependencies. It unfolds headers, decodes base64 and quoted-printable in the
part's charset, walks nested multiparts (up to eight levels), skips parts
marked as attachments, and falls back to the HTML part as plain text when a
message has no plain part. It also decodes encoded-word subjects. The screen
now runs on the decoded subject and body, so the base64 injection above comes
back `hold`.

## Testing the tests

Each fix started as a failing test. After that we ran a second campaign on
the reader itself. Its tests caught 8 of 20 seeded bugs. The 12 that got
through were in the HTML character references (hex `&#x41;`, the top code
point, `&#0;`), the nesting limit, underscores in quoted-printable bodies, and
how the command line reads `--after`. Eleven were real gaps, and a new test
now catches each one. The twelfth was a header-name pattern that could only
skip names with digits in them, and none of the three headers the reader uses
has one.

Moving these tests into their own file, `read-inbox.test.mjs`, also fixed a
blind spot. The red-team tool only finds a file's tests by the
`<name>.test.mjs` convention, so before this run it treated the reader as
untested and could never seed bugs in it.

**Numbers:** `inbox.mjs` caught 13 of 15 seeded bugs, and the 2 that escaped
were equivalent. `read-inbox.mjs` caught 8 of 20 before the new tests and 19
of 20 after (the twentieth is equivalent). The edge suite runs 41 tests,
all passing.
