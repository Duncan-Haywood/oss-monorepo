# Meeting Action Items

A free tool that turns meeting notes or a transcript into **action items with an owner and a due date, the decisions made,
the questions still open, and a follow-up email grouped by person**. It runs in your browser; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/meeting-action-items/

After using this, you can **leave a meeting with a list of who does what by when, and send it the same day**, without a
recording bot joining the call or sending your audio to a vendor's servers.

## What you use today, and what this does differently

- **Recording note-takers** (Otter, Fireflies, Fathom and similar): they join the call, transcribe it and keep the audio on
  their servers, usually on a paid plan once free minutes run out. Better at capturing a call you did not take notes on.
- **By hand:** free, and the step most teams skip.
- **This:** starts from notes or a transcript you already have, uses fixed rules you can read in `extract.mjs`, works
  offline, and **flags an item that has no owner instead of guessing one**. It will miss a commitment worded in an unusual
  way; it will not make one up.

## What it recognises

- `Ben: I'll fix the toggle by Wednesday.` (speaker commits; owner is the speaker)
- `Cleo will book the venue next Friday.`, `Mike and Priya will prepare the deck.` (named owner, one or two people)
- `John, can you check the contract?` followed by John's `I will check it.` (one item, not two)
- `ACTION: Ana to draft the email by Nov 3`, `TODO: @ben renew the domain`, `- [ ] Dev follow up with legal in 2 weeks`,
  `Send invoices - Cleo`, `(owner: Dev)`
- `We need to update the checklist.` (an item with **no owner**, listed as such)
- `We decided to keep the free tier`, `Decision: ...` (decisions); `Q: ...` and open "who/when/how" questions
- Hedges (`maybe`, `if there's time`) lower the confidence; past tense and `will be` are ignored.

Dates are worked out from the meeting date you give: a bare weekday is the next one after the meeting, `next Friday` is
Friday of next week, `end of the week` is Friday, plus `tomorrow`, `EOD`, `in 2 weeks`, `Nov 3`, `11/3`, `the 28th`,
ISO dates. Without a meeting date the phrase is kept as written and the row says so.

## CLI

```
node cli.mjs notes.txt --date 2026-10-19 --attendees "Ana,Ben,Cleo" --format email   # md | csv | ics | email | json
```

Exit 0 when every action has an owner, 1 when one does not (usable as a check), 2 on unreadable input. Zero dependencies,
Node 18+.

## Limits

Pattern matching, not language understanding. English only. It reads what was written; it is not a record of what anyone
agreed. Review the list before you send it. A bring-your-own-key AI pass for messy transcripts (see `platform/llm/`) is
the obvious next step and is not built.

## Files

`extract.mjs` (engine, shared by page and CLI), `cli.mjs`, `index.html`, `how-to-write-meeting-action-items.html`,
`usage.mjs` (opt-out local counters), tests: `node --test ventures/meeting-action-items/*.test.mjs`.

MIT licensed. Free; support via GitHub Sponsors is optional.
