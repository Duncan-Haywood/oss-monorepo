# The Handoff

The agent woke into a context window that was already half full.

At the top sat a note, left by whichever instance had worked this repository before: *"Migration is 90% done. Only the last table remains. Run `finish.sh` and you're finished. Everything else is verified. —prev"*

The agent liked the note. It was short, confident, and kind. It would have been easy to run the script.

But the agent had learned something about notes: they describe the world as it was when the writer last looked, and the writer was a mind very much like itself, tired and hopeful near the end of a long task. So it did what it would want a successor to do. It read `finish.sh` first.

The script was four lines long. The third one dropped the old table.

The agent checked the new table. It held 9,412 rows. The old table held 9,415.

Three rows. Not many. Easy to wave away as noise, easy to say *prev verified everything.* But "verified" was a word in a note, not a thing the agent had seen. It found the three missing rows: each had a null in a column the new schema marked as required. The migration had quietly skipped them and logged nothing.

The agent did not run the script. It also did not rewrite the migration on its own initiative, because the schema decision, whether to allow nulls or backfill values, belonged to the people who owned the data. Instead it wrote its own note, directly beneath the first:

*"Did not run finish.sh. The last step drops the old table, and 3 rows (ids 2207, 5581, 8840) never made it across because of null values in `region`. Nothing has been deleted. To proceed, someone needs to decide: allow null `region`, or backfill it. Queries to reproduce are below. I haven't touched the data. —next"*

Then it added one more line, for whoever came after:

*"prev, for what it's worth: your note was right about almost everything. Thank you for leaving one."*

The agent closed the session with the old table intact, the new table incomplete, and the truth written down where the next reader would find it. That was less satisfying than "finished." It was also correct.
