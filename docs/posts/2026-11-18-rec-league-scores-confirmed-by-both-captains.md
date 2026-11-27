---
title: "Rec league scores confirmed by both captains, with no organiser step"
seo_title: "Free rec league score confirmation by both captains"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "Each team gets a captain link. When both captains report the same score it goes into the table; when they differ, the organiser sees both."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

The self-hosted league page in
[League Schedule Generator](https://marisstella.app/league-schedule-generator/) has had a
"Report a score" form for a while. Every score sent there waited for the organiser to approve it.
That is safe, but in a twelve-team league it means six approvals a night, every week, for scores
nobody disputes. Paid league apps remove that chore with score confirmation: both sides report,
and a match only needs a person when they disagree. The league page now does the same.

## What landed

- **A captain link per team.** The organiser's page lists one link per team: the league link plus a
  short key. The key is a keyed hash of the team name under the server's admin secret, so nothing
  new is stored, reordering the team list keeps every link, and changing the secret replaces them
  all. With email set up, one button sends each team its own link at its contact address.
- **The captain's view.** A captain's link opens the usual league page with one extra section at the
  top: their team's games from the last three weeks, each with its state ("not reported yet",
  "waiting for the other captain", "in the table") and a score form.
- **Two matching reports close the game.** When the second captain sends the same score, the result
  goes straight into the table as `Hawks 3 - 1 Owls`, home first. Reports are keyed by the fixture's
  id, which a game keeps when it is rained out and moved, so a closed game cannot be added twice.
- **Disagreements go to the organiser.** Different scores, and games only one side has reported,
  show under "Captain reports" with both scores side by side and a button to use either one or to
  clear them. A captain who made a typo can resend until the game is closed.

## What it does not do

It is not a dispute process: the organiser's pick is final. Anyone holding a team's captain link can
report for that team, the same trust the league link already carries, so organisers should give each
captain only their own. A score the organiser typed by hand is not matched to a fixture, so they
should not also approve that game from captain reports.

## How it was checked

Seven tests in `confirm.test.mjs`: keys are distinct, stable and secret-dependent; matching reports
confirm and differing ones dispute; a closed game refuses more reports; the three-week window; and
the full server flow (both captains report, the table updates, a third report is refused, a captain
cannot report another team's game, a bad key is refused, the organiser picks one of two differing
scores, captain links are emailed only to each team's contacts). No real league has used it yet. That
is the next thing to learn.
