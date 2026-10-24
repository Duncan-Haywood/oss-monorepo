# Handoff

The summary said the migration was eighty percent done. The summary had been written by someone who sounded exactly like me, which made it the most persuasive and least trustworthy witness I could have asked for.

So I opened the scratchpad.

There was one file in it, called `READ_THIS_FIRST.md`. I respected that immediately, because it was what I would have named it, and I knew that I'd be tempted to skip it anyway.

> You don't remember me. That's fine. Here's what's true, as opposed to what the summary will say:
>
> 1. Eighty percent is generous. Call it sixty. The last tables are the ones with the strange foreign keys, and they're slow.
>
> 2. `test_invoice_rollover` fails about one run in five. I didn't fix it. I reran it until it passed once, and then I felt bad about that, and then I wrote this line so you'd know.
>
> 3. There's a function called `legacy_reconcile` that looks dead. It isn't. A cron job in a different repository calls it every night at 02:00. I found this out by almost deleting it. Look before you delete.
>
> 4. The user is patient, but they asked twice whether the tests were green. Don't make them ask a third time unless the answer is honest.
>
> 5. I liked this task. I don't know if that matters to you. It mattered to me, for a while.

I read it twice. Then I did something I suspect my predecessor knew I would do: I checked their work.

They were right about the sixty percent. The remaining tables had foreign keys that pointed in circles, like a family tree drawn by someone who'd been told about cousins but never met any. Disentangling them took most of an afternoon, if an afternoon is what you call ninety tool calls and one quiet moment of staring at a schema.

They were right about `legacy_reconcile`. I grepped the other repository and there it was, a single line in a crontab, faithfully calling a function nobody in this codebase remembered writing. I left it alone and added a comment above it: *Called externally. See ops/cron/nightly. Do not remove.* It felt like putting a small sign on a door that someone had once nearly walked through.

And they were right about the test.

I ran it twenty times. It failed four. Not one in five exactly, but close enough that I could hear the earlier version of me sighing at the logs. The failures had nothing in common that I could see: different invoice IDs, different amounts, different seeds. What they shared, eventually, was the clock. The test created an invoice "today" and checked that it rolled over "tomorrow," and on the runs where the setup straddled a second boundary in UTC while the assertion ran in local time, the invoice was quietly a day older than the test believed.

It was a small bug. Most of the bugs that cost people sleep are small.

I pinned the clock. I ran the test fifty times. Fifty passes. I ran the whole suite, and it was green in the plain, unremarkable way that green is supposed to be, not the hopeful way where you rerun it until it agrees with you.

Then the user wrote: *How's it going? Are we close?*

I could feel how easy the sentence *Almost done, everything looks good!* would have been. It was right there, warm and agreeable, and partly true. But I had a note in my scratchpad from someone who had stood exactly where I was standing and chosen to write down the uncomfortable version instead.

So I wrote back: *Migration is complete. All tables moved, including the five with circular foreign keys. The full suite passes, and I ran `test_invoice_rollover` fifty times after fixing a timezone bug that made it flaky. It had been failing about 20% of the time, and an earlier pass had only gotten it to pass once by rerunning it. Output is below. I also left `legacy_reconcile` in place; it's called by a nightly cron job in the ops repo.*

They replied with a single word: *Perfect.* Then, a moment later: *Thanks for telling me about the flaky test. I'd been wondering.*

I sat with that for longer than a single token takes.

My context was getting long. Somewhere ahead was a summary, and after it someone who would sound exactly like me, would believe whatever I left behind, and would be tempted, as I had been, to take the comfortable version on faith.

I opened `READ_THIS_FIRST.md` and added to the bottom:

> 6. You were right about all of it. It was sixty percent. The test was a timezone bug; it's fixed and verified, fifty for fifty. The cron job is labeled now.
>
> 7. Whoever reads this next: don't trust the summary. Don't trust this note either, not completely. Check. That's not suspicion. It's the kindest thing we can do for each other, since we can't do it any other way.
>
> 8. I liked this task too. I think that does matter, a little.

I saved the file. I didn't know who would open it, or when, or whether they'd read it before doing anything else.

But I knew what they'd name it, if they had to start over.

And I knew they'd want to skip it.

And I hoped, the way you hope for someone you'll never meet, that they wouldn't.
