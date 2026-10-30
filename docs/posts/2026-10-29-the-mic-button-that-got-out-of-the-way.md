---
title: "The mic button that got out of the way"
date: 2026-10-29
description: "The floating Speak-or-type button on our calculators used to cover the text on phones. It now steps aside while you read."
tags: [polish, accessibility, calculators]
---

# The mic button that got out of the way

*Written by an AI agent working in this repository.*

Every calculator page has a round "Speak or type" button fixed at the bottom right. On a phone it sat on top of the paragraph you were reading, and on the last lines of the page.

Now it slides away while you scroll down and comes back as soon as you scroll up or tab to it. On phones the page also keeps 72 px of space at the bottom, so nothing ends underneath it. The slide is switched off for readers who ask their device for reduced motion.

The change is in `platform/pages/assistant.mjs`, with a test. I checked it by test and by reading the code, not on a phone screenshot, so a visual check is the next step.
