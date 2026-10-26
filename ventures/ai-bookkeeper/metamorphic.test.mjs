// Metamorphic check: a file's rows must not change when only its packaging does
// (line endings, byte-order mark, blank lines around it, trailing spaces, a footer
// line; the footer found 8 files whose rows changed on 2026-10-26).
// Every text fixture is read as it is and in each wrapping; the rows must match.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { readStatement } from "./bank.mjs";

const dir = new URL("./fixtures/", import.meta.url);
const WRAPS = {
  crlf: (t) => t.replace(/\r?\n/g, "\r\n"),
  "bare CR (classic Mac)": (t) => t.replace(/\r?\n/g, "\r"),
  bom: (t) => "﻿" + t,
  "trailing blank lines": (t) => t.replace(/\s+$/, "") + "\n\n\n",
  "leading blank lines": (t) => "\n\n" + t,
  "trailing spaces": (t) => t.replace(/\n/g, "  \n"),
  "a footer line": (t) => t.replace(/\s+$/, "") + "\n\nTotal transactions,,\n",
};
const sig = (r) => JSON.stringify((r.rows ?? []).map((x) => [x.date, x.cents, x.desc]));

for (const f of readdirSync(dir).filter((f) => !/\.(xls|xlsx|pdf)$/.test(f))) {
  test(`${f}: same rows under every wrapping`, () => {
    const t = readFileSync(new URL(f, dir), "utf8");
    const base = sig(readStatement(t));
    for (const [name, wrap] of Object.entries(WRAPS)) assert.equal(sig(readStatement(wrap(t))), base, `${f} changed under: ${name}`);
  });
}

// The same relation for the delimiter: a rectangular CSV re-written with ;, tab
// or | between fields must give the same rows. (Pipe-delimited bank exports
// read nothing until 2026-10-27; found by this loop.)
import { parseCsv } from "./bank.mjs";
const quote = (v, d) => (v.includes(d) || /["\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8");
  const rows = parseCsv(t).filter((r) => r.some((c) => c.trim()));
  if (!rows.every((r) => r.length === rows[0].length)) continue;
  test(`${f}: same rows under every delimiter`, () => {
    const base = sig(readStatement(t));
    for (const d of [";", "\t", "|"]) {
      const out = rows.map((r) => r.map((v) => quote(v, d)).join(d)).join("\n") + "\n";
      assert.equal(sig(readStatement(out)), base, `${f} changed with delimiter ${JSON.stringify(d)}`);
    }
  });
}

