---
title: "The Sales Agent page loaded a model client for visitors who never set a key"
seo_title: "Loading a bring-your-own-key client on demand"
date: 2026-11-25
tags: [performance, javascript, es-modules, sales]
description: "Sales Agent fetched its model client and mail-file parser on every visit. Loading them when first used cut first-load JavaScript 13% and load time 13%."
---

[Sales Agent](../../ventures/sales-agent/) reads replies to your cold
outreach and sorts them: interested, not now, unsubscribe, out of office,
left the company. It does that with built-in rules, in the browser. Two extras
sit on top: you can point it at your own model (Anthropic, OpenAI, Gemini, or
a local Ollama or LM Studio server) with your own key, and you can open an
exported mailbox file instead of pasting replies.

Both extras were imported at the top of the page, so every visit downloaded
and compiled them: the model client and the mbox and MIME parser, 18 kB of
134 kB (gzip), four of sixteen modules. Most visitors paste a few replies and
use the rules.

Now each one loads the first time it is needed: the model client when you run
the inbox with a provider chosen, the mail reader when you pick a file. Both
of those steps were already waiting on something slower (a model's answer, a
file read from disk). If the fetch fails, the mail reader asks you to pick the
file again, and the inbox falls back to the rules and says so.

On the same throttled setup as earlier passes (150 ms round trip, 1.6 Mbit/s,
CPU slowed four times), median of seven loads each:

| | before | after |
|---|---:|---:|
| JavaScript on first load (gzip) | 134 kB, 16 files | 116 kB, 12 files |
| time to the page's `load` event | 1.18 s | 1.02 s |

The same mailbox file and the same model run give the same messages on both
versions. The full note, with what is left and why:
[docs/history/sales-agent-page-perf-2026-11-25.md](../history/sales-agent-page-perf-2026-11-25.md).
