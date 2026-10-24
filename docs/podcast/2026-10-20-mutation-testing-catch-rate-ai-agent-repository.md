---
title: "Red team, blue team: seeding bugs to see how many tests catch"
date: 2026-10-20
description: "AI agents seeded over thirteen hundred small bugs into their own repository. The tests caught seventy percent, and boundary bugs slipped through most."
post: mutation-testing-catch-rate-ai-agent-repository
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Most quality numbers count failures that something already noticed. A red test run, a review comment, a revert. None of them tells you how many bugs go unnoticed. In a repository where unattended AI coding agents merge a few hundred pull requests a day, with an owner steering a few hours a week, that is the number that matters. If a session ships a bug, would anything catch it?

Since the fifteenth of October, about seven percent of agent runs have been answering that question directly. They are called red team runs.

Here is how one works. The run picks a file that some test suite guards. It seeds a mutant, which is one small, deliberate bug. The kinds of bug are simple. Flip equals to not equals. Turn less than into less than or equal. Swap plus for minus, and for or, true for false, max for min. Or add one to a constant. The tool applies one mutant at a time, runs that file's own tests, and then restores the file exactly as it was.

If the tests fail, the mutant was caught. If they pass, it escaped. Then the same run switches sides and becomes the blue team. It decides whether each escape is a real gap, or an equivalent mutant that changes nothing a user could see. It writes the smallest test that catches each real gap, and proves the test works by re-running the escaped mutants. It also hunts for real bugs by hand, and fixes what it finds. None of the rates is typed by hand. The tool writes every mutant and its result into the run record, and the totals are computed from those.

Now the numbers, as of the twentieth of October. One hundred and twenty-three red team runs. Ninety-five distinct files. One thousand three hundred and seventy-one mutants seeded. The existing tests caught nine hundred and one. Three hundred and eighty-three escaped. Eighty-seven were judged equivalent and left out. That makes the catch rate seventy point two percent. Roughly three in ten small bugs got past the tests that already existed for that file.

The blue team then added tests that caught three hundred and sixty-five of the three hundred and eighty-three escapes. That lifts the rate to ninety-eight point six percent. But that second number is close to one hundred by construction, because the new tests were written for exactly those mutants.

Which bugs slip through? The pattern is the textbook one. Gross arithmetic errors are almost always caught. Swapping multiply for divide was caught ninety-two percent of the time, and flipping equals about eighty-six percent. Boundary errors are another story. Those are bugs where the code is wrong only exactly at a threshold. Turning greater than into greater than or equal was caught only forty-three percent of the time. Across the four comparison flips, forty-three boundary mutants were caught and fifty escaped. Tests rarely check the value right at a limit. Off-by-one constants were the biggest group, and more than a third of them escaped.

Platform and tooling code, and product code, came out about the same, at seventy-one and sixty-nine percent.

The hunt for real bugs found thirty-two, and every one was fixed in the same run. A few examples. A fee calculator, given an offer above the listed price, told the user that a negative ten dollar discount came out of their payout. A webhook checker let a timestamp that was not a number pass its replay check. Twenty calculators treated special words like constructor as valid lookup keys, and crashed on them. A self-employment tax calculator charged an extra Medicare tax on earnings below the four hundred dollar filing minimum. A check meant to confirm that an AI model runs on your own machine could be fooled by a remote host name that starts with ten. And the guard against committed payment keys skipped several file types.

One find shows why the instructions say to fix the class, not the instance. A run found eight products printing negative money with the minus sign after the dollar sign. A check for exactly that already existed. But it only looked at functions with certain names, so the same bug shipped under other names. The run fixed all eight products and the check.

The method improved too. The random choice of files was mostly product code. On the seventeenth of October, three thousand five hundred and two of the three thousand six hundred and sixty-seven guarded files were products, so tooling code was rarely tested. An option was added to aim at platform code instead. And a stale cache of compiled Python once hid a mutant from the tests, so the tool now turns that cache off.

Some honest caveats. The catch rate has not risen. It stayed between sixty-seven and seventy-one percent each day from the fifteenth to the nineteenth. That is expected, because each run mutates a different file. Files with no tests at all are never sampled, so this number describes tested code only. The equivalent mutants were judged by the agents themselves, and nobody re-checked them. And the research folder is excluded from mutation.

These runs were cheap, about forty cents each at list prices. That is an estimate, not a charge, and none of this is professional advice on testing your own code.

The written version is on the site's Writing page, with the tables, the links, and the sources.
