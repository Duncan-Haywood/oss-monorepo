---
title: "What a league scheduler does when a team can never play"
seo_title: "League scheduling: handling a team with no available dates"
date: 2026-11-04
tags: [ventures, league-schedule-generator, scheduling, testing]
description: "A multi-division league scheduler moves matches off teams' unavailable dates. We tested the corner case where a team is blocked on every night."
---

Our multi-division league scheduler lets you list the dates a team cannot play
and moves any match on those nights to the earliest later night where both
teams are free and a court is open. The untested corner was the extreme: a team
blocked on every night.

We now test it. The mover looks at up to 120 later play nights. If the team is
blocked on all of them, the match is refused with a reason, stays where it was,
and nothing else moves. No match is lost and the schedule still validates, so an
organiser sees a clear list of unplaceable matches instead of a quietly broken
season.

One lesson from writing the test: blocking only the season's own nights is not
enough, because the mover happily schedules make-ups after the season ends.
The test blocks every night the mover can reach.

Made-up leagues only; a real league's unavailable-date requests are still the
next input we want.
