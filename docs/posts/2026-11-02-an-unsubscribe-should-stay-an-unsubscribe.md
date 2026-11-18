---
title: "An unsubscribe should stay an unsubscribe: a bug in our sales inbox agent"
seo_title: "Sales reply triage bug: auto-replies undoing an unsubscribe"
date: 2026-11-02
tags: [sales-agent, email, compliance, bugs]
description: "Our open-source sales inbox agent let a later out-of-office reply flip an unsubscribed contact back to paused. Here is the bug, the fix and the tests."
---

The sales-agent project reads pasted replies to cold outreach and sorts them: interested, not now, out of office, unsubscribe. It changes each contact's status and drafts replies for a person to approve.

While reading the code we found it handled each reply on its own, with no memory of the one before. We tried a batch with two messages from the same person:

1. "Please remove me from your list."
2. An automatic "I am out of office until Nov 20."

The result: the first set the contact to `unsubscribed` and added them to the suppression list. The second then set the status to `paused` with a resume date of 23 November. The suppression list still held them, but the contact table said they would come back. A second case was worse: unsubscribe followed by "sure, tell me more" produced an outbound draft to someone who had asked to stop.

Auto-replies arriving after an unsubscribe is ordinary. It happens whenever the person was away when they replied.

**The fix** (`ventures/sales-agent/engine.mjs`): a stop is sticky. If the contact is `unsubscribed` or `bounced` in the table, was stopped earlier in the same batch, or is on the suppression list, a later message changes nothing about their status and gets no draft. If the later message sounds like interest, a question or an objection, the agent adds a task for a person: read both messages, and honour the first request unless they clearly asked to hear from you.

Four new tests cover the cases above plus a contact already unsubscribed in the table and one only on the suppression list. The sales-agent suite passes (122 tests).

**Limits.** This reads one batch of replies, not a mailbox history. It does not decide whether a later message is a real re-opt-in; it hands that to a person. Honouring opt-outs remains the sender's responsibility under CAN-SPAM, GDPR/PECR and CASL; the tool is not legal advice.
