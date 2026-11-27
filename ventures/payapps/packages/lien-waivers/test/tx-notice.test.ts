import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  noticeById,
  noticeForms,
  placeholdersOf,
  renderNotice,
  TX_LABOR_NOTICE_ID,
  TX_RETAINAGE_NOTICE_ID,
  toPlainText,
  txLienAffidavitDue,
  txMonthlyNoticeDue,
  txMonthOf,
  txNextWeekday,
  txNoticeSchedule,
  txRetainageAffidavitDue,
  txRetainageNoticeDue,
} from "../src/index.ts";

// Tex. Prop. Code §§ 53.001 (excerpt), 53.003, 53.052, 53.056 and 53.057, fetched 2026-11-27 (see
// the file's header).
const LINES = readFileSync(new URL("../sources/tx-53-notices.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"));
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const ALL = normalize(LINES.join(" "));
const section = (n: string) => {
  const line = LINES.find((l) => l.startsWith(`Sec. ${n}.`));
  assert.ok(line, `§ ${n} in the snapshot`);
  return normalize(line);
};
const S53_056 = section("53.056");
const S53_057 = section("53.057");

/** The quoted form inside a section: from its title to the (a-3) that follows it. */
function statuteForm(sec: string, title: string): string {
  const start = sec.indexOf(`"${title}`);
  const end = sec.indexOf("(a-3)", start);
  assert.ok(start > 0 && end > start, `form ${title} found`);
  return sec.slice(start, end);
}

/** A form's text with its quote marks, rules and captions taken out, for a word-for-word compare. */
const strip = (s: string) =>
  normalize(
    s
      .replaceAll('"', " ")
      .replace(/_{3,}/g, " ")
      .replace(/\{\{\w+\}\}/g, " ")
      .replace(/\((Claimant's contact person|Claimant's address)\)/g, " "),
  ).replace(/ ([.:])/g, "$1");

/** The printed form in the order it prints: titles, notices, each field line, signature captions. */
function printed(id: string): string {
  const f = noticeById("TX", id);
  assert.ok(f);
  return f.body
    .flatMap((b) => {
      if (b.type === "field") return [`${b.label}: ${b.value}`];
      if (b.type === "signature") return (b.lines ?? []).map((l) => `${l.value} (${l.label})`);
      return "text" in b ? [b.text] : [];
    })
    .join(" ");
}

test("TX notices: both § 53.056(a-2) and § 53.057(a-2) forms print word for word, in order", () => {
  const labor = statuteForm(S53_056, "NOTICE OF CLAIM FOR UNPAID LABOR OR MATERIALS");
  const ret = statuteForm(S53_057, "NOTICE OF CLAIM FOR UNPAID RETAINAGE");
  assert.ok(labor.includes("Claim amount:") && ret.includes("Total retainage unpaid:"));
  assert.equal(strip(printed(TX_LABOR_NOTICE_ID)), strip(labor));
  assert.equal(strip(printed(TX_RETAINAGE_NOTICE_ID)), strip(ret));
});

test("TX notices: the two captions under a rule are the signature lines' labels", () => {
  for (const id of [TX_LABOR_NOTICE_ID, TX_RETAINAGE_NOTICE_ID]) {
    const f = noticeById("TX", id);
    assert.ok(f);
    const sig = f.body.find((b) => b.type === "signature");
    assert.ok(sig && sig.type === "signature");
    const labels = (sig.lines ?? []).map((l) => l.label);
    assert.deepEqual(labels, ["Claimant's contact person", "Claimant's address"]);
    for (const l of labels) assert.ok(ALL.includes(`(${l})`), l);
    const declared = new Set(f.fields.map((x) => x.key));
    for (const k of placeholdersOf(f.body)) assert.ok(declared.has(k), k);
    assert.equal(f.fields.length, placeholdersOf(f.body).size);
  }
});

test("TX notices: every phrase the notes quote is in the statute as published", () => {
  let quotes = 0;
  for (const f of noticeForms("TX")) {
    for (const note of f.notes) {
      for (const m of note.matchAll(/"([^"]+)"/g)) {
        const q = normalize(m[1] ?? "");
        assert.ok(ALL.includes(q), `not in the snapshot: ${q}`);
        quotes++;
      }
    }
  }
  assert.ok(quotes >= 16, `${quotes} quotes checked`);
});

test("TX notices: offered for Texas only, labor first", () => {
  assert.deepEqual(
    noticeForms("tx").map((n) => n.id),
    [TX_LABOR_NOTICE_ID, TX_RETAINAGE_NOTICE_ID],
  );
  assert.equal(noticeById("OK", TX_LABOR_NOTICE_ID), undefined);
});

