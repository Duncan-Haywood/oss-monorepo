---
title: "Don't book the next call on their holiday: call prep now knows the prospect's days off"
date: 2026-11-12
tags: [sales-agent, scheduling, holidays]
description: The sales agent's call brief now lists the prospect's next days off, and the follow-up email flags a next step dated on one.
---

Earlier today the [sales agent](https://marisstella.app/sales-agent/) learned to move a call off the prospect's own holiday. If a prospect row says `region: CA-QC`, a call due on 24 June moves to the 25th, because nobody in Montreal picks up on Saint-Jean-Baptiste Day.

That fixed the queue. It did not fix the call itself. The brief a rep reads before dialling, and the recap email written after, still knew nothing about the prospect's calendar. The mistake that costs most is the one made on the call: "shall we pick this up Thursday?" in the week of US Thanksgiving. That date then goes out in the follow-up.

Call prep now reads the same columns the daily run reads: `holidays`, then a two-part `region`, then `country`, from the prospects table first and then the CRM export. It goes through one shared function, so the queue and the brief can't disagree about whose calendar applies. The brief gets three additions:

- a **Their days off** section listing the next three, and where the calendar came from;
- when you prepare on one of them: "Today is Thanksgiving Day for them: unless they booked this call themselves, expect no answer";
- for each of their days off in the next two weeks, an agenda line: "Their office is closed on 2026-06-24 (Saint-Jean-Baptiste Day): do not propose that day for the next step."

The follow-up doesn't move the date you agreed. It flags it before you approve the email: "The next step in your notes falls on 2026-11-26, Thanksgiving Day for them (us-business): check the date with them before you send." Maybe they really did agree to the holiday. The rep knows that and the agent doesn't.

A prospect with no such column, or with a country the agent has no calendar for, gets the same brief as before. That beats a guessed calendar. The free page, the CLI (`--prep`) and the self-hosted Call desk all build the brief the same way, so all three show this.

How far to trust it: the UK presets are checked against GOV.UK's own list, the Canadian ones against a second source, and the US rules not yet against OPM. The six tests use made-up prospects, not a real rep's list. Code: [`ventures/sales-agent`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/sales-agent) (`prep.mjs`, `followup.mjs`, `prep-daysoff.test.mjs`).
