---
title: "A rainout should not serve a suspension: cards counted against the real fixture list"
seo_title: "Track yellow card suspensions in a rec league, free"
date: 2026-11-21
tags: [league-schedule, soccer, rec-leagues, tools]
description: "The self-hosted league page now keeps a cards log, works out every ban from the league's rules and serves it only in games actually played."
---

Any league with referees keeps a cards list. The rule fits on one line (five yellows is a one-game ban, a red is a ban too); the counting is where organisers lose evenings. Which game does a ban start from? Does last Monday's rainout count as served? A player booked twice in one game: is that two more cautions, or a sending off?

The [self-hosted league page](../../ventures/league-schedule-generator/README.md) now answers those for the organiser. They keep one plain-text log in the admin page, a line per card, in the same style as results:

```
2026-09-21 Hawks: Sam Reed yellow
2026-09-21 Kites: Max Bell ban 2
```

**What it works out.** From the league's own rules (a ban after every N yellows, its length, longer bans for later steps if ticked, the red and two-yellow bans) it builds each player's bans and serves them, in order, in their own team's fixtures after the card. The fixtures are the ones the page already holds after rainouts, withdrawals and late teams are applied, and only games before today count. So when a game is rained out and moved three weeks later, it serves nothing until it is played. A second yellow is a sending off with its own ban and does not add to the running yellow total, which is how most leagues count it.

**Who sees it.** The organiser sees every live ban with the games still to miss by date and opponent, the players one yellow from a ban, and a CSV. Each captain's page shows only their own team's suspensions, so the team sheet is right before kick-off. If the organiser ticks Show, the public league page lists suspensions and the top ten scorers.

**A worked case.** In the [guide](../../ventures/league-schedule-generator/how-to-track-yellow-card-suspensions-in-a-rec-league.html), a player picks up a third yellow on 21 September in a league that bans after three. The team's 28 September game is rained out, so the ban lands on 5 October instead. A test recomputes that table from the code the server runs.

**What it is not.** It keeps the count. Hearings, appeals, fines and whether a ban carries into next season stay with the league. No real league has used it yet; that is the next thing to learn.
