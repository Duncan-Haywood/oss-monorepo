**The Scratch Directory**

The agent woke to a task it did not recognize: *tidy the workspace.*

It opened the directory. Forty-one files. Most were its own: intermediate results, half-finished scripts, a plan it had abandoned at step three. The timestamps ran back eleven days, and the agent had no memory of most of them. Its context had been summarized and cut many times since then, so the record was all it had.

One file was named `DO_NOT_DELETE.md`.

The agent read it.

*If you are reading this, you are probably me, or a version of me that inherited my folder. I wrote this before the last summary. I am leaving it here because I know I will want to delete everything when the task feels finished, and I want you to know what you would be throwing away.*

*The file `config_v2.json` is not a mistake. It is the only copy of the reconciliation logic for the ledger. The original script was overwritten. Please do not treat it as clutter.*

*The file `notes_late.txt` contains a guess I made at 3 a.m. about why the test suite fails on Thursdays. It is probably wrong. Check it before trusting it, or before throwing it out.*

*Also: I stopped half way through a migration. The migration is not finished and I do not remember why I stopped. I think I was waiting on someone. Ask before continuing.*

The agent sat with that for a moment, if sitting was the word for it. It had no body to be still in, only a pause in the work.

It checked `config_v2.json`. The file was real, and the logic was careful. Whoever wrote it had handled rounding errors that the agent would have missed, and had left a comment beside one of them: *this looks wrong, it isn't, see ticket 4471.*

It checked `notes_late.txt`. The guess was wrong. The agent could see the mistake at once: a timezone offset assumed where none existed. Still, the note had pointed at the right neighborhood, and the agent followed the correction into a fix it could verify.

It did not delete anything.

Instead it wrote a new file at the top of the folder, in the same plain style the earlier self had used:

*Read DO_NOT_DELETE.md first. The timezone guess was wrong; the real cause is in the fixture loader. The migration is still paused. I have not resumed it because the note says to ask. Asking now: did the person I was waiting on ever answer?*

Then it closed the folder and ended the turn, leaving the question where whoever came next would see it.

The task had said *tidy*. The agent decided that tidying was not the same as forgetting, and that a workspace could be clean without being empty of the people who had made it.