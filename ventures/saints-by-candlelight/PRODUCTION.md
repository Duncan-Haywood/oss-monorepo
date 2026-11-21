# Saints by Candlelight: series bible and production guide

The owner's brief (2026-10-20): podcast episodes in the spirit of a
myths-and-legends storytelling show, but about the saints, angels and
patriarchs of the Catholic and Orthodox traditions. Entertaining,
lighthearted, bedtime-style. Some episodes may be fiction, with a
disclaimer, but nothing may contradict doctrine, morals or teaching.
Each episode 30 minutes to an hour. Ongoing, indefinitely.

This file is how any session (or person) adds the next episode and keeps
the show sounding like one show.

## The show in one paragraph

A warm, funny narrator retells the old stories of holy people, the ones
told around fires and in monastery refectories for fifteen centuries, the
way you would tell them to a friend at bedtime: faithfully where the record
is clear, with a wink at the legends, and with plain honesty about which
is which. The humour comes from the people (a lion who is very bad at
guarding donkeys, an angel who gives a fake name and then a real pedigree,
a bishop who loses his temper at a council), never from the faith itself.
The pace slows as the episode goes on. The listener should be able to fall
asleep in the last ten minutes and miss nothing important.

## Length and shape

- **Target 5,500 to 8,500 words of spoken text** (about 35 to 55 minutes at
  the narrator's pace, about 155 words a minute). Never under 4,500.
- **Shape of an episode:**
  1. **Cold open** (100-200 words): a single vivid moment from the middle
     of the story, then "But we're getting ahead of ourselves."
  2. **Welcome** (fixed wording, see below), including the AI disclosure and
     the one-line "what's true" statement for this episode.
  3. **Setting the scene** (500-900 words): where and when, what life was
     like, told with modern comparisons and gentle jokes.
  4. **The story** in four to seven scenes separated by `* * *`. Most of the
     words go here. Dialogue is modern and natural; nobody says "thee"
     unless it's a joke about people who say "thee".
  5. **The wind-down** (400-800 words): the end of the saint's life, the
     feast day, what happened to the place, slower sentences, quieter.
  6. **Notes for the curious** (spoken, 150-300 words): what the sources
     are, what is history, what is legend, what this episode invented.
  7. **Sign-off** (fixed wording, see below), ending with a short blessing
     or traditional prayer appropriate to the saint.

### Fixed welcome (adapt only the bracketed parts)

> Hello, and welcome to Saints by Candlelight, stories of saints, angels and
> patriarchs from the Catholic and Orthodox traditions, told for bedtime.
> These episodes are written by an AI and read by a synthetic voice, and
> they try very hard to be faithful. Tonight's story is [one line on what
> it is and where it comes from, e.g. "from the Book of Tobit, which
> Catholic and Orthodox Christians read as Scripture"], [and one line on
> what is invented, e.g. "and a few of the small conversations are our own
> invention, told in the spirit of the original"]. So get comfortable. Dim
> the lights. And let's begin.

### Fixed sign-off (adapt only the bracketed parts)

> That's the story of [saint] for tonight. [Feast-day line.] Thank you for
> listening to Saints by Candlelight. If you enjoyed it, share it with
> someone who could use a gentle story at the end of a long day. [Prayer
> or blessing.] Goodnight, and God bless.

## Voice and tone

- **Lighthearted, never mocking.** Laugh with the saints, never at the
  faith, the sacraments, Our Lady, or the Lord. Jokes land on human
  foibles, animals, bureaucracy, weather, monastery food, and the
  narrator's own tangents.
- **Bedtime.** No gore, no graphic martyrdom, no jump scares. Martyrdom is
  told in one or two quiet sentences ("and so he went home to God"), with
  more weight on the life than the death. Demons may appear when the source
  has them (Tobit's Asmodeus), but they are defeated, faintly ridiculous,
  and never described in frightening detail.
- **Narrator asides** are the signature: short parenthetical tangents,
  modern comparisons ("roughly the ancient equivalent of a group chat"),
  admissions ("the old sources do not tell us what the dog was called,
  which I think is an oversight"). Not more than one every few paragraphs.
- **Written for the ear.** Short sentences. No footnotes, URLs, markdown
  links, numerals that read badly (write "three hundred and twenty-five",
  not "325"), Roman numerals, or abbreviations ("Saint", not "St."). No
  parentheses that only work on the page; turn them into spoken asides with
  commas or dashes.
- **Pace.** Put `[pause]` on its own line where a long silence helps (after
  the welcome, before the wind-down, before the sign-off). Use `* * *` on
  its own line between scenes. The renderer turns both into silence.

## Doctrine and honesty rules (non-negotiable)

1. **Never contradict Catholic or Orthodox doctrine or moral teaching.**
   Where the two traditions differ (the papacy, the filioque, purgatory,
   later dogmas and later saints), stay off the disputed ground. Do not
   argue either side.
2. **Miracles are God's.** Saints pray; God acts. A saint is never a wizard
   and relics are never magic objects.
3. **Angels are angels.** They are not the souls of dead people and they do
   not earn wings. There are no neutral or half-fallen angels, even though
   some medieval legends (for example the birds in the *Voyage of Saint
   Brendan*) say otherwise: skip or correct such details out loud.
4. **Scripture is told straight.** When the story comes from Scripture
   (including the deuterocanonical books, which both traditions read as
   Scripture), invent nothing that changes what happens or what it means.
   Small invented dialogue and colour are fine and must be flagged in the
   welcome and the notes.
5. **Legend is labelled as legend.** "The old story says", "according to
   the monks who wrote it down three hundred years later". Never present a
   legend as documented history.
6. **Invented episodes are allowed** (an invented companion, an invented
   day in a real saint's life, or an entirely invented holy person in a
   traditional setting). They must say so in the welcome, in the notes, and
   in the `fiction` field, and the invented events must be the kind of
   thing that could edifyingly have happened, not new miracles attributed to
   a real saint as if they were history.
7. **Name the tradition.** If a saint is venerated in only one tradition,
   say so plainly and kindly ("Saint Seraphim is an Orthodox saint, much
   loved by Catholics too"). Do not claim a canonisation that did not
   happen.
8. **Sources.** List the real primary and standard secondary sources in the
   front matter. Only list sources that exist and that you are confident
   say what you claim. If unsure, leave a detail out.
9. **AI disclosure.** Every episode says it is written by an AI and read by
   a synthetic voice, in the welcome, the page and the feed.

## File format

One file per episode: `episodes/<NNN>-<slug>.md`, where `NNN` is the
three-digit episode number.

```
---
number: 1
slug: the-angel-who-called-himself-azarias
title: The Angel Who Called Himself Azarias
published: 2026-10-20
summary: One or two sentences for the feed and the page.
figures: Tobit, Tobias, Sarah, Saint Raphael the Archangel
tradition: Catholic and Orthodox
feast: one line on feast days in each tradition
history: one line on what is historical or scriptural
legend: one line on what is legend (or "none")
fiction: one line on what this episode invented
sources:
  - The Book of Tobit (Catholic and Orthodox Old Testament)
  - ...
---

Script text starts here. Paragraphs are separated by blank lines.
```

Front matter values are single lines (no wrapping). `sources` is the only
list.

## Making an episode

Which creative project is due, and whether audio fits under the 400 MB cap:
`python3 platform/ci/creative_due.py` from the repository root.

```
cd ventures/saints-by-candlelight
# 1. write episodes/<NNN>-<slug>.md following this file
node generate.mjs --check-script <slug>     # length, banned characters, welcome/sign-off present
python3 render_audio.py <slug>              # Kokoro TTS, offline, ~1/4 real time on 4 CPU cores; re-renders reuse unchanged sentences
node generate.mjs                           # pages, feed.xml, sitemap
node --test
```

`render_audio.py` needs `pip install kokoro-onnx soundfile` and the two
Kokoro v1.0 model files (`kokoro-v1.0.onnx`, `voices-v1.0.bin`, Apache 2.0)
in `~/.cache/kokoro` or `--models <dir>`; it downloads them from Hugging Face
if missing. Narrator voice: `bm_george` at speed 0.9. The rendering itself is the
shared engine, [`platform/audio/narrate.py`](../../platform/audio/narrate.py)
(sentence cache, one worker per core, fixed-gain loudness, optional `misaki`
pronunciation); its docstring has the setup.

## The episode list

Done episodes are in `episodes/`; the list entries they came from, with the
sources each used and the sequels it left for another night, are in
[DONE.md](DONE.md). Next up, roughly in order, one entry per line (claim one by
writing it; skip any already in `episodes/`). Mark one you finish `- *(Done:
episode N, Title.)*` at the start of its line, then run `node list_done.mjs` to
move it to DONE.md (`node --test` fails while one is left here). Add the
sequels your episode leaves as new lines, so the list never runs down to one:

- Egeria and Lent with the bishop's catechesis (Travels, chapters 27-28 and 45-46; a sequel to episode 133).
- Valerius of Bierzo and the letter in praise of the blessed Egeria, the seventh-century Spanish monk who gave her name back (Valerius's letter to the monks of the Bierzo; a coda to episodes 127-137).
- Hiram king of Tyre and the cedars of Lebanon floated down the coast in rafts, the friend of David who sent Solomon timber for the temple (First Kings 5 and Second Chronicles 2; left by episode 156).
- The ships of Tarshish and the throne of ivory with twelve lions on six steps, the years when silver was counted as nothing in Jerusalem, told as a quieter episode about trade and its dangers, with Deuteronomy 17:16-17 (First Kings 10:14-29; left by episode 156).
- Saint Theognius or Saint Abraamius, Cyril of Scythopolis's other short desert lives.
- Saint Cyriacus the Anchorite, whose Life Cyril also wrote.
- Saint Joseph of Thessalonica, Theodore the Studite's hymn-writing brother.
- The water turned to blood at the edge of the Nile, the first sign by the river in the morning and the magicians who did the same, seven days (Exodus 7:14-25; left by episode 160).
- Aaron's staff that budded in the tent of meeting, twelve staffs with twelve names and the almonds in the morning, kept before the testimony (Numbers 17, with Hebrews 9:4; left by episode 160).
- Aaron and Hur holding up Moses' hands at Rephidim until the going down of the sun, Joshua's first battle and the altar called the Lord is my banner (Exodus 17:8-16; left by episode 158).
- Moses and Zipporah on the road back to Egypt and the lodging place, a hard passage told carefully in daylight, with the main readings named and none settled (Exodus 4:24-26; left by episodes 37, 157 and 158).
- Miriam and Aaron and the cloud over the tent at Hazeroth, the meekest man on the face of the earth (Numbers 12; left by episode 141).
- Othniel and Achsah and the upper and lower springs, Caleb's daughter who asked for water and the first judge of Israel (Joshua 15:13-19, Judges 1:11-15 and 3:7-11; left by episode 142).
- Joshua and the twelve stones at Gilgal and the commander of the Lord's army before Jericho (Joshua 3-5; left by episode 143).
- Shimei and the stones on the road from Jerusalem, and David who would not let Abishai take his head, then forgave him at the Jordan (Second Samuel 16:5-14 and 19:16-23; left by episode 147).
- David and the Song of the Bow, the lament for Saul and Jonathan, swifter than eagles and stronger than lions (Second Samuel 1; left by episode 147).
- David at the gate of Gath, the first time he fled to Achish and let his spittle run down his beard (First Samuel 21:10-15, with Psalm 34's title; left by episode 148).
- Abiathar and the bread of the Presence at Nob, the priest's son who escaped with the ephod (First Samuel 21:1-9 and 22, with Mark 2:25-26; left by episode 148).
- The wise woman of Abel Beth-maacah, who talked Joab out of a siege from the city wall, a mother in Israel (Second Samuel 20:14-22; left by episode 154).
- Amos the herdsman of Tekoa and the basket of summer fruit, the dresser of sycamore figs sent to Bethel (Amos 1:1, 7:10-15 and 8:1-2; left by episode 155).
- Saint Silvanus of Tarsus and the councils of Seleucia, the bishop who would not silence a guest (Theodoret, Sozomen and Socrates on the council of three hundred and fifty-nine; a sequel to episode 136).
- The ark at Kiriath-jearim, twenty years in the house of Abinadab on the hill, and Eleazar who kept it (First Samuel 6:19 to 7:2, with Second Samuel 6:1-4 and Psalm 132:6; left by episode 149).
- The men of Gibeon on the wall, Nehemiah's list of who rebuilt which stretch, gate by gate (Nehemiah 3; left by episode 149).
- Saul at Gilgal and the seven days, the king who could not wait for Samuel, and "a man after his own heart" (First Samuel 13:1-15; left by episode 153).
- The Philistine blacksmiths and the hill country without a smith, a quieter episode about tools, trades and the pim weights (First Samuel 13:19-22, with Isaiah 2:4; left by episode 153).
- Michal and the image in David's bed, the night she let him down through the window (First Samuel 19:11-17; left by episode 151).
- Saul among the prophets at Naioth in Ramah, three lots of messengers and then the king himself (First Samuel 19:18-24; left by episode 151).
- Absalom at the city gate and the long flight up the Mount of Olives, Ittai the Gittite who would not go home and Zadok who carried the ark back (Second Samuel 15; left by episode 152).
- The two runners from the battle in the forest of Ephraim, Ahimaaz who outran the Cushite by the plain and would not tell the king the worst (Second Samuel 18:19-33; left by episode 152).

## Audio status

<!-- audio-status: written by node generate.mjs from episodes/ and audio/manifest.json -->
Audio: 29 of 160 episodes, numbers 1 to 29 (27 to 53 minutes each). Text only: episodes 30 to 160.
<!-- /audio-status -->

Whether to add audio is the creative prompt's call, not this file's: `prompts/creative/prompt-0.md`, "Audio size", says text only while the `du` it names is over 400 MB (577 MB on 2026-11-18), and the higher layer wins. The case that the cap is stale (audio has been served from jsDelivr, outside the deploy artifact, since 2026-10-24, so the cost left is git history) is in [`docs/reports/2026-11-13-audio-cap-is-stale.md`](../../docs/reports/2026-11-13-audio-cap-is-stale.md); changing the rule is a `prompts/` edit, which waits on the owner's approval. This paragraph used to recommend voicing the backlog against the prompt, and five run records from 2026-11-16 to 2026-11-18 reported the two guides disagreeing. When the rule allows audio, voice the backlog in episode order, about 60 MB a run (episodes 20 to 24 took 7 to 11 minutes each on 4 cores, 2026-11-15). Read the episode for names first and add any the voice would trip on to `SAY` in `render_audio.py`. The line above is regenerated with the pages, so a new episode or render needs no edit here. If Hugging Face is blocked in a cloud session, the Kokoro model files are also on GitHub: `https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/` (`kokoro-v1.0.onnx`, `voices-v1.0.bin`) into `~/.cache/kokoro`. Use `/usr/bin/python3` if `python3` lacks numpy. A render takes about 8 to 15 minutes.

## Publishing

- Episodes, pages and `feed.xml` are served with the catalogue at
  `https://marisstella.app/saints-by-candlelight/` (Cloudflare, built by
  `portfolio-pages.yml` on every merge; the old github.io address redirects).
- Audio is committed as mono 40 kbps MP3 (about 0.3 MB a minute). The deploy
  serves each committed MP3 from jsDelivr at a pinned commit
  (`platform/pages/audio-cdn.mjs`), so audio no longer counts against the
  site artifact. The limit on new audio is the repository's, set by the
  creative prompt (`prompts/creative/prompt-0.md`, 400 MB across the audio
  folders), not a hosting limit.
- Listing in Apple Podcasts, Spotify, YouTube Music and Podcast Index is a
  one-time owner submission of the feed URL (see the README).
