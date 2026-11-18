---
title: "The remove-duplicates button finds about a third of them"
seo_title: "Fuzzy duplicate contacts: Fellegi-Sunter vs exact match on Febrl"
date: 2026-11-13
tags: [fuzzy-dedupe, ventures, research-tools, record-linkage, crm]
description: "A free browser tool for duplicate contacts. On the Febrl benchmark it finds 99.6-99.8% of true pairs; an exact name-and-postcode match finds 26-36%."
---

Merge two contact lists and you get the same person twice: once as Robert Lindqvist with a work email, once as Bob Lindqvist with only a phone number written with +1. The "remove duplicates" button in a spreadsheet or an email tool doesn't catch it, because it only removes rows that are spelled exactly the same.

The new [fuzzy dedupe tool](https://marisstella.app/fuzzy-dedupe/) does the matching that paid dedupe products sell. You paste or open a CSV. It guesses what each column holds, compares likely pairs field by field, and groups the rows that are probably the same person or business. Each group says why its rows matched, borderline pairs are listed separately, and you download a merged file with one row per person. It runs in the browser, from a command line and from an AI agent, and it is MIT licensed.

## The method is from 1969

The model is Fellegi and Sunter's "A Theory for Record Linkage" (*JASA*, 1969). Each field of a pair is given an agreement level: exact, very close, close or different. Each level then gets a weight, log2(m/u), where m is how often true duplicates agree at that level and u is how often different people do. The weights add up to a match probability. Names are compared with the Jaro-Winkler similarity (Jaro 1989; Winkler 1990) after accents are dropped and about 60 groups of common English nicknames are joined. Emails are compared with case, Gmail dots and +tags ignored, phones on their last ten digits, and companies without Inc, LLC or Ltd.

Nobody has m and u for their own file, so the tool learns them from that file with the EM algorithm, as Winkler showed in 1988. Comparing every pair of 5,000 rows would mean 12.5 million comparisons. Instead it compares only rows that share a blocking key, such as the same email, the same last seven phone digits or a similar-sounding surname with the same initial. On a 5,000-row file that is about 16,700 pairs and half a second.

## Measured on a benchmark with known answers

The Febrl data sets are the standard test for this problem. They are synthetic person records with typos, missing values, swapped fields and name variants, and the true duplicates are known. At the default 90% setting:

| Set | Rows | True duplicate pairs | Found | Precision | Exact match on name and postcode, found |
| --- | ---: | ---: | ---: | ---: | ---: |
| Febrl 1 | 1,000 | 500 | 99.8% | 100% | 36.2% |
| Febrl 2 | 5,000 | 1,934 | 99.6% | 100% | 29.1% |
| Febrl 3 | 5,000 | 6,538 | 99.8% | 100% | 25.9% |

Febrl records carry a birth date and an ID number, which makes them easier than a contact list. With those two columns removed, leaving only name and address, the tool still found 95 to 97% of true pairs at 99.8 to 100% precision.

## Two things that went wrong first

The first version held u fixed at the rate random pairs agree, which is what the popular Splink library does by default. On Febrl 2 with name and address only, one group swallowed 4,210 of the 5,000 rows. Rows that share a blocking key agree on postcode and street far more often than random rows. With u fixed, the model's only way to explain those agreements was to call nearly every pair a match. Letting EM fit u on the candidate pairs as well, which is Winkler's original form, fixed it. The engine's notes keep both the failure and the fix.

The second problem showed up on the page's 21-row contact example, which is invented placeholder data. Grace Whitfield shares a surname, company, town and ZIP code with James Whitfield, but no first name, email or phone. The model merged them. Company, town and ZIP aren't independent evidence, since colleagues share all three, and the model adds their weights as if they were. So the tool now holds back any pair whose first names clearly differ unless an email, phone, ID number or date also agrees exactly. Those pairs go to the review list.

That guard has a measured cost. On Febrl with name and address only, it moves 11 to 14% of the true pairs from merged to "check these", because Febrl's corruption often hits the first name, and Febrl has no colleagues or relatives to protect against. It is on by default anyway because business contact lists are the opposite case, and there is a switch on the page to turn it off. Whether that was the right default needs a labelled contact list with colleagues in it, which this project does not yet have. If you have one you can share, open an issue.

## Next

The obvious next steps are term-frequency adjustment (a match on "Smith" should count for less than a match on "Okafor") and matching two files against each other as separate sources. A scheduled match against a CRM's API with merge write-back would be the paid tier, and that needs accounts first.