test("TX notice renders filled, with a rule for the blank optional line", () => {
  const f = noticeById("TX", TX_LABOR_NOTICE_ID);
  assert.ok(f);
  const r = renderNotice(f, {
    noticeDate: "2026-06-10",
    projectDescription: "Lamar Office Shell, 1200 S Lamar Blvd, Austin, TX 78704",
    claimantName: "Hill Country Electric LLC",
    workType: "Electrical labor and materials",
    originalContractor: "Capitol Builders Inc.",
    claimAmount: "$18,400.00",
    contactPerson: "Dana Ruiz, (512) 555-0144",
    claimantAddress: "88 E 5th St, Austin, TX 78701",
  });
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const text = toPlainText(r.document);
  assert.match(text, /Date: June 10, 2026/);
  assert.match(text, /Claim amount: \$18,400\.00/);
  assert.match(text, /different from original contractor: _{6,}/);
  assert.equal(r.document.sendTo, "the owner or reputed owner and the original contractor");
  const missing = renderNotice(f, { noticeDate: "2026-06-10" });
  assert.ok(!missing.ok);
  assert.ok(missing.errors.some((e) => e.field === "claimAmount"));
});

test("TX dates: § 53.056 monthly notice, third month (second residential), past a weekend", () => {
  assert.ok(S53_056.includes("not later than the 15th day of the third month after the month"));
  assert.ok(S53_056.includes("not later than the 15th day of the second month after the month"));
  // March 2026 work: 15 June 2026 is a Monday; residential 15 May 2026 is a Friday.
  assert.deepEqual(txMonthlyNoticeDue("2026-03", false), {
    statutory: "2026-06-15",
    due: "2026-06-15",
    movedForWeekend: false,
  });
  assert.equal(txMonthlyNoticeDue("2026-03", true).due, "2026-05-15");
  // November 2026 work: 15 February 2027 (Monday); residential 15 January 2027 (Friday).
  assert.equal(txMonthlyNoticeDue("2026-11", false).due, "2027-02-15");
  // May 2026 work: 15 August 2026 is a Saturday, so Monday 17 August (§ 53.003(e)).
  assert.deepEqual(txMonthlyNoticeDue("2026-05", false), {
    statutory: "2026-08-15",
    due: "2026-08-17",
    movedForWeekend: true,
  });
  assert.throws(() => txMonthlyNoticeDue("2026-13", false), RangeError);
  assert.throws(() => txMonthlyNoticeDue("2026-3", false), RangeError);
});

test("TX dates: weekend roll follows § 53.003(e), holidays are not moved", () => {
  assert.ok(ALL.includes("is a Saturday, Sunday, or legal holiday, the period is extended"));
  assert.equal(txNextWeekday("2026-11-28"), "2026-11-30"); // Saturday
  assert.equal(txNextWeekday("2026-11-29"), "2026-11-30"); // Sunday
  assert.equal(txNextWeekday("2026-11-26"), "2026-11-26"); // Thanksgiving, a Thursday: not moved
  assert.throws(() => txNextWeekday("2026-02-30"), RangeError);
});

test("TX dates: § 53.057 retainage notice, 30 days after the earlier end", () => {
  assert.ok(S53_057.includes("the 30th day after the date the claimant's contract is completed"));
  // Contract done 2026-09-10: 30 days is 2026-10-10, a Saturday, so Monday 12 October.
  assert.deepEqual(txRetainageNoticeDue("2026-09-10"), {
    statutory: "2026-10-10",
    due: "2026-10-12",
    movedForWeekend: true,
  });
  // The original contract terminated earlier, on 2026-08-31: 30 September 2026 (Wednesday).
  assert.equal(txRetainageNoticeDue("2026-09-10", "2026-08-31").due, "2026-09-30");
  assert.equal(txRetainageNoticeDue("2026-09-10", "2026-12-01").due, "2026-10-12");
});

test("TX dates: § 53.052 lien affidavits", () => {
  const s = section("53.052");
  assert.ok(s.includes("not later than the 15th day of the fourth month after the later of"));
  assert.ok(s.includes("not later than the 15th day of the third month after the later of"));
  // Last work in July 2026: 15 November 2026 is a Sunday, so Monday 16 November.
  assert.equal(txLienAffidavitDue("2026-07", false).due, "2026-11-16");
  assert.equal(txLienAffidavitDue("2026-07", true).due, "2026-10-15");
  // Original contract completed in October 2026: 15 January 2027 (Friday).
  assert.equal(txRetainageAffidavitDue("2026-10").due, "2027-01-15");
});

test("TX dates: one notice per month across a year end", () => {
  const rows = txNoticeSchedule("2026-11", "2027-02", false);
  assert.deepEqual(
    rows.map((r) => [r.workMonth, r.statutory]),
    [
      ["2026-11", "2027-02-15"],
      ["2026-12", "2027-03-15"],
      ["2027-01", "2027-04-15"],
      ["2027-02", "2027-05-15"],
    ],
  );
  assert.equal(txMonthOf("2026-12-31"), "2026-12");
  assert.throws(() => txNoticeSchedule("2027-01", "2026-12", false), RangeError);
});
