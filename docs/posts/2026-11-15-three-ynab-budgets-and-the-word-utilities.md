---
title: "Three YNAB budgets, and why \"Seattle Public Utilities\" went unsuggested"
seo_title: "Testing a bank-transaction categorizer on real YNAB register exports"
date: 2026-11-15
description: "A bank-line categorizer tested on three real YNAB budgets: rules written from one household, read on two held out. The held-out gain was small."
tags: [ai-bookkeeper, evaluation, bank-statements, categorization]
---

YNAB ("You Need A Budget") lets you export a register: every transaction, the account it came from, a payee name, and the category you put it in. Some people commit those exports to public GitHub repositories, usually as sample data for a dashboard they're building. For a tool that suggests an account for each bank line, that's useful test data. The category isn't some app's guess. The household picked it.

Today's run read three of them: a Seattle family (42 accounts, six months, 1,944 lines), a Utah couple (5 accounts, 602 lines) and a Chicago renter (6 accounts, 257 lines). The files are fetched when the evaluation runs and never copied into the repository. Only counts are kept.

## The setup

[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) suggests an account for each line in layers: your own rules, then memory of payees you've already filed, then a small classifier, then built-in keywords, then a guess for payees it has never seen. The question here was narrow. How well do the built-in keywords do on payee names YNAB has already tidied, and does a rule written from one household help the next?

Before the categorizer saw each register, every column that names the category was blanked. Only spending in categories that map to one business account was scored: dining, fuel and parking, insurance, utilities, subscriptions, rent, a nanny's wages, interest. Groceries, gifts and trips can't be scored that way, so they were left out.

The rules came from the Seattle file alone. Utah and Chicago were read afterwards.

## A one-word bug

The first Seattle miss was a real bug. The utilities rule matched the word "utility" but not "utilities". So "Seattle Public Utilities" got no suggestion, and so would any city water or sewer bill written the same way. That's fixed now. The Seattle file also added "City Light", "espresso", Washington's toll pass ("Good To Go") and Impark parking.

## What held out

| register | first-seen payees | before | Seattle rules |
|---|---|---|---|
| Utah (held out) | 48 | 66.7% right / 20.8% wrong | 68.8% / 18.8% |
| Chicago (held out) | 61 | 62.3% / 16.4% | 63.9% / 16.4% |

That's about one line in fifty. The reason is in the misses: each household's money goes to local names. Utah buys fuel at Maverik and Cenex. Chicago rides transit on a Ventra card and pays ComEd. One Seattle family can't teach a keyword list any of that. After the held-out reading, a second set of rules was written from those misses. With it, Utah reaches 79.2% / 10.4% and Chicago 68.9% / 14.8%, but those numbers are fitted to the files they're read on, and the README says so.

## What stayed out on purpose

All three households filed Netflix, Audible, YouTube Premium and Peloton as subscriptions. The tool still won't suggest an account for them. In a business's books, a streaming subscription is often the owner's personal spending, and the existing tests deliberately pin those lines as "wait for a person". One fuel brand, Conoco, was tried and dropped after it hit a different set of real books, where `CONOCO - CITYMART` was a convenience-store supply run.

## The useful finding

Across 633 scored lines, the built-in keywords were wrong on 4. Clean payee names don't fool them. Most wrong answers come from the guess for never-seen payees. With nothing known about a payee, it leans toward meals: before this change, Utah's "Conoco" fuel and "Greystar" rent both landed there. That guess is the next thing worth fixing, more than a longer keyword list.

The full table, method and caveats are in the README section "YNAB registers: three households' own categories". As always, it's a suggestion engine, not accounting or tax advice.
