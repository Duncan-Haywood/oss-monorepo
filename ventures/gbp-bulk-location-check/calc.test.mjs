import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validate, repair, parseCsv, toCsv, decodeBuffer, canonHeader, closestColumn, findingsCsv, sampleFile, sampleBrokenFile,
  normalizeHours, parseHours, checkPhone, paddedZip, checkUrl, detectDelim, validDate, COLUMNS, HOURS_COLUMNS, COUNTRY_CODES,
} from "./calc.mjs";

const wk = ["x", "09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "10:00-14:00"];
const K = ["Store code", "Business name", "Address line 1", "Locality", "Administrative area", "Country/Region", "Postal code", "Primary phone", "Website", "Primary category", ...HOURS_COLUMNS, "Special hours", "From the business", "Opening date", "Labels", "Other photos", "Latitude", "Longitude"];
const ok = { "Store code": "S-1", "Business name": "Harbor Street Plumbing", "Address line 1": "120 Harbor Street", Locality: "Boston", "Administrative area": "MA", "Country/Region": "US", "Postal code": "02110", "Primary phone": "+1 617 555 0142", Website: "https://example.com/", "Primary category": "Plumber" };
HOURS_COLUMNS.forEach((d, i) => { ok[d] = wk[i]; });
const file = (...rows) => toCsv([K, ...rows.map((o) => K.map((k) => o[k] ?? ""))]);
const codes = (r) => r.findings.map((f) => f.code);
const has = (rows, code) => codes(validate(file(...rows))).includes(code);

test("the clean example has no errors or warnings, the broken one has both", () => {
  assert.deepEqual(validate(sampleFile()).findings.filter((f) => f.severity !== "info"), []);
  const bad = validate(sampleBrokenFile());
  assert.ok(bad.findings.some((f) => f.severity === "error") && bad.findings.some((f) => f.severity === "warning"));
  assert.equal(bad.summary.delimiter, ";");
});

test("a clean single row passes", () => {
  assert.deepEqual(validate(file(ok)).findings.filter((f) => f.severity !== "info"), []);
});

test("header handling: canonical names, near misses, missing required and expected columns", () => {
  assert.equal(canonHeader(" Country/Region "), "countryregion");
  assert.equal(closestColumn("Zip"), "Postal code");
  assert.equal(closestColumn("Primary Catgory"), "Primary category");
  const r = validate("Name,City\nAcme,Boston\n");
  assert.ok(codes(r).includes("unknown-header"));
  assert.ok(r.findings.some((f) => f.code === "unknown-header" && /Business name/.test(f.detail)));
  const miss = validate("Store code,Business name\nS1,Acme\n");
  for (const c of ["Address line 1", "Country/Region", "Primary category"]) assert.ok(miss.findings.some((f) => f.code === "missing-column" && f.severity === "error" && f.title.includes(c)), c);
  assert.ok(miss.findings.some((f) => f.code === "missing-column" && f.severity === "warning" && f.title.includes("Postal code")));
  assert.ok(codes(validate("Store code,Business name,Store code\nS1,A,S2\n")).includes("dup-header"));
  for (const c of COLUMNS) assert.ok(c.length > 0);
});

test("encoding, BOM and delimiter detection", () => {
  assert.equal(detectDelim("a;b;c\n1;2;3"), ";");
  assert.equal(detectDelim('"a;b",c,d\n'), ",");
  assert.equal(detectDelim("a\tb\tc\n"), "\t");
  assert.ok(codes(validate(file(ok).replace(/,/g, ";"))).includes("delimiter"));
  assert.ok(codes(validate("\ufeff" + file(ok))).includes("bom"));
  assert.ok(codes(validate("S\u0000t\u0000")).includes("utf16"));
  assert.ok(codes(validate(file({ ...ok, "Business name": "Caf\ufffd Roma" }))).includes("encoding"));
  assert.ok(codes(validate(file({ ...ok, "Business name": "CafÃ© Roma" }))).includes("mojibake"));
  const u16 = Uint8Array.from([0xff, 0xfe, ...[..."a,b\n"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16), "a,b\n");
  const tsv = file(ok).replace(/,/g, "\t");
  assert.ok(!validate(tsv).findings.some((f) => f.severity !== "info"));
});

test("unterminated quote stops the run with a line number", () => {
  const r = validate('Store code,Business name\nS1,"Acme\nS2,B\n');
  assert.equal(r.findings[0].code, "quote");
  assert.equal(r.findings[0].line, 2);
});

test("duplicate store codes, length, characters, scientific notation, blank", () => {
  assert.ok(has([ok, { ...ok, "Address line 1": "5 Elm St" }], "dup-store"));
  assert.ok(has([{ ...ok, "Store code": "x".repeat(65) }], "store-length"));
  assert.ok(!has([{ ...ok, "Store code": "x".repeat(64) }], "store-length"));
  assert.ok(has([{ ...ok, "Store code": "S 1" }], "store-chars"));
  assert.ok(has([{ ...ok, "Store code": "1.2346E+09" }], "sci-store"));
  assert.ok(has([{ ...ok, "Store code": "" }], "store-blank"));
  assert.ok(has([{ ...ok, "Store code": "1001.0" }], "store-float"));
  assert.ok(has([ok, { ...ok, "Store code": "s-1", "Address line 1": "5 Elm St" }], "dup-store-case"));
  const nums = ["0101", "0102", "103", "0104"].map((c, i) => ({ ...ok, "Store code": c, "Address line 1": `${i} Main St` }));
  assert.ok(has(nums, "store-zero"));
});

test("business name: length, caps, spaces, stuffing hints", () => {
  assert.ok(has([{ ...ok, "Business name": "x".repeat(101) }], "name-length"));
  assert.ok(!has([{ ...ok, "Business name": "x".repeat(100) }], "name-length"));
  assert.ok(has([{ ...ok, "Business name": "" }], "name-blank"));
  assert.ok(has([{ ...ok, "Business name": "HARBOR STREET PLUMBING" }], "name-caps"));
  assert.ok(!has([{ ...ok, "Business name": "IBM" }], "name-caps"));
  assert.ok(has([{ ...ok, "Business name": "Best Plumber Near Me" }], "name-stuffing"));
  assert.ok(has([{ ...ok, "Business name": "Plumber, Drains, Heaters, Boilers" }], "name-stuffing"));
  assert.ok(has([{ ...ok, "Business name": "Acme 617-555-0142" }], "name-stuffing"));
  assert.ok(has([{ ...ok, "Business name": "Acme Plumbing Plumbing Plumbing" }], "name-stuffing"));
  assert.ok(!has([ok], "name-stuffing"));
  assert.ok(has([{ ...ok, "Business name": "Acme " }], "name-space"));
});

test("phones: E.164, country plausibility, Excel damage", () => {
  assert.equal(checkPhone("+1 617 555 0142", "US"), null);
  assert.equal(checkPhone("(617) 555-0142", "US"), null);
  assert.equal(checkPhone("+44 20 7946 0958", "GB"), null);
  assert.equal(checkPhone("020 7946 0958", "GB"), null);
  assert.equal(checkPhone("617555", "US").code, "phone-length");
  assert.equal(checkPhone("+1234", "US").code, "phone-length");
  assert.equal(checkPhone("+44 20 7946 0958", "US").code, "phone-country");
  assert.equal(checkPhone("1.6175550143E+9", "US").code, "sci-phone");
  assert.equal(checkPhone("6175550143.0", "US").code, "phone-float");
  assert.equal(checkPhone("617-CALL-NOW", "US").code, "phone-chars");
  assert.equal(checkPhone("2079460958", "GB").code, "phone-zero");
  assert.equal(checkPhone("012 555 0142", "US").code, "phone-area");
  assert.equal(checkPhone("617 555 0142 ext 12", "US"), null);
  assert.ok(has([{ ...ok, "Primary phone": "" }], "phone-blank"));
  assert.ok(has([{ ...ok, "Primary phone": "123" }], "phone-length"));
});

test("website: https, scheme, spaces, email", () => {
  assert.equal(checkUrl("https://example.com/a?b=1"), null);
  assert.equal(checkUrl("http://example.com").code, "url-http");
  assert.equal(checkUrl("example.com").code, "url-scheme");
  assert.equal(checkUrl("info@example.com").code, "url-email");
  assert.equal(checkUrl("https://exa mple.com").code, "url-space");
  assert.equal(checkUrl("ftp://example.com").code, "url-protocol");
  assert.equal(checkUrl("https://localhost/").code, "url-host");
  assert.ok(has([{ ...ok, Website: "www.example.com" }], "url-scheme"));
});

test("hours: 24h format, closed, 24 hours, split shifts, 12-hour, ranges, overlap", () => {
  for (const good of ["09:00-17:00", "9:00-17:00", "x", "closed", "Closed", "24 hours", "09:00-12:00, 13:00-17:00", "00:00-24:00", "10:00-00:00"]) assert.deepEqual(parseHours(normalizeHours(good)).problems, [], good);
  assert.equal(parseHours("9am-5pm").problems[0].code, "hours-12h");
  assert.match(parseHours("9am-5pm").problems[0].msg, /09:00-17:00/);
  assert.equal(parseHours("25:00-26:00").problems[0].code, "hours-range");
  assert.equal(parseHours("09:00-09:00").problems[0].code, "hours-zero");
  assert.equal(parseHours("09:00-12:00, 11:00-14:00").problems[0].code, "hours-overlap");
  assert.equal(parseHours("closed, 09:00-10:00").problems[0].code, "hours-mixed");
  assert.equal(parseHours("lunchtime").problems[0].code, "hours-format");
  assert.equal(parseHours("18:00-02:00").problems[0].code, "hours-overnight");
  assert.equal(normalizeHours("09:00 – 17:00"), "09:00-17:00");
  assert.equal(normalizeHours("09:00 to 17:00"), "09:00-17:00");
  assert.equal(normalizeHours("09:00-12:00;13:00-17:00"), "09:00-12:00, 13:00-17:00");
  assert.ok(has([{ ...ok, "Monday hours": "9am-5pm" }], "hours-12h"));
  assert.ok(has([{ ...ok, "Monday hours": "09:00 – 17:00" }], "hours-separator"));
  assert.ok(!has([{ ...ok, "Monday hours": "09:00-12:00, 13:00-17:00" }], "hours-format"));
  assert.ok(has([{ ...ok, "Special hours": "Christmas closed" }], "special-format"));
  assert.ok(has([{ ...ok, "Special hours": "2026-02-30: closed" }], "special-date"));
  assert.ok(!has([{ ...ok, "Special hours": "2026-12-25: closed" }], "special-date"));
});

test("opening date, labels, from the business, photos, lat/long", () => {
  assert.ok(!has([{ ...ok, "Opening date": "2024-02-29" }], "date"));
  assert.ok(has([{ ...ok, "Opening date": "2025-02-29" }], "date"));
  assert.ok(has([{ ...ok, "Opening date": "03/15/2024" }], "date-format"));
  assert.ok(has([{ ...ok, "Opening date": "45366" }], "date-serial"));
  assert.ok(validDate(2024, 2, 29) && !validDate(2023, 2, 29));
  assert.ok(has([{ ...ok, Labels: Array.from({ length: 11 }, (_, i) => `L${i}`).join(", ") }], "label-count"));
  assert.ok(!has([{ ...ok, Labels: Array.from({ length: 10 }, (_, i) => `L${i}`).join(", ") }], "label-count"));
  assert.ok(has([{ ...ok, Labels: "x".repeat(51) }], "label-length"));
  assert.ok(has([{ ...ok, Labels: "a,,b" }], "label-empty"));
  assert.ok(has([{ ...ok, "From the business": "x".repeat(751) }], "desc-length"));
  assert.ok(has([{ ...ok, "From the business": "Visit https://example.com today" }], "desc-links"));
  assert.ok(has([{ ...ok, "Other photos": "C:\\photos\\a.jpg" }], "photo-local"));
  assert.ok(has([{ ...ok, "Other photos": "http://x.test/a.jpg" }], "photo-http"));
  assert.ok(!has([{ ...ok, "Other photos": "https://x.test/a.jpg, https://x.test/b.jpg" }], "photo-url"));
  assert.ok(has([{ ...ok, Latitude: "91", Longitude: "120" }], "latitude"));
  assert.ok(has([{ ...ok, Latitude: "10", Longitude: "181" }], "longitude"));
  assert.ok(has([{ ...ok, Latitude: "120", Longitude: "42" }], "latlong-swapped"));
  assert.ok(has([{ ...ok, Latitude: "40,7", Longitude: "-74,0" }], "latlong-comma"));
  assert.ok(has([{ ...ok, Latitude: "40.7", Longitude: "" }], "latlong-partial"));
  assert.ok(has([{ ...ok, Latitude: "0", Longitude: "0" }], "latlong-zero"));
  assert.ok(has([{ ...ok, Latitude: "42.36", Longitude: "71.05" }], "latlong-sign"));
  assert.ok(!has([{ ...ok, Latitude: "42.36", Longitude: "-71.05" }], "latlong-sign"));
});

test("country, state and postal code shape", () => {
  assert.ok(COUNTRY_CODES.has("US") && COUNTRY_CODES.has("GB") && !COUNTRY_CODES.has("UK"));
  assert.ok(has([{ ...ok, "Country/Region": "UK" }], "country"));
  assert.ok(validate(file({ ...ok, "Country/Region": "UK" })).findings.some((f) => /GB/.test(f.detail)));
  assert.ok(has([{ ...ok, "Country/Region": "United States" }], "country"));
  assert.ok(has([{ ...ok, "Country/Region": "us" }], "country-case"));
  assert.ok(has([{ ...ok, "Country/Region": "" }], "country-blank"));
  assert.ok(has([{ ...ok, "Administrative area": "Massachusetts" }], "state"));
  assert.ok(has([{ ...ok, "Administrative area": "ma" }], "state-case"));
  assert.ok(!has([{ ...ok, "Administrative area": "DC", "Postal code": "20001" }], "state"));
  const pc = (country, postal, extra = {}) => has([{ ...ok, "Country/Region": country, "Postal code": postal, "Administrative area": "", "Primary phone": "", ...extra }], "postal");
  assert.ok(!pc("GB", "SW1A 1AA") && pc("GB", "12345"));
  assert.ok(!pc("CA", "M5H 2N2") && pc("CA", "12345"));
  assert.ok(!pc("DE", "10115") && pc("DE", "1011"));
  assert.ok(!pc("AU", "2000") && pc("AU", "20000"));
  assert.ok(!pc("NL", "1011 AB") && pc("NL", "1011"));
  assert.ok(!pc("US", "02110-1234") && pc("US", "021"));
  assert.ok(has([{ ...ok, "Postal code": "1.2E+05" }], "sci-postal"));
  assert.ok(has([{ ...ok, "Postal code": "02110.0" }], "postal-float"));
});

test("Excel ZIP damage: restored only when the state agrees", () => {
  assert.equal(paddedZip("2110", "MA"), "02110");
  assert.equal(paddedZip("6103", "CT"), "06103");
  assert.equal(paddedZip("8701", "NJ"), "08701");
  assert.equal(paddedZip("2110-1234", "ma"), "02110-1234");
  assert.equal(paddedZip("601", "PR"), "00601");
  assert.equal(paddedZip("2110", "TX"), null, "Texas ZIPs do not start with 0");
  assert.equal(paddedZip("2110", "CT"), null, "021 is a Massachusetts prefix");
  assert.equal(paddedZip("2110", ""), null);
  assert.equal(paddedZip("2110", "ZZ"), null);
  assert.equal(paddedZip("601", "MA"), null);
  assert.equal(paddedZip("12345", "MA"), null);
  assert.ok(has([{ ...ok, "Postal code": "2110" }], "zip-zero"));
  const unproven = validate(file({ ...ok, "Postal code": "2110", "Administrative area": "TX" }));
  assert.ok(codes(unproven).includes("postal") && !codes(unproven).includes("zip-zero"));
});

test("duplicate addresses under different store codes", () => {
  const dup = [ok, { ...ok, "Store code": "S-2", "Address line 1": "120 harbor st." }];
  assert.ok(has(dup, "dup-address"));
  assert.ok(!has([ok, { ...ok, "Store code": "S-2", "Address line 1": "121 Harbor Street" }], "dup-address"));
  assert.ok(!has([ok, { ...ok, "Store code": "S-2", Locality: "Cambridge", "Postal code": "02139" }], "dup-address"));
});

test("Excel formula errors and row-shape problems", () => {
  assert.ok(has([{ ...ok, "Business name": "#NAME?" }], "excel-error"));
  const wide = file(ok).replace("Boston", "Boston,Extra");
  assert.ok(codes(validate(wide)).includes("extra-cells"));
  assert.ok(codes(validate("Store code,Business name,Address line 1\nS1,Acme\n")).includes("short-row"));
  assert.ok(codes(validate(file(ok) + ",,,\r\n")).includes("blank-rows"));
  assert.ok(codes(validate("")).includes("empty"));
});

test("findings are sorted errors first and each carries a line for row rules", () => {
  const r = validate(file(ok, { ...ok, "Store code": "S-2", "Business name": "ACME PLUMBING AND HEATING", "Postal code": "x" }));
  const order = r.findings.map((f) => ["error", "warning", "info"].indexOf(f.severity));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(r.findings.filter((f) => f.severity !== "info" && f.code !== "optional-columns").every((f) => f.line >= 2));
});

test("safe fixes: semicolons to commas, trim, ZIP zero, trailing .0, hours separators, BOM", () => {
  const broken = toCsv([K, K.map((k) => ({ ...ok, "Business name": " Harbor Street Plumbing ", "Postal code": "2110", "Store code": "1001.0", "Monday hours": "09:00 – 12:00;13:00 to 17:00" })[k] ?? "")], ";");
  const fix = repair("\ufeff" + broken);
  assert.equal(fix.error, null);
  const joined = fix.changes.join("\n");
  assert.match(joined, /byte-order mark/);
  assert.match(joined, /semicolon delimiter to commas/);
  assert.match(joined, /"2110" → "02110"/);
  assert.match(joined, /"1001.0" → "1001"/);
  assert.match(joined, /"09:00 – 12:00;13:00 to 17:00" → "09:00-12:00, 13:00-17:00"/);
  assert.match(joined, /stray spaces/);
  const again = validate(fix.text);
  assert.equal(again.summary.delimiter, ",");
  for (const c of ["zip-zero", "name-space", "store-float", "hours-separator", "delimiter", "bom"]) assert.ok(!codes(again).includes(c), c);
  assert.equal(repair(fix.text).changes.length, 0, "second pass changes nothing");
});

test("safe fixes never touch what cannot be proven", () => {
  const rows = [{ ...ok, "Postal code": "2110", "Administrative area": "TX", "Business name": "BEST PLUMBER", "Primary phone": "6175550142", "Monday hours": "9am-5pm", "Country/Region": "UK", "Opening date": "03/15/2024" }];
  const fix = repair(file(...rows));
  assert.equal(fix.changes.length, 0);
  const back = parseCsv(fix.text).rows[1].cells;
  assert.equal(back[K.indexOf("Postal code")], "2110");
  assert.equal(back[K.indexOf("Business name")], "BEST PLUMBER");
  assert.equal(back[K.indexOf("Monday hours")], "9am-5pm");
  assert.equal(back[K.indexOf("Country/Region")], "UK");
  assert.equal(back[K.indexOf("Opening date")], "03/15/2024");
  const noZip = repair(file({ ...ok, "Country/Region": "CA", "Postal code": "2110", "Administrative area": "MA" }));
  assert.equal(parseCsv(noZip.text).rows[1].cells[K.indexOf("Postal code")], "2110");
});

test("tab-separated input stays tab-separated after fixes", () => {
  const tsv = file({ ...ok, "Business name": " Acme " }).replace(/,/g, "\t");
  const fix = repair(tsv);
  assert.ok(fix.text.split("\r\n")[0].includes("\t"));
  assert.ok(!fix.changes.some((c) => /delimiter/.test(c)));
});

test("repair reports unusable input", () => {
  assert.match(repair("").error, /empty/);
  assert.match(repair('a,b\n"x,y\n').error, /quote/);
});

test("csv round trip keeps quotes, commas and newlines", () => {
  const rows = [["a", 'b,"c"', "d\ne"], ["", "x", ""]];
  assert.deepEqual(parseCsv(toCsv(rows)).rows.map((r) => r.cells), rows);
  assert.equal(parseCsv('a,b\n"x\ny",z\n').rows[1].line, 2);
  assert.equal(parseCsv('a,b\n"x\ny",z\nq,r\n').rows[2].line, 4);
});

test("findings CSV has a header and one row per finding", () => {
  const r = validate(sampleBrokenFile());
  const rows = parseCsv(findingsCsv(r)).rows;
  assert.deepEqual(rows[0].cells, ["severity", "line", "code", "title", "detail"]);
  assert.equal(rows.length, r.findings.length + 1);
});
