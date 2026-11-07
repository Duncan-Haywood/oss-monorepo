# Doctrine review rubric

How the ongoing doctrine review grades the repository's Catholic fiction
(Hearth & Horizon's three shelves and Saints by Candlelight) against
**strict traditional Catholic doctrine**. The scoreboard and the batch
picker are in `doctrine_review.py`; the per-story verdicts are in
`reviews.yaml`; the write-ups are the blog posts tagged `doctrine-review`.

This is a reader's audit by an AI, not a theological censor. It has no
*nihil obstat*, no imprimatur and no authority; it only says where a story
sits against what the Church teaches and how the stricter, traditional end
of Catholic opinion would read it.

## What "strict traditional" means here

The yardstick is the Church's own teaching read without softening: the
creeds, the defined dogmas of the councils (Lateran IV, Florence, Trent,
Vatican I), the *Catechism of the Catholic Church*, the 1983 *Code of
Canon Law*, the Roman Missal's rubrics, and the pre-conciliar manual
tradition where it is still the Church's teaching. "Traditional" means the
reviewer takes the strict reading where the Church allows more than one
(for example on the historicity of Scripture's narratives, on angels, on
whether a separated tradition's saints are Catholic saints), and notes
where a traditionalist reader would object even when no doctrine is broken.

Findings are graded by **what kind of teaching is touched**, because a
story that gets a rubric wrong has not denied a dogma:

| Level | Kind of teaching | Examples |
|---|---|---|
| **D** | Dogma or defined doctrine (de fide, creed, council) | Trinity, Incarnation, Real Presence, Marian dogmas, angels as created pure spirits, only a priest consecrates or absolves, the soul's particular judgment, hell, purgatory |
| **M** | Moral teaching | lying, contraception, euthanasia, marriage, scandal, superstition and magic |
| **L** | Liturgy, sacraments and discipline (rubrics, canon law, who may do what) | who may bless, the Sunday and vigil obligation, the Angelus form, lay baptism only in necessity, feast dates, titles of saints |
| **P** | Piety, legend and history handling | a legend told as history, a miracle credited to a saint rather than to God, relics as magic, an invented miracle attributed to a real saint |
| **T** | Traditionalist sensibility (no doctrine broken) | a post-conciliar practice shown as the only one, ecumenical framing that a strict reader would call indifferentist in tone, historical-critical asides about Scripture |

## Verdict per story

- **faithful**: no finding above level T.
- **minor**: at least one L or P finding, none at D or M.
- **concern**: a D or M finding where the text can be read orthodoxly but a
  strict reader would object (ambiguity, imprecision, an unanswered error in
  a character's mouth that the narration seems to endorse).
- **error**: the narration states or clearly endorses something the Church
  teaches against.

A character's sin, doubt or wrong opinion is **not** a finding unless the
narration endorses it. Invented dialogue and colour in a Scripture or
saint's story are not findings when labelled as invention (that is the
house rule and the Church tolerates it in pious retelling).

## Evidence rules (research integrity)

- Every finding quotes the story **verbatim** (a short span, exact
  characters) so a later run can `grep -F` it. A finding whose quote does
  not match the file is dropped.
- Name the teaching in words. Cite a *Catechism* paragraph, canon or
  council only when sure of the number; otherwise describe it. Never
  invent a citation.
- Say what a fix would be, in one line.
- Note the strengths too (`notes`): a story that handles a hard point well
  is evidence about the corpus, not filler.

## Known house rules that create tension (read once per review)

- Saints by Candlelight's rule 1 is "never contradict Catholic **or
  Orthodox** doctrine" and it stays off disputed ground. It tells some
  Orthodox-only saints (canonised by an Orthodox Church, not by Rome). Under
  a strict traditional reading those are not Catholic saints; check that the
  episode says so (its rule 7) and grade a missing or wrong statement L.
- Hearth & Horizon's worldview rule 7 ("fair to all") is good; check it never
  slides into indifferentism (all religions equally true) in the narration.
- The science fiction shelves keep grace ambiguous on purpose (rule 4). That
  is not a doctrinal problem; denying grace or providence would be.
- AI characters: the house position is that the metaphysics is unsettled.
  A strict reading holds that a machine has no rational soul; grade T if a
  story leans toward ensoulment, M/D only if the narration asserts it or an
  AI administers or simulates a sacrament.
