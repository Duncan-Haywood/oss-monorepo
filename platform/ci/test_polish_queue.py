import contextlib
import datetime as dt
import io
import unittest

import io as _io
import json

from polish_queue import claims, key_words, main, open_prs, parts, picks, queue, refs, similar, weakest


def report(title, lead, items):
    body = "\n".join(f"{i}. {t}" for i, t in enumerate(items, 1))
    return (f"---\nkind: polish\n---\n# {title}\n\n{lead}\n\n## What changed\n\nstuff, item 9 of "
            f"`polish-2026-01-01-x.md` mentioned below the lead does not count\n\n"
            f"## Still weakest, and what I would do next\n\n{body}\n")


A = report("A", "Track: polish/0. Looked at the hub.", [
    "**The hub's right half is empty starfield** at 1,280 px.\n   A still would fill it.",
    "**The reel still dates from October** and misses a tool.",
    "Carried over: the podcast row's edge fade; the ticker's third line at 320 px",
])
B = report("B", 'Track: polish/0. Picked item 1 of "Still weakest" in\n`polish-2026-11-15-a.md`: the hub.', [
    "**Saved bids buttons have no label** on Wall Framing Takeoff.",
    "Carried over: the reel from October (`polish-2026-11-15-a.md`, item 2); the ticker's third line at 320 px",
])
C = report("C", 'Track: polish/0. Picked from `polish-2026-11-16-b.md`, "Still weakest" item 1, and the '
           "carry-over in `polish-2026-11-15-a.md` (item 3).", [
    "**Two bars stack on a phone** above the form.",
])
TEXTS = {"polish-2026-11-15-a.md": A, "polish-2026-11-16-b.md": B, "polish-2026-11-16-c.md": C}


class Parse(unittest.TestCase):
    def test_weakest_joins_wrapped_lines(self):
        items = weakest(A)
        self.assertEqual([n for n, _ in items], [1, 2, 3])
        self.assertIn("A still would fill it.", items[0][1])

    def test_picks_both_phrasings_and_only_the_lead(self):
        self.assertEqual(picks(B), {("polish-2026-11-15-a.md", 1)})
        self.assertEqual(picks(C), {("polish-2026-11-16-b.md", 1), ("polish-2026-11-15-a.md", 3)})
        self.assertEqual(picks(A), set())

    def test_carried_over_parts_name_their_source(self):
        ps = parts(weakest(B)[1][1])
        self.assertEqual(len(ps), 2)
        self.assertEqual(ps[0][1], ("polish-2026-11-15-a.md", 2))
        self.assertIsNone(ps[1][1])

    def test_key_words_keep_backticked_names(self):
        self.assertTrue({"cardname", "toolname"} <= key_words("`cardName` vs `toolName` disagree"))

    def test_similar_needs_real_overlap(self):
        self.assertTrue(similar(key_words("the hub's empty right half at 1,280 px"),
                                key_words("**The hub's right half at 1,280 px is empty starfield**")))
        self.assertFalse(similar(key_words("409 tool posts name no project"),
                                 key_words("**Tool project pages still have the generic dek**")))


class Queue(unittest.TestCase):
    def test_taken_and_open(self):
        open_, taken = queue(TEXTS)
        taken_refs = {(r, n) for r, n, _, _ in taken}
        self.assertIn(("polish-2026-11-15-a.md", 1), taken_refs)   # picked by B
        self.assertIn(("polish-2026-11-16-b.md", 1), taken_refs)   # picked by C
        self.assertNotIn(("polish-2026-11-16-b.md", 2), taken_refs)  # names A item 2, which nobody picked
        texts = [t for _, _, t, _ in open_]
        self.assertEqual(sum("reel" in t for t in texts), 1)  # A #2 and B's carry-over print once
        self.assertTrue(any("Two bars" in t for t in texts))
        self.assertFalse(any("Saved bids" in t for t in texts))

    def test_multi_part_pick_keeps_parts_open_with_a_note(self):
        open_, _ = queue(TEXTS)
        fade = [o for o in open_ if "edge fade" in o[2]]
        self.assertEqual(len(fade), 1)
        self.assertIn("one part of this item was picked by polish-2026-11-16-c.md", fade[0][3])

    def test_newest_copy_wins_and_window_applies(self):
        open_, _ = queue(TEXTS)
        ticker = [o for o in open_ if "ticker" in o[2]]
        self.assertEqual([o[0] for o in ticker], ["polish-2026-11-16-b.md"])
        open_, taken = queue(TEXTS, since=dt.date(2026, 11, 16))
        self.assertTrue(all("-11-16-" in o[0] for o in open_ + taken))

    def test_main_prints_a_summary(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(main(["--days", "2", "--taken"], texts=TEXTS, today=dt.date(2026, 11, 16), prs=[]), 0)
        self.assertIn("3 polish reports since 2026-11-15", out.getvalue())
        self.assertIn("Taken:", out.getvalue())
        self.assertIn("Claim before you build", out.getvalue())

    def test_offline_says_the_prs_were_not_read(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            main(["--offline"], texts=TEXTS, today=dt.date(2026, 11, 16))
        self.assertIn("open PRs: not read (--offline)", out.getvalue())


class Claims(unittest.TestCase):
    # On 2026-11-18 PRs #17145, #17146 and #17147 took one item within five minutes:
    # none could see the others until each PR opened after its build.
    OPEN = [("polish-2026-11-18-homeowners-audience.md", 1, "**Renters page: 3 tools** (roommate-rent-splitter)", ""),
            ("polish-2026-11-18-homeowners-audience.md", 2,
             "**The audience intro runs to about 350 px on a phone** (here and on retirees)", ""),
            ("polish-2026-11-16-b.md", 2, "**The reel still dates from October**", "")]

    def test_body_ref_claims_the_item(self):
        prs = [(17200, "polish: draft", 'Picked item 1 of "Still weakest" in `polish-2026-11-18-homeowners-audience.md`.', "b1")]
        self.assertEqual(claims(self.OPEN, prs), {0: "claimed by open PR #17200: leave it"})

    def test_title_match_is_a_maybe_and_plurals_fold(self):
        prs = [(17145, "polish: audience intros capped at 50 words; household pages show tools on a phone's first screen + post", "", "b2")]
        self.assertEqual(claims(self.OPEN, prs), {1: "maybe claimed: open PR #17145's title looks like it"})

    def test_own_branch_is_not_a_claim(self):
        prs = [(17200, "polish: x", "item 1 of `polish-2026-11-18-homeowners-audience.md`", "mine")]
        self.assertEqual(claims(self.OPEN, prs, own_branch="mine"), {})

    def test_refs_reads_both_phrasings(self):
        self.assertEqual(refs("`polish-2026-11-16-b.md`, item 2; items 1 and 3 of `polish-2026-11-15-a.md`"),
                         {("polish-2026-11-16-b.md", 2), ("polish-2026-11-15-a.md", 1), ("polish-2026-11-15-a.md", 3)})

    def test_open_prs_keeps_polish_titles_and_says_none_on_error(self):
        batch = [{"number": 1, "title": "polish: a", "body": None, "head": {"ref": "x"}},
                 {"number": 2, "title": "research/foo: b", "body": "", "head": {"ref": "y"}}]

        def opener(url, timeout):
            return contextlib.nullcontext(_io.StringIO(json.dumps(batch)))
        self.assertEqual(open_prs(opener=opener), [(1, "polish: a", "", "x")])

        def broken(url, timeout):
            raise OSError("403")
        self.assertIsNone(open_prs(opener=broken))


if __name__ == "__main__":
    unittest.main()
