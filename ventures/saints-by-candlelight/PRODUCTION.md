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

Done episodes are in `episodes/`. Next up, roughly in order (claim one by
writing it; skip any already in `episodes/`):

- *(Done: episode 14, Joseph and the Coat with Long Sleeves.)* Joseph the dreamer and his brothers (Genesis 37-50)
- *(Done: episode 18, George and the Dragon of Silene.)* Saint George and the dragon (legend; the historical martyr told gently)
- *(Done: episode 10, Brendan and the Island That Moved.)* Saint Brendan the Navigator (*Navigatio*; the birds-as-angels episode skipped)
- *(Done: episode 17, Kevin and the Blackbird.)* Saint Kevin of Glendalough and the blackbird
- *(Done: episode 9, Patrick and the Ship That Was Ready.)* Saint Patrick, from slave to bishop (his own *Confessio*)
- *(Done: episode 5, Francis and the Wolf of Gubbio.)* Saint Francis and the wolf of Gubbio (Catholic; *Fioretti*)
- *(Done: episode 20, Mary of Egypt and the Three Loaves; text only, no audio yet.)* Saint Mary of Egypt (Orthodox and Catholic; told gently for bedtime)
- *(Done: episode 13, Abraham and the Three Visitors at Mamre.)* Abraham and the three visitors at Mamre (Genesis 18)
- *(Done: episode 11, Herman and the Garden on Spruce Island.)* Saint Herman of Alaska (Orthodox)
- *(Done: episode 15, Nicholas and the Grain Ships.)* Saint Nicholas, part two: the storm at sea and the grain ships
- *(Done: episode 12, Elijah and the Still Small Voice.)* Elijah, the ravens and the still small voice (1 Kings 17-19)
- *(Done: episode 16, Spyridon and the Snake That Became Gold.)* Saint Spyridon and the snake that became gold (legend; told with care)
- *(Done: episode 21, Gall and the Bear Who Brought the Firewood; text only.)* Saint Gall of Lake Constance and the bear (Walafrid Strabo's Life; legend labelled)
- *(Done: episode 19, A Winter Night at the Hill Convent.)* An invented episode: a novice and an old abbess on a winter night, with the saints she tells her about (clearly labelled fiction)
- *(Done: episode 22, Melangell and the Hare in the Fold of Her Robe; text only.)* Saint Melangell of Pennant Melangell and the hare (Welsh; legend labelled)
- *(Done: episode 23, Ruth and the Barley Harvest at Bethlehem; text only.)* The book of Ruth (Scripture told straight; Catholic and Orthodox)
- *(Done: episode 24, Kentigern and the Four Signs of Glasgow; text only.)* Saint Kentigern (Mungo) and the robin, tree, bell and fish of Glasgow (Jocelyn of Furness; legend labelled)
- *(Done: episode 25, Anthony and the Sermon to the Fishes; text only.)* Saint Anthony of Padua and the sermon at Rimini (Assidua; Fioretti legend labelled)
- *(Done: episode 26, Noah and the Boat with One Door; text only.)* Noah and the ark (Genesis 6 to 9; Scripture told straight; Noah's vineyard left for another night)
- *(Done: episode 27, Brigid and the Cloak That Would Not Stop; text only.)* Saint Brigid of Kildare and the cloak (Cogitosus, Vita Prima; legend labelled)
- *(Done: episode 28, Jonah and the City That Listened; text only.)* The book of Jonah (Scripture told straight; Catholic and Orthodox)
- *(Done: episode 29, Daniel and the Night with the Lions; text only.)* Daniel chapter six (Scripture told straight; Catholic and Orthodox)
- *(Done: episode 30, Martin of Tours and the Half a Cloak; text only.)* Saint Martin of Tours and the cloak at Amiens (Sulpicius Severus, Life of Martin; geese and Saint Martin's summer labelled as later tradition and folk custom)
- *(Done: episode 31, Seraphim of Sarov and the Bear in the Clearing; text only.)* Saint Seraphim of Sarov (Orthodox; Zander, Motovilov; bear and rock labelled as the tradition of his life; the Motovilov conversation and the Diveyevo ditch left for later nights)
- *(Done: episode 32, Samuel and the Voice in the Night; text only.)* The boy Samuel at Shiloh (1 Samuel 1 to 3; Scripture told straight; Catholic and Orthodox; the fall of Eli's house left for another night)
- *(Done: episode 33, Rebekah and the Camels at the Well; text only.)* Genesis 24 (Scripture told straight; Catholic and Orthodox; the servant left unnamed; Jacob and Esau left for another night)
- *(Done: episode 34, Jacob and the Ladder at Bethel; text only.)* Genesis 28 (Scripture told straight; Catholic and Orthodox; Jacob's years with Laban, the wrestling at the Jabbok and the meeting with Esau left for other nights)
- *(Done: episode 35, Tobias and the Angel on the Road to Media; text only.)* The book of Tobit (Scripture told straight; Catholic and Orthodox, not in Protestant Bibles; the archangel Raphael; the song of Tobit kept short)
- *(Done: episode 36, Naaman and the Seven Dips in the Jordan; text only.)* 2 Kings 5 (Scripture told straight; Catholic and Orthodox; Gehazi's part of the chapter left for another night)
- *(Done: episode 37, Moses and the Bush That Was Not Consumed; text only.)* Exodus 3 and 4 (Scripture told straight; Catholic and Orthodox; the inn at the end of chapter four, the plagues and the sea left for other nights)
- *(Done: episode 38, Elisha and the Widow's Jars of Oil; text only.)* 2 Kings 4:1-17 (Scripture told straight; Catholic and Orthodox; the death and raising of the Shunammite's son, 4:18-37, left for another night)
- *(Done: episode 39, Isaac and the Wells That Were Dug Again; text only.)* Genesis 26 (Scripture told straight; Catholic and Orthodox; Esau's marriages and the blessing of Jacob left for another night)
- *(Done: episode 40, David and the Giant in the Valley of Elah; text only.)* 1 Samuel 17 (Scripture told straight; Catholic and Orthodox; the shorter Greek text and the two heights of Goliath are named in the notes; Jonathan's covenant is touched, David's years at court and Saul's jealousy left for other nights)
- *(Done: episode 41, Francis and the Christmas Night at Greccio; text only.)* Saint Francis and the first living crib at Greccio, 1223 (Thomas of Celano, Vita Prima; the knight's vision and the cures from the hay labelled as the old writer's report)
- *(Done: episode 42, Gideon and the Three Hundred with Jars; text only.)* Judges 6 and 7, with the offer of kingship from 8:22-23 (Scripture told straight; Catholic and Orthodox; the later chapters of the pursuit and the golden ephod left for another night)
- *(Done: episode 43, Benedict and the Sieve That Was Mended; text only.)* Saint Benedict of Nursia, early life from Gregory the Great, Dialogues II (sieve, Subiaco, raven, Scholastica and the storm; legends labelled; Florentius's later schemes left out)
- *(Done: episode 44, Hannah and the Prayer at Shiloh; text only.)* 1 Samuel 1 and 2:1-11, 18-21 (Scripture told straight; Catholic and Orthodox; Eli's household left for another night)
- *(Done: episode 45, Jacob and the Night at the Jabbok; text only.)* Genesis 32 and 33:1-17 (Scripture told straight; Catholic and Orthodox; the identity of the wrestler left as the text leaves it; Shechem and Dinah left out)
- *(Done: episode 46, Ambrose and the Bees in the Cradle; text only.)* Saint Ambrose of Milan (Paulinus, Life; Augustine, Confessions; bees, the child's voice and the night walk labelled as Paulinus's report; Theodoret's church-door scene left out; the relics of Gervasius and Protasius and the Easter-night star only touched)
- *(Done: episode 47, Joshua and the Woman with the Scarlet Cord; text only.)* Joshua 2 to 6 (Scripture told straight; Catholic and Orthodox; Rahab's lie and the giving up of Jericho named honestly in the notes; Achan, Ai and the Gibeonites left for other nights)
- *(Done: episode 48, Elisha and the Chariots of Fire at Dothan; text only.)* 2 Kings 6:1-23 (Scripture told straight; Catholic and Orthodox; the fiery horses as angels labelled a tradition of reading; the rare Hebrew word for the army's blindness noted; the servant left unnamed; the siege of Samaria in 6:24 onward left for another night)
- *(Done: episode 49, Zacchaeus and the Sycamore Tree at Jericho; text only.)* Luke 19:1-10 (Scripture told straight; Catholic and Orthodox; what was said at the dinner is left as the Gospel leaves it; the fourfold repayment set beside Exodus and Leviticus as a labelled reading; Caesarea bishopric and the shown sycamore labelled tradition)
- *(Done: episode 50, Mary and Elizabeth in the Hill Country of Judah; text only.)* Luke 1:39-56 (Scripture told straight; Catholic and Orthodox; the route, companions and distance labelled as estimate; Ein Karem labelled tradition; the Magnificat given in our own plain rendering and its echo of Hannah named as a reading; Zechariah's silence and the naming of John touched, the Benedictus left for another night)
- *(Done: episode 51, Cleopas and the Stranger on the Road to Emmaus; text only.)* Luke 24:13-35 (Scripture told straight; Catholic and Orthodox; the second disciple left unnamed; the sixty and one hundred and sixty stadia readings and the several claimed villages named; the content of the lesson on the road not invented; the appearance to the Eleven left for another night)
- *(Done: episode 52, Cyril and Methodius and the Letters for a People Without Any; text only.)* Saints Cyril and Methodius (the two Slavonic Lives and papal letters; the dream of Sophia labelled the old writer's report; Glagolitic versus Cyrillic named; the Khazar mission and the Cherson find touched and labelled disputed; the later Bulgarian schools only sketched)
- *(Done: episode 53, Paul and the Fourteen Nights Before Malta; text only.)* Acts 27 and 28:1-16 (Scripture told straight; Catholic and Orthodox; the gear let down, the number 276 and the landing site named as uncertain; Publius as first bishop labelled tradition; Paul's later years in Rome left for another night)
- *(Done: episode 54, Monica and the Window at Ostia; text only.)* Saint Monica (Augustine, Confessions III, V, VI, IX; the talk at the window kept as his outline with our wording; relics in Rome and patronage labelled tradition; Augustine's disputed later teaching left alone)
- *(Done: episode 55, Peter and the Night on the Lake; text only.)* Matthew 14:22-33 (Scripture told straight; Catholic and Orthodox; Mark's and John's shorter accounts noted; the "I am" echo named as a reading, not claimed; Peter's later life left for another night)
- *(Done: episode 56, The Wedding at Cana and the Six Stone Jars; text only.)* John 2:1-11 (Scripture told straight; Catholic and Orthodox; the couple, steward and servants left unnamed; the jar sizes given as our own sums from the Greek measure; the difficult words to Mary named as read differently; how the water became wine left as John leaves it)
- *(Done: episode 57, The Father Who Ran Down the Road; text only.)* Luke 15:11-32 (Scripture told straight; Catholic and Orthodox; a parable, nobody named; the double share from Deuteronomy as background only; the carob-pods reading flagged; the ending left open exactly as Luke leaves it)
- *(Done: episode 58, The Shepherds and the Night Watch Above Bethlehem; text only.)* Luke 2:1-20 (Scripture told straight; Catholic and Orthodox; Matthew's different telling noted; the census difficulty, shepherd count, cave, donkey and tower of the flock named as not claimed; the sign and its meaning not elaborated; "saying" not "singing" kept; Simeon and Anna left for another night)
- *(Done: episode 59, Hezekiah and the Letter Spread Out in the Temple; text only.)* 2 Kings 18 and 19 (Scripture told straight; Catholic and Orthodox; Isaiah 36-37 and 2 Chronicles 32 noted; the Taylor Prism and the Siloam tunnel inscription given as outside witnesses and labelled; Herodotus's mice and the plague guess named and left out; Sennacherib's death and Hezekiah's illness left for other nights)
- *(Done: episode 60, Simeon and Anna and the Child in the Temple; text only.)* Luke 2:22-38 (Scripture told straight; Catholic and Orthodox; Leviticus 12 and Exodus 13 as background; Simeon's age, priesthood and the Septuagint legend named as tradition or impossible; Anna's "eighty-four" read both ways; the sword left unexplained as Luke leaves it; the redemption price left out because Luke omits it)
- *(Done: episode 61, Bartimaeus and the Cloak Thrown Aside; text only.)* Mark 10:46-52 (Scripture told straight; Catholic and Orthodox; Matthew 20 and Luke 18 differences named; later traditions about Bartimaeus's life labelled and not relied on)
- *(Done: episode 62, Philip and the Traveller on the Gaza Road; text only.)* Acts 8:26-40 (Scripture told straight; Catholic and Orthodox; verse 37 left out as missing from the oldest manuscripts and said so; the official unnamed; the Deuteronomy 23 and Isaiah 56 background labelled a reading; the later Ethiopian tradition labelled tradition; the water's place not claimed)
- *(Done: episode 65, Zechariah and the Writing Tablet in the Hill Country; text only.)* Luke 1:5-25, 57-80 (Scripture told straight; Catholic and Orthodox; the Benedictus given only in our own plain words; Zechariah's possible deafness, the Mishnah's lot rule and Ein Karem labelled as reading or later tradition; later stories of Zechariah's death and John's childhood left out; John in the wilderness and at the Jordan left for another night)
- *(Done: episode 66, Lydia and the Open Door at Philippi; text only.)* Acts 16:9-40 (Scripture told straight; Catholic and Orthodox; the slave girl and the jailer left unnamed; the name Lydia as possibly 'the Lydian woman' offered as a guess; later lives of Lydia and the jailer left out; Paul's later Letter to the Philippians touched only lightly)
- *(Done: episode 67, Ananias and the Street Called Straight at Damascus; text only.)* Acts 9:1-19 (Scripture told straight; Catholic and Orthodox; Judas at the door a flagged guess; the shown house and chapel and later lives of Ananias labelled tradition and left out; the escape in the basket and Paul's years after left for another night)
- *(Done: episode 68, Mary Magdalene and the Gardener at the Tomb; text only.)* John 20:1-18 (Scripture told straight; Catholic and Orthodox; the other Gospels' tellings named; the old mixing with Luke 7's unnamed woman named as not in the Gospels; the Greek of 'do not touch me' flagged as disputed; later lives in France and Ephesus labelled tradition and left out; the evening appearance to the disciples left for another night)
- *(Done: episode 69, Thomas and the Locked Room in Jerusalem; text only.)* John 20:19-31 (Scripture told straight; Catholic and Orthodox; the reason for the Twin name and Thomas's absence not claimed; whether he touched the wounds left open as John leaves it; 'for fear of the Jews' explained; the forgiving of sins left unexplained; Thomas in India labelled tradition and left out of the story)
- *(Done: episode 70, Cornelius and the Sheet Let Down at Joppa; text only.)* Acts 10 and 11:1-18 (Scripture told straight; Catholic and Orthodox; the distance and the tanner's trade given as estimate or guess; the tongues not elaborated; Cornelius as later bishop labelled tradition and left out; the Council of Jerusalem left for another night)
- *(Done: episode 71, Hagar and the Well in the Wilderness of Beersheba; text only.)* Genesis 16 and 21:8-21 (Scripture told straight; Catholic and Orthodox; Sarah's harshness and Abraham's silence not excused; Ishmael's play-or-mockery and the carried-on-the-shoulder difficulty named; no feast day claimed; Paul's use of Hagar and later Jewish, Christian and Muslim retellings left out)
- *(Done: episode 72, The Boy with Five Loaves and Two Fish on the Hillside; text only.)* John 6:1-15 with Matthew 14, Mark 6, Luke 9 (Scripture told straight; Catholic and Orthodox; the boy unnamed, his morning and mother invented and said so; how the bread was multiplied left unexplained; the Eucharistic echo and the twelve baskets named as readings; later names for the boy left out)
- *(Done: episode 73, Aidan and the King's Horse on the Road from Bamburgh; text only.)* Saint Aidan of Lindisfarne (Bede, Ecclesiastical History III; the horse, the oil and the storm, Penda's fire; legends labelled; the roadside scene and small talk invented and said so)
- *(Done: episode 74, The Woman at the Well of Sychar; text only.)* John 4:1-42 (Scripture told straight; Catholic and Orthodox; why she came at noon and the five husbands left open and not made a disgrace; Photini and her later life named as Orthodox tradition; the walk, heat and evening invented and said so)
- *(Done: episode 75, Stephen and the Widows' Bread at Jerusalem; text only.)* Acts 6:1-15 and 7:54-60, 8:1-2 (Scripture told straight; Catholic and Orthodox; the seven's Greek names and the title deacon as later usage noted; Saul at Cilicia a flagged guess; Jesus 'standing' left open; relics of 415 labelled tradition and left out; the courtyard morning and the unnamed widow invented and said so; Stephen's long speech only summarised)
- *(Done: episode 76, Peter and John and the Man at the Beautiful Gate; text only.)* Acts 3 and 4:1-31 (Scripture told straight; Catholic and Orthodox; the gate unidentified and said so; the man unnamed, later lives labelled tradition and left out; Isaiah 35 echo and Luke the physician flagged as readings; the speech to the crowd framed as a Jew speaking to Jews; the morning, cousin and night in the cell invented and said so)
- *(Done: episode 77, The Woman of Shunem and the Child on the Prophet's Bed; text only.)* 2 Kings 4:8-37 (Scripture told straight; Catholic and Orthodox; the woman, husband, son and servant on the road unnamed or invented only as colour and said so; the Carmel distance given as our estimate; the rare Hebrew for 'sneezed' flagged; the resurrection reading labelled a reading; the stew and loaves of 4:38 on left for another night; the famine return of 8:1-6 only sketched)
- *(Done: episode 78, Lazarus and the Stone Rolled Away at Bethany; text only.)* John 11 with 12:1-2 (Scripture told straight; Catholic and Orthodox; Mary of Bethany kept apart from Magdalene; the four-days belief, the Cyprus and Provence traditions and the Greek of the Lord's distress labelled; the road, kitchen and sisters' waiting invented and said so; the sequel after the supper left for another night)
- *(Done: episode 79, The Good Samaritan and the Road Down to Jericho; text only.)* Luke 10:25-37 (a parable told straight; Catholic and Orthodox; nobody named; the priest's and Levite's reasons offered as readings, not Luke's; the road's figures our rounding; Origen's and Augustine's reading of the Samaritan as Christ named as a reading; the ruined inn a later custom; the donkey, the night and the innkeeper's talk invented and said so)
- *(Done: episode 80, Jairus and the Little Girl in the House by the Lake; text only.)* Mark 5:21-43 with Luke 8:40-56 and Matthew 9:18-26 (Scripture told straight; Catholic and Orthodox; the town unnamed; the Lord's word "sleeping" given as the Church's reading with the Gospels' own "dead" kept; the woman's uncleanness and the hand taken despite Numbers 19 offered as readings; her later naming and Eusebius's statue labelled later tradition; the walk home, the room, the neighbour's bowl and the girl's remark invented and said so)
- *(Done: episode 81, The Father and the Two Sons on the Road Home; text only.)* Luke 15:11-32 (a parable told straight; Catholic and Orthodox; nobody named; the one-third share, the carob pods and the father's running as undignified offered as readings or customs, not Luke's; the label prodigal called later; the road, farm, servant boy, kitchen and night scenes invented and said so; the ending left open as Luke leaves it)
- *(Done: episode 82, Mary and the Angel at Nazareth; text only.)* Luke 1:26-38 (Scripture told straight; Catholic and Orthodox; Matthew 1 noted as Joseph's side; 'full of grace' given with the modern 'favoured one'; Mary's question read both ways and not settled; the overshadowing echo named as a reading; the house at Nazareth and Mary's age and parents labelled later tradition and left out; the morning at the well, the bread, the evening meal and the old aunt invented and said so; Joseph's part left for another night)
- *(Done: episode 83, Joseph and the Night Road to Egypt; text only.)* Matthew 1:18-25 and 2:13-23 (Scripture told straight; Catholic and Orthodox; Joseph given no words in Matthew, so every word is ours and said so; the gifts-paid-for-the-road idea, the Hosea reading and the Nazarene line named as readings; the Coptic route, palm tree, falling idols and the donkey left out as later tradition; Herod and the Holy Innocents told briefly; the workshop, packing, neighbour, well, Egyptian market and return invented and said so)
- *(Done: episode 84, The Wise Men and the Star Over Bethlehem; text only.)* Matthew 2:1-12 (Scripture told straight; Catholic and Orthodox; the Magi's number, names, kingship, homeland and relics, the identity of the star and the Fathers' reading of the gifts named as later tradition, guess or reading; the road, the roof at night and the hour in the house invented and said so; Herod and the Holy Innocents only touched)
- *(Done: episode 85, The Widow of Nain and the Gate of the Town; text only.)* Luke 7:11-17 (Scripture told straight; Catholic and Orthodox; woman and son unnamed and given no words; the morning, neighbours and walk home invented and said so; the Elijah and Elisha echoes, the touching of the bier and the distance from Capernaum labelled reading, background or estimate)
- *(Done: episode 86, Gregory and the Boys in the Roman Market; text only.)* Saint Gregory the Great and the mission of Saint Augustine of Canterbury (Bede, Ecclesiastical History I.23-33 and II.1; Gregory's letters; the market puns labelled as Bede's handed-down tradition; the Whitby Life's locust labelled legend; the Hadrian's-tomb angel and Gregorian chant left out as later; the papacy's disputed claims left alone; Brother Felix, the merchant's extra words and the weather invented and said so)
- *(Done: episode 87, Columbanus and the Bear in the Cave at Annegray; text only.)* Saint Columbanus (Jonas of Bobbio, Life of Columbanus; his letters and sermons; the bear, Domoal's spring, the wolves, the hide, the squirrel and Carantoc's cart labelled as Jonas's report; the caves at Annegray and Bobbio labelled local tradition; Jonas's wrong king named; the Brunhild quarrel told briefly and the Easter question only touched)
- *(Done: episode 88, Ninian and the White House at Whithorn; text only.)* Saint Ninian (Bede, Ecclesiastical History III.4; Ailred of Rievaulx, Life of Ninian; the Miracula Nynie Episcopi; the leeks, the psalter in the rain, the cattle and the thieves, King Tuduvallus, the visit to Martin and the runaway boy's staff labelled as Ailred's report, the bull softened; the cave labelled local tradition; Clancy's Uinniau argument named as one scholar's; the Latinus stone and the excavations given as the history; Brother Elffin invented and said so)
- *(Done: episode 89, Basil and the Soup Kitchen at Caesarea; text only.)* Saint Basil the Great (Gregory of Nazianzus, Oration 43; Basil's letters 14, 94 and 223, the barns and famine homilies, the Longer Rules; Gregory of Nyssa's Life of Macrina; Theodoret for Valens's gift of land; Modestus and the Epiphany liturgy labelled Gregory's report; the Vasilopita labelled folk tradition; the disputed death year named; Philo, his mother and the cook Domnina invented and said so; Valens's son, the broken pen and the Sasima quarrel left out)
- *(Done: episode 90, Macrina and the Lamps at Annesi; text only.)* Saint Macrina the Younger (Gregory of Nyssa, Life of Macrina and On the Soul and the Resurrection; the betrothed who died, the bread for her mother, Basil "puffed up", the household made equal, Naucratius and the old men, the tumour, Gregory's dream and visit, the plank bed, "stop being ungrateful", the last prayer paraphrased, death at the lamp-lighting, Lampadion and Vetiana, the iron cross and ring, the soldier's daughter; the dream of Thecla, both healings and the shining relics told as Gregory's report; the hymn sung at her death not named by Gregory, so O gladsome light is offered as likely only; Peter's whereabouts at the death left out; the mule driver Theon and the kitchen girl invented and said so)
- *(Done: episode 91, Margaret and the Book in the River; text only.)* Saint Margaret of Scotland (Turgot's Life written for her daughter Edith-Matilda; the Anglo-Saxon Chronicle D; Lanfranc's letter; the nine orphans and the spoon, the treasury and the king's pretend threats, the books he could not read, the king translating for the clergy, the three hundred poor, ransomed captives, the free ferry, her death and last prayer; the book in the river told as Turgot's report, with the surviving Bodleian book and its old poem; Saint Margaret's Hope, Queensferry, the cave, the castle chapel and Fordun's funeral mist labelled tradition; tradition named as Catholic, canonised twelve fifty; Bethoc, Aed and Wulfric invented and said so; Malcolm's raids and children's discipline only touched)
- *(Done: episode 92, Gregory and the Little Church Called Anastasia; text only.)* Saint Gregory of Nazianzus (his poem On His Own Life, Orations 2, 42 and 43, Letters 4, 5 and 101; Gregory of Nyssa for the bakers and bath-keepers; the storm vow, his mother's promise, the sun through the clouds and the would-be assassin told as his own report; Sasima told gently as the friendship's bruise; Maximus told briefly; the Philocalia labelled traditional; the relics' return in two thousand and four as history; Melitine invented and said so; completes the Cappadocian trio with episodes 89 and 90)
- *(Done: episode 93, John Chrysostom and the Last Road to Comana; text only.)* Saint John Chrysostom (Palladius's Dialogue; the Letters to Olympias; Socrates, Sozomen, Theodoret; Anthusa and the teacher's remark as John's report, Libanius's deathbed words as Sozomen's, Basiliscus's "tomorrow we shall be together" and his word to the priest as Palladius's report; the Statues homilies, Eutropius at the altar, the Oak, the fire and Cucusus as history; the Paschal Homily and the Liturgy labelled as bearing his name; the Euchaita dream and Paul at his ear labelled tradition; Theophilus and Eudoxia told briefly without villains, Theophilus named as a Coptic saint; the lamp boy and the kind soldier's words invented and said so; completes the Three Holy Hierarchs with episodes 89 and 92)
- *(Done: episode 94, Olympias and the House Beside the Great Church; text only.)* Saint Olympias the deaconess (the anonymous Life, translated by Elizabeth Clark; Palladius, Dialogue and Lausiac History fifty-six; Sozomen VIII.9 and VIII.24; John's seventeen letters; Gregory of Nazianzus's wedding poem and Gregory of Nyssa's dedication of the Song of Songs sermons; the refusal of Elpidius, the seized fortune and her letter to Theodosius, the deaconess office explained historically without the modern debate, the 'water into the sea' advice, the baptistery farewell, the trial before Optatus and the fines, exile and death in her forties told as history; Sergia's seventh-century coffin-in-the-sea account labelled later legend; the Life's claim about her marriage left out; Zoe the girl from the docks invented and said so; she picks up the story of episode 93 from Olympias's side)
- *(Done: episode 95, Simeon and the Pillar on the Hill at Telanissos; text only.)* Saint Simeon the Stylite (Theodoret, Religious History twenty-six, written while Simeon was alive; the snowy-day Beatitudes, the dream of digging, Teleda under Eusebonas and Abibion and his dismissal, Bassus and the untouched loaves, the chain and Meletius, the bugs, the nations and the pictures in Rome, the pillar heights six, twelve, twenty-two and thirty-six cubits, the prophets defence, the Bedouin crush, the one thousand two hundred and forty-four bows; dream, loaves and bugs told as Theodoret's report; the desert fathers' obedience test labelled as Evagrius's later report; the story of his mother and the harsher episodes of Antonius and the Syriac Life left out; pillar platform size not claimed; the opening caution that the Church asks no one to copy him; Habib the village boy invented and said so)
- *(Done: episode 96, Daniel and the Pillar Above the Bosporus; text only.)* Saint Daniel the Stylite (the Life by his disciple, translated in Dawes and Baynes, Three Byzantine Saints; Delehaye, Les Saints Stylites; Martha's promise, the monastery at twelve, Simeon's blessing on the ladder, the turn from Jerusalem to Byzantium, nine years in the old temple at Anaplus, Anatolius, Sergius and Simeon's tunic, Gelanius's vineyard, Leo's double column, the ordination by Gennadius, the one descent under Basiliscus told without taking up the Chalcedon argument, the testament and death in four hundred and ninety-three; the Jerusalem-road old man, the temple's demons, the healings, the frozen night, the ladder at the ordination and the fire warning told as the Life's report; the naming story and most wonders left out; the boatman Kyriakos and his daughter Theodora invented and said so; sequel to episode 95)
- *(Done: episode 97, Romanos and the Scroll on Christmas Night; text only.)* Saint Romanos the Melodist (Synaxarion of Constantinople, first of October; Maas and Trypanis's genuine hymns; Grosdidier de Matons; Lash; Krueger; Emesa, Berytus, Anastasius, the Kyrou church, about sixty genuine kontakia with the 'humble Romanos' acrostic, the Christmas prooimion still sung, Mary at the Cross and the hymn on the earthquakes and fires of 532 as history; the poor voice, the dream, the scroll and the ambo told as the Synaxarion's report with the Ezekiel and Revelation echo named as its meaning; the Akathist attribution named as doubted and left out; the Nika riots only touched; Stephanos the lamp-boy and Eudokia the bread-seller invented and said so)
- *(Done: episode 98, Andrew of Crete and the Great Canon; text only.)* Saint Andrew of Crete (the Great Canon in the Lenten Triodion; Niketas's Life; the Synaxarion for the fourth of July; Daley and Cunningham for the Marian homilies; Damascus, Jerusalem under Theodore, the delegation of six hundred and eighty-five on the Sixth Council, deacon of Hagia Sophia over an orphanage and an old people's home, Gortyna, Philippikos's synod of seven hundred and twelve and the return after it told honestly, death on Lesbos about seven hundred and forty as history; the mute childhood and the raid turned back told as the Life's report; when and where the canon was written not claimed; the canon's form explained from the nine biblical odes; the Mary of Egypt reading in the fifth week of Lent tied back to episode 20; Leo the orphan scribe and both cooks called Anna invented and said so)
- *(Done: episode 99, John of Damascus and the Baskets at the Market; text only.)* Saint John of Damascus (his three treatises on the divine images, Louth's translation and study; Theophanes; the acts of Nicaea II; the Greek Life for the Italian captive teacher, the forged letter and the healed hand before the icon of the Three Hands, the baskets sold in Damascus, the funeral hymn, the penance and the elder's dream, all labelled the Life's report and the hand named as most historians' legend; the Hilandar icon and Saint Sava labelled that monastery's tradition; the Easter canon paraphrased in our own words; Elias the young brother invented and said so; his chapter on the Ishmaelites, Barlaam and Josaphat, and the filioque left out)
- Next up, suggestions: more saints' lives to balance the long run of Scripture episodes (Saint Gregory of Nyssa himself; Saint Thecla of Iconium, labelled as the Acts of Paul and Thecla's legend; Saint Theodore the Studite at Constantinople, who would carry the icon story of episode 99 into its second round under Leo the Fifth; Saint Cosmas the hymn-writer, John's adopted brother, briefly met in episode 99; Saint Sabbas himself, founder of the monastery in the cliffs)

## Audio status

Episodes 1 to 19 have audio (episodes 20 to 99 are text only: the audio folders sit near the creative prompt's 400 MB line; run its `du` for the current figure) (episode 19 rendered 2026-10-23, about 27 minutes) (episode 18 rendered 2026-10-23, about 32 minutes) (episode 17 rendered 2026-10-23, about 36 minutes) (episode 8 was rendered on 2026-10-22, about 33 minutes). If Hugging Face is blocked in a cloud session, the Kokoro model files are also on GitHub: `https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/` (`kokoro-v1.0.onnx`, `voices-v1.0.bin`) into `~/.cache/kokoro`. Use `/usr/bin/python3` if `python3` lacks numpy. A render takes about 15 minutes.

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
