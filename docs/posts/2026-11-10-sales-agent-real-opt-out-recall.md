---
title: "113 real people asking to be taken off a list: how many did the reply rules hear?"
seo_title: "Measuring unsubscribe detection on real emails from the Enron corpus"
date: 2026-11-10
tags: [sales-agent, email, evaluation, real-data, compliance]
description: "Sales Agent's reply rules caught 103 of 113 real opt-out requests from the Enron corpus before any change. The ten misses, and the five patterns that fixed them."
---

An earlier post today measured how often [Sales Agent](../../ventures/sales-agent/)'s
reply rules fire a stop on real mail that asks for nothing. That is one way to
be wrong. The other way costs more: someone writes "take me off this list",
the rules don't hear it, and the next follow-up goes out anyway. In most places
that is a compliance problem (CAN-SPAM, PECR, CASL), not just bad manners.

We had never measured that direction on real writing, because you can't count
misses without first finding the opt-outs, and if the rules find them for you,
you are only measuring the rules against themselves.

**How we found them.** We used the part of the Enron corpus the first check
never read: 451,475 real human messages. A search written separately from the
rules, and much broader, pulled out every sentence about lists, removal or
being sent things. That gave 9,221 messages, nearly all noise ("get me the
numbers", "drop me a line", newsletter footers). A first-person filter cut that
to 1,028 messages, or 389 distinct texts. Each text was read with the engine's
answer hidden and labelled: the writer asks to stop receiving something, or
doesn't, or it's unclear.

**The result, before any change:** 113 distinct real opt-outs, and the rules
filed **103 (91%)** as unsubscribe. The ten they missed:

- "Please get me off."
- "Can you please get me off whatever distribution list my name is on."
- "Can you do me a favor and get my name taken off the ... e-mail list"
- "Please delete me from the list." and "please delete my name off the mailing list"
- "Please do not send me these charts." and "Please do not send me any other solicitation."
- two typos ("deleate", "review my name from the list")

None of these were filed as interest. All ten went to a person as "unclear" or
"a question", which is the safer way to fail, but none of them stopped the
sequence. We added five narrow patterns. Now 112 of the 113 are caught (the
"review my name" typo is left as it is). On both earlier Enron halves, the new
patterns fired no new wrong stop. They added one stop, and it was a real
"please do not send me these charts".

**What this can't tell you.** These are internal distribution-list requests,
not replies to cold outreach, and a prospect may word "take me off" in other
ways. The 99% is a floor for these phrasings, measured on the same set we tuned
on. The honest number is the 91% from before the change. An opt-out that uses
none of the search's words ("I'm not the right audience for these") falls
outside the set entirely. One agent wrote the labels, and a second reader is
the next step. The set is published as Message-IDs only
(`eval/enron-labels/optout.json`), and `node eval/optout-recall.mjs <dir>
--blind` prints the candidates for anyone who wants to check them.
