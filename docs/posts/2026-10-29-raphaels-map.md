---
title: "Raphael's Map: where to meet marriage-minded Catholics, without making up a number"
date: 2026-10-29
description: "A free research tool for Catholic singles built on public county data and public parish and campus groups. Why it shows two scorecards instead of one multiplied estimate, and what it refuses to do."
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

<!-- FINDINGS: coordinator fills in after the data lands -->

## The community list is marked as unchecked

The communities view lists public organizations only: parish young adult
series, campus ministries, diocesan young adult offices and Traditional Latin
Mass parishes, starting with the Colorado Front Range and a few other large
metros. The organizations' own websites could not be reached from the
environment that compiled the list, so every row carries a **Not verified**
badge, with a note saying what the search result showed. The badge goes away
only when someone opens the official page and records the date. Rows checked
more than 180 days ago are marked stale. And an organization being on the
list does not mean it has many people your age, or anyone looking to marry.

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
