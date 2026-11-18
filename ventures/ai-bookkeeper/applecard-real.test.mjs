// Descriptors seen in two real Apple Card exports (eval/applecard.mjs); each line below is
// written here, not copied, and carries no cardholder name or amount.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const model = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
const acct = (desc, cents = -2500) => suggest({ desc, cents }, model).account;

test("a grocer's fuel pumps and car wash are vehicle and fuel, its store is not", () => {
  assert.equal(acct("H-E-B GAS/CARWASH #7"), "6160");
  assert.equal(acct("H-E-B #733 12125 ALAMO RANCH PKWY SAN ANTONIO 78253 TX USA"), "6130");
});
test("parking garages and cruises", () => {
  assert.equal(acct("VAN NESS GARAGE 1341 BOYLSTON ST BOSTON"), "6160");
  assert.equal(acct("BROOKLINE PASSPORT PKG333 WASHINGTON ST"), "6160");
  assert.equal(acct("ROYAL CARIBBEAN CRUISE1050 CARIBBEAN WAY MIAMI"), "6120");
});
test("YouTube Premium is a subscription", () => {
  assert.equal(acct("GOOGLE *YOUTUBEPREMIUM1600 AMPHITHEATRE PKWY"), "6060");
});
test("personal retail and games stay blank", () => {
  assert.equal(acct("STEAMGAMES.COM 4259522109"), null);
  assert.equal(acct("SUPERCUTS #08679 829 BOYLSTON ST BOSTON"), null);
});
