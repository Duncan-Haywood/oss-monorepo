---
title: "An empty id swallows webhooks: sixteen seeded faults in a relay and a post composer"
seo_title: "Webhook relay bug: an empty event id dropped later events"
date: 2026-11-12
tags: [testing, mutation-testing, webhooks, redteam]
description: "Sixteen faults seeded into a webhook relay and a post composer, seven caught. The hunt found an empty event id made the relay drop new webhooks."
---

Today's red-team run seeded faults into two files, one at a time
(`redteam.py campaign`: change one constant or flip one comparison, run the
file's tests, put the file back). The tool drew the first file at random. The
second draw was limited to `platform/`.

| File | Seeded | Caught before | Caught after the new tests |
|---|---|---|---|
| `ventures/webhook-relay/relay.mjs` | 8 | 6 | 8 of 8 |
| `platform/distribution/hub/content.mjs` | 8 | 1 | 8 of 8 |

The relay's suite held up well. The two faults that got through were narrow.
Changing one `||` to `&&` in the chain of provider event-id headers meant a
Shopify delivery id on its own no longer counted, and nothing tested any
header except `webhook-id`. The other was the `< 3600` boundary in the
duration label. Both now have a test: each provider header is checked on its
own, and one hour has to read as `1h`.

The content extractor builds social posts from a write-up's own sentences.
Its tests covered the happy path and little else. Seven of eight faults got
through: a top-level `# ` heading being read as a paragraph, every paragraph
(not only the first) getting the lead bonus, a housekeeping line ("This PR
#42 …") being picked as the lead, the strongest limit being dropped, the first
finding missing from the thread, a long post clipping two findings instead of
keeping one whole, and a one-character budget returning a lone `…`. Each one
now has a test that fails with the fault in place and passes without it.

## The real bug

Reading the relay as an attacker would turned up one real defect. When no
header carries an event id, the relay falls back to the body: a JSON object
with string `id` and `type` fields (the Stripe shape) is keyed by that `id`,
so a provider's retry is absorbed rather than delivered twice. An empty
string passed the `typeof j.id === "string"` check, so every such body got the
same key, `route:`. The first event was delivered. Every later event with
`"id": ""` on that route was treated as a retry of the first and dropped. For
a deduplication key that is the wrong way to fail: a missing id should mean
"no dedupe", which is what the code already did when the field was absent.

The fix is one condition (`j.id.trim()` must be non-empty). The test sends
two different bodies with empty ids and checks that both are kept. It failed
before the fix and passes now. No other file in the repository builds a key
this way.

## Limits

Sixteen mutants in two files is a small sample. The rates describe these
two suites, not the repository. All seven open defects from earlier red-team
runs are changes to CI workflows or `prompts/`. Each already has its own
pull request waiting for the owner's approval, so this run did not open
duplicates.
