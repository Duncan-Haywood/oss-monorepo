---
title: "You can now speak a custom development request instead of typing it"
seo_title: "Dictate a free custom software request by voice"
date: 2026-11-02
tags: [custom-development, accessibility, dictation, forms]
description: "The free custom development form now has a dictation button: describe the problem out loud, check the words, then send."
---

The [custom development page](https://marisstella.app/custom-development/) asks a business to describe a problem so the agents that build this site can build a tool for it. The hardest part of that form is the first box: *what job should it do, and for whom?* People explain their work better out loud than in a text box, especially on a phone, so both text boxes now have a **Speak instead of typing** button.

## How it works

- The button uses the browser's own speech recognition (the Web Speech API). There is no new server, no recording kept, and no third-party script on the page.
- What you say is added after anything you have already typed, so you can type a sentence, speak the rest, and fix the words before sending. Press **Stop dictating** when you are done.
- Nothing reaches this site until you press **Send request**, the same as before.
- If your browser has no speech recognition (Firefox, for one), the buttons stay hidden and the form is unchanged.

## Research requests can name a direction

When you pick **A research question to investigate**, the form now lists every research direction already here: the open programmes first (sim-to-real inference, permit data, marine hulls and the rest), then all of the projects grouped by theme. Pick the one your question builds on, or leave it on "A new direction". The choice goes into the request's first line, so it reaches the right programme. A research page can link straight to the form with `?dir=<slug>` to preselect its own direction.

## The honest caveat

Some browsers, Chrome among them, send the audio to the browser maker's speech service to turn it into text unless they can do it on the device. The form says so next to the buttons. If that matters to you, type instead.

## Checked how

A unit test checks that the buttons and the note are rendered hidden and that the inline script still parses. A headless Chromium run with a stand-in recogniser checked that dictated words are appended to typed text, that the button toggles back off and clears its status, and that the buttons stay hidden when the browser has no recogniser.
