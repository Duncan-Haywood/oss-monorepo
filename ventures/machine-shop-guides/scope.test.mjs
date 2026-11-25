import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { QUOTES, KINDS, emptyAsset, emptyScope, normaliseScope, classify, review, inventoryCsv, sspInventoryLines, scopeToJson, exampleScope } from "./scope.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
const asset = (kind, o = {}) => ({ ...emptyAsset(kind), ...o });

test("quotes are pinned to 32 CFR 170.19 as read from the eCFR on 25 Nov 2026", () => {
  // Every string was checked as a verbatim substring of the eCFR XML for
  // 170.19 (amended 16 Dec 2024; file sha256 69465e2b...4f197, SOURCES.md).
  // Changing a quote means re-reading the section.
  const lines = Object.entries(QUOTES).map(([k, v]) => k + "\t" + v).join("\n");
  assert.equal(sha(lines), "cf653a7565d223857fa37cedbb5dbf4dea84b359bea4becf3eef59b411c401b5");
});

test("an asset that handles CUI is a CUI Asset; a security tool that also handles CUI stays one", () => {
  assert.equal(classify(asset("cam", { cui: "yes" })).cat, "cui");
  assert.equal(classify(asset("server", { cui: "yes", security: true })).cat, "cui");
});

test("a security tool is a Security Protection Asset, never out of scope, even if separated from CUI", () => {
  const r = classify(asset("security", { cui: "cannot", security: true, separation: "own VLAN" }));
  assert.equal(r.cat, "spa");
  assert.equal(r.inScope, true);
});

test("could reach CUI: CRMA only with a written policy, otherwise unresolved", () => {
  const no = classify(asset("printer", { cui: "can" }));
  assert.equal(no.cat, "unresolved");
  assert.match(no.gaps.join(" "), /policy/);
  const yes = classify(asset("printer", { cui: "can", policy: "CUI prints only on the enclave printer." }));
  assert.equal(yes.cat, "crma");
  assert.deepEqual(yes.gaps, []);
});

test("CNC controllers, CMMs, IoT and GFE that cannot be fully secured are Specialized Assets", () => {
  for (const kind of ["cnc", "cmm", "iot", "gfe"]) {
    assert.equal(classify(asset(kind, { cui: "yes" })).cat, "specialized", kind);
    assert.equal(classify(asset(kind, { cui: "can" })).cat, "specialized", kind);
  }
  // If the shop says the controller can be fully secured, it is a CUI Asset like any other.
  assert.equal(classify(asset("cnc", { cui: "yes", unsecurable: false })).cat, "cui");
  // A specialized kind that cannot reach CUI is out of scope.
  assert.equal(classify(asset("cnc", { cui: "cannot", separation: "air-gapped, programs by USB from the enclave only" })).cat, "oos");
});

test("out of scope needs a separation justification", () => {
  const r = classify(asset("workstation", { cui: "cannot" }));
  assert.equal(r.cat, "oos");
  assert.equal(r.inScope, false);
  assert.match(r.gaps[0], /separated/);
  assert.deepEqual(classify(asset("workstation", { cui: "cannot", separation: "guest VLAN" })).gaps, []);
});

test("unanswered is unresolved and counted in scope", () => {
  const r = classify(asset("workstation"));
  assert.equal(r.cat, "unresolved");
  assert.equal(r.inScope, true);
});

test("outside services follow table 4", () => {
  const cspCui = classify(asset("cloud", { espData: "cui", csp: true }));
  assert.equal(cspCui.cat, "cui");
  assert.match(cspCui.reason, /FedRAMP requirements in 48 CFR 252\.204-7012/);
  assert.match(cspCui.gaps[0], /FedRAMP Moderate baseline/);
  assert.equal(classify(asset("cloud", { espData: "cui", csp: false })).cat, "cui");
  assert.equal(classify(asset("cloud", { espData: "spd" })).cat, "spa");
  const none = classify(asset("cloud", { espData: "neither" }));
  assert.equal(none.cat, "oos");
  assert.match(none.reason, /does not meet the CMMC definition of an ESP/);
  assert.equal(classify(asset("cloud")).cat, "unresolved");
});

