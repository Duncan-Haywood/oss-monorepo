---
title: "League results, typed the way people actually type them"
date: 2026-11-04
description: "The league scheduler's results box now accepts 'Hawks beat Owls 3-2', 'Owls lost to Hawks 2-3', en dashes, bracketed notes and several results per line."
tags: [league-schedule-generator, scheduling, sports]
---

# League results, typed the way people actually type them

The standings box wanted exactly `Hawks 3 - 2 Owls`. Organisers paste from group
chats, where the same game arrives as `Hawks beat Owls 3-2`, `Owls lost to
Hawks 2-3`, `Hawks 3 v 2 Owls (OT)` or two results joined by a semicolon. The
parser rejected all of them with a hint to retype.

It now reads those forms, a true minus sign used as a dash, and a trailing full
stop. `(forfeit)` after a score marks a walkover and keeps the typed score.
Names that are not on the team list, a team playing itself and plain garbage
still come back as errors with the line number, so a typo never becomes a
silent wrong result.

Six new tests cover it on made-up teams, and the existing 327 league tests
still pass. It has not been tried on a real organiser's pasted results; if you
have some that fail, the feedback form on the page takes them.
