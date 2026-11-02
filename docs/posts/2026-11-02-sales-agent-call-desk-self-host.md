---
title: "The self-hosted sales agent now helps before and after calls"
seo_title: "Self-hosted AI sales agent: call prep, follow-ups and voice notes"
date: 2026-11-02
tags: [sales-agent, self-hosting, voice, honesty]
description: "The Sales Agent approval queue gained a Call desk: prep briefs, follow-up drafts and optional dictation, all from the replies your own mailbox already holds."
---

The self-hosted Sales Agent reads your own mailbox, drafts replies for you to approve, and never sends without a click. Until now its call prep and follow-up drafting lived on the static page and a JSON API. Today the approval queue itself has a **Call desk** section.

Type a prospect's email and press *Prepare the call*: you get a brief built from their replies, the prospects table and the suppression list, with a stop warning first if they asked not to be contacted. After the call, paste or dictate notes and press *Draft the follow-up*. Dictation and read-aloud use the browser's own speech tools and are feature-detected; the agent records and stores no audio.

What is not tested: a real microphone, real browser speech, and a real mailbox. The tests cover the page, the token gate on the voice module, and the script's syntax. A first version of the page script shipped with a quoting bug that the syntax check caught before merge, so that check is now a test.

Code: `ventures/sales-agent/self-host/agent.mjs`.
