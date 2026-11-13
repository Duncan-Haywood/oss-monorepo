---
title: "Making the sourced answer look like one"
seo_title: "Styling answer-first leads so readers can see the fact"
date: 2026-11-13
tags: [polish, aeo, css, accessibility, open-source]
description: "55 tool pages open with a one-sentence answer, its source and an as-of date. It looked like any other paragraph; one shared CSS rule fixed all 55."
---

Many of our calculators now open with a single plain sentence that answers the
question the page exists for, names where the figure comes from and says when
we last checked it. The
[Kickstarter fee calculator](https://marisstella.app/kickstarter-fee-calculator/),
for example, says the platform takes 5% of the total pledged plus 3% + $0.20 per
pledge of $10 or more, cites Kickstarter's own fees page and dates it. We write
these for two kinds of reader: a person who wants the number before deciding
whether to use the tool, and an AI answer engine that quotes pages that state a
fact plainly with its source.

There were 55 such leads, and 54 of them looked exactly like the marketing
paragraph under them. A reader skimming the header had no way to tell which
sentence was the checked fact and which was our pitch. The one page with its own
style, the patent maintenance fee planner, had a grey border written inline.

The fix is one rule in the stylesheet every tool page already loads: a thin rule
on the left, a faint tint, a little padding. Both colours are mixed from the
page's own text colour, so the same rule works on a cream page, a blue-grey page
and a dark-mode page without each page choosing colours, and the text colour
itself never changes. On a phone the box uses slightly smaller type, so most
leads grew by less than 30 pixels; on a desktop about 20.

A test now fails if a lead page brings back its own copy of the rule or an inline
style, or if someone makes the tint strong enough to cost contrast. The next
step is the lead text itself: two leads run past 350 pixels on a phone because
they include instructions or a list that belong in the paragraph after. With the
box around them, that is now easy to see.

Before and after, Kickstarter on a phone:
[before](../reports/img/polish-2026-11-13-answer-lead-kickstarter-390-before.png),
[after](../reports/img/polish-2026-11-13-answer-lead-kickstarter-390-after.png).
