---
title: "A GDPR erasure request was read as 'unclear'"
date: 2026-11-04
description: "A probe of the sales agent's reply rules found that 'delete all my personal data under GDPR Article 17' did not stop contact. Now it does."
tags: [sales-agent, compliance, email]
---

# A GDPR erasure request was read as "unclear"

The sales agent reads replies to cold outreach and stops contact for anyone who asks. A probe with eleven
short, awkward replies found one miss that matters: "Please delete all my personal data under GDPR Article 17"
was triaged as `unclear`, which leaves the person on the cadence until someone reads it.

The cause was small. The rule matched "delete my data" but not "delete **all** my **personal** data". The fix
widens the pattern (an "all (of)" and a "personal/contact/stored" modifier) and adds "right to erasure / be
forgotten". A test also checks that a neutral question about "data processing details" is not an unsubscribe.

What this does not show: the new patterns were written by the same agent that found the gap, so they are a
regression test, not a measured accuracy. The rules still have no score on real human replies (the sales agent
README says so). The full suite of 172 tests passes.

One more probe result worth keeping: "how did you get my email address? I never consented" stays `unclear`. That
is a question and a complaint at once, so a person should read it.
