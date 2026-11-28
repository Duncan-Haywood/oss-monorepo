import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MI_ATTACHED, MI_CAPTIONS, MI_WARNING, miNoticeOfFurnishing } from "../src/mi-notice.ts";
import {
  MI_NOTICE_ID,
  noticeById,
  noticeForms,
  placeholdersOf,
  renderNotice,
  toPlainText,
} from "../src/index.ts";

// Mich. Comp. Laws §§ 570.1108, 570.1108a and 570.1109 from legislature.mi.gov, 2026-11-28.
const RAW = readFileSync(new URL("../sources/mi-570-1108-1109.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"));
const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
const at = (prefix: string, from = 0) => {
  const i = RAW.findIndex((l, n) => n >= from && l.startsWith(prefix));
  assert.ok(i >= 0, `${prefix} missing from the snapshot`);
  return i;
};
const S1109 = normalize(RAW.slice(at("570.1109 ")).join(" "));
const S1108 = normalize(RAW.slice(0, at("570.1109 ")).join(" "));
// § 570.1109(4)'s form: from "NOTICE OF FURNISHING" up to § 570.1109(5).
const FORM_START = at("NOTICE OF FURNISHING");
const FORM_LINES = RAW.slice(FORM_START, at("(5) ", FORM_START));

/** Every blank (a run of dots, or a printed rule) as one marker, so the form and the notice compare. */
const BLANK = "<>";
const blanks = (s: string) =>
  normalize(s)
    .replace(/\.{4,}/g, BLANK)
    .replace(/_{4,}/g, BLANK)
    .replace(/\{\{\w+\}\}/g, BLANK)
    .replace(new RegExp(`${BLANK}(\\s*${BLANK})+`, "g"), BLANK)
    .replace(/\s+([,.])/g, "$1");

const DATA = {
  designee: "Huron Clinic Holdings LLC",
  designeeAddress: "2200 Woodward Ave, Detroit, MI 48201",
  contractedWith: "Great Lakes Builders Inc.\n500 Griswold St, Detroit, MI 48226",
  workDescription: "Electrical rough-in and finish, labor and materials",
  liber: "58231",
  page: "117",
  county: "Wayne",
  claimantName: "Motor City Electric LLC",
  claimantAddress: "900 W Lafayette Blvd, Detroit, MI 48226",
  signer: "Dana Ruiz, President",
  signedDate: "2026-11-28",
};

const form = () => {
  const f = noticeById("MI", MI_NOTICE_ID);
  assert.ok(f);
  return f;
};

test("MI notice of furnishing is encoded for Michigan only, once", () => {
  assert.deepEqual(
    noticeForms("mi").map((n) => n.id),
    [MI_NOTICE_ID],
  );
  assert.equal(noticeById("WI", MI_NOTICE_ID), undefined);
});

test("MI notice is § 570.1109(4)'s form word for word, blanks aside", () => {
  const printed = form()
    .body.filter((b) => "text" in b)
    .map((b) => ("text" in b ? b.text : ""))
    .join(" ");
  // The statute's form ends "Date:....... ." and the notice leaves off the stray full stop.
  const statute = blanks(FORM_LINES.join(" ")).replace(/Date:<>\.$/, "Date:<>");
  assert.equal(blanks(printed).replace("Date: <>", "Date:<>"), statute);
  for (const caption of Object.values(MI_CAPTIONS)) assert.ok(statute.includes(caption), caption);
  assert.ok(statute.includes(MI_ATTACHED));
  assert.ok(statute.includes(MI_WARNING));
  // The warning prints as a notice block (bold).
  assert.deepEqual(
    form()
      .body.filter((b) => b.type === "notice")
      .map((b) => ("text" in b ? b.text : "")),
    [MI_WARNING],
  );
});

test("MI notice: sendTo and the notes quote the statute exactly where they quote it", () => {
  const f = form();
  assert.ok(S1109.includes(`notice of furnishing to ${f.sendTo}`));
  for (const note of f.notes) {
    for (const m of note.matchAll(/"([^"]+)"/g)) {
      const q = m[1] ?? "";
      assert.ok(S1109.includes(q) || S1108.includes(q), `not in the statute: ${q}`);
    }
  }
});

test("MI notice declares every placeholder it uses", () => {
  const f = miNoticeOfFurnishing();
  const declared = new Set(f.fields.map((x) => x.key));
  assert.deepEqual(
    [...placeholdersOf(f.body)].filter((k) => !declared.has(k)),
    [],
  );
});

test("MI notice renders the recording details, or lines to fill when a copy is attached", () => {
  const r = renderNotice(form(), DATA);
  assert.ok(r.ok);
  const text = toPlainText(r.document);
  assert.match(text, /^NOTICE OF FURNISHING/);
  assert.match(text, /To: Huron Clinic Holdings LLC/);
  assert.match(text, /furnishing to Great Lakes Builders Inc\.\n500 Griswold/);
  assert.match(text, /recorded in liber 58231, on page 117, Wayne records,/);
  assert.match(text, /by Dana Ruiz, President/);
  assert.match(text, /Date: November 28, 2026/);
  assert.equal(r.document.citation, "Mich. Comp. Laws § 570.1109");
  assert.ok(r.document.disclaimers.some((d) => d.includes("§ 570.1108(10)")));
  const attached = renderNotice(form(), { ...DATA, liber: "", page: "", county: "" });
  assert.ok(attached.ok);
  assert.match(
    toPlainText(attached.document),
    /recorded in liber _{8,}, on page _{8,}, _{8,} records,/,
  );
});

test("MI notice refuses missing required fields", () => {
  const r = renderNotice(form(), { ...DATA, designee: " ", signer: "" });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.errors.map((e) => [e.field, e.code]).sort(), [
    ["designee", "REQUIRED"],
    ["signer", "REQUIRED"],
  ]);
});