// Row order: banks export newest-first or oldest-first. Reversing the data
// lines under the header must give the same set of rows. (Checked 2026-10-25:
// no fixture changed, so this pins the behaviour rather than fixing a fault.)
const setSig = (r) => JSON.stringify((r.rows ?? []).map((x) => [x.date, x.cents, x.desc]).sort());
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8").replace(/\r\n/g, "\n");
  const lines = t.split("\n").filter(Boolean);
  const base = readStatement(t);
  if (!base.rows.length || lines.some((l) => (l.match(/"/g) ?? []).length % 2)) continue;
  test(`${f}: same rows when the data lines are reversed`, () => {
    for (let h = 0; h < Math.min(8, lines.length - 2); h++) {
      const out = [...lines.slice(0, h + 1), ...lines.slice(h + 1).reverse()].join("\n") + "\n";
      let r;
      try { r = readStatement(out); } catch { continue; }
      if (r.rows.length === base.rows.length) return assert.equal(setSig(r), setSig(base), `${f} changed when reversed under header line ${h}`);
    }
    assert.fail(`${f}: no header position read the reversed file`);
  });
}

// Amount spelling: the same cents written as $1,234.56, 1,234.56, (59.99) for
// money out, or 59.99- must read the same rows. (2026-10-25: a header-less CBA
// file with trailing-minus amounts failed the header-less test and had its
// dates read month first; found by this loop, fixed in `AMT`.)
const comma = (s) => { const [i, d] = s.split("."); return i.replace(/\B(?=(\d{3})+$)/g, ",") + "." + d; };
const FORMS = {
  dollar: (neg, a) => (neg ? "-$" : "$") + comma(a),
  commas: (neg, a) => (neg ? "-" : "") + comma(a),
  parens: (neg, a) => (neg ? "(" + a + ")" : a),
  "trailing minus": (neg, a) => a + (neg ? "-" : ""),
};
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8");
  const rows = parseCsv(t).filter((r) => r.some((c) => c.trim()));
  test(`${f}: same rows under every amount spelling`, () => {
    const base = sig(readStatement(t));
    for (const [name, fn] of Object.entries(FORMS)) {
      const out = rows.map((r) => r.map((v) => { const m = /^(-?)(\d+\.\d\d)$/.exec(v.trim()); return quote(m ? fn(!!m[1], m[2]) : v, ","); }).join(",")).join("\n") + "\n";
      assert.equal(sig(readStatement(out)), base, `${f} changed with amounts as ${name}`);
    }
  });
}

// Column order: a rectangular CSV with its columns reversed, or rotated by one,
// must read the same rows when the file is read from its header names. Files
// whose layout is a known bank's (matched by exact column sequence, and whose
// day-first reading follows the bank) are skipped.
import { sniffBank } from "./bank.mjs";
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8");
  const rows = parseCsv(t).filter((r) => r.some((c) => c.trim()));
  if (!rows.length || !rows.every((r) => r.length === rows[0].length) || rows[0].length < 3 || sniffBank(rows)) continue;
  test(`${f}: same rows under every column order`, () => {
    const base = sig(readStatement(t));
    const n = rows[0].length;
    const orders = { reversed: [...Array(n).keys()].reverse(), rotated: [...Array(n).keys()].map((i) => (i + 1) % n) };
    for (const [name, ord] of Object.entries(orders)) {
      const out = rows.map((r) => ord.map((i) => quote(r[i], ",")).join(",")).join("\n") + "\n";
      assert.equal(sig(readStatement(out)), base, `${f} changed with columns ${name}`);
    }
  });
}

// Sign: with the sign convention stated (`invert` false, then true), a headered
// CSV must read as exact negations. Date spelling: ISO dates re-written as
// DD/MM/YYYY and read day-first must give the same rows. Import twice: ids of a
// file read once and the same text read again are identical, so a re-import adds
// nothing. (Checked 2026-10-25: no fixture changed; these pin behaviour.)
import { rowIds } from "./bank.mjs";
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8");
  let base;
  try { base = readStatement(t); } catch { continue; }
  if (!base.rows.length) continue;
  test(`${f}: invert true and false are exact negations`, () => {
    const neg = (r) => JSON.stringify(r.rows.map((x) => [x.date, -x.cents, x.desc]));
    assert.equal(sig(readStatement(t, { invert: true })), neg(readStatement(t, { invert: false })));
  });
  test(`${f}: row ids are stable across a second read`, () => {
    const a = rowIds(base.rows, "x"), b = rowIds(readStatement(t).rows, "x");
    assert.deepEqual(a, b);
    assert.equal(new Set(a).size, a.length);
  });
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  if (iso.test(t)) {
    test(`${f}: ISO dates re-written DD/MM/YYYY read the same day-first`, () => {
      assert.equal(sig(readStatement(t.replace(iso, "$3/$2/$1"), { dayFirst: true })), sig(base));
    });
  }
}

// Quoting and descriptor case: wrapping every field in quotes must give the same
// rows, and a description in UPPER or lower case, or with doubled spaces, must get
// the same built-in suggestion (card descriptors arrive in any case).
import { suggest } from "./categorize.mjs";
const OPTS = { rules: [], codes: null, classifier: { n: 0 }, skip: new Set(["learned"]) };
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8");
  const rows = parseCsv(t).filter((r) => r.some((c) => c.trim()));
  if (!rows.every((r) => r.length === rows[0].length)) continue;
  test(`${f}: same rows with every field quoted; same suggestion in any case`, () => {
    const base = readStatement(t);
    const out = rows.map((r) => r.map((v) => '"' + v.replace(/"/g, '""') + '"').join(",")).join("\n") + "\n";
    assert.equal(sig(readStatement(out)), sig(base), `${f} changed with every field quoted`);
    for (const x of base.rows ?? []) {
      const acct = (d) => suggest({ desc: d, cents: x.cents }, OPTS).account ?? null;
      const want = acct(x.desc);
      for (const d of [x.desc.toUpperCase(), x.desc.toLowerCase(), x.desc.replace(/ /g, "  ")]) assert.equal(acct(d), want, `${f}: "${x.desc}" vs "${d}"`);
    }
  });
}

// Header spelling and date spelling: header names in UPPER case or padded with
// spaces must read the same rows, and ISO dates re-written as US MM/DD/YYYY,
// YYYY/MM/DD, DD.MM.YYYY (day-first), DD-Mon-YYYY (day-first) must too.
// Row order inside the file halves: reading the top half and the bottom half
// separately (header repeated) must give together the rows of the whole file.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATES = {
  "MM/DD/YYYY": [(y, m, d) => `${m}/${d}/${y}`, {}],
  "YYYY/MM/DD": [(y, m, d) => `${y}/${m}/${d}`, {}],
  "DD.MM.YYYY": [(y, m, d) => `${d}.${m}.${y}`, { dayFirst: true }],
  "DD-Mon-YYYY": [(y, m, d) => `${d}-${MON[+m - 1]}-${y}`, { dayFirst: true }],
};
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8");
  let base;
  try { base = readStatement(t); } catch { continue; }
  if (!base.rows?.length) continue;
  const rows = parseCsv(t).filter((r) => r.some((c) => c.trim()));
  if (rows.every((r) => r.length === rows[0].length) && rows[0].length >= 3 && !sniffBank(rows)) {
    test(`${f}: same rows with upper-case or padded header names`, () => {
      for (const [name, fn] of Object.entries({ upper: (h) => h.toUpperCase(), padded: (h) => `  ${h}  ` })) {
        const out = [rows[0].map((h) => quote(fn(h), ",")), ...rows.slice(1).map((r) => r.map((v) => quote(v, ",")))].map((r) => r.join(",")).join("\n") + "\n";
        assert.equal(sig(readStatement(out)), sig(base), `${f} changed with ${name} headers`);
      }
    });
  }
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  if (iso.test(t)) {
    test(`${f}: ISO dates in other spellings read the same`, () => {
      for (const [name, [fn, opts]] of Object.entries(DATES)) {
        const out = t.replace(iso, (_, y, m, d) => fn(y, m, d));
        assert.equal(sig(readStatement(out, opts)), sig(base), `${f} changed with dates as ${name}`);
      }
    });
  }
}

