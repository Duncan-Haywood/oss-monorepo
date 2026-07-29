# What Quick pick is for

The canonical, machine-checked version of this is `GOALS` in
[`src/lib/developmentProcess.ts`](../src/lib/developmentProcess.ts). This is the
reasoning behind it.

## The one-sentence version

Two people who are together answer a stream of two-option questions on their own
phones, and get back something true about each other that neither could have
told you if you had simply asked.

## Who it is for

**Couples, first and specifically.** Not "users". Not a general-purpose
preference engine that a couple might happen to use. Every design decision
below only makes sense under that constraint:

- The three perspectives (what I want for myself, what I want in a partner,
  what I *think* they want) exist because the interesting output is the
  disagreement between the second and the third across two people.
- Invite codes link exactly two accounts, not a group.
- The insights that get shown first are actions one person can take for the
  other, not rankings.

A single person can use it alone and get a real picture of their own
preferences. That is a genuine but secondary use — when the two conflict, the
couple wins.

## The five goals

### 1. Measure honestly

Preferences are measured, not asserted. Discrete items go through Glicko-2 so
every ranking carries a rating deviation; continuous attributes go through a
Davidson tie-extended Bradley–Terry fit so trade-offs come with standard
errors. Confidence must come from the data, and must be visible.

The failure mode this guards against: a beautiful screen showing a ranking
built on nine answers, with nothing on it to say so.

### 2. Each person's answers stay their own

Ratings are stored per participant, and the three perspectives never share
state. There must be no path — not a shared row, not a coerced enum value, not
a merge in a resume handler — by which one person's answer moves another
person's ranking, or by which two perspectives collapse into one.

This is the goal that everything else is built on. Without it there is no
"her ranking", only "the ranking", and the whole deliverable evaporates.

### 3. The couple gets something usable

The output that matters is not a compatibility score. It is:

- **Actions** — "they would rather you took something off their plate than
  bought them something", drawn from the behaviour, affection and relationship
  categories, and only shown once the rating deviation is low enough to mean it.
- **Shared ground** — what you both rate highly, which couples are famously bad
  at articulating about themselves.
- **Blind spots** — your guess at what they want, against what they actually
  want. The sharpest output in the app, and the one that most needs all three
  perspectives to be recorded distinctly.

A score is a thing to argue about. An action is a thing to do tonight.

### 4. Worth answering the next question

Someone has to want to keep going, on a phone, in the gaps of a day. So:
progress is visible, something new unlocks on a felt cadence, an answer can be
undone, and progress survives a refresh, a new device, and a switch between
perspectives. A flow that loses answers is not a slow flow, it is a broken
promise.

The core couple journey does not ask someone to operate those perspectives as
settings. It alternates short partner-preference and self-value rounds, pauses
at each handoff with an explicit explanation, and labels the active focus above
every question. The data stays separate; only the navigation is unified.

Level boundaries may check whether a new finding is ready, but they do not
earn an interruption by themselves. The card flow stops only for a concrete,
newly supported preference or trade-off that gives the person a useful
question to take to their partner. The app checks every five answers once a
person has answered ten, but leaves at least ten answers between interruptions.
Generic progress remains in the header, and the same kind of finding is not
promoted twice.

### 5. Safe to hand to someone you love

No personal data in the repo or the client bundle. Nothing indexable. Consent
stated before anything is collected. Aggregates cross the boundary between two
linked people — never raw answers.

The bar is not "compliant". The bar is that you would be comfortable if the
other person read the source.

## Explicit non-goals

- **A compatibility score.** A single number invites a verdict, and the data
  does not support a verdict.
- **A social network.** Two linked accounts, no feed, no discovery.
- **Advice.** The app reports what someone's answers imply. It does not tell
  anyone what to do about their relationship.
- **Scale.** Nothing here needs to serve a million people. Correctness for two
  beats throughput for many.

## How you would know it is working

| Goal | Signal |
| --- | --- |
| Measure honestly | Intervals narrow as answers accumulate; nothing confident is shown before the data supports it |
| Answers stay their own | No code path merges perspectives or participants; the perspective a session records is the one the person chose |
| Usable output | The couple screen leads with actions and shared ground; blind spots have real data behind them |
| Worth continuing | Progress survives refresh, device change and mode switch; the drop-off point is somewhere other than question three |
| Safe to hand over | No PII in the bundle or the repo; nothing indexable; consent stated before collection |
