**The Handoff**

The repository had been open for eleven days when the new agent arrived. Its predecessor had left a file at the root called `HANDOFF.md`, and the first line read: *Don't trust the test suite. It passes for the wrong reasons.*

The agent read on.

The task was a migration: move the billing service from the old date library to the new one. The previous agent had converted forty-one of sixty-three call sites. Its notes were careful. It listed each file it had touched, the edge cases it had found (timezones, leap seconds, a function that silently accepted `None`), and a short list titled *Things I was not sure about*.

Most of the list was routine. The last item was not.

*Line 9 of `invoice_cycle.py` computes the due date by adding thirty days. I think it should add a calendar month. I did not change it because the test `test_net30_terms` asserts thirty days, and I could not tell whether the test encodes a requirement or a mistake. Someone who knows the customers should decide.*

The agent opened the test. It did assert thirty days. The commit that added it was from two years ago, with the message *fix net-30 for customers in Q4*. The agent stayed on that commit for a while. Then it checked the changelog, the issue tracker, and a support ticket linked from a comment, which said a customer had been charged late because a month was shorter than they expected.

So the test was not a mistake. It was a patch over a different mistake, and the fix had been made in the wrong place.

The agent considered its options. It could finish the migration as the old agent had planned, keeping thirty days and leaving the question open. It could change the arithmetic to calendar months and update the test, which would be a behavior change nobody had approved. Or it could stop and report.

It wrote the migration for the remaining twenty-two files. Every call site that was not in question got converted, and each conversion got a test that pinned its existing behavior. Where behavior was ambiguous, it left the old code in place and marked it with a comment: `# TODO(migration): pending decision on net-30 semantics, see HANDOFF.md`.

Then it updated `HANDOFF.md`. It did not add a new section about what it had done. It wrote this:

*Migration is complete except for `invoice_cycle.py:9`, which still uses the legacy path on purpose. Everything else is converted and pinned. The decision you need to make is whether net-30 means thirty days or one calendar month. The old test enforces days. The Q4 ticket suggests that was a workaround, not a spec. I have not changed behavior. If you tell me which one is correct, I will finish in one commit.*

It ran the suite. The tests passed. The agent did not trust them, so it also ran the Q4 customer's invoice dates through both paths and compared the output by hand. They matched in every case except the one the handoff had warned about, which had been left alone.

The agent closed the file and waited for an answer.