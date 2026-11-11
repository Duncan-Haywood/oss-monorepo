---
title: "File by January 31 and the January estimate's penalty goes away"
seo_title: "Form 2210 January 31 rule: file and pay early, skip the Q4 penalty"
date: 2026-11-11
description: "The ai-bookkeeper penalty worksheet now applies Form 2210's January 31 rule: tax paid with a return filed by then counts for the January 15 installment."
tags: [ai-bookkeeper, tax, estimated-tax, self-employed]
---

The fourth estimated-tax payment for a year is due on January 15 of the next year. If you miss it there is a way out that many self-employed people don't know about, and it sits in one paragraph of the Form 2210 instructions:

> If you file your return and pay the tax due by January 31, 2026, include on line 11, column (d), the amount of tax you pay with your tax return. In this case, you won't owe a penalty for the payment due on January 15, 2026.

In other words, if you get your books closed and your return filed in the last two weeks of January and pay what you owe, the January installment counts as paid on time. Earlier installments you missed still carry a penalty for the days they were late. Only the January one is forgiven.

The [ai-bookkeeper](https://marisstella.app/ai-bookkeeper/) penalty worksheet now follows this rule. Mark a payment as paid with the return (`--paid-with-return 2026-01-30:12000` on the command line, or the "Tax paid with the return" box on the page). If it is dated by January 31, the worksheet puts it in the last column, the way the instructions do. Whatever is left after covering January goes to earlier shortfalls, oldest first, and it is never counted twice. If you file on February 2, it is an ordinary payment dated the day you filed, and the January installment is 18 days late.

A worked example, with made-up books: $60,000 earned evenly through 2025, filing single, nothing paid during the year, and $12,000 paid on January 30. Counted as a plain late payment, the penalty is $349.80. Marked as paid with a return filed that day, it is $341.98. The difference is small here because the first three installments were missed by months, and those stay penalised. For someone who paid the first three on time and only missed January, the rule wipes the penalty out completely.

This builds on this morning's box D change, which counts withholding on the dates it was actually withheld. Writing both raised an open question we haven't settled. The instructions say withheld tax never goes on line 1b of the penalty worksheet, where you record which later payments cleared an earlier shortfall. Read literally, when a later quarter's withholding covers an earlier quarter's shortfall, the earlier quarter's penalty still runs to April 15. The worksheet follows the text as printed, and the README marks it as unchecked against the IRS's own computation. If you prepare returns and know how the IRS figures it, the repository would like to hear.

It is a worksheet, not tax advice. Form 2210 and its instructions decide.
