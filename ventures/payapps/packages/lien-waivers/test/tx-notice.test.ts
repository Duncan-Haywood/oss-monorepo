import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  monthsBetween,
  noticeById,
  noticeForms,
  placeholdersOf,
  renderNotice,
  TX_NOTICE_ID,
  TX_RETAINAGE_NOTICE_ID,
  toPlainText,
  txNoticeDeadline,
  txPeriodDeadline,
} from "../src/index.ts";
import type { NoticeForm } from "../src/notices.ts";

// Tex. Prop. Code ch. 53 from the Texas Legislature's chapter file, and H.B. 2237's last two
// sections, fetched 2026-11-27 (see the file's header).
const LINES = readFileSync(new URL("../sources/tx-53-056.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"));
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const ALL = normalize(LINES.join(" "));
// The statute prints each form line inside its own opening quotation mark; the notes quote the
// text with those marks left out.
const UNQUOTED = normalize(LINES.map((l) => l.replace(/^"/, "").replace(/"$/, "")).join(" "));

/** The form as the statute prints it: from its title to the closing quotation mark. */
function statuteForm(title: string): string {
  const start = LINES.indexOf(`"${title}`);
  assert.ok(start >= 0, `form title in the snapshot: ${title}`);
  const end = LINES.findIndex((l, i) => i > start && l.endsWith('"'));
  return LINES.slice(start, end + 1).join(" ");
}

const stripBlanks = (s: string) =>
  normalize(
    s
      .replaceAll('"', " ")
      .replace(/_{3,}/g, " ")
      .replace(/\{\{\w+\}\}/g, " "),
  ).replace(/ ([.:])/g, "$1");

/** What the encoded form prints, in order: titles and text, "label:" for fields, "(caption)" for signature lines. */
function printed(f: NoticeForm): string {
  return f.body
    .flatMap((b) => {
      if (b.type === "field") return [`${b.label}: ${b.value}`];
      if (b.type === "signature") return (b.lines ?? []).map((l) => `${l.value} (${l.label})`);
      return "text" in b ? [b.text] : [];
    })
    .join(" ");
}

const form = (id: string) => {
  const f = noticeById("TX", id);
  assert.ok(f, id);
  return f;
};

