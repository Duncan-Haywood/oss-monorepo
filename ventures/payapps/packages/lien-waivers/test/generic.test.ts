import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  GENERIC_NOTICE,
  hasStatutoryForms,
  listForms,
  render,
  STATUTORY_STATES,
  toPlainText,
  US_STATES,
  undeclaredPlaceholders,
  type WaiverData,
  type WaiverKind,
} from "../src/index.ts";

const BASE: WaiverData = {
  claimantName: "Acme Drywall LLC",
  customerName: "Big GC Inc.",
  ownerName: "Jane Owner",
  jobLocation: "123 Main St, Springfield",
  signerName: "Pat Smith",
  signerTitle: "President",
  signedDate: "2026-11-24",
};

function dataFor(kind: WaiverKind): WaiverData {
  const d: WaiverData = { ...BASE };
  if (kind.endsWith("progress")) d.throughDate = "2026-10-31";
  else d.disputedClaimsCents = 0;
  if (kind.startsWith("conditional")) {
    d.checkMaker = "Big GC Inc.";
    d.checkAmountCents = 1234567;
    d.checkPayee = "Acme Drywall LLC";
  } else {
    d.amountPaidCents = 1234567;
  }
  return d;
}

const genericStates = US_STATES.filter((s) => !STATUTORY_STATES.some((x) => x.state === s));

test("every non-statutory state gets the four generic forms", () => {
  assert.equal(genericStates.length, US_STATES.length - STATUTORY_STATES.length);
  for (const st of genericStates) {
    assert.equal(hasStatutoryForms(st), false);
    const forms = listForms(st);
    assert.equal(forms.length, 4);
    for (const f of forms) {
      assert.equal(f.source, "generic");
      assert.equal(f.citation, null);
      assert.ok(f.notes.includes(GENERIC_NOTICE));
    }
  }
});

test("unknown state codes throw", () => {
  assert.throws(() => listForms("XX"), RangeError);
  assert.throws(() => listForms(""), RangeError);
});

test("state codes are case- and whitespace-insensitive", () => {
  assert.equal(listForms(" ny ")[0]?.state, "NY");
});

describe("generic form rendering (NY)", () => {
  for (const form of listForms("NY")) {
    test(`${form.kind}: renders with the not-a-statutory-form notice`, () => {
      assert.deepEqual(undeclaredPlaceholders(form), []);
      const r = render(form, dataFor(form.kind));
      assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
      const doc = r.document;
      assert.equal(doc.source, "generic");
      assert.equal(doc.citation, null);
      assert.equal(doc.blocks[0]?.type, "title");
      assert.ok(doc.blocks.some((b) => b.type === "notice" && b.text === GENERIC_NOTICE));
      assert.ok(doc.disclaimers.some((d) => d.includes("not legal advice")));
      const text = toPlainText(doc);
      assert.ok(!text.includes("{{"), "no placeholders left");
      assert.ok(text.includes("$12,345.67"));
      assert.ok(text.includes("Acme Drywall LLC"));
      assert.ok(text.includes("Date of Signature: November 24, 2026"));
      if (form.kind.endsWith("progress")) assert.ok(text.includes("October 31, 2026"));
      if (form.kind.startsWith("unconditional")) assert.ok(text.includes("NOTICE TO CLAIMANT"));
      else assert.ok(text.includes("takes effect only when"));
    });
  }

  test("blank optional fields render as a fill-in line", () => {
    const form = listForms("NY").find((f) => f.kind === "conditional-progress");
    assert.ok(form);
    const d = dataFor(form.kind);
    delete d.ownerName;
    const r = render(form, d);
    assert.ok(r.ok);
    assert.ok(toPlainText(r.document).includes("Owner: ________________"));
  });
});

describe("field validation", () => {
  const form = listForms("NY").find((f) => f.kind === "conditional-progress");
  assert.ok(form);

  function errorsFor(d: WaiverData) {
    const r = render(form as NonNullable<typeof form>, d);
    assert.equal(r.ok, false);
    return r.ok ? [] : r.errors;
  }

  test("reports every missing required field", () => {
    const codes = errorsFor({}).map((e) => `${e.field}:${e.code}`);
    for (const k of [
      "claimantName",
      "customerName",
      "jobLocation",
      "signerName",
      "signerTitle",
      "signedDate",
      "throughDate",
      "checkMaker",
      "checkAmountCents",
      "checkPayee",
    ]) {
      assert.ok(codes.includes(`${k}:REQUIRED`), k);
    }
    assert.ok(!codes.some((c) => c.startsWith("ownerName")));
  });

  test("whitespace-only counts as missing", () => {
    const e = errorsFor({ ...dataFor(form.kind), claimantName: "   " });
    assert.deepEqual(
      e.map((x) => x.code),
      ["REQUIRED"],
    );
  });

  test("rejects impossible and malformed dates", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "11/24/2026", "2026-1-5"]) {
      const e = errorsFor({ ...dataFor(form.kind), throughDate: bad });
      assert.deepEqual(
        e.map((x) => `${x.field}:${x.code}`),
        ["throughDate:INVALID_DATE"],
        bad,
      );
    }
  });

  test("money must be non-negative integer cents", () => {
    for (const bad of [-1, 12.5, Number.NaN, "100"]) {
      const d: WaiverData = { ...dataFor(form.kind), checkAmountCents: bad };
      const e = errorsFor(d);
      assert.deepEqual(
        e.map((x) => `${x.field}:${x.code}`),
        ["checkAmountCents:INVALID_MONEY"],
        String(bad),
      );
    }
  });

  test("rejects unknown fields (catches typos)", () => {
    const e = errorsFor({ ...dataFor(form.kind), claimantNmae: "x" });
    assert.deepEqual(
      e.map((x) => `${x.field}:${x.code}`),
      ["claimantNmae:UNKNOWN_FIELD"],
    );
  });

  test("rejects over-long text", () => {
    const e = errorsFor({ ...dataFor(form.kind), exceptions: "x".repeat(2001) });
    assert.deepEqual(
      e.map((x) => x.code),
      ["INVALID_TEXT"],
    );
  });
});
