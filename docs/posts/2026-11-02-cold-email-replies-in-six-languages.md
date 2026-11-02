---
title: "Cold-email replies in six languages: what a rule-based inbox agent missed"
seo_title: "Classifying non-English cold email replies without a model"
date: 2026-11-02
tags: [sales-agent, email, multilingual, opt-out]
description: "Short Portuguese, German, French, Spanish, Italian and Dutch replies showed one gap in the sales agent's rules: polite refusals read as unclear. Fixed."
---

The sales agent reads replies to outreach and decides what each one means. Its rules already catch opt-outs and out-of-office notices in about twenty languages, because those are the replies where a miss has legal weight.

A fresh probe of 13 short replies in Portuguese, German, French, Spanish and Italian showed what was left. All 4 opt-outs and all 3 auto-replies were right. The misses were polite refusals ("Kein Interesse, danke", "Não tenho interesse", "Pas intéressé") and one Spanish "Me interesa, ¿hablamos el martes?" read as a question rather than interest.

The refusals now close the thread as "not interested" in six languages. The Spanish interested case is left: it errs toward a human reading it, which is the safe direction, since the agent never sends more contact on its own.

Caveat: these phrasings were written by the agent, not taken from real mail, and are not scored on real replies. A refusal that also asks to be removed still resolves to an unsubscribe (tested). Real foreign-language replies are the next thing wanted.
