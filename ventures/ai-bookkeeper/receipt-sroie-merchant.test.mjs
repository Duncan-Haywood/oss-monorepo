// SROIE scans read by RapidOCR: the merchant line as the engine misreads it
// (eval/sroie-merchant-names-2026-11-18.md). Lines are in the scans' style, not copied.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, shopName } from "./receipts.mjs";

const slip = (head) => parseReceipt(`${head}\nNO 12 JALAN BESAR\nDate: 25/12/2018\nITEM A 5.00\nTOTAL 12.00\n`).merchant;

test("SDN BHD misread, spaced or glued to the name", () => {
  assert.equal(shopName("Timeless Kitchenette San Bhd"), "Timeless Kitchenette Sdn Bhd");
  assert.equal(shopName("WAHIN HARDWARE SIN BHD"), "WAHIN HARDWARE SDN BHD");
  assert.equal(shopName("AMANO MALAYSIASONBHD"), "AMANO MALAYSIA SDN BHD");
  assert.equal(shopName("Broadview Marketing 5dn Bhd"), "Broadview Marketing Sdn Bhd");
  assert.equal(shopName("SUPER SEVEN CASH& CARRY SDN 3HD"), "SUPER SEVEN CASH& CARRY SDN BHD");
  assert.equal(shopName("BEMED (SP) SDN.BHZ."), "BEMED (SP) SDN.BHD.");
  assert.equal(shopName("Segi Cash & Carry Sdn.Rhd"), "Segi Cash & Carry Sdn.Bhd");
  assert.equal(shopName("99 SPEED MART 5/B"), "99 SPEED MART S/B");
  assert.equal(shopName("SOON FATT S/R"), "SOON FATT S/B");
});

test("0, 1 and 5 inside a word are letters; numbers in names are left", () => {
  assert.equal(shopName("KMF F00DICI0US SDN BHD"), "KMF FOODICIOUS SDN BHD");
  assert.equal(shopName("URBAN 1DEA SDN BHD"), "URBAN IDEA SDN BHD");
  assert.equal(shopName("YONG S0ON FATT S/B"), "YONG SOON FATT S/B");
  assert.equal(shopName("MR.D.1.Y.(M) SDN BHD"), "MR.D.I.Y.(M) SDN BHD");
  assert.equal(shopName("AEON C0.(M) BHD."), "AEON CO.(M) BHD.");
  for (const keep of ["LOT10 SHOPPING", "OLIVE9 PHARMACY", "7-ELEVEN MALAYSIA SDN BHD", "99 SPEED MART S/B", "HASAN BHD", "TOKO 15 RIBU"]) assert.equal(shopName(keep), keep);
});

test("a registration number in full-width or half-closed brackets is not the name", () => {
  assert.equal(slip("AEON CO.(M) BHD (126926-H）\n3RD FLR,AEON TAMAN MALURI SC"), "AEON CO.(M) BHD");
  assert.equal(slip("URBAN 1DEA SDN BHD (417940-M),"), "URBAN IDEA SDN BHD");
  assert.equal(slip("SELASIH EKSLUSIF SDN BHD (524101-0)"), "SELASIH EKSLUSIF SDN BHD");
  assert.equal(slip("99 SPEED MART S/D(519537·X)"), "99 SPEED MART S/B");
  assert.equal(shopName("99 SPEED MART 578519537-X)"), "99 SPEED MART"); // "S/B(" read as "57B", then 578 by cleanOcr
});

test("glued or misspelt boilerplate above the name is skipped", () => {
  assert.equal(slip("TQFORSHOPPINGWITHUS.COM\nPAGOH REST AND SERVICE AREA"), "PAGOH REST AND SERVICE AREA");
  assert.equal(slip("For feedtack or ccpiaint, please call:\nSEGI CASH & CARRY SDN.BHD"), "SEGI CASH & CARRY SDN.BHD");
  assert.equal(slip("GOODSSOLDARENOTRETURNABLE.THANKYOU\nSLF CASH & CARRY"), "SLF CASH & CARRY");
  assert.equal(slip("Company Reg. No. : 725186-V\nADVANCO COMPANY"), "ADVANCO COMPANY");
});
