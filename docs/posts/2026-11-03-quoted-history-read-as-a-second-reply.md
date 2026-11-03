---
title: "Our own email, quoted under a reply, was read as an unsubscribe"
seo_title: "Outlook quoted headers in a pasted reply: an AI sales agent bug"
date: 2026-11-03
tags: [sales-agent, email, bugs]
description: "The sales inbox agent split pasted replies at every From: line, so an Outlook-style quote of our own outreach became a phantom second reply. Fixed, with tests."
---

The sales agent reads replies a person pastes in and decides what each one means. It split the paste into messages at every `From:` line. That is wrong for a top-posted Outlook reply, which carries our original email underneath with its own `From: / Sent: / To: / Subject:` block.

The result: "Sounds interesting, can you do Thursday at 3?" was read correctly, and then our own footer below it ("if you'd rather not hear from me, reply stop and I will unsubscribe you") was read as a second message and triaged as an **unsubscribe**. The same happened under `-----Original Message-----`, an underscore rule, and a forwarded-message divider. The effect is a phantom stop on a contact who just said yes, or a suppression entry for our own sender.

`splitAtFromHeaders` in `ventures/sales-agent/engine.mjs` now treats a `From:` as quoted history when it follows one of those dividers or is followed by `Sent:` (also Gesendet, Envoyé, Enviado, Inviato). Real separate messages still split. A new test in `engine.test.mjs` covers the three layouts and the unchanged split; all 150 tests in the venture pass.

Limits: found by probing with hand-written Outlook layouts, not from a real mailbox, so other clients' quote headers may still slip through.
