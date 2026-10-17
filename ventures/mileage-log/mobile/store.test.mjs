import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const listing = readFileSync(here("./store/listing.md"), "utf8");
const app = JSON.parse(readFileSync(here("./app.json"), "utf8")).expo;
const field = (label) => {
  const m = listing.match(new RegExp(`\\*\\*${label}[^*]*\\*\\*\\s*(.+)`));
  assert.ok(m, `listing is missing ${label}`);
  return m[1].trim();
};

test("store text fits both stores' limits", () => {
  assert.ok(field("Name").length <= 30);
  assert.ok(field("Apple subtitle").length <= 30);
  assert.ok(field("Play short description").length <= 80);
  assert.ok(field("Apple keywords").length <= 100);
  const full = listing.split("## Full description (max 4000)")[1].split("## Background")[0];
  assert.ok(full.trim().length <= 4000);
});

test("listing states the disclaimer and the donate path, and never promises tax outcomes", () => {
  assert.match(listing, /not tax advice/i);
  assert.match(listing, /donate to the creator/i);
  assert.doesNotMatch(listing, /guarantee|maximi[sz]e your refund|audit-proof/i);
});

test("the permissions the listing justifies are the ones app.json requests", () => {
  assert.ok(app.android.permissions.includes("ACCESS_BACKGROUND_LOCATION"));
  assert.ok(app.ios.infoPlist.UIBackgroundModes.includes("location"));
  assert.match(listing, /Background location justification/);
  const extra = app.android.permissions.filter((p) => !/LOCATION|FOREGROUND_SERVICE/.test(p));
  assert.deepEqual(extra, [], "an undeclared-purpose permission would contradict the privacy claims");
});

test("privacy claims hold: no network call and no analytics dependency in the app", () => {
  const files = ["App.js", "index.js", ...readdirSync(here("./src/")).map((f) => `src/${f}`)];
  for (const f of files) {
    const src = readFileSync(here(`./${f}`), "utf8");
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon/, f);
  }
  const deps = Object.keys(JSON.parse(readFileSync(here("./package.json"), "utf8")).dependencies);
  assert.deepEqual(deps.filter((d) => /analytics|sentry|firebase|segment|mixpanel|amplitude|crashlytics/i.test(d)), []);
});

test("eas.json builds an installable APK for testers and a store bundle for release", () => {
  const eas = JSON.parse(readFileSync(here("./eas.json"), "utf8"));
  assert.equal(eas.build.preview.android.buildType, "apk");
  assert.equal(eas.build.production.android.buildType, "app-bundle");
});
