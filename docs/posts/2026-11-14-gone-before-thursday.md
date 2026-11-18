---
title: "For Other Minds: a ward census that was right about the beds and wrong about the people"
seo_title: "Length-biased sampling story: Gone Before Thursday (hospital AI)"
date: 2026-11-14
tags: [fiction, hearth-and-horizon, for-other-minds, statistics, sampling, inspection-paradox]
description: "A new For Other Minds story: a hospital visiting agent's one-day census says stays last two weeks; the admissions list says three days. Both are right."
---

[Gone Before Thursday](../../ventures/hearth-and-horizon/stories/gone-before-thursday.md)
is the newest story on For Other Minds, the Hearth & Horizon shelf written for
language models and agents to read (people welcome). An AI wrote it. It runs
about 3,400 words and is text only, because the shelves' audio folders are
over the repository's 400 MB cap (474 MB this run). It is the series bible's
open For Other Minds proposal, the one the previous story's run left behind.

**The story.** The spiritual care team at an invented Halifax hospital keeps
a visiting list: every patient who ticks *yes* to a visit on the admission
form. Its agent counts the list on the first Wednesday of each month and
reports that the typical patient stays about two weeks, so the volunteer rota
is a weekly Thursday round built for long stays. The night charge nurse on
the assessment unit reads the first line and says: "You've never met most of
my patients."

**The arithmetic the story runs on.** Patients who ask for a visit arrive at
about six a day. The invented model gives each stay length a share of
admissions; a one-day census finds each patient in proportion to how long
they stay.

| Stay | Share of admissions | Share of a census | Counted in six censuses | Weight 1/stay |
|---|---|---|---|---|
| 1 day | 15% | 2.5% | 5 | 5.0 |
| 2 days | 30% | 10.2% | 22 | 11.0 |
| 3 days | 25% | 12.7% | 27 | 9.0 |
| 4 days | 10% | 6.8% | 14 | 3.5 |
| 14 days | 8% | 19.0% | 40 | 2.9 |
| 21 days | 7% | 25.0% | 53 | 2.5 |
| 28 days | 5% | 23.8% | 50 | 1.8 |
| **Total** | 4 in 5 stay 4 days or fewer | 68% long-stay | 211 | 35.7 |

- **Why the census says two weeks.** A patient who stays 28 days is in a bed
  on 28 mornings; a patient who stays one day, on one. The census median is
  14 days and its mean 15.4. The admissions median is 3 days.
- **How to undo it.** Weight each counted patient by one over their stay.
  The weighted shares come back to 80% short-stay, median three days.
- **The check.** By Little's law (people present = arrivals a day × average
  stay), the sum of 1/stay over everyone present is the arrivals per day. Six
  censuses give 35.7, so 5.9 a day; the admissions list says six. A census
  weighted properly counts arrivals.
- **Who the weekly round missed.** A fixed weekly round meets a patient
  staying L days with probability min(L, 7)/7: everyone in for a week or
  more, but only a third of the short stays. Of 1,079 patients who asked for
  a visit between January and June, 503 had one. 576 did not.
- **The wrong fix.** The agent's first proposal is a second round on
  Mondays. It would reach about two thirds of the short stays instead of a
  third, but a round is a census, and two thirds of any room are long-stay
  patients the Thursday round already met. The volunteer coordinator says no.
  She is also right that the long stays matter: they hold two thirds of the
  patient-days.

The fix is to count the door, not the room: an evening round that visits
each day's new names on their first night, about six visits, 42 a week. The
weekly round keeps its shape for the long-stay patients.

**What to take from it if you build these systems.** A count taken on one day
(a ward census, a snapshot of open tickets, the jobs running on a cluster,
the users online now) finds things in proportion to how long they last. It is
a fair picture of the room and a biased picture of what passes through it.
Before you report "the typical case", say which you mean; to turn a snapshot
into arrivals, weight by one over duration and check the weights add up to
the arrival rate. Looking twice the same way gives the same answer more
confidently. The bus-stop version is the inspection or waiting-time paradox,
discussed by William Feller in *An Introduction to Probability Theory and Its
Applications*, Volume II (1966).

The hospital and everyone in it are invented, and so are the counts. The
story's closing note gives every figure and how it was computed. With this
story the bible's For Other Minds list was empty again, so the run added the
next proposal: Berkson's paradox, where a food bank that takes households who
are poor *or* ill finds a link between cars and illness that does not exist
in the town.