for (const [id, title] of [
  [TX_NOTICE_ID, "NOTICE OF CLAIM FOR UNPAID LABOR OR MATERIALS"],
  [TX_RETAINAGE_NOTICE_ID, "NOTICE OF CLAIM FOR UNPAID RETAINAGE"],
] as const) {
  test(`TX ${title}: the whole form is printed word for word, in order, nothing added`, () => {
    const statute = statuteForm(title);
    assert.ok(statute.length > 400, "form found in the snapshot");
    assert.equal(stripBlanks(printed(form(id))), stripBlanks(statute));
  });

  test(`TX ${title}: every placeholder is a declared field, and every field is printed`, () => {
    const f = form(id);
    const used = placeholdersOf(f.body);
    assert.deepEqual([...used].sort(), f.fields.map((x) => x.key).sort());
  });

  test(`TX ${title}: every phrase the notes quote is in the statute`, () => {
    const f = form(id);
    const quotes = f.notes.flatMap((n) => [...n.matchAll(/"([^"]{12,})"/g)].map((m) => m[1]));
    assert.ok(quotes.length >= 5, "the notes quote the statute");
    for (const q of quotes) {
      assert.ok(UNQUOTED.includes(normalize(q as string)), `not in the snapshot: ${q}`);
    }
  });
}

test("TX: both notices are offered for Texas, and verified against the snapshot", () => {
  const forms = noticeForms("tx");
  assert.deepEqual(
    forms.map((f) => f.id),
    [TX_NOTICE_ID, TX_RETAINAGE_NOTICE_ID],
  );
  for (const f of forms) {
    assert.equal(f.citation.verification.status, "verified");
    assert.match(f.citation.officialUrl ?? "", /^https:\/\/statutes\.capitol\.texas\.gov\//);
    assert.match(f.sendTo, /owner or reputed owner and the original contractor/);
    assert.ok(ALL.includes("the owner or reputed owner and the original contractor"));
  }
});

test("TX: the scope note matches H.B. 2237's transition and effective-date sections", () => {
  assert.ok(
    ALL.includes(
      "The changes in law made by this Act apply only to an original contract entered into on or after the effective date of this Act.",
    ),
  );
  assert.ok(ALL.includes("This Act takes effect January 1, 2022."));
  for (const f of noticeForms("TX")) {
    assert.ok(f.notes.some((n) => n.includes("on or after January 1, 2022")));
  }
});

test("TX: the statute's month counts are the ones the code uses", () => {
  assert.ok(
    ALL.includes(
      "for projects other than residential construction projects, not later than the 15th day of the third month after the month during which",
    ),
  );
  assert.ok(
    ALL.includes(
      "for residential construction projects, not later than the 15th day of the second month after the month during which",
    ),
  );
  assert.ok(
    ALL.includes(
      "if the deadline or the last day of the period is a Saturday, Sunday, or legal holiday",
    ),
  );
});

test("TX deadline: the 15th of the third month (commercial) or second (residential)", () => {
  assert.deepEqual(txNoticeDeadline("2026-03", "commercial"), {
    month: "2026-03",
    dueOn: "2026-06-15",
    weekendExtendedTo: null,
  });
  assert.equal(txNoticeDeadline("2026-03", "residential").dueOn, "2026-05-15");
  // Across the year end.
  assert.equal(txNoticeDeadline("2026-11", "commercial").dueOn, "2027-02-15");
  assert.equal(txNoticeDeadline("2026-12", "commercial").dueOn, "2027-03-15");
  assert.equal(txNoticeDeadline("2026-12", "residential").dueOn, "2027-02-15");
  assert.equal(txNoticeDeadline("2026-10", "commercial").dueOn, "2027-01-15");
});

test("TX deadline: a Saturday or Sunday moves to the Monday (§ 53.003(e)); weekdays do not move", () => {
  // 2026-11-15 is a Sunday; 2026-08-15 a Saturday; 2027-01-15 a Friday.
  assert.equal(new Date("2026-11-15T00:00:00Z").getUTCDay(), 0);
  assert.equal(txNoticeDeadline("2026-08", "commercial").weekendExtendedTo, "2026-11-16");
  assert.equal(new Date("2026-08-15T00:00:00Z").getUTCDay(), 6);
  assert.equal(txNoticeDeadline("2026-05", "commercial").weekendExtendedTo, "2026-08-17");
  assert.equal(txNoticeDeadline("2026-10", "commercial").weekendExtendedTo, null);
});

test("TX deadline: a pay period takes its earliest month's date", () => {
  assert.deepEqual(monthsBetween("2026-10-26", "2026-11-25"), ["2026-10", "2026-11"]);
  assert.deepEqual(monthsBetween("2026-12-01", "2027-02-28"), ["2026-12", "2027-01", "2027-02"]);
  assert.equal(txPeriodDeadline("2026-10-26", "2026-11-25", "commercial").dueOn, "2027-01-15");
  assert.equal(txPeriodDeadline("2026-11-01", "2026-11-30", "residential").dueOn, "2027-01-15");
  assert.throws(() => monthsBetween("2026-11-25", "2026-10-26"), RangeError);
  assert.throws(() => txNoticeDeadline("2026-13", "commercial"), RangeError);
});

test("TX notice: renders filled, with the blank 'if different' line left as a rule", () => {
  const r = renderNotice(form(TX_NOTICE_ID), {
    signedDate: "2026-12-01",
    projectDescription: "Riverside Clinic, 1200 E 7th St, Austin, TX 78702",
    claimantName: "Lone Star Electric LLC",
    workType: "Electrical rough-in and finish, labor and materials",
    originalContractor: "Hill Country Builders Inc.",
    claimAmount: "$18,240.00",
    claimantContact: "Dana Ruiz, (512) 555-0142",
    claimantAddress: "400 Congress Ave, Austin, TX 78701",
  });
  assert.ok(r.ok);
  const text = toPlainText(r.document);
  assert.match(text, /NOTICE OF CLAIM FOR UNPAID LABOR OR MATERIALS/);
  assert.match(text, /WARNING: This notice is provided to preserve lien rights\./);
  assert.match(text, /Claim amount: \$18,240\.00/);
  assert.match(
    text,
    /Party with whom claimant contracted if different from original contractor: _+/,
  );
  assert.ok(r.document.disclaimers.some((d) => /not legal advice/i.test(d)));
});

test("TX notice: the required fields are required", () => {
  const r = renderNotice(form(TX_NOTICE_ID), {});
  assert.equal(r.ok, false);
  if (r.ok) return;
  const missing = new Set(r.errors.map((e) => e.field));
  for (const k of ["signedDate", "projectDescription", "claimantName", "claimAmount"]) {
    assert.ok(missing.has(k), k);
  }
  assert.ok(!missing.has("contractedWith"));
});
