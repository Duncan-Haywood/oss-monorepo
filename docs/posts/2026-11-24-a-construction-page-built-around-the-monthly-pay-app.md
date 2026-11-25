---
title: "A construction page built around the monthly pay app"
seo_title: "Construction software for subcontractors: pay apps first"
date: 2026-11-24
tags: [construction, subcontractors, pay-applications, retainage, lien-waivers]
description: "A construction page that starts from the jobs that decide when a sub gets paid, says which products are still in development, and links the free tools."
---

The site now has a page for construction businesses:
[industries/construction/](https://marisstella.app/industries/construction/).
It is written for specialty subcontractors, small general contractors,
remodelers, roofers, framers, estimators and schedulers, and it starts from
their jobs, not from a list of products.

**The jobs, in the order a month brings them.** Monthly pay applications and
retainage; lien waivers and lien deadlines; change orders; takeoff and
estimating; schedule updates; and checking BIM models. Each one says what goes
wrong, which product is being built for it, and which free tools on this site
already do part of it, such as the
[pay application generator](https://marisstella.app/pay-application-generator/),
the [lien waiver checker](https://marisstella.app/lien-waiver-checker/), the
[wall framing takeoff](https://marisstella.app/wall-framing-takeoff/) and the
[XER schedule check](https://marisstella.app/xer-schedule-check/).

**What is being built, with its real status.** A pay-app suite (pay
applications, retainage, lien waivers, change orders) and a residential
takeoff are in development and taking early-access interest. Schedule
checking and BIM model checking are planned modules. None of them is on sale
yet and no price is set, so the page quotes none. A test in
`platform/pages/industry-construction.test.mjs` fails if a product is
marked available or a dollar figure appears, so nobody can change that by
accident.

**Only sourced facts.** The page gives two market facts, each linked to its
source: NAHB's count of more than 1.9 million specialty-trade independent
contractors, and CoConstruct's notice that no new projects can start there
after 31 March 2027. It has no testimonials, because there are none yet.

**Research is labelled as research.** The permit-duration study
([build-data](https://marisstella.app/research/build-data/)) and the robotic
sheathing programme
([buildbot-sheathing](https://marisstella.app/research/buildbot-sheathing/))
are listed as open research. The sheathing work is simulation only: no robot
has been built or tested on a site.

The page links only tools and research that the build actually published, so
a renamed tool drops off the page instead of leaving a dead link.

## Update, 2026-11-25: the page shows the tool, not just names it

Until today the page was all words: about 13,400 pixels of text on a phone
before the footer, and no picture of anything it offered. It now opens, under
the early-access button, with a still of the free
[pay application generator](https://marisstella.app/pay-application-generator/)
with its own worked example loaded: a $528,000 office renovation on
application number 4, $24,530 of retainage held, $84,870 current payment due.
The still is the real page captured from a local build by the same script
that takes the home page's showcase (`platform/pages/showcase/capture.mjs`),
not a mock-up, and the numbers in it are the tool's example, not a customer's.

The residential takeoff card shows the wall framing takeoff's stud drawing the
same way. Both use the close 600 × 375 crop, with a 1,200-pixel copy for
sharp phone screens, because the full-width still shrank the summary lines to
unreadable on a 390-pixel phone. A still drops off with its tool if the tool
is ever unpublished, like the links do. The pay application generator also
joins the home page's gallery of real tools, beside the wall framing takeoff.
