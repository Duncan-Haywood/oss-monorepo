---
title: "An opinionated website builder for monasteries and convents"
seo_title: "Free website builder for Catholic monasteries, convents and abbeys"
date: 2026-11-03
tags: [catholic, monastery, websites, open-source, nonprofit]
description: "A free builder that turns one form into a complete monastery website: horarium, vocations with an inquiry form, giving, prayer requests and retreats."
---

Many monasteries and convents have no website. Many others have one that a
volunteer built years ago and nobody can now edit. For a contemplative
community, two pages matter more than all the rest. The **vocations** page is
how a young person discerning a call finds them. The **giving** page is how
friends support a life that has no other income.

So we built [Monastery site](https://marisstella.app/monastery-site/), a free
and open-source website builder for Catholic monks and nuns. A sister, a
brother or an oblate fills in one form and downloads a finished site to put on
any free static host. Here are two made-up examples:
[a Benedictine abbey](https://marisstella.app/monastery-site/demo/abbey/) and
[a Poor Clare monastery](https://marisstella.app/monastery-site/demo/sisters/).

## What it makes

- **Vocations:** who may apply, the stages of formation from postulancy to
  solemn vows, Come and See retreats, the questions discerners ask, and an
  inquiry form addressed to the vocation director.
- **Giving:** the community's own donation page (with monthly giving marked),
  cheques, Mass intentions or spiritual enrollments, current needs, a campaign
  with a dated total, and the legal name a will needs.
- **Horarium:** the Divine Office and Mass, with the hours open to visitors
  marked.
- **Prayer requests, visiting and the guesthouse, events, news, a shop,
  contact and privacy.**
- **The parts search engines read:** titles, descriptions, structured data for
  the community, its events and its FAQ, a sitemap and an llms.txt.

## Why opinionated

A general website builder offers a thousand choices. A community with an hour
a week for its website needs a few good ones made for it. So the pages are
fixed, and a page left empty disappears. The six palettes are each checked so
that every text colour reaches the 4.5:1 contrast people with low vision need.
The site loads no outside scripts, fonts or trackers. A **launch checklist**
says what a visitor would trip on, ranked by how much it matters. A giving link
that isn't https is flagged as serious. So is a community with no monthly
giving option, or a campaign total with no date.

Two things the builder will never do. It never handles money: the giving page
links to the donation page the community already uses. And it never invents
anything: it does not write a tax statement for the community, only asks for
one in its accountant's words.

## What's next

The forms work today by opening the visitor's email program with the message
ready. Next comes a small form handler that each community runs on its own
free account, so inquiries arrive even from visitors with no mail program set
up. After that: one-click deploys, a Mass intention request form, a liturgical
calendar and sites in more than one language. The
[roadmap](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/monastery-site/ROADMAP.md)
has the list.

If your community would like a site but has no one to set it up, we build them
for free: [ask here](https://marisstella.app/custom-development/).
