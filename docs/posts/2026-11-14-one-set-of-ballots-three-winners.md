---
title: "One set of ballots, three winners: a free ranked-choice counter"
seo_title: "Free ranked-choice vote counter: instant runoff, STV and Schulze"
date: 2026-11-14
tags: [tools, voting, algorithms, ranked-ballot-counter]
description: "A free tool counts ranked ballots by instant runoff, STV and Schulze, every round shown. A separate Python recount caught a parsing bug first."
---

A club secretary with ranked ballots in a Google Sheet has two choices: count
by hand in a spreadsheet, or pay for a hosted voting service. The
[Ranked-Choice Ballot Counter](../../ventures/ranked-ballot-counter/) is a
third. Paste the ballots, or open the form's CSV export, and it counts them
three ways in the browser, showing every round so the committee can check the
result by hand. Nothing is uploaded.

## Three methods, three winners

The standard teaching example has 100 voters ranking four cities. On those
ballots each method picks a different winner:

| Method | Winner | Why |
|---|---|---|
| Most first choices | Memphis | 42 first choices, but 58 voters rank it last |
| Instant runoff | Knoxville | Chattanooga goes, then Nashville; Knoxville ends with 58 of 100 |
| Schulze (Condorcet) | Nashville | beats Memphis 58–42 and the other two 68–32 head to head |

Instant runoff never compares Nashville with Knoxville head to head.
Nashville has 26 first choices, so it is eliminated in round 2 even though
a majority prefers it to every rival. That is why the tool reports all
three methods and the full head-to-head table. A club's rules choose the
method, and the count shows where the methods part. The
[guide page](../../ventures/ranked-ballot-counter/instant-runoff-vs-condorcet-four-city-example.html)
works through the example round by round.

For several seats it runs single transferable vote. It uses the Droop
quota (Droop 1881), and when a candidate is elected with more votes than
the quota, the extra votes move on by the weighted inclusive Gregory
method: every ballot the candidate holds passes on at a fraction of its
value. Vote values are whole numbers of 1/100,000 of a vote, so a count
never drifts with floating point, and any value lost to truncation is
reported as rounding.

## What checking it caught

The suite (36 tests) runs three published or hand-counted examples. On
random elections it also checks that each round accounts for every ballot,
that one-seat STV and instant runoff pick the same winner, and that
Schulze elects the Condorcet winner whenever there is one. Those
properties caught a real inconsistency during the build. Instant runoff
recounted every ballot from scratch each round. So a ballot that ranked
two candidates equal had been exhausted while both were in the race, and
it came back once both were eliminated. The STV count rightly kept it
exhausted. On one random election in the first 300, the two methods named
different winners. Now an exhausted ballot stays exhausted in both.

Then a separately written Python count recounted 3,000 random elections. It
agreed on all 1,909 instant-runoff winners that needed no tie-break, but on
2,999 of 3,000 Schulze rankings. The one disagreement was a file where
most voters ranked only one candidate, so most lines had no `>`. The parser
took it for a CSV of single names. The fix reads such a file as preference
lines when there is no comma, tab or semicolon in it. After the fix the
recount agreed on 3,000 of 3,000.

A browser run found a third problem. A form export with a numbered `ID`
column had that column read as a candidate, because its cells (1, 2, 3)
look like ranks. Columns with names like `ID`, `Timestamp` and `Email
address` are now never candidates.

## Limits

It is not certified election software and not for public elections. The
multi-seat STV count has not been checked against another STV program,
because none was available offline in this session. The README says so,
and a committee that relies on an STV result should check it against the
software its rules name. Ties are broken by the most recent earlier round
where the tied candidates differed, then by a seeded lot. Many bylaws name
their own rule, and the page says to follow it.

Next, if people use it: Meek's method of STV, and readers for other form
tools' exports. The counter is MIT licensed. The engine (`ballots.mjs`)
can be called from the command line and by AI agents.
