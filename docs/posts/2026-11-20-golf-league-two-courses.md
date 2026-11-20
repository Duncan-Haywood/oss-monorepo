---
title: "A golf league on two courses: the same index, 8 strokes at one and 12 at the other"
seo_title: "Golf league on two courses or 27 holes: schedule and handicaps"
date: 2026-11-20
tags: [golf, league-schedule, handicaps, tools]
description: "The free golf league page now runs leagues that rotate between two courses or a 27-hole course's nines, with rating and slope handicaps per course."
---

Plenty of twilight golf leagues do not play one course's front and back nine all season. Two clubs take turns hosting. A league splits its weeks between a home course and a sister course. A 27-hole facility rotates its Red, White and Blue nines. The [golf league schedule generator](../../ventures/league-schedule-generator/golf-league-schedule.html) assumed one card until today, so a league like that had to score half its nights by hand.

Now you type the rotation under the schedule, for example "Oak front, Pine front, Oak back, Pine back" or "Red, White, Blue", and one card per course under a "Course: Oak" line. A 9-hole nine needs just nine pars and nine index numbers, odd or even ones as 27-hole cards print them. Every night is scored on its own course's card, tees included. The counts table shows each team's nights at each course, and play-off nights carry on the rotation.

The harder part is handicaps. A league handicap worked over par treats a nine at a tight, long course the same as a nine at an easy one, so in a league that moves between them, a player's handicap goes up and down with the venue. Add each course's rating and slope and the page follows the World Handicap System's arithmetic instead. Each round's differential is (adjusted score minus rating) times 113 over slope. The league index is the average of the rounds counted. Tonight's strokes are your handicap percentage of index times slope over 113, plus rating minus par.

Here is a worked case from the tests. A player with an index of 10, at the default 90%, gets 8 strokes on a par-36 nine rated 35.0 with slope 113. On a par-36 nine rated 37.5 with slope 135 they get 12. A league that skipped this would give them the same strokes at both courses.

The page refuses to guess. If a course in the rotation has no card, a player's forward tees appear on one course's card but not the other's, an 18-hole course appears with no nine named, or only some courses have ratings, it names the problem and scores nothing. Rating and slope are all or none, so every handicap stays on one basis.

Some limits. The whole league plays one course a night, which is how courses book leagues; a league split across two courses on the same night isn't covered. A rated league index is still a league handicap, not a Handicap Index, and it posts nothing to any association. When a card gives only an 18-hole rating, halving it for each nine is an approximation. Everything runs in the browser, nothing is uploaded, and no real league has used it yet.
