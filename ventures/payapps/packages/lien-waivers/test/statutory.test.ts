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
