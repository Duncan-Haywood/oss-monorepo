import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  FL_MAIL_ON_MAILING,
  FL_SERVICE_METHOD_LABELS,
  flNoticeService,
  flServiceText,
} from "../src/index.ts";

// The same snapshot as fl-notice.test.ts: §§ 713.06(2) and 713.18, Florida Senate, 2026-11-27.
const ALL = readFileSync(new URL("../sources/fl-713-06.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ")
  .replace(/\s+/g, " ");
const SRC = readFileSync(new URL("../src/fl-service.ts", import.meta.url), "utf8");

test("every phrase fl-service.ts quotes is in the statute's text", () => {
  // The header comment's quotes, and those inside the template strings flServiceText prints.
  const header = SRC.slice(SRC.indexOf("/**"), SRC.indexOf("*/")).replace(/\n \* /g, " ");
  const printed = [...SRC.matchAll(/`[^`]*`/g)].map((m) => m[0]).join(" ");
  const quoted = [...`${header} ${printed}`.matchAll(/"([^"]{12,})"/g)].map((m) => m[1]);
  assert.ok(quoted.length >= 8, `found ${quoted.length} quotes`);
  for (const q of quoted) {
    if (q.includes("${")) continue;
    assert.ok(ALL.includes(q), `not in the snapshot: ${q}`);
  }
});

test("the mail services and methods are the ones § 713.18 names", () => {
  assert.ok(ALL.includes("by registered, Global Express Guaranteed, or certified mail"));
  for (const m of FL_MAIL_ON_MAILING) {
    const label = FL_SERVICE_METHOD_LABELS[m].replace(" mail", "").toLowerCase();
    assert.ok(ALL.toLowerCase().includes(label), m);
  }
  assert.ok(ALL.includes("By hand delivery to the person to be served"));
  assert.ok(ALL.includes("By common carrier delivery service"));
  assert.ok(ALL.includes("By posting on the site of the improvement"));
});

const FIRST = "2026-03-01"; // + 40 = 2026-04-10, + 45 = 2026-04-15

test("certified mail within 40 days is served the day it is mailed", () => {
  const s = flNoticeService(FIRST, { method: "certified-mail", on: "2026-04-10" });
  assert.deepEqual(s, {
    serveBy: "2026-04-15",
    mailBy: "2026-04-10",
    servedOn: "2026-04-10",
    basis: "mailing",
    onTime: true,
  });
  assert.match(flServiceText(s), /§ 713\.18\(2\)/);
  // A delivery date after the 45 days does not undo service on mailing.
  const late = flNoticeService(FIRST, {
    method: "global-express-guaranteed",
    on: "2026-04-01",
    deliveredOn: "2026-04-20",
  });
  assert.equal(late.servedOn, "2026-04-01");
  assert.equal(late.onTime, true);
});

test("mail after the 40 days, or a carrier, is served when delivered", () => {
  const unknown = flNoticeService(FIRST, { method: "registered-mail", on: "2026-04-11" });
  assert.equal(unknown.basis, "delivery");
  assert.equal(unknown.servedOn, null);
  assert.equal(unknown.onTime, null);
  assert.match(flServiceText(unknown), /Enter the delivery date/);
  const inTime = flNoticeService(FIRST, {
    method: "registered-mail",
    on: "2026-04-11",
    deliveredOn: "2026-04-15",
  });
  assert.equal(inTime.onTime, true);
  const late = flNoticeService(FIRST, {
    method: "common-carrier",
    on: "2026-04-01",
    deliveredOn: "2026-04-16",
  });
  assert.equal(late.servedOn, "2026-04-16");
  assert.equal(late.onTime, false);
  assert.match(flServiceText(late), /complete defense/);
});

test("hand delivery and posting are served the day given; before work starts is in time", () => {
  assert.equal(flNoticeService(FIRST, { method: "hand-delivery", on: "2026-04-15" }).onTime, true);
  assert.equal(flNoticeService(FIRST, { method: "hand-delivery", on: "2026-04-16" }).onTime, false);
  const posted = flNoticeService(FIRST, { method: "posting", on: "2026-02-20" });
  assert.equal(posted.basis, "posting");
  assert.equal(posted.onTime, true);
});

test("bad dates are refused", () => {
  assert.throws(() => flNoticeService(FIRST, { method: "posting", on: "2026-13-01" }), RangeError);
  assert.throws(
    () =>
      flNoticeService(FIRST, {
        method: "common-carrier",
        on: "2026-03-10",
        deliveredOn: "2026-03-09",
      }),
    RangeError,
  );
  assert.throws(() => flNoticeService("soon", { method: "posting", on: "2026-03-01" }), RangeError);
});
