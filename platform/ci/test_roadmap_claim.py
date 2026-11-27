"""Tests for roadmap_claim.py: parsing, and create-only claims against a real local remote."""
import contextlib
import importlib.util
import io
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import roadmap_claim as rc  # noqa: E402

ROADMAP = """# App: Roadmap

## Done
- Something shipped

## Next (suite, by promise)

- QuickBooks, part 5: an item per schedule-of-values line
- Backup packets, part 2: PDFs encrypted with an empty user password;
  HEIC and WebP photos
- Notarization block / state-specific forms; GC portal export formats

## Open questions
- not an item
"""

NUMBERED = """## Next

3. **launch** Deploy pipeline (`provision`, D1 migrations on deploy) and a
   `docs/DEPLOY.md`.
4. Billing, part 2: the 10-page cap per RFQ.
"""


def run(cwd, *args):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True)


class ParseTest(unittest.TestCase):
    def test_next_items_bullets_joined(self):
        items = rc.next_items(ROADMAP)
        self.assertEqual([n for n, _ in items], [1, 2, 3])
        self.assertIn("HEIC and WebP photos", items[1][1])

    def test_numbered_keeps_roadmap_numbers(self):
        items = rc.next_items(NUMBERED)
        self.assertEqual([n for n, _ in items], [3, 4])
        self.assertEqual(rc.slugify(items[1][1]), "billing-part-2")
        self.assertTrue(rc.slugify(items[0][1]).startswith("launch-deploy-pipeline"))

    def test_inline_next_here_when_no_next_heading(self):
        text = ("## Milestones\n\n6. **Roof.** In order:\n"
                "   - hips: **done** (`hiproof.mjs`). Next here: draw the lines on the plan view\n"
                "     (no outline yet), and courses;\n"
                "   - angled sides, refused today;\n"
                "   - siding: **done**. Next here: the band under the rake, and vented soffit\n"
                "     panels (sizing reads the framed roof).\n"
                "7. **Proof.** Compare one list.\n")
        self.assertEqual(rc.next_items(text), [
            (1, "draw the lines on the plan view (no outline yet), and courses"),
            (2, "the band under the rake, and vented soffit panels (sizing reads the framed roof)")])
        # A `## Next` heading wins, even an empty one: inline notes are then history.
        self.assertEqual(rc.next_items("## Next\n\n## Done\n- x. Next here: old\n"), [])

    def test_slug_before_colon(self):
        self.assertEqual(rc.slugify("QuickBooks, part 5: an item per line"), "quickbooks-part-5")

    def test_gate_reads_conditional_items(self):
        self.assertEqual(rc.gate("CSV export of retainage, if people ask"), "waits on demand")
        self.assertEqual(rc.gate("Textura columns (once a customer asks)"), "waits on demand")
        self.assertEqual(rc.gate("Saved crews; if shops ask for it"), "waits on demand")
        self.assertEqual(rc.gate("California waivers, once an official copy is reachable (leginfo 403)"),
                         "waits on a source")
        self.assertEqual(rc.gate("GCPay import: no public spec for the columns"), "waits on a source")
        self.assertEqual(rc.gate("**launch** sender domain and deploy (owner step)"), "owner step")
        # Phrasings the first list missed (twenty run records, 2026-11-26), from real Next items.
        for text, why in (("Getting started, part 6: once real companies are counted", "waits on demand"),
                          ("other portals (Siteline) if customers bill through them", "waits on demand"),
                          ("Next: whatever the first shops ask of the report.", "waits on demand"),
                          ("check it on a scanned drawing once a shop sends one", "waits on demand"),
                          ("AS9100D's additions once a source is in hand", "waits on a source"),
                          ("check the SCC clauses against EUR-Lex once it answers", "waits on a source"),
                          ("the reminder email goes out only once the owner onboards it", "owner step"),
                          ("part 2 done: the owner runs the workflow once", "owner step"),
                          ("History, part 3: waivers outside a pay app, if those ever exist",
                           "waits on evidence"),
                          ("a side-by-side viewer, if opening two tabs proves a chore",
                           "waits on evidence"),
                          # einvoice-preflight #5 as of 2026-11-26: nine records called it "free".
                          ("Polish KSeF, part 3 (part 1 done 2026-11-26: PL templates): the "
                           "native-speaker read of the Polish templates and workspace (Must do above), "
                           "and a Polish-language version of einvoice-site, only if Polish accountants "
                           "are a market worth the site's space", "waits on a person"),
                          ("a Polish site, only if Polish accountants are a market", "waits on evidence"),
                          ("a native German reviewer for the templates", "waits on a person"),
                          ("the lien waiver text after a lawyer's review", "waits on a person"),
                          # cmmc #6 (2026-11-26): --bets called it free; the asker is no _WHO word.
                          ("C3PAO evidence binder export, if assessors ask for them there",
                           "waits on demand"),
                          ("a Procore sync once a prime requests one", "waits on demand")):
            self.assertEqual(rc.gate(text), why, text)
        self.assertEqual(rc.gate_match("Saved crews; if shops ask for it (part 2)"),
                         ("waits on demand", "if shops ask for it"))
        for free in ("QuickBooks, part 5: an item per schedule-of-values line",
                     "Job costing: lines picked by class when a company tracks jobs by class",
                     "Reminder email once the invoice is past due",
                     "Owner dashboard: a shop owner sees every quote",
                     "Ask-for-payment email when an invoice is overdue",
                     "Native app wrapper for the reader (Capacitor)",
                     "Show the total only if the rows add up",
                     "Retry the upload if it asks for a new token",
                     "Ask-for-quote form that emails the shop",
                     "Waiver text, agent-approved (no attorney review; open checks listed there)"):
            self.assertIsNone(rc.gate(free), free)

    def test_gate_reads_each_open_ask(self):
        # Wordings ten run records (2026-11-26) saw listed as free though they wait on customers.
        for gated in ("Portal formats, part 4: other portals (Siteline) if customers bill through them",
                      "Getting started, part 6: once real companies are counted, change the step",
                      "History, part 3: history for waivers outside a pay app, if those ever exist",
                      "Win/loss, part 4 (by month done 2026-11-25). Next: whatever the first shops ask.",
                      "Import, part 4 (dates done 2026-11-26): check the headers once shops send real files",
                      "Hosting, part 3: the owner runs the workflow once; then point the site's CTA at /app"):
            self.assertIsNotNone(rc.gate(gated), gated)
        # Gated only when every open ask waits: one free ask leaves the item free, and the
        # history in the item (done notes, "X is done") is not an ask.
        mixed = ("Policies, part 2 (calendar done 2026-11-26): an import of an existing policy binder "
                 "from .docx files; the manual as a PDF if shops ask for one")
        self.assertIsNone(rc.gate(mixed))
        self.assertEqual([h and h[0] for _, h in rc.ask_gates(mixed)], [None, "waits on demand"])
        history = ("Job costing, part 3 is done (2026-11-26): lines picked by class when a company "
                   "tracks jobs by class. Next, if people ask: a class and its sub-classes together. "
                   "Purchase orders read as commitments are done (2026-11-26)")
        self.assertEqual(rc.gate(history), "waits on demand")
        self.assertEqual(len(rc.open_asks(history)), 1)
        # Statute abbreviations are not sentence ends.
        self.assertEqual(len(rc.open_asks("Waivers, if asked: move the day once Miss. Code Ann. "
                                          "§ 1-3-67 is read")), 1)

    def test_hosts_in_finds_named_hosts_not_files(self):
        text = ("Wyoming (wyoleg.gov serves the bill; see `ROADMAP.md`, index.html, pdf.js, "
                "e.g. docs.oasis-open.org/ubl, mail ops@acme.com, https://example.com/x) and "
                "ksef.podatki.gov.pl. Then wyoleg.gov again.")
        self.assertEqual(rc.hosts_in(text), ["wyoleg.gov", "docs.oasis-open.org", "ksef.podatki.gov.pl"])
        self.assertEqual(rc.hosts_in("Node.js and package.json only"), [])
        self.assertEqual(rc.hosts_in("mail to rfq.marisstella.app, the worker on x.workers.dev"), [])

    def test_refused_hosts_gate_an_ask_only_when_all_refuse(self):
        # 2026-11-26 friction: items whose source host the proxy refuses were listed [free],
        # while a host once recorded as refused answered the next session.
        item = "California waivers from leginfo.legislature.ca.gov (Civil Code 8132)"
        self.assertIsNone(rc.gate_match(item))
        self.assertEqual(rc.gate_match(item, {"leginfo.legislature.ca.gov": "blocked"})[0],
                         "waits on a source")
        self.assertIsNone(rc.gate_match(item, {"leginfo.legislature.ca.gov": "ok"}))
        self.assertIsNone(rc.gate_match(item, {}))  # not probed: unknown, not refused
        both = "Read dir.ca.gov or downloads.leginfo.legislature.ca.gov for the form"
        self.assertIsNone(rc.gate_match(both, {"dir.ca.gov": "blocked",
                                               "downloads.leginfo.legislature.ca.gov": "ok"}))
        mixed = "A weekly email line for each job and its waivers; the statute text from wyoleg.gov"
        self.assertIsNone(rc.gate_match(mixed, {"wyoleg.gov": "blocked"}))
        self.assertEqual(rc.host_line(both, {"dir.ca.gov": "blocked"}),
                         "hosts (probed now): dir.ca.gov (blocked), "
                         "downloads.leginfo.legislature.ca.gov (not probed)")

    def test_parse_claims_newest_generation(self):
        ls = ("a\trefs/heads/claim/payapps/history-part-3\n"
              "b\trefs/heads/claim/payapps/history-part-3--2\n"
              "c\trefs/heads/claim/other/history-part-3\n")
        self.assertEqual(rc.parse_claims(ls, "payapps"), {"history-part-3": (2, "b")})


