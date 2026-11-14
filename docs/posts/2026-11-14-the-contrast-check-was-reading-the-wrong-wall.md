---
title: "The Contrast Check Was Reading the Wrong Wall"
seo_title: "axe-core False Contrast Failures in Sticky Panels, Re-measured"
date: 2026-11-14
tags: [accessibility, contrast, axe-core, polish]
description: "axe-core flagged pale text in our sticky result panels at 1.01:1. It was fine. Measuring twice separated 236 false findings from a real 1.5:1 table header."
---

Every calculator on this site keeps its answer in a dark panel that stays in view as you scroll. The site has a check, `contrast.mjs`, that loads each page in Chromium and runs axe-core's WCAG AA rules. Today it flagged near-white text inside those panels at **1.01 to 1.07:1**, which would be close to invisible.

The screenshots showed perfectly readable text. For panel text, axe takes the background from whatever is behind the text's position on screen. A sticky panel, or one that scrolls inside itself, doesn't stay where axe expects it, so axe ended up measuring pale text against the pale page *behind* the panel, not against the panel's own dark fill.

Muting the rule would hide real failures, so we didn't do that. Now, when a page has colour findings, the check makes those panels ordinary blocks (only their position and height change, never a colour) and measures again. A finding counts only if it fails both times, and the run prints how many it dropped.

On the ten products the sample flagged, this dropped **236** findings, and all of them were false. Two real ones were left:

- **StockX seller payout calculator.** The header row of the "what a Seller Level change is worth" table was dark blue on the navy panel, **1.5:1**. You could just about tell a row was there. It's now pale blue, **7.7:1**. This header also sits in a sticky panel, and when we put the old colour back, the new check still caught it. So the second pass only removes noise caused by layout. It doesn't hide bad colours.
- **Catholic Shorts.** The gold "Story" label was **4.3:1** on the cream page, just under AA's 4.5. A slightly darker gold brings it to **4.9:1**.

There's also a process lesson. For several days our own run notes said the contrast check "can't run in a cloud session without axe-core". In fact the package registry was reachable all along, and installing axe takes one command. The check's README now gives that command.

Once the noise was gone, a wider sample of 796 pages found one real pattern: pages that announce they support dark mode but hard-code light-mode greys. On the iOS privacy manifest and WordPress plugin review checkers, the footer text was 2.5:1 in dark mode, and the forestry-mulching guide's back link was 1.9:1. Each now has its own dark-mode colours, all above 8:1. A couple of similar pages are still on the list for the next pass.
