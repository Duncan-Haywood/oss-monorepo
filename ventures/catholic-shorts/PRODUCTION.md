# Catholic Shorts: production guide

The series bible. Every short follows it; change it when a run learns
something, and say why in the PR.

Origin: the owner, 2026-11-03: "another one to do is catholic ai shortform
content. apologetics. faithful entertainment etc."

## What a short is

One minute of speech (110 to 180 words; `generate.mjs --check` enforces it),
one idea, one hook in the first sentence. Four kinds:

| Kind | What it does |
|---|---|
| `apologetics` | Answers one common question or objection about Catholic belief, from Scripture, the Catechism and the early Church. |
| `faith-and-science` | A true story or idea where faith and science meet, told without overclaiming. |
| `saint` | A saint of the day, told truthfully, with legend labelled as legend. Time it to the feast day. |
| `story` | A one-minute faithful story, sketch or parable. Invented, and it says so. |

Each file in `shorts/NNN-<slug>.md` has front matter (number, slug, title,
kind, published, hook, summary, sources) and four sections: `Script` (spoken),
`On screen` (the text cards, one per bullet), `Fair to the other side`, and
`Caption` (220 characters at most, for the platform post).

## Honesty rules (these are the liability lines)

1. **Never invent a source or a quotation.** Every Catechism paragraph cited is
   read at its source (https://www.scborromeo.org/ccc/para/NNNN.htm or
   vatican.va) before publishing, and the words quoted in the script must
   appear there. Scripture is quoted from public-domain translations
   (Douay-Rheims, KJV) or as a short fair-use phrase with the verse given.
   Church Fathers are quoted from public-domain translations (Roberts and
   Donaldson, Ante-Nicene Fathers; New Advent).
2. **State the other side fairly.** Every apologetics short names what other
   Christians (or non-believers) actually hold and why, in a form they would
   recognise, then the Catholic answer. No straw men, no mocking.
3. **Fiction is labelled.** A `story` says it is invented in its sources and
   its fair-side note; a `saint` short says which details are legend.
4. **Disclosure.** Every page, card and video says it was written by an AI and
   read by a synthetic voice. Not official Church teaching; not reviewed by a
   Church authority. The site footer says so.
5. **No posting under the owner's name.** Accounts on TikTok, YouTube,
   Instagram or Facebook are the owner's to open (publishing under the
   portfolio's public name). The site offers the videos for anyone to repost
   under CC BY-SA instead.

## Tone

Warm, direct, a little wry. Speak to a curious friend, not an opponent. End
on Christ, not on winning. No culture-war bait, no partisan politics, no
claims about who is going to hell.

## Making one

1. Write `shorts/NNN-<slug>.md`; check every citation at its source.
2. `node generate.mjs` (pages, cards, sitemap) and `node --test '*.test.mjs'`.
3. Video: `tts/bin/python3 make_video.py <slug>` then `node generate.mjs`
   again. Kokoro voice `am_michael`, 720x1280, about 1 MB a minute. Add
   mispronounced names to `SAY` in `make_video.py`. Watch one frame of the
   result before committing.

## Next up

Apologetics: the papacy and Matthew 16:18; praying to saints; why the
Deuterocanon; "faith alone" and James 2:24; why Catholics baptise babies;
statues and the golden calf; "is the Mass re-sacrificing Christ?";
the Immaculate Conception (and what it is not: the Virgin Birth); infallibility
(and what it is not: impeccability).

Saints, on their feasts: Albert the Great (15 November, a scientist bishop);
Elizabeth of Hungary (17 November); Andrew (30 November); Francis Xavier
(3 December); Nicholas (6 December); Juan Diego (9 December); Lucy
(13 December).

Faith and science: Mendel's peas; Nicolas Steno and the layers of rock; the
Vatican Observatory; the Galileo affair told accurately (both sides of it).

Stories and sketches: more one-minute parables in the style of "The last pew";
a recurring pair of characters would build an audience.

Formats to try: a two-voice dialogue short (Kokoro has several voices); a
captioned version with burned-in subtitles for sound-off viewing.