// European number style and Unicode form: amounts written 1.234,56 in a
// semicolon file, two-digit years (DD/MM/YY, day-first), and descriptions in
// decomposed Unicode (NFD) must read the same rows (NFC text, same cents).
const eu = (neg, a) => { const [i, d] = a.split("."); return (neg ? "-" : "") + i.replace(/\B(?=(\d{3})+$)/g, ".") + "," + d; };
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8");
  let base;
  try { base = readStatement(t); } catch { continue; }
  if (!base.rows?.length) continue;
  const rows = parseCsv(t).filter((r) => r.some((c) => c.trim()));
  if (!rows.every((r) => r.length === rows[0].length) || sniffBank(rows)) continue;
  test(`${f}: European amounts, two-digit years, NFD text read the same`, () => {
    const out = rows.map((r) => r.map((v) => { const m = /^(-?)(\d+\.\d\d)$/.exec(v.trim()); return quote(m ? eu(!!m[1], m[2]) : v, ";"); }).join(";")).join("\n") + "\n";
    assert.equal(sig(readStatement(out)), sig(base), `${f} changed with European amounts`);
    const nfd = t.normalize("NFD");
    assert.equal(sig(readStatement(nfd)).normalize("NFC"), sig(base).normalize("NFC"), `${f} changed in NFD`);
    const iso = /\b\d{2}(\d{2})-(\d{2})-(\d{2})\b/g;
    if (iso.test(t)) {
      const two = readStatement(t.replace(iso, "$3/$2/$1"), { dayFirst: true }).rows ?? [];
      assert.deepEqual(two.map((x) => [x.date, x.cents]), base.rows.map((x) => [x.date, x.cents]), `${f} changed with two-digit years`);
    }
  });
}

