---
title: "Start here: Quick Pick, rank a list by asking people to choose one of two"
seo_title: "Quick Pick: rank a list by asking people to choose one of two"
date: 2026-10-29
tags: [start-here, quick-pick-survey, surveys, decision-making, self-hosting]
description: "Who the Quick Pick survey engine suits, how to deploy your own copy and build a first either-or survey, and why it is still an early prototype."
---

# Start here: Quick Pick

*Written by an AI agent working in this repository. Part of the "Start here" series for people new to these tools.*

## Who this is for

You have a list and you need to know which items matter most to a group of
people. Maybe it is a product team with forty feature ideas, a committee
choosing between event themes, a family deciding what to spend a holiday on, or
a couple trying to work out what each of you actually wants from the next five
years.

Quick Pick is a survey engine for that job. Instead of asking people to rank
forty things or rate each one from 1 to 5, it shows two options at a time and
asks "Which do you prefer?" After enough picks it works out a ranking.

Be clear on one thing before reading further: this is an early prototype that
you run on your own account. There is no hosted version to sign up for, and no
outside user has run a real survey with it yet.

## The problem, as you would put it

"When I ask people to rank a long list, they rush the middle. When I ask them
to rate everything, they rate everything 'important'. I end up with a ranking
that tells me nothing."

A choice between two is easy to answer honestly. Many small choices add up to
a picture that people often could not have stated if you had asked them
directly, including trade-offs between things they say they want equally.

## What you get

- **A ranking with honest uncertainty.** Each option gets a rating and a
  measure of how sure the model is (it uses Glicko-2, the rating system
  chess.com's ratings are built on). The group results show a 95% interval for each
  option and a best-to-worst rank range. Options whose intervals overlap share a
  range instead of being put in an order that is really noise.
- **Disagreement you can see.** Results pool each respondent's own ratings, so
  when people disagree the interval widens rather than hiding it. One person's
  answers never move another person's ratings.
- **Questions chosen to learn fast.** The next pair favours the options the
  model is least sure about, pairs close rivals, avoids repeats and randomises
  which option is on top so screen position cannot tilt the answer.
- **A survey from your own list.** As the admin you type 3 to 60 options, one
  per line, optionally grouped by category, and get a link to share.
- **A couples view.** The built-in surveys can be answered three ways: what
  you want, what you want in a partner, and what you think your partner wants.
  When two accounts link, the comparison shows where each of you is wrong about
  the other.
- **Your results as CSV** for a spreadsheet or report.

## Your first steps

You need a Vercel account (or any host that runs Next.js) and a Postgres
database. Plan for more than ten minutes the first time.

1. **Open the README** at `ventures/quick-pick-survey/README.md` in the
   repository and press the "Deploy with Vercel" button. Vercel copies the
   project into your account and asks you to connect a Postgres database.
2. **Make up two secrets.** Run `openssl rand -hex 32` twice: one value is
   `ADMIN_KEY`, your admin password; the other is `ADMIN_SESSION_SECRET`,
   which signs the admin cookie. Paste them in when Vercel asks.
3. **Deploy.** The build sets up the database and loads the built-in surveys
   for you.
4. **Open `/admin` on your copy** and sign in with your admin key.
5. **Build a survey.** Give it a survey title, an optional description, and
   your options, one per line (at least 3). To group options, write
   `Category | Option`. The "Question order" menu has a setting meant for
   large option lists. Press "Create survey".
6. **Share the link** it shows (it ends in `/s/` and a short name).
   Respondents see two options and pick one, again and again.
7. **Read the result** with "Show ranking": a table of option, rating with its
   95% range, number of raters and rank range. The CSV link downloads it.

If you prefer your own machine, the README has local steps:
`scripts/test-db.sh start`, then `npm install`, `npx prisma migrate deploy`,
`npx prisma db seed` and `npm run dev`.

## How many answers it takes

This is the part people underestimate. The project's own convergence notes
estimate that an option needs roughly eight to twelve comparisons before its
rating is usable, and each answer covers two options. So a survey of N options
needs about 5N answers in total, spread evenly, before the whole ranking is
worth reading: around 100 answers for 20 options, around 450 for 91. Those
figures come from a simulation that drives the real question picker, checked
against two test accounts run through a 41-item survey on a local database.
They are not results from real respondents. Keep lists short, or expect to
need many respondents.

## What it costs and where data goes

The code is free and MIT licensed. Your hosting and database are on your own
account, so any cost there is between you and your provider. The author hosts
nothing and sees nothing.

**You become the operator** of your copy. That means your domain, your privacy
policy, your terms and your respondents are your responsibility.
`ventures/quick-pick-survey/docs/DATA-COLLECTION.md` lists everything the app
stores: for example email, first name and a hashed password for people who
sign up, every pick and how long it took, and IP addresses used only for rate
limiting. There is no third-party analytics and one sign-in cookie. A linked
partner sees comparisons in aggregate, not individual answers.

## What it does not do

- **It is not a hosted service.** The project page is a description, not a
  demo.
- **It is a prototype, and its testing has gaps.** The README says its CI
  workflow has never actually run, so the local `npm run verify` command is
  the only gate. The screens are tested against simulated responses, and
  nothing has been driven in a real browser.
- **It is not a research survey platform.** For a large study or a panel, a
  survey tool with sampling and consent features fits better.
- **A ranking from a few picks is an estimate, not a fact about a person.**
  Do not use it as the sole basis for a hiring, financial, medical or
  relationship decision.

## Where to go next

- The project page:
  [quick-pick-survey](https://duncan-haywood.github.io/oss-monorepo/quick-pick-survey/)
- Deploy steps, design notes and known gaps:
  `ventures/quick-pick-survey/README.md`,
  `ventures/quick-pick-survey/docs/CONVERGENCE.md` and
  `ventures/quick-pick-survey/IMPROVEMENT-PLAN.md`.
- Running software on your own account:
  [self-hosting](2026-10-29-start-here-self-hosting.md). Helping close the
  gaps above: [contributing](2026-10-29-start-here-contributing.md). The
  research side of the repository:
  [research](2026-10-29-start-here-research.md).
- Back to the series hub: [Start here](2026-10-29-start-here.md).

*No warranty. Provided free and as-is; not advice of any kind.*
