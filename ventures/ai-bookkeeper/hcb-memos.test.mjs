// eval/hcb-memos.mjs on memos written here (the real feed is fetched at run time).
import test from "node:test";
import assert from "node:assert/strict";
import { coverage } from "./eval/hcb-memos.mjs";

test("coverage counts suggested and unmatched memos and keeps the account", () => {
  const c = coverage([
    { memo: "Porkbun", cents: -1000 }, { memo: "Porkbun", cents: -1000 },
    { memo: "2300 Sahara Hotel", cents: -9000 }, { memo: "Zorblax Qux", cents: -500 },
  ]);
  assert.equal(c.n, 4);
  assert.equal(c.suggested, 3);
  assert.equal(c.hits.get("porkbun => 6060"), 2);
  assert.equal(c.hits.get("2300 sahara hotel => 6120"), 1);
  assert.equal(c.misses.get("zorblax qux"), 1);
});

test("memos read on HCB pages 2 and 3 (hardware vendors, transit, meals) get an account", () => {
  const c = coverage([
    { memo: "RevRobotics", cents: -5000 }, { memo: "New York City MTA", cents: -300 },
    { memo: "Friday lunch for hack clubbers", cents: -4000 }, { memo: "Tribeca Bagels", cents: -2000 },
  ]);
  assert.equal(c.suggested, 4);
  assert.equal(c.hits.get("revrobotics => 6100"), 1);
  assert.equal(c.hits.get("new york city mta => 6120"), 1);
});

test("Lumens (a lighting shop) and a power-manager part are not utility bills", () => {
  const c = coverage([
    { memo: "PayPal *LUMENS FTY.", cents: -2000 }, { memo: "Solar power manager module", cents: -1500 },
    { memo: "Lumen Technologies", cents: -8000 }, { memo: "City Power & Light", cents: -9000 },
  ]);
  assert.equal(c.hits.get("lumen technologies => 6140"), 1);
  assert.equal(c.hits.get("city power & light => 6140"), 1);
  assert.equal(c.suggested, 2);
});

test("memos read on HCB page 4 (transactional mail, parts shops, merch printers, catering) get an account", () => {
  const c = coverage([
    { memo: "POSTMARKAPP.COM", cents: -1500 }, { memo: "MISUMI USA", cents: -4000 },
    { memo: "Standout Stickers", cents: -2500 }, { memo: "EZCATER*AZUL MEXICAN C", cents: -9000 },
    { memo: "Amazon", cents: -3000 }, { memo: "Target T-1176", cents: -2000 },
  ]);
  assert.equal(c.suggested, 4);
  assert.equal(c.hits.get("misumi usa => 6100"), 1);
  assert.equal(c.hits.get("ezcater*azul mexican c => 6130"), 1);
});

test("memos read on HCB page 5 (mail tools, prepaid phone, steel and 3D-printer suppliers, fare sites) get an account", () => {
  const c = coverage([
    { memo: "www.mailerlite.com", cents: -3000 }, { memo: "Tello Mobile", cents: -1000 },
    { memo: "SHELL/SHELL", cents: -4000 }, { memo: "ALRO STEEL CORP", cents: -9000 },
    { memo: "COA CHEAPOAIR.COM AIR", cents: -30000 }, { memo: "DISCOUNTMUGS.COM", cents: -7000 },
    { memo: "Amazon", cents: -3000 },
  ]);
  assert.equal(c.suggested, 6);
  assert.equal(c.hits.get("shell/shell => 6160"), 1);
  assert.equal(c.hits.get("alro steel corp => 6100"), 1);
});

test("memos read on HCB page 6 (home-improvement site, fab shops, parking app, merch printers) get an account", () => {
  const c = coverage([
    { memo: "HOMEDEPOT.COM", cents: -9000 }, { memo: "SP POLYMAKER 3D PRIN", cents: -4000 },
    { memo: "GOOGLE *GOOGLE ONE", cents: -300 }, { memo: "SPOTHERO 844-356-8054", cents: -2500 },
    { memo: "CUSTOMINK GROUPS", cents: -8000 }, { memo: "CHILI'S DOWNTOWN SANJO", cents: -3000 },
    { memo: "Amazon", cents: -3000 },
  ]);
  assert.equal(c.suggested, 6);
  assert.equal(c.hits.get("spothero 844-356-8054 => 6160"), 1);
});

test("memos read on HCB page 7 (robotics suppliers, regional restaurants) get an account; Walmart and Amazon stay open", () => {
  const c = coverage([
    { memo: "SP THE THRIFTY BOT", cents: -4000 }, { memo: "VEX ROBOTICS", cents: -9000 },
    { memo: "STUDICA LIMITED", cents: -7000 }, { memo: "MCALISTERS 1007", cents: -3000 },
    { memo: "DAIRY QUEEN #43841", cents: -1500 }, { memo: "WAL-MART #0935", cents: -5000 },
    { memo: "Amazon", cents: -3000 },
  ]);
  assert.equal(c.suggested, 5);
  assert.equal(c.hits.get("vex robotics => 6100"), 1);
  assert.equal(c.hits.get("mcalisters 1007 => 6130"), 1);
});

test("memos read on HCB page 8 (robotics and metal suppliers, pizza and ice cream) get an account; Amazon and Walmart stay open", () => {
  const c = coverage([
    { memo: "ANDY MARK INC", cents: -4000 }, { memo: "SP MAXBOTIX", cents: -9000 },
    { memo: "HABOR FREIGHT TOOLS314", cents: -2000 }, { memo: "STAR PIZZERIA", cents: -3000 },
    { memo: "MARBLE SLAB CREAMERY", cents: -1500 }, { memo: "WM SUPERCENTER #2548", cents: -5000 },
    { memo: "Amazon", cents: -3000 },
  ]);
  assert.equal(c.suggested, 5);
  assert.equal(c.hits.get("star pizzeria => 6130"), 1);
});