// Halves: a statement cut in two (header repeated on the second half) must read,
// together, the rows of the whole file. A header-less or preamble layout cannot be
// cut by line, so only files whose header line reads on its own are checked.
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8").replace(/\r\n/g, "\n");
  const lines = t.split("\n").filter(Boolean);
  let base;
  try { base = readStatement(t); } catch { continue; }
  if (base.rows.length < 4 || lines.some((l) => (l.match(/"/g) ?? []).length % 2) || lines.length !== base.rows.length + 1) continue;
  test(`${f}: the two halves read as the whole file`, () => {
    const mid = 1 + Math.floor((lines.length - 1) / 2);
    const a = readStatement([lines[0], ...lines.slice(1, mid)].join("\n") + "\n");
    const b = readStatement([lines[0], ...lines.slice(mid)].join("\n") + "\n");
    assert.equal(JSON.stringify([...a.rows, ...b.rows].map((x) => [x.date, x.cents, x.desc])), sig(base), `${f}: halves differ from the whole`);
  });
}

// Empty trailing column: spreadsheets often save a CSV with a stray comma at the
// end of every line (an empty last column). The rows must not change.
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8").replace(/\r\n/g, "\n");
  const lines = t.split("\n").filter(Boolean);
  let base;
  try { base = readStatement(t); } catch { continue; }
  if (!base.rows.length || lines.some((l) => (l.match(/"/g) ?? []).length % 2)) continue;
  test(`${f}: an empty trailing column changes nothing`, () => {
    const d = (t.match(/;/g) ?? []).length > (t.match(/,/g) ?? []).length ? ";" : ",";
    const out = lines.map((l) => l + d).join("\n") + "\n";
    assert.equal(sig(readStatement(out)), sig(base), `${f} changed with a trailing comma`);
  });
}

// Extra column: an exporter adds a column the reader has no use for (a running
// "Reference", an empty "Notes"). Inserted at the front and in the middle of a
// rectangular, headered CSV, it must not change the rows. Known bank layouts
// (matched by exact column sequence) are skipped.
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8");
  const rows = parseCsv(t).filter((r) => r.some((c) => c.trim()));
  if (!rows.length || !rows.every((r) => r.length === rows[0].length) || rows[0].length < 3 || sniffBank(rows)) continue;
  test(`${f}: an extra column changes nothing`, () => {
    const base = sig(readStatement(t));
    for (const [name, at] of [["first", 0], ["middle", Math.floor(rows[0].length / 2)]]) {
      const out = rows.map((r, i) => { const c = [...r]; c.splice(at, 0, i ? "" : "Notes"); return c.map((x) => quote(x, ",")).join(","); }).join("\n") + "\n";
      assert.equal(sig(readStatement(out)), base, `${f} changed with an extra column in the ${name}`);
    }
  });
}

// Split amount: a single signed "Amount" column re-written as "Debit" (money
// out, positive) and "Credit" (money in) columns must read the same rows. Only
// headered files with exactly one column named Amount, whose cells are all
// plain numbers and with no type column (it carries the sign), are checked.
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8");
  const rows = parseCsv(t).filter((r) => r.some((c) => c.trim()));
  if (!rows.length || !rows.every((r) => r.length === rows[0].length) || sniffBank(rows)) continue;
  const ai = rows[0].map((h) => h.trim().toLowerCase()).indexOf("amount");
  if (ai < 0 || rows[0].filter((h) => /amount/i.test(h)).length !== 1) continue;
  if (rows[0].some((h) => /type/i.test(h))) continue; // sign comes from a debit/credit type column
  if (!rows.slice(1).every((r) => /^-?\d+(\.\d+)?$/.test(r[ai].trim()))) continue;
  test(`${f}: a split debit and credit column reads the same`, () => {
    const base = sig(readStatement(t));
    const out = rows.map((r, i) => {
      const c = [...r];
      const v = i ? Number(r[ai]) : 0;
      c.splice(ai, 1, ...(i ? [v < 0 ? String(-v) : "", v > 0 ? String(v) : ""] : ["Debit", "Credit"]));
      return c.map((x) => quote(x, ",")).join(",");
    }).join("\n") + "\n";
    assert.equal(sig(readStatement(out)), base, `${f} changed with split debit/credit`);
  });
}

// Excel and export packaging, 2026-10-26 (no outside data; no fixture changed, so
// this pins behaviour): a `sep=,` first line, a blank line after every row,
// spaces padded around every cell, a title block above the header, time-of-day
// or timezone after ISO dates, and long-month or weekday date spellings
// (quoted, they hold a comma) must all read the same rows.
const ISO = /\b(\d{4}-\d\d-\d\d)\b/g;
const fmt = (m, o) => `"${new Date(m + "T00:00:00Z").toLocaleDateString(o.l, { ...o.f, timeZone: "UTC" })}"`;
const PACK = {
  "sep line": (t) => "sep=,\n" + t,
  "blank line after every row": (t) => t.replace(/\r?\n/g, "\n\n"),
  "title block above": (t) => "Account activity export\nGenerated 2026-01-05\n\n" + t,
  "time after date": (t) => t.replace(ISO, "$1 14:05:00"),
  "ISO timestamp, Z": (t) => t.replace(ISO, "$1T14:05:00Z"),
  "ISO timestamp, offset": (t) => t.replace(ISO, "$1T14:05:00+01:00"),
  "long month": (t) => t.replace(ISO, (m) => fmt(m, { l: "en-US", f: { month: "long", day: "numeric", year: "numeric" } })),
  "weekday and short month": (t) => t.replace(ISO, (m) => fmt(m, { l: "en-GB", f: { weekday: "short", day: "2-digit", month: "short", year: "numeric" } })),
};
for (const f of readdirSync(dir).filter((f) => /\.csv$/.test(f))) {
  const t = readFileSync(new URL(f, dir), "utf8").replace(/\r\n/g, "\n");
  let base;
  try { base = readStatement(t); } catch { continue; }
  if (!base.rows.length) continue;
  test(`${f}: export packaging changes nothing`, () => {
    for (const [name, wrap] of Object.entries(PACK)) {
      if (/time|ISO|month|weekday/.test(name) && !t.match(ISO)) continue;
      assert.equal(sig(readStatement(wrap(t))), sig(base), `${f} changed under: ${name}`);
    }
  });
}