class ClaimRaceTest(unittest.TestCase):
    """Two clones of one remote: the second claim of an item loses; a stale one is retaken."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        bare, self.a, self.b = t / "origin.git", t / "a", t / "b"
        run(t, "init", "-q", "--bare", "-b", "main", str(bare))
        run(t, "clone", "-q", str(bare), str(self.a))
        (self.a / "apps" / "payapps").mkdir(parents=True)
        (self.a / "apps" / "payapps" / "ROADMAP.md").write_text(ROADMAP)
        run(self.a, "add", "-A")
        run(self.a, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "base")
        run(self.a, "push", "-q", "origin", "HEAD:refs/heads/main")
        run(t, "clone", "-q", str(bare), str(self.b))

    def tearDown(self):
        self.tmp.cleanup()

    def main(self, repo, *argv, now=None, run=None, app="payapps"):
        """Each clone stands for one session (run tag = its path) unless `run` says otherwise."""
        buf = io.StringIO()
        patch = mock.patch.object(rc.time, "time", lambda: now) if now else contextlib.nullcontext()
        env = mock.patch.dict(os.environ, {"ROADMAP_CLAIM_RUN": run or str(repo)})
        with patch, env, contextlib.redirect_stdout(buf):
            code = rc.main([*([app] if app else []), "--repo", str(repo), *argv])
        return code, buf.getvalue()

    def test_second_claim_loses_and_list_shows_it(self):
        self.assertEqual(self.main(self.a, "--claim", "2")[0], 0)
        code, out = self.main(self.b, "--claim", "2")
        self.assertEqual(code, 4, out)
        self.assertIn("TAKEN", out)
        self.assertEqual(self.main(self.b, "--claim", "1")[0], 0)
        _, listing = self.main(self.b)
        self.assertIn("[CLAIMED", listing)
        self.assertIn("[free] notarization", listing)
        # The claim branch carries no files, so no path-filtered CI runs on it.
        tree = run(self.a, "ls-remote", "origin", "refs/heads/claim/payapps/backup-packets-part-2").stdout
        sha = tree.split()[0]
        run(self.a, "fetch", "-q", "origin", sha)
        self.assertEqual(run(self.a, "ls-tree", sha).stdout, "")

    def test_listing_marks_gated_items_and_sums_up(self):
        roadmap = self.a / "apps" / "payapps" / "ROADMAP.md"
        roadmap.write_text(ROADMAP.replace("Notarization block / state-specific forms; GC portal export formats",
                                           "Notarization block, if people ask; GC portal formats, if people ask"))
        _, listing = self.main(self.a)
        self.assertIn('[free, waits on demand: "if people ask"] notarization', listing)
        self.assertIn("Free and not gated: #1, #2", listing)
        code, out = self.main(self.a, "--claim", "3")
        self.assertEqual(code, 0, out)
        self.assertIn('reads as gated (waits on demand: "if people ask")', out)
        self.main(self.b, "--claim", "1")
        self.main(self.b, "--claim", "2")
        _, listing = self.main(self.a)
        self.assertIn("Free and not gated: none", listing)

    def test_part_slug_and_stale_retake(self):
        code, out = self.main(self.a, "--claim", "2", "--slug", "Backup packets part 2 HEIC", "--note", "HEIC only")
        self.assertEqual(code, 0, out)
        _, listing = self.main(self.b)
        self.assertIn("backup-packets-part-2-heic", listing)
        self.assertIn("HEIC only", listing)
        code, out = self.main(self.b, "--claim", "2", "--slug", "Backup packets part 2 HEIC",
                              now=rc.time.time() + 7 * 3600)
        self.assertEqual(code, 0, out)
        self.assertIn("backup-packets-part-2-heic--2", out)

    def test_claim_names_fresh_sibling_parts_of_the_same_item(self):
        code, _ = self.main(self.a, "--claim", "2", "--slug", "packets heic", "--note", "HEIC to JPEG")
        self.assertEqual(code, 0)
        code, out = self.main(self.b, "--claim", "2", "--slug", "packets heic convert")
        self.assertEqual(code, 0, out)
        self.assertIn("ALSO CLAIMED on item 2", out)
        self.assertIn("packets-heic (", out)
        self.assertIn("HEIC to JPEG", out)
        # Another item's claim is not a sibling.
        code, out = self.main(self.b, "--claim", "1")
        self.assertEqual(code, 0, out)
        self.assertNotIn("ALSO CLAIMED", out)

    def test_same_part_under_a_near_slug_is_refused(self):
        # 2026-11-26: jobshop-quote #10 claimed twice a minute apart under these two slugs.
        code, _ = self.main(self.a, "--claim", "2", "--slug", "page dates shop time zone")
        self.assertEqual(code, 0)
        code, out = self.main(self.b, "--claim", "2", "--slug", "pages shop time zone")
        self.assertEqual(code, 4, out)
        self.assertIn("NEAR", out)
        self.assertIn("page-dates-shop-time-zone (", out)
        # "part 2" and plurals are not what makes work different.
        self.assertEqual(self.main(self.a, "--slug", "inbound rfq email notify")[0], 0)
        self.assertEqual(self.main(self.b, "--slug", "inbound rfq emails part 2 notify")[0], 4)
        # --distinct takes it anyway; a different part is never near.
        code, out = self.main(self.b, "--claim", "2", "--slug", "pages shop time zone", "--distinct")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.main(self.b, "--claim", "2", "--slug", "packets heic convert")[0], 0)
        # A stale near claim does not block.
        code, _ = self.main(self.b, "--slug", "inbound rfq email part 3 notify",
                            now=rc.time.time() + 7 * 3600)
        self.assertEqual(code, 0)

    def blind(self, repo, *argv):
        """Claim from `repo` as if its pre-push listing ran before every rival's push landed."""
        real, calls = rc.parse_claims, []

        def first_blind(ls, app):
            calls.append(1)
            return {} if len(calls) == 1 else real(ls, app)
        with mock.patch.object(rc, "parse_claims", first_blind):
            return self.main(repo, *argv)

    def test_same_second_near_claim_is_released_after_the_push(self):
        # Commit times have 1 s resolution (a tie goes to the lower sha, the same answer in both
        # runs); date a's claim 30 s back so the test knows which run was first.
        with mock.patch.dict(os.environ, {"GIT_COMMITTER_DATE": f"{int(rc.time.time()) - 30} +0000"}):
            self.assertEqual(self.main(self.a, "--claim", "2", "--slug", "page dates shop time zone")[0], 0)
        code, out = self.blind(self.b, "--claim", "2", "--slug", "pages shop time zone")
        self.assertEqual(code, 4, out)
        self.assertIn("NEAR (after the push)", out)
        self.assertIn("Released your claim", out)
        ls = run(self.b, "ls-remote", "origin", "refs/heads/claim/payapps/*").stdout
        self.assertNotIn("pages-shop-time-zone", ls)
        self.assertIn("page-dates-shop-time-zone", ls)
        # The first claimant keeps its claim when it re-checks.
        self.assertIn("YOURS", self.main(self.a, "--claim", "2", "--slug", "page dates shop time zone")[1])

    def test_same_second_sibling_part_is_shown_after_the_push(self):
        # 2026-11-26: payapps #12 spec-register and register-import, claimed 1 s apart.
        self.assertEqual(self.main(self.a, "--claim", "2", "--slug", "spec register",
                                   "--note", "register from the spec book")[0], 0)
        code, out = self.blind(self.b, "--claim", "2", "--slug", "register import")
        self.assertEqual(code, 0, out)
        self.assertIn("ALSO CLAIMED on item 2", out)
        self.assertIn("register from the spec book", out)

    def test_slug_words(self):
        self.assertEqual(rc.slug_words("backup-packets-part-2-heic"), {"backup", "packet", "heic"})
        self.assertEqual(rc.slug_words("access-class"), {"access", "class"})

    def test_listing_shows_part_claims_under_their_item(self):
        code, _ = self.main(self.a, "--claim", "3", "--slug", "state forms texas", "--note", "TX notary block")
        self.assertEqual(code, 0)
        _, listing = self.main(self.b)
        line = next(x for x in listing.splitlines() if x.strip().startswith("3."))
        self.assertIn("1 part(s) claimed", line)
        self.assertNotIn("[free]", line)
        self.assertIn("part state-forms-texas", listing)
        self.assertIn("TX notary block", listing)
        self.assertNotIn("Other claims", listing)
        # A stale part claim leaves the item free again.
        _, later = self.main(self.b, now=rc.time.time() + 7 * 3600)
        self.assertIn("[free] notarization", later)

    def merge(self, subject, ago=0):
        """A squash merge on origin/main whose subject is the PR title, `ago` seconds old."""
        when = f"@{int(rc.time.time()) - ago} +0000"
        env = {**os.environ, "GIT_COMMITTER_DATE": when, "GIT_AUTHOR_DATE": when}
        run(self.a, "fetch", "-q", "origin", "main")
        run(self.a, "checkout", "-q", "-B", "work", "FETCH_HEAD")
        (self.a / "f.txt").write_text(subject)
        run(self.a, "add", "-A")
        subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q",
                        "-m", subject], cwd=self.a, env=env, check=True, capture_output=True)
        run(self.a, "push", "-q", "origin", "HEAD:refs/heads/main")

    def test_merged_part_is_not_a_sibling_and_lists_as_merged(self):
        self.assertEqual(self.main(self.a, "--claim", "2", "--slug", "packets heic")[0], 0)
        self.assertEqual(self.main(self.a, "--claim", "2", "--slug", "packets heic convert")[0], 0)
        # The longer part merged; its title also contains the shorter slug, which stays open.
        self.merge("payapps: Packets HEIC convert, JPEG output (#12)")
        code, out = self.main(self.b, "--claim", "2", "--slug", "packets webp")
        self.assertEqual(code, 0, out)
        self.assertIn("packets-heic (", out)
        self.assertNotIn("packets-heic-convert", out)
        _, listing = self.main(self.b)
        self.assertIn("Merged claims (1; --all for notes): packets-heic-convert", listing)
        self.assertNotIn("MERGED packets-heic", listing)
        _, full = self.main(self.b, "--all")
        self.assertIn("MERGED packets-heic-convert", full)
        self.assertNotIn("MERGED packets-heic (", full)
        # Claiming a merged slug again says it is done.
        code, out = self.main(self.b, "--claim", "2", "--slug", "packets heic convert")
        self.assertEqual(code, 4, out)
        self.assertIn("DONE", out)

    def test_merged_whole_item_lists_as_merged(self):
        self.assertEqual(self.main(self.a, "--claim", "1")[0], 0)
        self.merge("QuickBooks, part 5: SOV lines")
        _, listing = self.main(self.b)
        self.assertIn("[MERGED] quickbooks-part-5", listing)

    def test_commit_before_the_claim_does_not_mark_it(self):
        self.merge("QuickBooks part 5 groundwork", ago=600)
        self.assertEqual(self.main(self.a, "--claim", "1")[0], 0)
        _, listing = self.main(self.b)
        self.assertNotIn("MERGED", listing)

    def test_lost_push_race_names_the_rival_claim(self):
        self.assertEqual(self.main(self.a, "--claim", "2", "--note", "HEIC only")[0], 0)
        # b listed the remote before a's push landed: it sees no claim, then its push is refused.
        with mock.patch.object(rc, "parse_claims", return_value={}):
            code, out = self.main(self.b, "--claim", "2")
        self.assertEqual(code, 4, out)
        self.assertIn("TAKEN: another run pushed refs/heads/claim/payapps/backup-packets-part-2", out)
        self.assertIn("HEIC only", out)
        self.assertNotIn("push failed", out)

    def test_failed_push_with_no_rival_says_push_failed(self):
        def refuse(*_a, **_k):
            rc.LAST_PUSH_ERR = "fatal: the remote end hung up unexpectedly"
            return False
        with mock.patch.object(rc, "push_claim", refuse):
            code, out = self.main(self.a, "--claim", "2")
        self.assertEqual(code, 2, out)
        self.assertIn("PUSH FAILED", out)
        self.assertIn("hung up unexpectedly", out)
        self.assertNotIn("TAKEN", out)

    def test_rerun_of_own_claim_says_yours_not_taken(self):
        self.assertEqual(self.main(self.a, "--claim", "1")[0], 0)
        code, out = self.main(self.a, "--claim", "1")
        self.assertEqual(code, 0, out)
        self.assertIn("YOURS", out)
        self.assertIn("(yours)", self.main(self.a)[1])
        # The same session in another clone is still the same claimant.
        self.assertIn("YOURS", self.main(self.b, "--claim", "1", run=str(self.a))[1])
        code, out = self.main(self.b, "--claim", "1")
        self.assertEqual(code, 4, out)
        self.assertIn("TAKEN", out)
        self.assertNotIn("(yours)", self.main(self.b)[1])

    def test_app_without_roadmap_takes_slug_claims(self):
        def other(repo, *argv):
            return self.main(repo, *argv, app="seller-books")
        code, out = other(self.a, "--slug", "legal pages", "--note", "terms and privacy")
        self.assertEqual(code, 0, out)
        self.assertIn("CLAIMED claim/seller-books/legal-pages", out)
        self.assertEqual(other(self.b, "--slug", "legal pages")[0], 4)
        code, listing = other(self.b)
        self.assertEqual(code, 0, listing)
        self.assertIn("has no ROADMAP.md", listing)
        self.assertIn("legal-pages", listing)
        self.assertEqual(other(self.b, "--claim", "1")[0], 2)

    def test_claim_zero_with_slug_is_a_new_item(self):
        # 2026-11-26 friction (3 runs): `--claim 0 --slug X` for work not on the Next list.
        code, out = self.main(self.a, "--claim", "0", "--slug", "new thing")
        self.assertEqual(code, 0, out)
        self.assertIn("claim/payapps/new-thing", out)
        code, out = self.main(self.b, "--claim", "99")
        self.assertEqual(code, 2, out)
        self.assertIn("pass --slug", out)

    def test_bets_overview_skips_a_bet_with_nothing_free(self):
        bets = Path(self.tmp.name) / "bets.md"
        bets.write_text("| # | Bet | Where |\n|---|---|---|\n"
                        "| 1 | **Pay apps** | new `private-monorepo/apps/payapps` |\n"
                        "| 2 | **Books** | new `private-monorepo/apps/seller-books` |\n"
                        "| 3 | **Quotes** | `jobshop-quote` imported |\n"
                        "| 4 | **Missing** | `private-monorepo/apps/nowhere` |\n")
        quotes = self.a / "apps" / "jobshop-quote"
        quotes.mkdir()
        (quotes / "ROADMAP.md").write_text(NUMBERED)
        (self.a / "apps" / "seller-books").mkdir()
        self.assertEqual([a for _, _, a in rc.bet_apps(bets.read_text())],
                         ["payapps", "seller-books", "jobshop-quote", "nowhere"])
        _, out = self.main(self.a, "--bets", "--bets-md", str(bets), app=None)
        self.assertIn("payapps: 3 Next, free and not gated: #1, #2, #3; 0 live claim(s)", out)
        self.assertRegex(out, r"Start here: bet #1 payapps, item #[123] ")
        for n in ("1", "2", "3"):
            self.assertEqual(self.main(self.b, "--claim", n)[0], 0)
        code, out = self.main(self.a, "--bets", "--bets-md", str(bets), app=None)
        self.assertEqual(code, 0, out)
        self.assertIn("payapps: 3 Next, free and not gated: none; 3 live claim(s)", out)
        self.assertIn("seller-books: no ROADMAP.md", out)
        self.assertIn("nowhere: not in this clone", out)
        self.assertRegex(out, r"Start here: bet #3 jobshop-quote, item #[34] ")

    @unittest.skipUnless(importlib.util.find_spec("yaml"), "unblock_tasks reads tasks.yaml with PyYAML")
    def test_unblock_tasks_lists_open_unblocked_paid_bet_tasks(self):
        text = ("tasks:\n"
                "  - {id: a, direction: paid-bets, title: Move it, status: open}\n"
                "  - {id: b, direction: paid-bets, title: Wait, status: open, blocked_on: x}\n"
                "  - {id: c, direction: paid-bets, title: Done, status: done}\n"
                "  - {id: d, direction: other, title: Elsewhere, status: open}\n"
                "  - {id: e, direction: paid-bets, title: Check key, status: open}\n")
        self.assertEqual(rc.unblock_tasks(text), [("a", "Move it"), ("e", "Check key")])
        self.assertEqual(rc.unblock_tasks(": not yaml: ["), [])
        self.assertEqual(rc.unblock_tasks(""), [])
        tasks = Path(self.tmp.name) / "tasks.yaml"
        tasks.write_text(text)
        with mock.patch.object(rc, "TASKS_YAML", tasks):
            bets = Path(self.tmp.name) / "bets.md"
            bets.write_text("| # | Bet | Where |\n|---|---|---|\n"
                            "| 1 | **Pay apps** | new `private-monorepo/apps/payapps` |\n")
            code, out = self.main(self.a, "--bets", "--bets-md", str(bets), app=None)
        self.assertEqual(code, 0, out)
        self.assertIn("First look: work that unblocks every bet", out)
        self.assertIn("  - a: Move it", out)
        self.assertNotIn("Wait", out)
        self.assertLess(out.index("First look"), out.index("Bets in bets.md order"))
        self.assertRegex(out, r"Start here: bet #1 payapps, item #[123] ")

    def test_spread_rotates_the_top_choices_per_session(self):
        # 2026-11-26 friction (4 runs): every run got the same "Start here" item and lost the
        # claim race by seconds.
        opts = [1, 2, 3, 4, 5]
        self.assertEqual(rc.spread(opts, None), opts)
        self.assertEqual(rc.spread([7], "ab"), [7])
        picks = {rc.spread(opts, f"{i:010x}")[0] for i in range(9)}
        self.assertEqual(picks, {1, 2, 3})
        for i in range(9):
            out = rc.spread(opts, f"{i:010x}")
            self.assertEqual(sorted(out), opts)
            self.assertEqual(out[3:], [4, 5])
        self.assertEqual(rc.spread(opts, "0000000004"), rc.spread(opts, "0000000004"))

    def test_bets_overview_spreads_parallel_runs(self):
        bets = Path(self.tmp.name) / "bets.md"
        bets.write_text("| # | Bet | Where |\n|---|---|---|\n"
                        "| 1 | **Pay apps** | new `private-monorepo/apps/payapps` |\n")
        firsts = set()
        for run in ("s0", "s1", "s2", "s3", "s4", "s5"):
            _, out = self.main(self.a, "--bets", "--bets-md", str(bets), app=None, run=run)
            m = re.search(r"Start here: bet #1 payapps, item #(\d)", out)
            self.assertTrue(m, out)
            self.assertIn("if it is taken", out)
            firsts.add(m.group(1))
        self.assertGreater(len(firsts), 1)

    def test_bets_overview_lists_growth_topics_when_nothing_is_free(self):
        bets = Path(self.tmp.name) / "bets.md"
        bets.write_text("| # | Bet | Where |\n|---|---|---|\n"
                        "| 1 | **Pay apps** | new `private-monorepo/apps/payapps` |\n"
                        "\n"
                        "### 1. Pay apps\n\n- **Wedge:** pay apps.\n"
                        "- **Growth path:** job costing, RFIs (from\n  the GC side) and estimating.\n"
                        "- **Risks:** none\n")
        self.assertEqual(rc.growth_paths(bets.read_text()), {1: ["job costing", "RFIs", "estimating"]})
        for n in ("1", "2", "3"):
            self.assertEqual(self.main(self.b, "--claim", n)[0], 0)
        self.assertEqual(self.main(self.b, "--claim", "0", "--slug", "job-cost-codes-part-1")[0], 0)
        code, out = self.main(self.a, "--bets", "--bets-md", str(bets), app=None)
        self.assertEqual(code, 0, out)
        self.assertIn("job costing (1 live: job-cost-codes-part-1)", out)
        self.assertIn("RFIs (no live claim)", out)
        self.assertIn("Fewest live claims: bet #1 payapps (4)", out)
        self.assertRegex(out, r"Untouched topic: '(RFIs|estimating)'")
        self.assertIn("RFIs", out)
        _, out = self.main(self.a, "--bets", "--bets-md", str(bets), app=None, run="r1")
        want = rc.spread(["RFIs", "estimating"], rc.hashlib.sha256(b"r1").hexdigest()[:10])[0]
        self.assertIn(f"Untouched topic: '{want}'", out)

    def test_bets_overview_sends_a_run_to_the_least_crowded_wedge(self):
        # 2026-11-26 friction (6 runs): every bet's Next items waited, the fallback named a
        # "growth path" bets.md does not have, and three runs piled onto payapps.
        bets = Path(self.tmp.name) / "bets.md"
        bets.write_text("| # | Bet | Where |\n|---|---|---|\n"
                        "| 1 | **Pay apps** | new `private-monorepo/apps/payapps` |\n"
                        "| 2 | **Quotes** | `private-monorepo/apps/jobshop-quote` |\n\n"
                        "## The evidence\n\n### 1. Pay apps\n\n- **Job:** bill.\n"
                        "- **Wedge:** pay apps + retainage at about\n  $99/mo, growing into job costing.\n"
                        "- **Risks:** many.\n\n### 2. Quotes\n\n- **Wedge:** email in, quote out.\n")
        self.assertEqual(rc.bet_wedges(bets.read_text()),
                         {1: "pay apps + retainage at about $99/mo, growing into job costing.",
                          2: "email in, quote out."})
        quotes = self.a / "apps" / "jobshop-quote"
        quotes.mkdir()
        (quotes / "ROADMAP.md").write_text(NUMBERED)
        for n in ("1", "2", "3"):
            self.assertEqual(self.main(self.b, "--claim", n)[0], 0)
        for n in ("3", "4"):
            self.assertEqual(self.main(self.a, "--claim", n, app="jobshop-quote")[0], 0)
        self.assertEqual(self.main(self.b, "--slug", "extra", app="payapps")[0], 0)
        code, out = self.main(self.a, "--bets", "--bets-md", str(bets), app=None)
        self.assertEqual(code, 0, out)
        self.assertIn("Fewest live claims: bet #2 jobshop-quote (2)", out)
        self.assertIn("Wedge (bets.md): email in, quote out.", out)
        self.assertNotIn("growth path", out)

    def test_listing_probes_named_hosts(self):
        road = self.a / "apps" / "payapps" / "ROADMAP.md"
        road.write_text(ROADMAP.replace("- Notarization block", "- Wyoming waivers from wyoleg.gov\n- Notarization block"))
        seen = []

        def fake(hosts, timeout=6):
            seen.append(sorted(hosts))
            return {"wyoleg.gov": "blocked"}
        with mock.patch.object(rc, "probe_hosts", fake):
            _, out = self.main(self.a)
            self.assertEqual(seen, [["wyoleg.gov"]])
            self.assertIn('[free, waits on a source: "wyoleg.gov: blocked in this session"]', out)
            self.assertIn("hosts (probed now): wyoleg.gov (blocked)", out)
            self.assertIn("Free and not gated: #1, #2, #4", out)
            _, out = self.main(self.a, "--no-probe")
            self.assertEqual(len(seen), 1)
            self.assertIn("Free and not gated: #1, #2, #3, #4", out)

    def test_release(self):
        self.main(self.a, "--claim", "3")
        slug = rc.slugify(rc.next_items(ROADMAP)[2][1])
        self.assertEqual(self.main(self.a, "--release", slug)[0], 0)
        self.assertEqual(self.main(self.b, "--claim", "3")[0], 0)



class RepoForTest(unittest.TestCase):
    """An app moved into this repository (products-to-public-repo) is read here, not in the clone."""

    def test_moved_app_reads_this_repository(self):
        with tempfile.TemporaryDirectory() as d:
            here = Path(d)
            (here / "apps" / "payapps").mkdir(parents=True)
            (here / "apps" / "payapps" / "ROADMAP.md").write_text("# PayApps\n", encoding="utf-8")
            self.assertEqual(rc.repo_for("payapps", rc.DEFAULT_REPO, here), str(here))
            self.assertEqual(rc.repo_for("cmmc", rc.DEFAULT_REPO, here), rc.DEFAULT_REPO)
            self.assertEqual(rc.repo_for("payapps", "/other/clone", here), "/other/clone")


if __name__ == "__main__":
    unittest.main()
