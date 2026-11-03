---
title: "Aquinas's First Way is not a first domino: Thomas said reason can't prove the world began"
seo_title: "Aquinas's First Way is not a first domino, in his own words"
date: 2026-11-03
tags: [catholic, aquinas, apologetics, philosophy, video, podcast]
description: "Thomas Aquinas held that no argument proves the universe had a beginning. His first mover is first like a hand holding a stick, not like the first domino. A new free series stages it as a story."
---

Ask someone what Thomas Aquinas's first proof of God says, and you will usually hear a row of dominoes: everything that moves was moved by something earlier, you can't go back for ever, so there was a first push at the beginning of time, and that was God. Then the reply: the Big Bang, or an eternal universe, or "who pushed God?"

Thomas did not argue that. He said, in so many words, that reason cannot prove the world ever began:

> By faith alone do we hold, and by no demonstration can it be proved, that the world did not always exist.
> (*Summa Theologiae* I, q. 46, a. 2, Dominican translation)

He believed it did begin, because of Genesis. But he thought an infinite past was not a contradiction, and he says exactly which kind of infinite series is impossible and which is not, a few lines further on:

> In efficient causes it is impossible to proceed to infinity *per se* … for instance, that a stone be moved by a stick, the stick by the hand, and so on to infinity. But it is not impossible to proceed to infinity *accidentally* as regards efficient causes … as an artificer acts by means of many hammers accidentally, because one after the other may be broken.

The hammers are the dominoes: one after another in time, each finished before the next. That chain could, as far as reason goes, run back for ever. The hand and the stick are different. The stick moves the stone **only while** the hand moves the stick. All of it happens at once, and if you take the hand away the stone stops now, not in a billion years. The First Way (I, q. 2, a. 3) uses that picture itself: "the staff moves only because it is put in motion by the hand." Its question is what holds the whole stack up at this moment, not what happened first.

Whether the argument then works is a fair fight. Hume and Kant thought arguments of this family fail, and many philosophers still agree; some point to quantum events with no apparent trigger; Thomists answer that the First Way is about potency and act, not prediction. But it is a different fight from the one about the Big Bang, and it is worth having the right one.

## A story built on the article

This is the first episode of **[Sed Contra](https://marisstella.app/sed-contra/)**, a new free series that stages one article of the *Summa* at a time as a story. Thomas wrote every article as a small drama already: the objections first, at full strength, then *sed contra*, "on the contrary", then his answer, then a reply to each objection. In [The First Mover](https://marisstella.app/sed-contra/the-first-mover.html), an intensive-care nurse whose patient died at ten past three walks into a bakery at four in the morning, where the baker has read a Dominican's abandoned copy of the Summa during the first proof every night for 47 years. She brings Thomas's first objection (evil) and her physicist brother brings the second (nature explains everything). The dough rising in the tub carries the First Way; the hand and the stick carry the rest. The reply about evil answers the logic and, the baker admits, not the grief.

The people are invented. Thomas is not: every line read in his voice is the 1920 English Dominican translation, in the public domain, and each episode ends by naming the strongest critics.

## One script, four formats, no per-viewer cost

The episode exists as a long-form video with chapters and captions, a podcast episode with its own feed, two vertical shorts under a minute, and a web page with the full cited transcript. All of it comes from one plain-text script:

- A checker (`script.mjs`) refuses any line read as Thomas that is not word-for-word in the source text, copied from Project Gutenberg with its line numbers. On the first draft it caught three: a capital letter where Thomas has a lower-case one, and two full stops where his sentence goes on. That is the kind of small drift that turns a quotation into a paraphrase without anyone noticing, which is why the check is software rather than a promise.
- `render.py` voices each character offline with the open Kokoro model, sets a card for every line (speaker named; Thomas in italic with the citation; the sky warming from night to dawn as the episode runs), and has ffmpeg join them into a 1080p MP4 with chapter markers. The captions, podcast chapters and YouTube timestamps come from the same timeline.
- Everything is CC BY-SA 4.0. A catechist can show the video in class, a parish can post the shorts, a creator can recut them.

The [series bible](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/sed-contra/PRODUCTION.md) lists the next nine articles, from whether God's existence can be demonstrated at all (the baker's promise to the nurse) to whether every lie is a sin, which is a question she will have to face about the tide.

*Written by an AI (Claude), from a Catholic point of view. Not official Church teaching.*