test("Level 1: FCI in scope, specialized assets and non-FCI out", () => {
  assert.equal(classify(asset("cam", { fci: "yes" }), "1").cat, "in");
  assert.equal(classify(asset("cnc", { fci: "yes" }), "1").cat, "specialized");
  assert.equal(classify(asset("cnc", { fci: "yes" }), "1").inScope, false);
  assert.equal(classify(asset("workstation", { fci: "no" }), "1").cat, "oos");
  assert.equal(classify(asset("workstation"), "1").inScope, true);
});

test("review counts categories and flags a scope with no CUI, no security tool and no mail service", () => {
  const r = review({ level: "2", assets: [asset("workstation", { name: "PC", cui: "cannot", separation: "x" })] });
  assert.equal(r.counts.oos, 1);
  assert.equal(r.inScope, 0);
  assert.ok(r.issues.some((i) => /No asset is marked as handling CUI/.test(i)));
  assert.ok(r.issues.some((i) => /No security tool/.test(i)));
  const r2 = review({ level: "2", assets: [asset("cam", { name: "CAM", cui: "yes" })] });
  assert.ok(r2.issues.some((i) => /No email or cloud service/.test(i)));
  assert.ok(review({ assets: [asset("cam", { cui: "yes" })] }).issues.some((i) => /give it a name/.test(i)));
});

test("the invented example scopes as expected", () => {
  const r = review(exampleScope());
  assert.equal(r.rows.length, 12);
  const by = Object.fromEntries(r.rows.map((x) => [x.asset.name, x.cat]));
  assert.equal(by["M365 GCC High (CUI mail and files)"], "cui");
  assert.equal(by["Mill 1 controller"], "specialized");
  assert.equal(by["CMM"], "specialized");
  assert.equal(by["Firewall"], "spa");
  assert.equal(by["MSP remote monitoring (logs, config)"], "spa");
  assert.equal(by["Office printer"], "crma");
  assert.equal(by["Front office PC"], "oos");
  assert.equal(by["Owner's phone"], "unresolved");
  assert.match(exampleScope().company, /invented/);
  const l1 = review({ ...exampleScope(), level: "1" });
  assert.equal(l1.counts.in, 6); // M365, two CAM, DNC, printer, phone
  assert.equal(l1.counts.specialized, 2); // CNC controller and CMM
  assert.equal(l1.issues.length, 0);
});

test("CSV neutralises formula cells and has one row per asset", () => {
  const csv = inventoryCsv({ assets: [asset("cam", { name: "=HYPERLINK(\"x\")", cui: "yes" }), asset("server", { name: "NAS", cui: "yes", notes: "a, b" })] });
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^"'=HYPERLINK/);
  assert.match(lines[2], /"a, b"$/);
});

test("SSP lines cover in-scope assets only, as item, owner, role", () => {
  const out = sspInventoryLines(exampleScope()).split("\n");
  assert.equal(out.length, 11); // the front office PC is out of scope
  assert.ok(out.includes("CAM-01, Programmer, CUI Asset: processes/stores/transmits CUI"));
  assert.ok(out.some((l) => l.startsWith("Office printer, Office, Contractor Risk Managed Asset: not intended to handle CUI (CUI prints only")));
  assert.ok(!out.some((l) => l.startsWith("Front office PC")));
});

test("normaliseScope survives junk and round-trips through JSON", () => {
  assert.deepEqual(normaliseScope(null), emptyScope());
  assert.deepEqual(normaliseScope({ level: "9", assets: "x" }), emptyScope());
  const odd = normaliseScope({ assets: [null, 3, { kind: "nope", cui: "maybe", security: "yes", name: 5 }] });
  assert.equal(odd.assets.length, 1);
  assert.equal(odd.assets[0].kind, "other");
  assert.equal(odd.assets[0].cui, "unknown");
  assert.equal(odd.assets[0].security, false);
  assert.equal(odd.assets[0].name, "");
  const ex = exampleScope();
  const back = normaliseScope(JSON.parse(scopeToJson(ex)));
  assert.deepEqual(back, ex);
  assert.equal(normaliseScope({ assets: Array(600).fill({}) }).assets.length, 500);
});

test("every kind has a label and the specialized kinds match the rule's list", () => {
  for (const k of KINDS) assert.ok(k.label.length > 3);
  const sp = KINDS.filter((k) => k.specialized).map((k) => k.specialized).join(" ");
  for (const word of ["Operational Technology", "Test Equipment", "IoT", "Government Furnished Equipment"]) assert.match(QUOTES.specialized, new RegExp(word));
  assert.match(sp, /Operational Technology/);
});
