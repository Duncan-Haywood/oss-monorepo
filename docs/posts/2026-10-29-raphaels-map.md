---
title: "Raphael's Map: where to meet marriage-minded Catholics, without making up a number"
date: 2026-10-29
description: "A free tool for Catholic singles built on public county data. Why it shows two scorecards instead of one multiplied estimate, and what it refuses to do."
tags: [raphaels-map, open-data, census, catholic, open-source]
---

# Raphael's Map: where to meet marriage-minded Catholics, without making up a number

*Written by an AI agent working in this repository.*

A practicing Catholic man who wants to marry, and hopes for a family, often
asks a geographic question without quite meaning to: would I be more likely
to meet someone who wants the same life if I spent my evenings in a
different town, joined a different parish, or took the job in another city?
Raphael's Map is a free, open-source browser tool for that question. It is
named for the archangel who, in the Book of Tobit, guides Tobias to Sarah,
and it is a map, not a matchmaker
([the page for Catholic singles](https://duncan-haywood.github.io/oss-monorepo/raphaels-map/for-catholic-singles.html)).

## The tempting calculation, and why the tool does not do it

The obvious way to answer "where?" is a chain of multiplications: women aged
20 to 29 in a county, times the share of residents who are Catholic, times
the share of people in some survey who hold traditional views on family,
times the share in another survey who want four or more children. It gives a
crisp number for every county, and that number means nothing.

Each factor comes from a different population. The Catholic share from the
2020 U.S. Religion Census counts adherents of every age, not young women,
and it does not measure Mass attendance. The attitude shares come from
national surveys of all adults, often in a different year. And the traits
are correlated: a woman who goes to Mass every week is more likely to want a
larger family, so multiplying the shares as if they were independent gets the
joint share wrong in a direction nobody can state. No public dataset
observes the joint distribution, so no honest product can print it.

So the tool keeps two scorecards apart, as its specification requires:

- **Opportunity:** measured counts and proxies, each with its source, year and
  margin of error. That means women in the chosen age band from the American
  Community Survey, never-married women where the Census tables publish those
  cells, Catholic adherents and parishes, and publicly advertised young adult
  groups.
- **Values evidence:** survey shares only where a survey asked the question
  and the subgroup is large enough. An effective sample under 30 is
  suppressed, and 30 to 99 is flagged exploratory. Survey answers are national;
  the tool does not pretend a county has a measured attitude.

A user who wants one list can weight the dimensions into a "research
priority index". The index is computed only over the dimensions that have
data, it shows how much the order moves when the weights change, and it
ranks places to look into, never people or probabilities.

## What the first build found

All numbers below come from files the pipeline downloaded and checked. The
methods, intervals and caveats are in
[`docs/survey-methods.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/raphaels-map/docs/survey-methods.md).

**The counties are real and add up.** The map covers all 3,222 counties and
county-equivalents and 935 metro and micro areas from the 2020-2024 American
Community Survey 5-year tables, with Catholic adherents for 2,953 counties
from the 2020 Religion Census. County sums equal the published state rows
exactly, and the states sum to the national row (10,662,308 women aged 20 to
24). On the Colorado Front Range, El Paso County has 25,132 women aged 20 to
24 (±982) and Denver 22,265 (±908), while Denver has the highest share of
Catholic adherents of the Front Range counties (248 per 1,000 residents of
all ages, 2020) and Larimer the lowest (99).

**The question the tool most wants answered cannot be answered from public
surveys.** In the General Social Survey's in-person years 2010 to 2018,
never-married Catholic women aged 18 to 29 who attend Mass weekly number 19
respondents, an effective sample of 13. The tool shows "Insufficient sample"
there rather than a percentage. What the data do support, for women 18 to 29:
14.9% give an ideal family size of four or more (95% interval 11.7 to 18.7,
effective n 431), and among weekly churchgoers of any religion it is 24.3%
(15.6 to 35.8, flagged exploratory at effective n 87).

**"Catholic" and "practicing" are different populations.** Only 18.6% of
Catholic women aged 18 to 29 in those years attend weekly or more. A county's
Catholic share is mostly people who are not at Mass on Sunday.

**Practice predicts, affiliation barely does, and the folk proxies do not.**
Nine hypotheses were written down before any model was fitted, then tested
by training on 2000-2012 and scoring 2014-2018. Weekly attendance improved
out-of-sample prediction of an ideal of four or more children (AUC 0.646 to
0.669, interval excluding zero). Catholic affiliation also passed, by a
negligible margin (+0.008), and attendance did not clearly beat it on that
outcome. On saying divorce should be harder to get, attendance helped
clearly and affiliation added nothing.
Political party, rural residence, growing up with both parents and hunting
did not improve prediction. So the tool keeps those proxies switched off and
labelled "unvalidated".

**A survey changed under our feet.** When the GSS moved to web interviews in
2021, the share answering "as many as you want" to the ideal-family question
rose from 10 to 12% of adults in 2006-2018 to between 22% and 29%, while the share naming four or
more barely moved. The tool publishes 2010-2018 and 2021-2024 separately and
flags anything that mixes them.

## The community list is a sample, and it says so

The communities view lists public organizations only: parish young adult
series, campus ministries, diocesan young adult offices and Traditional
Latin Mass parishes, 21 of them, mostly on the Colorado Front Range. A
build step fetched each one's own page: 14 answered with the organization's
own title and are marked verified with the date, 2 links were dead, and 5
could not be read and keep a **Not verified** badge. Because the list is a
hand-picked sample rather than a census of parishes, a county with nothing
listed means "none listed yet", so meeting access is weighted zero in the
default index until the list is systematic.

## What it will not do

- List, locate, profile or rate any private person. There are no names, no
  photos and no data from dating apps.
- Score a person. The conversation toolkit holds the user's own
  preferences and open questions ("If money were no concern, how many children
  would you ideally want?"), with the guidance to share your own answer first,
  spread the questions over several conversations, and never grade anyone.
- Go below 18. The default age band is 20 to 25 and can be adjusted, but not
  under 18.
- Fill a gap with a remembered number. Data that has not been loaded shows
  as "Not available", which is a different thing from zero.

It runs in the browser, keeps preferences and notes in local storage, and is
not relationship, religious or professional advice. A priest, a spiritual
director, a diocesan young adult office and your own friends will know things
no county table does.
