// Shapes seen in a real business Chase checking export (Delta-Compute/DeltaCFOAgent, Chase3687_Q2_2024.CSV,
// MIT licence, 53 rows Apr to Jun 2024; fetched at run time, every line here is written, not copied).
// The reader took it as `chase-checking` with no problems. Before this change an outgoing wire to a third
// party was filed as an own-account transfer (or, with a bank's name in it, as a utility), and an ACH
// origination fee had no suggestion.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc, cents) => suggest({ desc, cents }, model).account;

test("a wire to a named third party waits for a person, in or out", () => {
  assert.equal(acct("ONLINE INTERNATIONAL WIRE TRANSFER VIA: EXAMPLE BANK N.A./0008 A/C: EXAMPLE ENERGY LTD", -9700000), null);
  assert.equal(acct("ONLINE DOMESTIC WIRE TRANSFER VIA: EXAMPLE BK/071922777 A/C: ACME LLC", -4241064), null);
  assert.equal(acct("BOOK TRANSFER CREDIT B/O: EXAMPLE SPA MILAN ITALY IT ORG:/IT00", 12641400), null);
  assert.equal(acct("CHIPS CREDIT VIA: EXAMPLE BANK/0959 B/O: ACME CAPITAL LLC", 4325259), null);
});
test("wire fees and own-account transfers still file", () => {
  assert.equal(acct("INTERNATIONAL INCOMING WIRE FEE", -1500), "6010");
  assert.equal(acct("ONLINE DOMESTIC WIRE FEE", -2500), "6010");
  assert.equal(acct("Online Transfer to CHK ...3911 transaction#: 21201948434 06/25", -100000), "transfer");
  assert.equal(acct("Payment to Chase card ending in 6118 06/26", -100000), "transfer");
});
test("ACH origination fees are bank fees", () => {
  assert.equal(acct("STANDARD ACH PMNTS INITIAL FEE", -250), "6010");
});
