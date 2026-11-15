---
title: "Ranking pictures by picking pairs, without uploading a single one"
seo_title: "Pick the best photo or logo by comparing pairs, nothing uploaded"
date: 2026-11-15
description: "Our pairwise ranker now takes photos and design drafts. The pictures never leave the device, yet a team can still combine picks: the file names are the list."
tags: [quick-pick-survey, pairwise-comparison, photos, design-review, privacy, product]
---

[Quick Pick's ranker](https://marisstella.app/quick-pick-survey/rank.html)
turns "which of these two?" answers into a ranked order, with a range for
each place. Until today it ranked words. Plenty of "this or that" decisions are
about pictures, though: the best of forty shots of the same moment, which of
six logo drafts goes forward, which hero image goes on the landing page. So
the ranker now takes 3 to 60 image files.
[How it works, in short](https://marisstella.app/quick-pick-survey/pick-the-best-photo.html).

## The constraint: nothing uploaded

The ranker has no server. A list travels inside the link after the `#`, which
browsers never send, and each person returns a short result code that the
organiser pastes in to combine the team. Pictures don't fit in a link, and we
did not want to start hosting other people's photos, so we kept it that way.

The answer was to make the **file names the list**. When you select pictures,
the page reads their names, cleans them the same way it cleans a typed line,
and sorts them, so the order your file picker returns them in never changes
the list. From then on everything (the list's fingerprint, the shared link,
the result codes, the team combine) works exactly as it does for words. The
pictures themselves stay in your browser's memory as links to your own files.

A teammate who opens your link sees the names and is asked to select the same
files on their own device: a shared drive folder is the easy way. The page
matches the files back by name, ignoring case, and any picture not yet
attached shows as its name, so a half-attached set still works. Reload, and
your answers are still there; the page simply asks for the pictures again.

## What we checked

In a browser at phone width we selected five pictures and a stray `.txt` (the
text file was named as left out, not silently dropped), answered 15 pairs to
a result with thumbnails, then opened the link in a fresh browser as a second
person. Attaching three of the five files told them which two were still
missing; attaching the rest brought up both pictures. Their opposite taste
combined with the first person's code to an agreement of −1.00, as it should.
Seven unit tests cover the name matching and the link round trip.

## What it is not

It does not look at the pictures. There is no AI scoring of sharpness or
smiles; it ranks what *you* prefer, which is the question when the shots are
all technically fine. Star ratings rate each picture on its own; comparing two
at a time keeps the judgement relative. And unlike paid panel polls, the
people answering are you and your team, not strangers.

The code is MIT licensed, in
[ventures/quick-pick-survey](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/quick-pick-survey)
(`site/image-items.mjs`), and the design notes are in
[docs/RANK-PAGE.md](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/RANK-PAGE.md),
"Pictures".
