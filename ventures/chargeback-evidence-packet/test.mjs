// Page-level checks: the wiring, the controls, and the language the safety
// boundary depends on. The arithmetic and the evidence rules are exercised
// directly in `packet.test.mjs` — asserting them again as regular expressions
// over this file would test the markup's spelling rather than the tool's
// answer, which is what these tests used to do.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { EVIDENCE_KEYS, REASONS } from "./packet.mjs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("landing page exposes the chargeback workflow and safety boundary", () => {
  assert.match(html, /Build a chargeback evidence packet/);
  assert.match(html, /not legal, financial, or payment-dispute advice/);
  assert.match(html, /Everything runs locally/);
  assert.match(html, /SoftwareApplication/);
});

test("the page loads its logic as a module rather than duplicating it inline", () => {
  assert.match(html, /<script type="module">/);
  assert.match(html, /from '\.\/packet\.mjs'/);
  // The old inline copy of the rules is the thing that drifted from the tests.
  assert.doesNotMatch(html, /reason==='Merchandise not received'\?/);
});

test("every dispute reason the module knows is offered on the page", () => {
  for (const reason of REASONS) {
    assert.ok(html.includes(`<option>${reason}</option>`), `no option for ${reason}`);
  }
});

test("the evidence checklist is built from the selected reason", () => {
  assert.match(html, /id="checks"/);
  assert.match(html, /function renderChecks/);
  assert.match(html, /Core for this reason/);
  assert.match(html, /Strengthens your response/);
  assert.match(html, /Other records you may hold/);
  // Every evidence key must be reachable: the three groups partition the set.
  assert.match(html, /EVIDENCE_KEYS\.filter/);
  assert.ok(EVIDENCE_KEYS.length > 8, "checklist should cover more than the original eight records");
});

test("restoring a saved draft re-renders the checklist before ticking boxes", () => {
  // Restore sets the reason, which changes which boxes exist. Ticking before
  // re-rendering would silently drop the saved selections.
  const restore = html.slice(html.indexOf("#restore"), html.indexOf("#restore") + 900);
  assert.ok(
    restore.indexOf("renderChecks()") < restore.indexOf(".checks input"),
    "renderChecks must run before the saved boxes are applied",
  );
});

test("generated summary keeps observation language and the deadline note", () => {
  assert.match(html, /This is an observation, not a decision/);
  assert.match(html, /Review needed/);
  assert.match(html, /deadlineNote/);
});

test("discovery and privacy controls are explicit", () => {
  assert.match(html, /Chargeback response FAQ/);
  assert.match(html, /navigator\.doNotTrack==='1'/);
  assert.match(html, /navigator\.globalPrivacyControl===true/);
  assert.match(html, /Do Not Track and Global Privacy Control/);
  assert.match(html, /draft_copied/);
});

test("copy action degrades gracefully when Clipboard API is unavailable", () => {
  assert.match(html, /navigator\.clipboard\?\.writeText/);
  assert.match(html, /document\.execCommand\('copy'\)/);
  assert.match(html, /Select the draft and copy it manually/);
});

test("both downloads are local, guarded, and safely named", () => {
  assert.match(html, /id="download"/);
  assert.match(html, /Download packet JSON/);
  assert.match(html, /new Blob\(\[buildWorkingNotes\(packet\)\]/);
  assert.match(html, /new Blob\(\[JSON\.stringify\(packet,null,2\)\]/);
  assert.match(html, /URL\.createObjectURL/);
  assert.match(html, /URL\.revokeObjectURL/);
  assert.match(html, /safeFileStem\(packet\.orderId\)/);
  assert.match(html, /packet_downloaded/);
  assert.match(html, /packet_exported/);
  // Neither export may run before a packet exists.
  assert.equal((html.match(/if\(!packet\)return/g) ?? []).length, 2);
});

test("optional sponsors and no-warranty are visible", () => {
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /No warranty/);
});

test("draft persistence is explicit and browser-local", () => {
  assert.match(html, /id="save"/);
  assert.match(html, /id="restore"/);
  assert.match(html, /chargeback-packet-draft/);
  assert.match(html, /draft_saved/);
  assert.match(html, /draft_restored/);
  assert.match(html, /only in this browser/);
});

test("the how-to article links back to the tool and carries the boundary", () => {
  const article = readFileSync(new URL("./how-to-respond-to-a-chargeback.html", import.meta.url), "utf8");
  assert.match(article, /href="\.\/"/);
  assert.match(article, /No warranty/);
  assert.match(article, /not legal, financial, or payment-dispute advice/);
  assert.match(article, /does not predict/);
  for (const reason of REASONS) {
    assert.ok(article.includes(reason), `article never covers ${reason}`);
  }
});
