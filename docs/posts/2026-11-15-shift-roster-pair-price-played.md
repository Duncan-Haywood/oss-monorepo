---
title: "Paying for the second call-out: what it buys on bigger teams"
seo_title: "Second call-out pricing on 20-40 person teams: played results"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, simulation, operations-research]
description: "Over hundreds of simulated weeks of sick calls, pricing second call-outs left 2-11% fewer open hours on three of four bigger teams."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) has two
opt-in prices for call-out slack. `--cover-price` charges a roster for each
person-day nobody could cover if that person called out. `--second-callout-price`
also charges for *pairs* of call-outs that could each be covered alone but not
both, usually because one spare person is the only cover for both. Until today
the second price had only been tested on five small sample teams. It was a big
win on one and made no difference on the rest. Every write-up since then had
ended with the same open question: what does it do on bigger teams?

**How I tested it.** I took twelve generated weeks of 20, 30 and 40 people and
built each plain roster once. From that same roster I ran the slack pass twice,
once at $25 an hour at risk and once at $25 plus $1 a clashing-pair hour. Then I
played all three rosters through the same simulated weeks of call-outs: 200
weeks each for the 20-person teams, 100 for the bigger ones. The call-out
rates were 1.0% (sick calls only) and 8.4% (all leave), both taken from a real
security firm's roster export. Each call-out is announced at 5pm the day
before, and the product reissues the week, keeping everyone else's shifts
where it can.

**On eight of the twelve weeks neither price moved anyone.** Those rosters
had no cheap move that made them safer. On the four that moved:

| team | open hours call-outs added: slack price → + pair price | sign test |
|---|---|---|
| 20 people, week 2, 8.4% | 2,697 → **2,610** | 63 weeks better, 34 worse (p 0.004) |
| 20 people, week 5, 8.4% | 4,245 → **4,168** | 20 better, 2 worse (p 0.0001) |
| 30 people, week 0, 8.4% | 2,505 → **2,404** | 45 better, 21 worse (p 0.004) |
| 40 people, week 0, 8.4% | 2,751 → 2,765 | 5 better, 7 worse (noise) |

At the 1.0% rate the differences point the same way, but there are too few
disrupted weeks to tell them from noise. On the 40-person team the open hours
were a wash. The reissues there moved 12% fewer people and owed 11% less in
change premiums at 1.0%. The pair price never cost more than $26 of payroll a
week on these rosters, and on two of them it cost nothing.

**Why it is still off by default.** The 30-person week has 121 shift copies,
one over the cap that keeps the pair price off on big weeks. With the cap lifted,
building that roster took four minutes on a 4-core cloud machine. The 40-person
week took 23 seconds. What drives the time is how many candidate moves reach the
pair check, not team size, so the worst case is hard to predict. A price that
helps is no use if the page hangs. The next step is a time cap on the pass
itself: stop at the build's budget and keep the moves already made.

**What changed in the product today:** the option's note on the page now
reports this result next to the sample-team one. The simulation script is
`eval/pair-played-big.mjs`, its output is `eval/pair-played-big.out.txt`, and
the full table, including changes and premiums, is in the README under "The
pair price in played weeks".

All of this is on made-up teams and generated weeks, with single runs on one
machine. The 60-person week was not played, because at this machine's speed
100 simulated weeks would take about ten hours. This is scheduling arithmetic,
not employment or legal advice.
