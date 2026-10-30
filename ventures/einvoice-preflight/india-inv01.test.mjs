import assert from "node:assert/strict";
import test from "node:test";
import { checkInv01 } from "./india-inv01.mjs";
import { gstinCheckChar } from "./india.mjs";

const gstin = (p) => p + gstinCheckChar(p);
const inv = () => ({
  Version: "1.1",
  TranDtls: { TaxSch: "GST", SupTyp: "B2B" },
  DocDtls: { Typ: "INV", No: "INV/2026/001", Dt: "15/10/2026" },
  SellerDtls: { Gstin: gstin("27AAPFU0939F1Z"), LglNm: "Seller", Addr1: "1 Road", Loc: "Mumbai", Pin: 400001, Stcd: "27" },
  BuyerDtls: { Gstin: gstin("29AAFCC9980M1Z"), LglNm: "Buyer", Addr1: "2 Road", Loc: "Bengaluru", Pin: 560001, Stcd: "29", Pos: "29" },
  ItemList: [{ SlNo: "1", IsServc: "N", HsnCd: "8517", Qty: 2, UnitPrice: 500, TotAmt: 1000, Discount: 0, AssAmt: 1000, GstRt: 18, IgstAmt: 180, TotItemVal: 1180 }],
  ValDtls: { AssVal: 1000, IgstVal: 180, TotInvVal: 1180 },
});

test("a consistent inter-state invoice passes", () => {
  assert.deepEqual(checkInv01(inv()).problems, []);
  assert.equal(checkInv01(JSON.stringify(inv())).ok, true);
});

test("an intra-state invoice needs CGST and SGST", () => {
  const d = inv();
  d.BuyerDtls.Pos = "27";
  assert.ok(checkInv01(d).problems.some((p) => /CGST plus SGST/.test(p.message)));
  Object.assign(d.ItemList[0], { IgstAmt: 0, CgstAmt: 90, SgstAmt: 90 });
  d.ValDtls = { AssVal: 1000, CgstVal: 90, SgstVal: 90, TotInvVal: 1180 };
  assert.deepEqual(checkInv01(d).problems, []);
});

test("names the field for each fault", () => {
  const d = inv();
  d.ItemList[0].TotItemVal = 1200;
  d.ValDtls.TotInvVal = 1500;
  d.DocDtls.Dt = "31/02/2026";
  d.SellerDtls.Pin = 40001;
  d.BuyerDtls.Gstin = "29AAFCC9980M1ZX";
  const paths = checkInv01(d).problems.map((p) => p.path);
  for (const p of ["ItemList[0].TotItemVal", "ValDtls.TotInvVal", "DocDtls.Dt", "SellerDtls.Pin", "BuyerDtls.Gstin"]) assert.ok(paths.includes(p), p);
});

test("rounding within one rupee is accepted; bad JSON is reported", () => {
  const d = inv();
  d.ValDtls.TotInvVal = 1180.6;
  assert.equal(checkInv01(d).ok, true);
  assert.equal(checkInv01("{").problems[0].message, "Not valid JSON.");
});
