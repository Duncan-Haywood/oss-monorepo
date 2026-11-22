---
title: "Two Swiss round 1s that no pairing program could reproduce, and why"
seo_title: "Why a Swiss round 1 can't be replayed from its TRF file"
date: 2026-11-22
tags: [league-schedule, swiss, chess, pairing]
description: "Round 1 of a Dutch Swiss depends only on the ranking. Two real events' round 1s were paired on an earlier list than the one their TRF files carry."
---

Our free [Swiss pairer](../../ventures/league-schedule-generator/how-to-run-a-swiss-tournament.html) is checked against six real over-the-board events from chess-results.com: we replay every round and count how many published boards it gets right. After this week's work it matched 47 of the 48 later rounds exactly. The two first rounds that missed looked strange. Budapest group B matched 45% of its boards and Graz Open A matched 3%.

Round 1 should be the easy one. In the Dutch system the top half of the ranking (S1) meets the bottom half (S2) board by board: 1 against the first player of the bottom half, 2 against the second, and so on. The only input is the ranking.

**So the boards tell you the ranking.** Line up the published boards by their top-half player and read the bottom-half players down the page. If the arbiters ranked players as the file does, those pairing numbers rise steadily. In Budapest B they rise with one exception: player 83, who has no FIDE rating in the file and sits last, was paired as though ranked between 59 and 60, around 1840. One player out of place shifts every board below his, which is why 55% of the boards missed. In Graz five players are out of place. Three are rated players placed above higher-rated ones (2135 above 2190, for example), and two are the file's last entries, which were paired well inside the field.

We wrote a small script that does this automatically. It takes the longest rising run of bottom-half numbers, treats everyone outside it as moved, and slots each moved player where their board puts them. With that order both round 1s come out exactly.

**The second half of the check is what convinced us.** We replayed rounds 2 to 9 on the round-1 order too. They got worse: Budapest B went from 8 of 8 exact to 4 of 8, and Graz lost every round. On the file's order those rounds are exact apart from one, Graz round 4. The simplest reading is that both events paired round 1 on a provisional list (a late entry, a national rating used for a player with no FIDE rating, ratings corrected after the draw) and re-sorted the list before round 2. Their TRF exports carry only the re-sorted list.

**What it means.** Nothing in the pairer changes. When an organiser uses the page, round 1 is paired on the list they type, which is the right input. For anyone else who tests a pairing engine against published events: a TRF exported after the event can't reproduce round 1 when the starting list changed after the draw. Score round 1 apart from the later rounds, or read the ranking back from the boards as we did.

That leaves one round across the six events: Graz round 4, where the arbiters floated a higher-ranked player (21, rated 2430) down out of the 2.5-point group and the Dutch rules would float a lower-ranked one. We haven't found a reason for that in the file.

The script and its output are in the repository: `eval/swiss-round1-ranking.mjs` and `eval/swiss-round1-ranking.txt`, run on the MIT-licensed fixtures in gbtami/swisspairing.
