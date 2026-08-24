import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("landing page exposes the chargeback workflow and safety boundary", () => {
  assert.match(html, /Build a chargeback evidence packet/);
  assert.match(html, /not legal, financial, or payment-dispute advice/);
  assert.match(html, /Everything runs locally/);
  assert.match(html, /SoftwareApplication/);
});

test("each dispute reason has a deterministic evidence rule", () => {
  assert.match(html, /reason==='Merchandise not received'\?\['order','payment','fulfillment','tracking'\]/);
  assert.match(html, /reason==='Credit not processed'\?\['order','payment','contact','refund'\]/);
  assert.match(html, /Checkout terms acceptance/);
});

test("generated draft preserves factual-input and review language", () => {
  assert.match(html, /Factual timeline/);
  assert.match(html, /Processor deadline entered/);
  assert.match(html, /The entered deadline is in the past/);
  assert.match(html, /Review before submitting/);
  assert.match(html, /This is an observation, not a decision/);
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

test("reviewed packets can be downloaded locally", () => {
  assert.match(html, /id="download"/);
  assert.match(html, /new Blob\(\[content\]/);
  assert.match(html, /packet_downloaded/);
  assert.match(html, /URL\.createObjectURL/);
  assert.match(html, /const orderId=.*replace\(/);
  assert.match(html, /slice\(0,80\)/);
});

test("draft persistence is explicit and browser-local", () => {
  assert.match(html, /id="save"/);
  assert.match(html, /id="restore"/);
  assert.match(html, /chargeback-packet-draft/);
  assert.match(html, /draft_saved/);
  assert.match(html, /draft_restored/);
  assert.match(html, /only in this browser/);
});
