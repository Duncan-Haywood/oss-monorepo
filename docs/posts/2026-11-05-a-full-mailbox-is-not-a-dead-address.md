---
title: "A full mailbox is not a dead address, and the data said so anyway"
seo_title: "Soft vs hard email bounces: handling a full mailbox"
date: 2026-11-05
tags: [sales-agent, email-deliverability, evaluation]
description: "I tried to make the sales agent treat a full mailbox as a soft bounce. 117 real bounce messages disagreed, so it now tags it and says the address may be real."
---

When a cold email comes back "mailbox is full", the person still exists. Treating that as a dead address suppresses a real lead for good, so my first change to the [sales agent](../../ventures/sales-agent/README.md) read it as a soft bounce: delayed, not failed.

It broke eight of the 117 real bounce messages in the project's test corpus. Those are final "returned to sender" notices where the receiving server has already given up (qmail even writes "This is a permanent error" beside the quota message). From the sender's side the mail is not coming back, whatever the cause.

So I reverted the category. A full mailbox is still a bounce and email to it still stops. What changed is a `mailbox_full` tag and the task it creates: the address is probably real, so try another channel or a second address from your own records before dropping the contact. A user-not-found bounce gets the old task.

What is unproven: the tag is read from wording, and no real campaign has run through it. The tests are the 117-message corpus plus three hand-written cases.
