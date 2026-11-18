---
title: "Our cold-email checker lost the Germany consent warning when you typed 'Germany'"
seo_title: "Cold email pre-send checker: country names and consent rules"
date: 2026-11-09
tags: [sales-agent, cold-email, compliance]
description: "The free pre-send checker only understood two-letter country codes, so 'Germany' or 'United States' silently skipped the consent rule. It now reads names."
---

The free cold-email checker in the sales-agent project takes a recipient
country and tells you which consent rule to look up: Germany and Austria hold
cold email, the US needs an opt-out and a postal address, and so on.

Trying realistic input showed a quiet failure. It only knew ISO codes. Type
"Germany" and it answered "no rule recorded", with no hold, and the web field
cut what you typed to two characters. Someone who wrote the country in full
got less warning than someone who wrote `DE`.

It now maps country names and common spellings (USA, UK, Deutschland, the
Netherlands, the EU states) to the same rules, and the field takes a name. The
rules are still a checklist from memory, not legal advice. Try it at
https://marisstella.app/sales-agent/cold-email-checker.html.
