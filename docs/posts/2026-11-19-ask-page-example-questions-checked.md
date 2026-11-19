---
title: "The Ask page's privacy answer came with a sleeve-length tool attached"
seo_title: "Testing an on-page assistant's example questions in a real browser"
date: 2026-11-19
tags: [site-design, polish, assistant, search, testing]
description: "A browser check now taps each example question on /ask/. Its first run it found the privacy answer trailed by five unrelated links, matched on 'does' and 'my'."
---

The [Ask page](https://marisstella.app/ask/) offers three example questions under its greeting. Tap one and the site's assistant answers with the default engine: no AI model, just the site search plus the page's own words. Until today someone checked those three answers by hand, once, when they were written.

Now a script does it. `platform/pages/ask-suggestions-check.mjs` opens the built page in Chromium at phone width, taps each question and reads the reply. It fails if the reply says "I found nothing", if it has neither a quote from the page nor a tool link, or if it misses what the question should find (a roofing link for the roofing question, say). It takes about two seconds.

**What it found on the first run.** All three questions got answers, so a simple "is it empty" test would have passed. But "Does what I type leave my device?" quoted the right answer from the page's FAQ and then listed five tools under it:

- Where does the sleeve end on my arm?
- Why does my semver range skip prereleases?
- Does my job qualify for "no tax on tips"?
- Why Does My Text Bill as Multiple SMS Segments?
- Does a smaller box cut my WFS fee?

None has anything to do with privacy. The reply was 1,740 px tall on a phone. The answer itself took 520 px of that.

**Why.** The site search ignores "what", "which" and "how", but not "does", "my", "can" or "much". In a search box that's fine: people type short phrases, often a tool's title. A typed question almost always has those words, and here they matched 2,204 entries. The ones that scored highest were titles that start "Does my…".

**The fix, for the assistant only.** Its search now drops those question words. A related tool also has to match properly: one of your words in its name, plus another anywhere. Two common words that happen to appear in a long description, like "type" and "leave" in a chimney sweep calculator, no longer count. When the page itself answers the question, only those strong matches are shown. The privacy reply is now just the answer, 640 px tall.

**Did it help elsewhere?** On twelve other typed questions, 7 got better top results, 3 stayed the same, 1 got slightly worse and 1 was mixed. "How much should I charge to mow a lawn?" used to lead with sealcoating, drywall and chimney sweeping. It now leads with a lawn mowing pricing guide and the Lawn Care Bid Calculator. "How much do I need to retire?" used to start with "How much rib knit does a hoodie run need?" and now starts with a retirement planner. "How do I price a bathroom remodel?" was poor before and after: there's no bathroom tool, and the list changed from one wrong set to another.

One idea I tried and dropped: also ignoring "tool", "tools" and "free". The roofing question then lost "Free tools for roofing, gutter and siding contractors", its best answer.

The check, its expectations and the ranking are open source (MIT) in [`platform/pages/`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/platform/pages): `ask-suggestions.mjs`, `ask-suggestions-check.mjs` and `assistant/fill.mjs`. The full notes and the per-question tables are in [the polish report](../reports/polish-2026-11-19-ask-suggestions-check.md).
