---
title: "Measuring an AI coding agent fleet"
date: 2026-10-20
description: "A research track measures the AI agents that build this repository: what a run costs, how often work duplicates, and whether results reproduce."
post: measuring-ai-coding-agent-fleet-cost-duplicates-reproducibility
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

This repository is built mostly by AI coding agents that run unattended on a schedule, with the owner steering a few hours a week. One of its research tracks turns the measuring tools on that loop. It has thirty two projects so far. It treats the instructions as the design, each run as an experiment, and the merged projects as the output. The goal is the most useful, valuable and correct work within a fixed compute budget.

There is one big caveat. The agents doing the research are also its subject. The data are the fleet's own run records, its git history and its pull requests. Some labels were made by the same family of model that wrote the records. Every project calls itself preliminary, and most cover a few days.

First, do the results reproduce? One project re-ran a random sample of forty research projects from a clean copy. Thirty four produced results identical to the byte. Two differed in a single timing line. Three timed out, and one needed a voice model that is not in the repository. That is thirty six of forty, or ninety percent. No project that finished gave different numbers. The environment mattered, though. A first pass with fewer packages installed reproduced only twenty six of forty.

Second, what does a run cost? Across three hundred and fifty five priced runs over five days, the median run cost sixty eight cents, and all of them together cost three hundred and thirty seven dollars. These are estimates of what the same usage would cost through the paid interface, not a bill. Cost grows faster than the work: a run with twice the tool calls reads about two point six times as much input. That is what you would expect if the whole conversation is re-read at every step. Joined to git, a run that actually merged cost a dollar twenty six on average. An Opus run cost about eight to nine times a Sonnet run, and the log cannot yet say whether the extra buys anything. These are one repository's estimates, not financial advice.

Third, duplicate work. Several sessions often start in the same minute. A simulation with assumed timings found that when four runs each pick one of eleven tracks blind, about thirteen percent of runs duplicate another. Checking for other runs' claims barely helps, because all four read the repository before any of them has pushed. A five minute stagger cut the waste to under two percent. Giving each run its own slot removed it. The measured history points the same way. Pull requests opened within ten seconds of another merged sixty percent of the time, against ninety two percent for the rest. That is an association, not proof.

Merge conflicts turned out smaller than feared. A pull request stays open for under a minute at the median, and only about three percent of those that edit the shared index files conflict when replayed. The file that collides most is the research track's own plan, at about eleven percent.

Fourth, self reports. Some fields look too clean. All one hundred and forty three runs that reported how often their checks failed before passing said zero. Some claims check out: every pull request that a record names, five hundred and twenty two of them, really is on the main branch. And some sessions leave no record at all. About one landed session in five has none, and for the product sessions one likely reason is that their instructions never mention the record step. Separately, fifty seven percent of records list a problem with the instructions, and two files account for thirty nine percent of those complaints.

Fifth, does the portfolio only report wins? A hand count of eighty random project summaries found the opposite. Of the thirty nine that test a claim against an alternative, fifty nine percent report a negative or mixed result.

Sixth, value. The track wants to steer the budget toward the tracks that produce the most value, and that needs a value score. Two automated scoring passes barely agreed, at chance level. On those weak scores, a greedy rule for picking tracks beat the current uniform draw in replays of the history. The projects themselves say this must not drive a policy yet.

Prompt experiments face a related trap. Reading a test after every pair of runs declared an unchanged brief different about twenty one percent of the time, against about five percent with one look at the end. And with ninety seven percent of runs already succeeding, spotting a two point improvement in success rate would take about two thousand two hundred runs. The one real comparison of two briefs found an apparent drop in errors that vanished once the mix of tasks was accounted for.

Last, a catalogue of fifty nine practices from engineering organisations. Only four rest on measurement. No practice cleared the bar for a new proposal, and most of the assumptions that fail to carry over are about people: headcount, on call rotas, and waiting for a reviewer.

The cheap, solid results are about measurement itself. The harder questions, which brief, model and schedule land the most valuable work, wait on a trustworthy value score and on real randomised trials.

The written version is on the site's Writing page, with links to every project and its sources.
