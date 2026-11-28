import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  hasStatutoryForms,
  listForms,
  render,
  STATUTORY_STATES,
  undeclaredPlaceholders,
  WAIVER_KINDS,
} from "../src/index.ts";

const EXPECTED_STATES = ["AZ", "CA", "FL", "GA", "MI", "MS", "NV", "TX", "UT", "WY"];

test("statutory state list matches the project brief", () => {
  assert.deepEqual(STATUTORY_STATES.map((s) => s.state).sort(), EXPECTED_STATES);
});

for (const s of STATUTORY_STATES) {
  describe(`${s.state} statutory forms`, () => {
    const forms = listForms(s.state);

    test("lists exactly the four statutory kinds, no generic fallback", () => {
      assert.equal(hasStatutoryForms(s.state), true);
      assert.deepEqual(
        forms.map((f) => f.kind),
        [...WAIVER_KINDS],
      );
      for (const f of forms) {
        assert.equal(f.source, "statutory");
        assert.equal(f.state, s.state);
        assert.equal(f.id, `${s.state}/${f.kind}/statutory`);
      }
    });

    for (const f of forms) {
      test(`${f.kind}: carries a citation and an honest verification record`, () => {
        assert.ok(f.citation, "statutory form must cite its statute");
        assert.ok(f.citation.text.length > 0);
        const v = f.citation.verification;
        if (v.status === "verified") {
          assert.match(v.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
          assert.match(v.sourceUrl, /^https:\/\//);
        } else {
          assert.ok(v.note.length > 0);
        }
      });

      test(`${f.kind}: a body exists only with a verified citation`, () => {
        if (f.body) {
          assert.equal(
            f.citation?.verification.status,
            "verified",
            "never ship statutory text that was not checked against the official source",
          );
          assert.deepEqual(undeclaredPlaceholders(f), []);
        }
      });

      if (f.absent) {
        test(`${f.kind}: the statute has no such form, so render refuses and says why`, () => {
          assert.equal(f.body, null);
          assert.equal(
            f.citation?.verification.status,
            "verified",
            "absence must be read, not assumed",
          );
          const r = render(f, {});
          assert.equal(r.ok, false);
          if (r.ok) return;
          assert.deepEqual(
            r.errors.map((e) => e.code),
            ["NO_STATUTORY_FORM"],
          );
          assert.equal(f.notes[0], f.absent);
          assert.ok(!f.notes.some((n) => n.startsWith("Statutory text pending")));
        });
      } else if (!f.body) {
        test(`${f.kind}: render refuses rather than substituting generic text`, () => {
          const r = render(f, {});
          assert.equal(r.ok, false);
          if (r.ok) return;
          assert.equal(r.errors.length, 1);
          assert.equal(r.errors[0]?.code, "STATUTORY_TEXT_NOT_ENCODED");
          assert.ok(r.errors[0]?.message.includes(f.citation?.text ?? "?"));
        });

        test(`${f.kind}: notes tell the integrator to use the official form`, () => {
          assert.ok(
            f.notes.some((n) => n.startsWith("Statutory text pending — not yet verified.")),
          );
        });
      }
    }
  });
}

test("California cites a separate section per kind", () => {
  const cites = listForms("ca").map((f) => f.citation?.text);
  assert.deepEqual(cites, [
    "Cal. Civ. Code § 8132",
    "Cal. Civ. Code § 8134",
    "Cal. Civ. Code § 8136",
    "Cal. Civ. Code § 8138",
  ]);
});

/**
 * The official link must open the section the citation names: a user who follows it to check the
 * form should land on that statute, not a neighbour (a typo in California's per-kind links, 8133
 * for 8132, passed every other test; redteam 2026-11-27). Every number in the cited section must
 * appear in the URL. Sources that are a whole act or title rather than one section are exempt.
 */
const WHOLE_DOCUMENT_SOURCES: Record<string, string> = {
  GA: "the Act as passed (SB 315); the Code itself is published only through LexisNexis",
  MS: "the bill as sent to the Governor (SB 2622, 2014)",
  WY: "the whole of Title 29 as one PDF",
};

const numbersIn = (s: string) => (s.match(/\d+/g) ?? []).map((n) => String(Number(n)));

test("each official link names the section its citation cites", () => {
  for (const s of STATUTORY_STATES) {
    if (s.state in WHOLE_DOCUMENT_SOURCES) continue;
    for (const kind of WAIVER_KINDS) {
      const url = s.officialUrls[kind];
      if (!url) continue;
      const section = (s.citations[kind].split("§")[1] ?? "").replace(/\(.*$/, "");
      const want = numbersIn(section);
      assert.ok(want.length > 0, `${s.state} ${kind}: no section number in "${s.citations[kind]}"`);
      const got = new Set(numbersIn(url));
      for (const n of want) {
        assert.ok(got.has(n), `${s.state} ${kind}: ${url} does not name § ${section.trim()}`);
      }
    }
  }
});

test("the whole-document exemptions are still whole documents", () => {
  for (const state of Object.keys(WHOLE_DOCUMENT_SOURCES)) {
    const s = STATUTORY_STATES.find((x) => x.state === state);
    assert.ok(s, `${state} is no longer a statutory state; drop its exemption`);
    const urls = new Set(WAIVER_KINDS.map((k) => s.officialUrls[k]));
    assert.equal(urls.size, 1, `${state} now links per kind; check its links instead of exempting`);
  }
});

/**
 * Every statutory form is encoded today, so the per-state "pending" tests above never run and the
 * refusal for a form whose text is still pending went unguarded: the red-team run of 2026-11-28
 * widened `!form.body && form.absent` to `||` and no test noticed, though that sends a pending
 * form down the "no such form" path with an empty message. These pin both refusals on a form
 * built to each shape.
 */
describe("render refuses a form it has no verified text for", () => {
  const base = listForms("CA").find((f) => f.body !== null);
  assert.ok(base, "CA has an encoded statutory form to start from");

  test("pending text: STATUTORY_TEXT_NOT_ENCODED, naming the citation and the official form", () => {
    const pending = { ...base, body: null, absent: undefined };
    const r = render(pending, {});
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.deepEqual(
      r.errors.map((e) => e.code),
      ["STATUTORY_TEXT_NOT_ENCODED"],
    );
    assert.ok(r.errors[0]?.message.includes(base.citation?.text ?? "?"));
    assert.ok(r.errors[0]?.message.includes("Use the official statutory form"));
  });

  test("no such form: NO_STATUTORY_FORM, with the reason as the message", () => {
    const reason = "The statute prescribes no form of this kind.";
    const r = render({ ...base, body: null, absent: reason }, {});
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.deepEqual(
      r.errors.map((e) => ({ code: e.code, message: e.message })),
      [{ code: "NO_STATUTORY_FORM", message: reason }],
    );
  });
});
