---
title: "Dictate your call notes, hear the brief: voice in the Sales Agent page"
date: 2026-11-01
tags: [sales-agent, voice, sales]
description: The Sales Agent call section can now take dictated notes and read a call brief aloud, using the browser's own speech tools; the page records and stores nothing.
---

A rep finishes a call and has about two minutes of memory left. Typing nine bullet points is where follow-ups go to die. The Sales Agent's call section now has a "Dictate notes" button: say "they lose about six hours a week on routing, next point, I will send the pricing sheet" and the notes box gets two lines, the second of which the follow-up draft treats as a promise.

The reverse also works. "Read it aloud" speaks the call brief before a call (markdown marks dropped, email addresses spoken as "dana at acme dot example") so it can be heard while walking in.

How it works: the page uses the browser's own speech recognition and speech synthesis, only shows the buttons where the browser has them, and records and stores nothing itself. One honest caveat is printed next to the buttons: in Chrome and Edge, dictation sends the audio to the browser maker's speech service.

What was checked: the text rules (spoken "next point", "period", "comma", capitalising, appending without overwriting) by hand-written tests, and the button by a headless Chromium click with a stubbed recogniser. What was not: a real microphone, accents, noisy rooms. Treat it as a first slice.
