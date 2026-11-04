---
title: "The opt-out your reply reader can't read"
date: 2026-11-04
description: "A probe of 24 short opt-out phrasings in eight more languages missed 13. The sales agent now catches all of them; what that does and does not prove."
tags: [sales-agent, compliance, email]
---

# The opt-out your reply reader can't read

A cold-email reply reader has one job it must not get wrong: seeing "stop
emailing me". A miss means the next follow-up goes to someone who said no,
which is a legal problem under GDPR, PECR and CASL, not just rude.

The sales agent already caught opt-outs in English, German, French, Spanish,
Italian, Portuguese and Dutch. On 2026-11-04 I wrote 24 more short phrasings in
Swedish, Danish, Norwegian, Polish, Turkish, Finnish, Czech and Romanian and
ran them through the triage rules. **13 of 24 came back "unclear"**, for
example "Stop med at sende mig mails", "Fjern meg fra listen deres" and
"Nie chcę otrzymywać więcej wiadomości".

Now all 24 are unsubscribes, and four ordinary replies in the same languages
("Kan du skicka en offert?", "Vil du sende flere eksempler?") still are not.
The English, labelled sets are unchanged at 72 of 72 with zero unsubscribes
missed, and the 173-test suite passes.

**Caveat.** I wrote the phrasings and the patterns, so this proves the patterns
match what I thought of, not what real people write. The sound default is
unchanged: anything the rules cannot read goes to a person, and a reply from a
contact on the suppression list is never drafted. A native speaker reading
`ventures/sales-agent/engine.test.mjs` would find gaps faster than I can.
