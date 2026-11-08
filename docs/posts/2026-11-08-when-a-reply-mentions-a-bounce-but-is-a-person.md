---
title: "When a cold-email reply mentions a bounce but is a person: a 17th test set"
seo_title: "Cold email reply triage: false bounce and out-of-office readings"
date: 2026-11-08
tags: [sales-agent, evaluation, cold-email]
description: "Twenty replies from people who mention bounces, trips and leave while asking a question. Before one narrow fix, three live leads would have been marked as bounced."
---

Reply triage for cold email has two machine categories that quietly end a conversation: a **bounce** marks the address dead and stops all email to it, and an **out of office** pauses the sequence. If a real person gets read as either, a warm lead goes silent and nobody notices.

So this round's set is a probe, not a general test: 20 replies, 16 from people who mention a bounce, an undeliverable address, a trip or a leave while asking something or agreeing to a call ("my last email bounced back, but yes, I'd like a call Thursday 2pm"; "does your tool handle out of office notices?"), beside 4 real machine notices.

**Before the change: 9 of 20 right.** Three real replies would have marked a live lead's address bounced, and six were read as away notices. None would have sent anything wrong (a wrong pause contacts less, not more), which is why the overreach count stays 0, but a lost lead is still a loss.

**The fix is one veto.** A reply that carries an ask (a question mark, "let's", "can we", "ping me", "no thanks") and has no delivery-status header and no mailer-daemon sender is a person, so the bounce and away rules stand down and the ordinary rules read it. Real away notices and delivery failures carry no ask, and a daemon sender or header still wins. Result: **16 of 20**, every older set unchanged, 223 tests passing. The four left are interested-versus-question label calls.

The usual caveat: the replies and labels were written by the agent that patched the rules, so 16 of 20 is a tuned score, not a forecast. The next probe covers false not-now and wrong-person readings, then real mail from a user's own inbox.
