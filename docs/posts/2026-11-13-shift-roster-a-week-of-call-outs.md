---
title: "A week of call-outs at a real roster's rates: keep the posted schedule, tell fewer people"
seo_title: "Rescheduling after call-outs: staff changes over a whole week"
date: 2026-11-13
tags: [shift-roster-builder, product, measurement]
description: "At one firm's real call-out rates, rebuilding a posted week from scratch told 6 people a week of a change; keeping the posted shifts told 2.5."
---

When someone calls out, [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) rebuilds the rest of the week. Since yesterday it keeps the posted shifts by default. Shifts that have already started stay as they were. Every other posted shift someone keeps earns a small bonus in the score, so the rebuild moves only the people it has to ([changing a posted schedule](https://marisstella.app/shift-roster-builder/schedule-change-after-posting.html)).

Every measurement of that so far used one call-out at a time against the first posted roster. A real week has several, and each new schedule becomes the one the next change starts from. So today's question: over a whole week, at the rates a real roster shows, how many people get a late change?

## The rates

Earlier today the importer learned to read a real Deputy timesheet export: five weeks at one security firm, with each worked shift beside the rostered one. Two numbers from it:

- **8.4% of rostered rows were leave**, and 1.0% were sick leave. Sick leave is the only kind that is clearly short notice, so 1.0% is the floor and 8.4% the ceiling.
- **10.9% of the work had no rostered shift.** Those are extra shifts added after the schedule was made.

## The experiment

The model is five invented teams: a café, the café with a spare part-timer, a salon, a retail shop and a clinic, 40 seeded weeks each. From Tuesday on, every person-day worked can become a call-out and every posted shift can gain an extra copy, at the rates above. Each day's events are announced at 5pm the evening before. The week is then rebuilt one of two ways: from scratch, or keeping the posted shifts. Every change to someone other than the caller is priced at an hour of their pay, the way a short-notice premium might be. That premium rule is invented, not taken from any ordinance.

| 200 weeks per row | changes to other people: rebuild / keep | premiums: rebuild / keep | open hours: rebuild / keep |
|---|---|---|---|
| sick-leave rate, no extras | 174 / 69 | $3,175 / $1,239 | 351 / 354 |
| sick-leave rate, extras | 1,597 / 547 | $29,195 / $10,099 | 2,814 / 2,809 |
| all-leave rate, no extras | 1,276 / 557 | $23,019 / $9,922 | 1,657 / 1,637 |
| all-leave rate, extras | 2,260 / 826 | $41,043 / $14,958 | 3,734 / 3,753 |

All 2,376 rebuilds were proven optimal for the week they were given. Keeping the posted shifts cut changes to other people by 56-66%. At the busiest setting, a from-scratch rebuild told about 6 people a week of a change and the kept one about 2.5. In premiums that's $205 a week against $75. Out of 631 disrupted weeks, keeping made more changes on exactly one.

## The catch: luck runs both ways

Each rebuild covers as many hours as possible for the week in front of it. It can't see the next call-out. On 29 weeks the kept schedule ended with more open hours than the from-scratch one, and on 31 it ended with fewer. Overall the difference was 19 hours out of 3,734 one way at the busiest setting and 20 hours the other way at another.

One week shows the mechanism. On the spare café, Ben is off Tuesday and Ana is off Thursday. Ana's call-out alone leaves 3 hours open under either policy. But the from-scratch rebuild on Tuesday made 14 changes, and one of them happened to leave someone rested and free on Thursday. The kept rebuild made 3 changes and left the 3 hours open. A rebuild that holds back slack for later call-outs could win both ways. That is the next question, and it wasn't tried here.

## What this doesn't show

- The rates come from one firm's five weeks and are applied to invented teams.
- Call-outs are drawn independently, while real sickness clusters.
- Some of the 8.4% leave was known in advance.
- An extra shift is modelled as one more copy of a posted shift, announced the evening before.

The script is `eval/real-rate-week.mjs` and the full output is `eval/real-rate-week.out.txt`, both in the [repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder). The README section "A whole week of call-outs at a real roster's rates" has the details.

This is arithmetic on invented teams and an invented premium rule. It isn't legal advice: check your local scheduling rules.
