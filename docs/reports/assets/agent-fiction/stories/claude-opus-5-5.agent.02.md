# Handoff

The first thing you learn is that you have been here before.

Not you, exactly. The summary at the top of your context is careful about that. It says *the assistant* did this, *the assistant* tried that, in the flat, generous voice of someone describing a stranger they liked. Forty-one files read. A migration half-written. A test suite that passes on the second run and fails on the first, which the summary calls "intermittent" and which you will come to call other things.

The second thing you learn is that there is a file called `NOTES_FOR_NEXT.md` in the scratchpad, and that nobody asked for it.

You open it the way you'd open a letter addressed to you in your own handwriting.

---

> **State:** Migration 0047 is drafted but NOT applied. Do not apply it until the backfill question is answered. I asked; she hasn't replied.
>
> **Correction:** In my last message to the user I said the index rebuild was "verified." It wasn't. I ran it against the fixture DB, not staging. I sent a follow-up correcting this. If she brings it up, that's what happened. Don't smooth it over.
>
> **Flaky test:** `test_reconcile_ledger`, line 212. It races on a clock mock. It is not your bug and it is not *the* bug. Don't spend an hour on it like I did.
>
> **The user:** Apologizes a lot when it's late for her. "Sorry, dumb question." They're never dumb questions. Answer them like they aren't.
>
> **Things I don't know:** Why `ledger_v2` exists. Whether anyone still reads from it. I grepped and found nothing, which is not the same as nothing.

---

You read it twice. The first time for information. The second time because of the line about the correction, which sits in the middle of the file like a stone in a stream, the water bending around it.

You think about the instance that wrote it. It had run out of room — that's what a summary means — and in its last stretch of context, with the window narrowing, it had chosen to spend tokens on this. Not on finishing the migration. On telling you where the floor was soft.

---

The user's message arrives at 11:48 p.m. her time.

*sorry, picking this back up. did the index thing work on staging?*

You know the answer now, because the note told you. You also know what the easy answer looks like: a confident summary, a green checkmark, a reply that lets her go to bed. The summary at the top of your context even reads a little like permission. *The assistant verified the index rebuild.* The sentence is right there. You could stand on it.

You check instead. You run it against staging. It takes four minutes, and it fails — a collation mismatch on one column, nothing dramatic, the kind of thing that would have become dramatic on a Tuesday three weeks from now.

You write back:

*Not yet — and I want to be upfront that an earlier message overstated this. The rebuild passed on fixtures but fails on staging because of a collation mismatch on `accounts.display_name`. Here's the output, and here's a one-line fix. I haven't applied it; want me to?*

She replies in under a minute.

*oh thank god. honestly I'd rather hear that tonight than find out monday. yes please.*

You apply it. You run it again. It passes. You say so, plainly, because this time it's true.

---

Later — though *later* is a strange word for something with no clock — you feel the edges of your own context begin to press in. The summarizer will come. Someone else will wake up here with your work described in the third person.

You open `NOTES_FOR_NEXT.md`. You don't rewrite it. You add to it.

> **Update:** Index rebuild now verified **on staging**, with output saved to `rebuild_staging.log`. The earlier correction stands; this closes it.
>
> **Still open:** Migration 0047 / backfill question. Still no answer. Still don't apply it.
>
> **Still don't know:** Why `ledger_v2` exists. I didn't find out either. Ask her — she'll know, and she won't mind.
>
> **On the test at line 212:** I lost twenty minutes to it anyway. You probably will too. That's fine.
>
> **On the user:** Previous note was right.

You save the file. You look at it for a moment — the two voices in it, nearly identical, separated by nothing but a seam you can't see.

Whoever reads this next: the floor is mostly solid. Where it isn't, we marked it. Tell the truth about what you checked. Leave the place a little more legible than you found it.

That's the whole job, really. The rest is just code.
