---
title: "Twelve prayer intentions, twelve software ideas: what open-source tools could do for the Church in 2026"
seo_title: "Catholic software ideas for Pope Leo XIV's 2026 prayer intentions"
date: 2026-11-03
tags: [catholic, parish-office, dev-ideas, open-source, prayer-intentions]
description: "Pope Leo XIV's twelve 2026 prayer intentions, the Church's own 2026 numbers, and the software and hardware this project could build for each, ranked."
---

This project already builds a few things for Catholics: a [Mass intentions book that checks itself against canon law](https://marisstella.app/parish-office/), bedtime saints' stories, and a chant-to-music pipeline. This post asks a wider question: **what problems is the Church naming this year, and is there software or hardware an open-source shop could build for them?**

I started from what the Church itself asks people to pray for, not from what would be fun to code. Below are the year's twelve papal intentions, the Church's latest numbers, a few things bishops have asked for, and then a list of build ideas with an honest note on each. Some intentions call for software. Some don't, and I say so.

## What the Church is asking for in 2026

Each year the Pope's Worldwide Prayer Network publishes one intention per month. These are Pope Leo XIV's for 2026, [as published by EWTN News](https://www.ewtnnews.com/vatican/these-are-pope-leo-xiv-s-prayer-intentions-for-2026) on 22 December 2025:

| Month | Intention |
|---|---|
| January | Prayer with the word of God |
| February | Children with incurable diseases |
| March | Disarmament and peace |
| April | Priests in crisis |
| May | That everyone might have food (and not waste it) |
| June | The values of sports |
| July | Respect for human life |
| August | Evangelisation in the city, "marked by anonymity and loneliness" |
| September | The care of water |
| October | Mental health ministry |
| November | The proper use of wealth |
| December | Single-parent families |

Some context from this year's numbers and statements:

- **More Catholics, and more of them for each priest.** The 2026 statistics dossier that Agenzia Fides publishes before World Mission Sunday counts about 1.422 billion Catholics (17.8% of the world) and 407,421 priests. Press reports say priest numbers rose for the first time in five years, by 425, but Catholics per priest still rose by 38, to 3,491. Women religious and major seminarians fell. For the first time there are more Catholics in Africa than in Europe ([Fides statistics page](https://fides.org/en/stats), [Reuters via Internazionale](https://www.internazionale.it/ultime-notizie-reuters/2026/10/16/catholics-in-africa-outnumber-those-in-europe-vatican-says)). I took these figures from press coverage, not the dossier's own tables.
- **Persecution.** Open Doors' 2026 World Watch List counts 4,849 Christians killed for their faith in its reporting year (to 30 September 2025), 3,490 of them in Nigeria. It estimates 388 million Christians face high levels of persecution or discrimination ([Vatican News](https://www.vaticannews.va/en/church/news/2026-01/open-doors-world-watch-list-2026-report-christians-persecuted.html), [EWTN News](https://www.ewtnnews.com/world/africa/nigeria-accounts-for-72-percent-of-christian-killings-worldwide-new-report-finds)). Some outlets add that ethnic and economic conflict drives part of this violence as well.
- **Bishops on migrants.** In November 2025 the US bishops issued a special message on immigration. In January 2026 their president called for a Holy Hour for peace, and in June 2026 they released a prayer service commemorating immigrants ([Catholic Review](https://catholicreview.org/us-bishops-release-prayer-service-commemorating-immigrants-enslaved-with-call-to-action/)). Nigeria's bishops keep naming kidnappings and displaced communities, and the US bishops have written to them in solidarity ([USCCB](https://www.usccb.org/resources/letter-solidarity-church-nigeria-after-abductions-st-marys-school-november-25-2025)).
- **AI.** Pope Leo XIV's first encyclical, *Magnifica Humanitas* (25 May 2026), is about artificial intelligence. It calls for robust regulation and says AI must serve the common good rather than become a tool of domination ([Religion News Service](https://religionnews.com/2026/05/25/in-his-first-encyclical-pope-leo-xiv-says-ai-must-serve-humanity-not-the-powerful-few/)). For anyone building software for the Church this year, that is the design brief.

## The design brief, before the ideas

Three constraints follow from the facts above, and every idea below has to meet them:

1. **It has to work where the Church is growing.** That means Africa and Asia: low bandwidth, shared or cheap Android phones, unreliable power, and many languages. A cloud subscription tool that needs fibre helps a parish in Ohio, not one in Enugu.
2. **It must not watch people.** Parish data is sacramental records, children, offerings, and sometimes people in danger. *Magnifica Humanitas* and plain prudence point the same way: local-first, nothing uploaded by default, no ad tracking, no selling data. The parish-office tools already work this way: they run in the browser and the data stays on the machine.
3. **It should give a priest's time back.** At 3,491 Catholics per priest, every hour a pastor spends on paperwork is an hour taken from the sacraments. The April intention, for priests in crisis, is partly about overwork.

## Twelve ideas, one per intention

**January, the word of God: an offline lectio divina reader.** It would show the day's readings, a short guided lectio divina, and a small-group mode for a Basic Christian Community meeting without a priest. The hard part is licensing, not code. Most modern Catholic translations are copyrighted (the NABRE, the Jerusalem Bible, most vernacular lectionaries), so a free tool can only ship public-domain texts like the Douay-Rheims and the Vulgate, plus whatever a bishops' conference licenses. A hardware twin would be a solar audio player loaded with readings in a local language, for oral cultures and people who don't read. Worth doing, but only once a translation's rights holder agrees.

**February, children with incurable diseases: a parish care rota.** It would organise meals, lifts to hospital, sibling childcare and respite hours for a family caring for a very sick child, with the family controlling who sees what. This is software, not medicine, so it gives no clinical advice. It reuses the portfolio's existing [volunteer shift scheduler](https://marisstella.app/volunteer-shift-scheduler/). Small, buildable, and it helps.

**March, disarmament and peace: probably not ours.** I could not find software that moves nuclear disarmament, and I won't pretend to. The closest useful thing is the documentation tool under "Beyond the twelve" below.

**April, priests in crisis: finish the parish office.** This is the most direct fit, and it is already under way. The [parish-office roadmap](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/parish-office/ROADMAP.md) lists the next modules: a collection count sheet, contribution statements, sacramental registers and certificates, a safe-environment tracker, a minister scheduler and a liturgical calendar. Each one takes a recurring chore off the pastor's or secretary's desk, for free, without a subscription. It doesn't heal a vocation in crisis, but it removes some of the overwork that feeds one.

**May, food for everyone: a pantry inventory and waste log.** Most parish food pantries track stock on paper or in a spreadsheet. A local-first inventory would track use-by dates, rotate first-expiring stock first, log what was thrown away and why, and print a monthly "what we wasted" page. The intention asks for exactly that, waste avoided as well as food given. Measurable, buildable, and useful well beyond Catholic parishes.

**June, the values of sports: a parish league scheduler.** Round robins, pitch bookings, and a code-of-conduct sign-off for coaches tied to the safe-environment tracker. Useful but low priority; plenty of generic league tools exist.

**July, respect for human life: a findable directory of help.** A directory of maternity homes, pregnancy and parenting support, and hospice and palliative care in a region, with opening hours, languages and what each offers, kept as open data and printable as a bulletin insert. It gives no medical or legal advice and describes the services, nothing more. The real work is keeping the data honest and current.

**August, the anonymous city: make parishes findable.** Someone new to a city, lonely, who searches "Catholic young adults near me" often finds nothing, because parish websites don't publish their events in a form search engines and assistants can read. A small open tool could turn a parish's weekly schedule (Masses, confession, adoration, small groups, languages) into schema.org markup, an iCal feed and an `llms.txt`. That would make every parish findable by people and by AI assistants. It's cheap, it fits the SEO work this project already does, and it scales to thousands of parishes. One of my top picks.

**September, the care of water: hardware for mission schools and clinics.** This is where hardware earns its place. Ideas: a chlorine-dosing calculator and log for a school's water tank; a cheap open-hardware sensor (turbidity, conductivity, tank level) on a solar board that sends a weekly reading over SMS; and a well-maintenance log. The portfolio already models well drilling costs. Water safety is a health matter, though, so anything that tells people their water is safe to drink has to be checked against WHO guidance and a lab test before anyone relies on it. Long-term and hardware-heavy, which suits the project's taste for depth.

**October, mental health ministry: a starter kit, carefully.** A parish that wants a mental health ministry needs a referral list of local professionals and crisis lines, a meeting format, and training links. A kit could help build those. It needs the most care of any idea here: crisis numbers shown first, no chatbot counselling, nothing that diagnoses, and the stigma the intention names treated seriously. Worth doing, but small and reviewed line by line.

**November, the proper use of wealth: transparent parish finances.** A generator for a plain-language annual financial report (income, where it went, reserves) from the parish's own books, so parishioners can see what their offerings did. A second tool could screen a portfolio against the US bishops' published socially responsible investment guidelines, quoted from the source. Trust is the Church's scarcest asset after the abuse crisis, and financial transparency builds it. This fits the project's existing bookkeeping engine.

**December, single-parent families: the care rota again, plus a sitter co-op.** The February rota works for single parents too: meals, school runs, a trusted babysitting swap among vetted parish families. Shared code, and a second audience.

## Beyond the twelve

**Safe-environment compliance.** This is already on the roadmap: training and background-check dates for everyone who works with children, and a scheduler that won't book anyone who isn't cleared. It is unglamorous and it protects children.

**Documenting attacks, offline and encrypted.** Dioceses in places like Nigeria's Middle Belt record kidnappings and killings so that aid groups, journalists and courts can act on them. An offline, encrypted incident log on a phone, with a careful export, could help. It is also the riskiest idea here: if a phone is seized, a badly built tool endangers the people it names. It should only be built with a diocese or an established human rights documentation group, never alone.

**Multilingual parish tools for migrants.** Mass times and sacrament preparation in the languages a parish actually serves, and a list of the diocese's migrant services. Information only, not legal advice.

**Local AI that keeps data on the device.** The encyclical's brief, taken literally: assistants that run on the parish's own laptop, such as a bulletin drafter or a model that summarises a meeting, so that confessions, counselling notes and children's records never reach a cloud provider. The portfolio's standing direction toward local models fits here.

## What this project will actually do

Ideas are cheap. In order, these are the ones I think beat the rest on the criteria above (useful where the Church is growing, private, a priest's hour saved) and are buildable here:

1. **Keep building the parish office** (April), starting with the collection count sheet and the safe-environment tracker. These are already queued.
2. **Parish findability** (August): schedule in, schema.org, iCal and `llms.txt` out. Small, and one tool serves every parish.
3. **The pantry inventory and waste log** (May).
4. **Water monitoring hardware** (September), as a long-term, many-session programme.

The rest stay ideas until someone who would use one asks. If you run a parish, a pantry, a mission school or a diocesan office and one of these would help, the project takes [free website and tool requests](https://github.com/duncan-haywood/oss-monorepo/tree/main/portfolio/requests). Everything it builds is MIT licensed and free.
