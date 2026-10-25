// A creator's month (fixtures/creator-checking.csv, made up): platform payouts are sales and
// the editing, audio and email tools are software.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { newBooks, importStatement } from "./engine.mjs";

const csv = readFileSync(new URL("./fixtures/creator-checking.csv", import.meta.url), "utf8");
const b = importStatement(newBooks(), csv, "1000").books;
const code = (re) => b.transactions.find((t) => re.test(t.desc ?? t.description))?.suggestion?.account;

test("AdSense, Substack, Twitch, Teachable and Patreon payouts are sales", () => {
  for (const re of [/ADSENSE/, /SUBSTACK/, /TWITCH/, /TEACHABLE/, /PATREON/]) assert.equal(code(re), "4000", String(re));
});

test("Riverside, Epidemic Sound, Canva, Kit and Descript are software; groceries are never sales", () => {
  for (const re of [/RIVERSIDE/, /EPIDEMIC/, /CANVA/, /KIT\.COM/, /DESCRIPT/]) assert.equal(code(re), "6060", String(re));
  assert.notEqual(code(/TRADER JOES/), "4000");
});
