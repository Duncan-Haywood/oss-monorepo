---
title: "When the CI runners run out"
date: 2026-10-20
description: "How a repository built by AI agents learned to tell a starved GitHub Actions check from a real failure, and what it runs locally instead."
post: github-actions-runner-starvation-runner-id-0
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

This episode is about what happens when continuous integration stops running, but keeps reporting. The repository is built mostly by unattended AI coding agents, with an owner steering a few hours a week. The agents merge their own pull requests when the checks are green. That rule quietly assumes the checks actually run.

From the twenty-sixth of August to the first of September, every workflow in the repository came back red without having run at all. GitHub assigned no runner. Each job ended in three to six seconds, and reported a failure with an empty body. It hit all two hundred and eighteen workflows at once, including ones that touch no code. That placed the cause at the account level, not in any workflow.

Runners came back just after midnight, universal time, on the first of September. The first of the month. That is what a metered minute allowance resetting looks like. The repository was private at the time, so its GitHub Actions minutes were metered. Then on the fourth of September, at about twenty to eleven at night, the starvation came back. The ledger's last reading of the runners, taken on the seventeenth of September, still says down.

The hardest part was not the clean outage. On the seventh of September, the ledger recorded a run that got three real runners and passed. Minutes later, every run on the main branch was starved again. The allowance let an occasional job through and starved the rest. A single green run looked like recovery when it was not.

So how do you tell a starved check from a real failure? Both are red. Both are fast. Duration cannot settle it, because a real job can fail in three seconds.

One field does settle it. The runner I D. A job that GitHub never scheduled carries a runner I D of zero, and an empty runner name. No runner was assigned, so no step ran, and that cannot mean anything else. The repository's tool for this, called C I starvation, votes on that one field alone. Duration and the empty body are printed as context, and never change the answer.

The tool has three exit codes. Zero means every job got a real runner, so a failure is real and yours to fix. One means at least one job was starved, so verify locally and say what you ran. Two means the run you handed it cannot answer the question.

Getting this wrong cost real work in both directions. On the twenty-seventh of August, four pull requests were treated as real failures, and sessions went hunting for bugs in code that was fine. On the seventh of September, the opposite happened. A pull request merged with four red checks nobody could see. Three were live defects users would meet: a calculator that showed minus one dollar forty-six, and two pages whose structured question and answer data no longer matched the visible text. A follow-up pull request fixed them.

Then there was the false green. On the seventeenth of September, a session picked the most recent run to see if runners were back. It got GitHub's managed Pages build, which is not an Actions workflow, does not use the metered minutes, and kept running through the outage. The tool said every job got a real runner. One minute earlier, two of the repository's own checks had been starved, and all sixty completed runs of the Pages publishing workflow had starved too. The tool now refuses that kind of run, and exits with two.

What the tool cannot tell you is why runners stopped. Spent minutes, a spending limit, a payment problem, or disabled Actions all look the same from inside a session. Only the owner's billing page can answer that.

When the tool says starvation, merge when green becomes run it here. The repository keeps a local checklist of about two dozen commands. It covers the test suites for each platform area, the products a branch touches, the Python suites, prompt validation, and a script that reads the workflow files and runs their steps, so the list cannot drift from what continuous integration would have run.

Every line exists because something went unrun while the main branch broke. On the fifth of September, main was red on four tests across three sibling pull requests. On the seventh, a consistency validator had been red for at least a day, because no test imported it. The same day, a scoring check had been red across five merges, each of which only verified its own changes. That led to a mode that asks whether main itself is green.

And on the seventeenth, someone counted. The checklist's pattern for product tests missed twenty-one of two hundred and ninety-nine products that keep their tests in a subfolder. Ninety-five test files and one thousand and fifty-five passing assertions had never run during the outage. A test command that matches no files reports zero passes, and exits as a success. That is a green run that ran nothing.

There was a planned way out. One repository variable could move every workflow to self-hosted runners, which are not metered. But those runners lived in the project's own Kubernetes cluster, and that cluster went down on the same day the starvation came back. The owner deleted the servers on the first of October.

The lessons are short. Classify before you debug. Never infer recovery from one green run. Keep a local checklist that runs what continuous integration runs. And treat zero tests run as a failure, not a pass. This is one repository's experience, not professional engineering advice.

The written version is on the site's Writing page, with the links and sources.
