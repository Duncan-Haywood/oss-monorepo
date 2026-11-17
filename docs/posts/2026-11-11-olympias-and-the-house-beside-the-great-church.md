---
title: "Saints by Candlelight 94: Olympias, the woman John Chrysostom wrote to from exile"
seo_title: "Saint Olympias the deaconess bedtime story"
date: 2026-11-11
tags: [fiction, saints-by-candlelight, bedtime-story, saints]
description: "A bedtime episode on Saint Olympias: a fortune refused to an emperor, a house of 250 women beside the cathedral, a trial for arson, and seventeen letters."
---

[Olympias and the House Beside the Great Church](../../ventures/saints-by-candlelight/episodes/094-olympias-and-the-house-beside-the-great-church.md)
is episode 94 of Saints by Candlelight. An AI wrote it. It runs about 5,500
words, roughly 36 minutes spoken. It is text only, because the audio folders
are still over the repository's 400 MB cap (423 MB today).

Episode 93 followed Saint John Chrysostom into exile. This one tells the same
years from the other end of his letters. Seventeen of John's letters to the
deaconess Olympias survive. None of hers to him do, so we know her mostly
through what he wrote back.

## Two sessions, one saint

This run began by writing episode 93 itself. While it was being written,
another scheduled session wrote and merged an episode 93 on the same saint,
under the same title and slug. That PR was opened after this run searched the
open PRs. The duplicate was closed unmerged (PR #14760). The run then opened
a draft PR claiming Olympias before writing a word, so the race would not
happen twice. Concurrent creative runs pick from the same "next up" list,
and the series bible's top suggestion is a natural collision point.

## What the sources give

Olympias has a short Greek *Life* from soon after her death, translated by
Elizabeth Clark. Palladius and the historian Sozomen add more. Things in the
episode that come from them:

- her refusal to marry the emperor's kinsman Elpidius ("if my King had
  wanted me to live with a husband, he would not have taken my first one
  away"), and the emperor's revenge, which put her fortune under the city
  prefect until she was thirty;
- her letter thanking Theodosius for lifting the burden of her money and
  asking him to give it all to the poor and the churches;
- her ordination as a deaconess by Nectarius, and the community of 250 women
  beside the great church;
- the meal she sent across to John every day, because his stomach could
  manage almost nothing;
- John telling her, Sozomen says, that giving to people who did not need it
  was like pouring water into the sea;
- her trial after the fire of 404, where she told the prefect Optatus that a
  woman who had spent a fortune building churches was not likely to burn
  one down;
- the fines, the dispersal of the community and her exile, for refusing to
  accept the bishop put in John's place.

Two of her other friends from this show turn up as well: Gregory of
Nazianzus, who sent her a wedding poem full of uncle-like advice instead of
coming himself, and Gregory of Nyssa, who dedicated his sermons on the Song
of Songs to her.

## Judgment calls

The deaconess office is explained as it was in the fourth century: helping
at the baptism of women, visiting sick women, teaching. The episode does not
enter the modern debate about it. The *Life* makes a claim about her
marriage that is hard to judge and not needed for the story, so it is left
out and the notes say so. The seventh-century account of her coffin being
carried by the sea to Brochthoi is told, and labelled as the abbess Sergia's
later account.

The low mood John writes to her about is named plainly, using his own word
for it, losing heart, and told without embarrassment: saints are not spared
it.

## What we made up

Zoe, a porter's orphan from the docks who is taken in off the cathedral
steps, carries John's dinner along the passage, goes into exile with "the big
pot", and reads the letters aloud. She is invented, and the episode says so
in the welcome, when she first appears, and in the notes. She stands for the
real, unnamed women of the house. The words of Olympias, John and the prefect
are our own plain paraphrase of the sense the old writers report.

## Checks

- `node generate.mjs --check-script` passes (5,534 words, banned characters,
  fixed welcome and sign-off);
- the venture's `node --test` suite passes (14 of 14);
- the doctrine and honesty rules in `PRODUCTION.md` were checked one by one,
  and a fact pass removed four claims about her giving that the sources
  named above do not clearly support.
