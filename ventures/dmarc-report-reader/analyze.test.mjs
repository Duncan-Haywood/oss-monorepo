import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync, deflateRawSync } from "node:zlib";
import { parseReport, summarize, diagnose, recommend, bytesToXml, toCsv } from "./analyze.mjs";

const rec = (ip, count, { dkim = "fail", spf = "fail", disp = "none", dkimAuth = "", spfAuth = "" } = {}) => `
<record><row><source_ip>${ip}</source_ip><count>${count}</count><policy_evaluated><disposition>${disp}</disposition><dkim>${dkim}</dkim><spf>${spf}</spf></policy_evaluated></row>
<identifiers><header_from>example.com</header_from><envelope_from>bounce.example.com</envelope_from></identifiers>
<auth_results>${dkimAuth}${spfAuth}</auth_results></record>`;
const report = (records, p = "none", org = "google.com") => `<?xml version="1.0"?><feedback>
<report_metadata><org_name>${org}</org_name><report_id>r1</report_id><date_range><begin>1760000000</begin><end>1760086400</end></date_range></report_metadata>
<policy_published><domain>example.com</domain><adkim>r</adkim><aspf>r</aspf><p>${p}</p><pct>100</pct></policy_published>${records}</feedback>`;

const good = rec("203.0.113.1", 900, { dkim: "pass", spf: "pass", dkimAuth: "<dkim><domain>example.com</domain><selector>s1</selector><result>pass</result></dkim>" });
const thirdParty = rec("198.51.100.7", 80, {
  dkimAuth: "<dkim><domain>mailer.net</domain><selector>x</selector><result>pass</result></dkim>",
  spfAuth: "<spf><domain>mailer.net</domain><result>pass</result></spf>",
});
const spoof = rec("192.0.2.99", 20);

test("parses metadata, policy and records", () => {
  const r = parseReport(report(good + spoof));
  assert.equal(r.org, "google.com");
  assert.equal(r.domain, "example.com");
  assert.equal(r.policy.p, "none");
  assert.equal(r.records.length, 2);
  assert.equal(r.records[0].count, 900);
  assert.ok(r.records[0].dkimAligned && r.records[0].spfAligned);
});

test("rejects non-DMARC input", () => {
  assert.throws(() => parseReport("<html></html>"), /no <feedback>/);
});

test("summarizes pass rate and sorts sources by volume", () => {
  const s = summarize([parseReport(report(good + thirdParty + spoof))]);
  assert.equal(s.total, 1000);
  assert.equal(s.pass, 900);
  assert.equal(s.passRate, 0.9);
  assert.deepEqual(s.sources.map((x) => x.ip), ["203.0.113.1", "198.51.100.7", "192.0.2.99"]);
  assert.deepEqual(s.sources.map((x) => x.status), ["aligned", "failing", "failing"]);
});

test("explains third-party sender misalignment for DKIM and SPF", () => {
  const h = diagnose(parseReport(report(thirdParty)).records[0]);
  assert.match(h[0], /signs as mailer\.net/);
  assert.match(h[1], /custom return-path/);
});

test("unsigned unknown sender gets spoofing hint", () => {
  const h = diagnose(parseReport(report(spoof)).records[0]);
  assert.match(h[0], /No DKIM signature/);
  assert.match(h[1], /spoofing/);
});

test("merges several reports and treats mixed rows as partial", () => {
  const mixed = rec("198.51.100.7", 10, { dkim: "pass", dkimAuth: "<dkim><domain>example.com</domain><result>pass</result></dkim>" });
  const s = summarize([parseReport(report(thirdParty, "none", "a")), parseReport(report(mixed, "none", "b"))]);
  assert.equal(s.reports, 2);
  assert.equal(s.sources.length, 1);
  assert.equal(s.sources[0].status, "partial");
  assert.deepEqual(s.sources[0].orgs.sort(), ["a", "b"]);
});

test("recommendations follow the policy ladder", () => {
  assert.match(recommend({ p: "none", pct: 100 }, 1000, 995, []), /p=quarantine; pct=10/);
  assert.match(recommend({ p: "none", pct: 100 }, 1000, 900, [{}]), /Stay at p=none/);
  assert.match(recommend({ p: "quarantine", pct: 100 }, 1000, 999, []), /p=reject/);
  assert.match(recommend({ p: "quarantine", pct: 20 }, 1000, 990, []), /Raise pct/);
  assert.match(recommend({ p: "reject", pct: 100 }, 1000, 800, [{}]), /refused/);
  assert.match(recommend({ p: "none", pct: 100 }, 0, 0, []), /No messages/);
});

test("decodes plain, gzip and zip (deflate and stored) input", async () => {
  const xml = report(good);
  const plain = new TextEncoder().encode(xml);
  assert.equal(await bytesToXml(plain), xml);
  assert.equal(await bytesToXml(new Uint8Array(gzipSync(plain))), xml);
  const zip = (method, data) => {
    const name = Buffer.from("r.xml");
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(method, 8);
    h.writeUInt32LE(data.length, 18); h.writeUInt32LE(plain.length, 22); h.writeUInt16LE(name.length, 26);
    return new Uint8Array(Buffer.concat([h, name, data]));
  };
  assert.equal(await bytesToXml(zip(8, deflateRawSync(plain))), xml);
  assert.equal(await bytesToXml(zip(0, Buffer.from(plain))), xml);
});

test("csv export quotes fields", () => {
  const csv = toCsv(summarize([parseReport(report(thirdParty))]));
  assert.match(csv, /^"source_ip"/);
  assert.match(csv, /"198\.51\.100\.7","example\.com","80","0","80","failing"/);
});
