// Descriptions a third probe found unsuggested; made up from the companies' public names, not a real export.
import test from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./categorize.mjs";

const acct = (desc, cents) => suggest({ desc, cents }, {}).account;

test("tax-prep software is a professional fee; VPN and cloud-storage plans are software", () => {
  for (const d of ["TURBOTAX", "H&R BLOCK", "TAXACT", "FREETAXUSA"]) assert.equal(acct(d, -12000), "6050", d);
  for (const d of ["NORDVPN", "EXPRESSVPN", "PROTON VPN", "GOOGLE *STORAGE"]) assert.equal(acct(d, -500), "6060", d);
});

test("tax payments, health insurers and a bare Amex payment stay for a person", () => {
  for (const d of ["AMEX PAYMENT", "IRS USATAXPAYMT", "EFTPS", "KAISER", "DELTA DENTAL"]) assert.equal(acct(d, -50000), null, d);
});
