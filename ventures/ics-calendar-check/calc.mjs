// iCalendar (.ics) file checker. Pure functions, no I/O, no network.
// Rules are read from memory of RFC 5545 (iCalendar) and the import behaviour commonly reported for
// Google Calendar, Outlook and Apple Calendar; confirm against the current documents.

const MAX_OCTETS = 75;
const enc = new TextEncoder();
const octets = (s) => enc.encode(s).length;

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  return new TextDecoder("utf-8").decode(b).replace(/^﻿/, "");
}

// Split into physical lines, then unfold (a line starting with space/tab continues the previous one).
export function unfold(text) {
  const phys = text.split(/\r\n|\n|\r/);
  if (phys.length && phys.at(-1) === "") phys.pop();
  const out = [];
  phys.forEach((raw, i) => {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length) {
      out.at(-1).value += raw.slice(1);
    } else {
      out.push({ value: raw, line: i + 1, physLen: 0 });
    }
  });
  return out;
}

export function fold(line) {
  if (octets(line) <= MAX_OCTETS) return line;
  const parts = [];
  let cur = "", curLen = 0, limit = MAX_OCTETS;
  for (const ch of line) {
    const n = octets(ch);
    if (curLen + n > limit) { parts.push(cur); cur = ""; curLen = 0; limit = MAX_OCTETS - 1; }
    cur += ch; curLen += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

// "DTSTART;TZID=Europe/Paris:20260105T090000" -> { name, params, value }
export function parseContentLine(s) {
  let inQ = false, colon = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') inQ = !inQ;
    else if (s[i] === ":" && !inQ) { colon = i; break; }
  }
  if (colon < 0) return null;
  const head = s.slice(0, colon), value = s.slice(colon + 1);
  const segs = []; let cur = ""; inQ = false;
  for (const ch of head) {
    if (ch === '"') inQ = !inQ;
    if (ch === ";" && !inQ) { segs.push(cur); cur = ""; } else cur += ch;
  }
  segs.push(cur);
  const name = segs.shift().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(name)) return null;
  const params = {};
  for (const p of segs) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name, params, value };
}

const DATE_RE = /^(\d{4})(\d{2})(\d{2})$/;
const DT_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

function validYMD(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Returns { kind: "date"|"datetime", utc, ms, value } or { error }.
export function parseTime(value) {
  let m = DATE_RE.exec(value);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (!validYMD(y, mo, d)) return { error: `${value} is not a real calendar date` };
    return { kind: "date", utc: false, ms: Date.UTC(y, mo - 1, d), value };
  }
  m = DT_RE.exec(value);
  if (m) {
    const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
    if (!validYMD(y, mo, d)) return { error: `${value} is not a real calendar date` };
    if (h > 23 || mi > 59 || s > 60) return { error: `${value} has an impossible time of day` };
    return { kind: "datetime", utc: m[7] === "Z", ms: Date.UTC(y, mo - 1, d, h, mi, s), value };
  }
  return { error: `"${value}" is not a date (YYYYMMDD) or date-time (YYYYMMDDTHHMMSS[Z])` };
}

const pad = (n, w = 2) => String(n).padStart(w, "0");
export const fmtDate = (ms) => { const d = new Date(ms); return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; };
export const fmtUtc = (ms) => { const d = new Date(ms); return `${fmtDate(ms)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; };

// Deterministic id for events that have none, so repairing twice gives the same file.
export function makeUid(seed) {
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (const ch of seed) {
    const c = ch.codePointAt(0);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return pad(h1.toString(16), 8) + pad(h2.toString(16), 8) + "@ics-calendar-check";
}

// Parse the whole file into a component tree plus structural problems.
export function parseCalendar(text) {
  const lines = unfold(text);
  const root = { name: "ROOT", props: [], children: [], line: 0 };
  const stack = [root];
  const problems = [];
  for (const l of lines) {
    if (!l.value.trim()) continue;
    const p = parseContentLine(l.value);
    if (!p) { problems.push({ line: l.line, kind: "unparsable", text: l.value }); continue; }
    p.line = l.line;
    if (p.name === "BEGIN") {
      const c = { name: p.value.toUpperCase(), props: [], children: [], line: l.line };
      stack.at(-1).children.push(c); stack.push(c);
    } else if (p.name === "END") {
      const want = p.value.toUpperCase();
      if (stack.length > 1 && stack.at(-1).name === want) { stack.at(-1).endLine = l.line; stack.pop(); }
      else problems.push({ line: l.line, kind: "unmatched-end", text: want, open: stack.length > 1 ? stack.at(-1).name : null });
    } else stack.at(-1).props.push(p);
  }
  for (const c of stack.slice(1)) problems.push({ line: c.line, kind: "unclosed", text: c.name });
  return { root, problems, lines };
}

const get = (c, name) => c.props.find((p) => p.name === name);
const all = (c, name) => c.props.filter((p) => p.name === name);
const walk = (c, f) => { f(c); c.children.forEach((k) => walk(k, f)); };

export function parseRrule(value) {
  const o = {};
  for (const part of value.split(";")) { const [k, v] = part.split("="); if (k) o[k.toUpperCase()] = v; }
  return o;
}

// Range checks on the BY* parts of an RRULE; returns [{title, detail}].
function rruleByProblems(r) {
  const out = [];
  const nums = (v) => v.split(",").map((x) => x.trim());
  const range = (key, lo, hi, noZero) => {
    if (r[key] === undefined) return;
    for (const x of nums(r[key])) {
      const n = Number(x);
      if (!/^[+-]?\d+$/.test(x) || (noZero && n === 0) || Math.abs(n) > hi || n < lo) out.push({ title: `bad ${key} value ${x || "(empty)"}`, detail: `${key} accepts ${noZero ? "non-zero " : ""}whole numbers from ${lo} to ${hi}.` });
    }
  };
  range("BYMONTH", 1, 12);
  range("BYMONTHDAY", -31, 31, true);
  range("BYYEARDAY", -366, 366, true);
  range("BYWEEKNO", -53, 53, true);
  range("BYHOUR", 0, 23);
  range("BYMINUTE", 0, 59);
  range("BYSETPOS", -366, 366, true);
  if (r.BYDAY !== undefined) {
    for (const x of nums(r.BYDAY)) {
      const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.toUpperCase());
      if (!m) out.push({ title: `bad BYDAY value ${x || "(empty)"}`, detail: "BYDAY takes two-letter days (MO, TU, WE, TH, FR, SA, SU), optionally with a number such as 2TU or -1FR. Full names like MONDAY are not valid." });
      else if (m[1] !== undefined && (Number(m[1]) === 0 || Math.abs(Number(m[1])) > 53)) out.push({ title: `bad BYDAY value ${x}`, detail: "The number before the day must be 1 to 53 or -1 to -53." });
      else if (m[1] !== undefined && !["MONTHLY", "YEARLY"].includes(r.FREQ)) out.push({ title: `BYDAY ${x} needs FREQ=MONTHLY or YEARLY`, detail: "A number before the weekday is only allowed in monthly and yearly rules. Importers ignore or reject it otherwise." });
    }
  }
  if (r.WKST !== undefined && !/^(SU|MO|TU|WE|TH|FR|SA)$/i.test(r.WKST)) out.push({ title: `bad WKST value ${r.WKST}`, detail: "WKST must be a two-letter day such as MO or SU." });
  if (r.BYMONTHDAY !== undefined && ["WEEKLY"].includes(r.FREQ)) out.push({ title: "BYMONTHDAY with FREQ=WEEKLY", detail: "The standard forbids BYMONTHDAY in a weekly rule. Use FREQ=MONTHLY, or BYDAY for weekly." });
  return out;
}

const F = (severity, line, title, detail, extra = {}) => ({ severity, line, title, detail, ...extra });

export function validate(text) {
  const findings = [];
  const { root, problems } = parseCalendar(text);

  if (/\r\n/.test(text) === false && /\n/.test(text)) {
    findings.push(F("warning", 0, "Line endings are LF, not CRLF", "RFC 5545 requires CRLF. Most importers cope, some strict ones reject the file. Fixed automatically.", { fixable: true, code: "crlf" }));
  } else if (/\n/.test(text.replace(/\r\n/g, ""))) {
    findings.push(F("warning", 0, "Mixed line endings", "Some lines end in CRLF and others in LF. Fixed automatically.", { fixable: true, code: "crlf" }));
  }
  const physical = text.split(/\r\n|\n|\r/);
  let longCount = 0, firstLong = 0;
  physical.forEach((raw, i) => { if (octets(raw) > MAX_OCTETS) { longCount++; if (!firstLong) firstLong = i + 1; } });
  if (longCount) findings.push(F("warning", firstLong, `${longCount} line${longCount === 1 ? "" : "s"} longer than 75 octets`, "RFC 5545 says lines are folded at 75 octets. Some importers truncate or reject longer lines, usually long DESCRIPTION or URL values. Refolded automatically.", { fixable: true, code: "fold" }));

  for (const p of problems) {
    if (p.kind === "unparsable") findings.push(F("error", p.line, "Line is not a valid property", `"${p.text.slice(0, 60)}" has no NAME:value form. Often a DESCRIPTION line whose line break was not folded (continuation lines must start with a space).`));
    else if (p.kind === "unmatched-end") findings.push(F("error", p.line, `END:${p.text} without a matching BEGIN`, p.open ? `The open component is ${p.open}.` : "Nothing is open."));
    else findings.push(F("error", p.line, `BEGIN:${p.text} is never closed`, `Add END:${p.text}. A truncated download or a copy that stopped early is the usual cause.`));
  }

  const cals = root.children.filter((c) => c.name === "VCALENDAR");
  if (!cals.length) {
    findings.push(F("error", 1, "No VCALENDAR found", "The file must start with BEGIN:VCALENDAR. It may not be an iCalendar file, or may be a web page saved by mistake."));
    return finish(findings, { events: 0, calendars: 0 });
  }
  if (cals.length > 1) findings.push(F("warning", cals[1].line, `${cals.length} VCALENDAR blocks in one file`, "Several importers read only the first. Merge them into one VCALENDAR."));

  let events = 0;
  const seenUid = new Map();
  for (const cal of cals) {
    const ver = get(cal, "VERSION");
    if (!ver) findings.push(F("error", cal.line, "VCALENDAR has no VERSION", "VERSION:2.0 is required. Added automatically.", { fixable: true, code: "version" }));
    else if (ver.value.trim() !== "2.0") findings.push(F("error", ver.line, `VERSION is ${ver.value}, not 2.0`, "Only 2.0 is the iCalendar standard. 1.0 is vCalendar and is not read by current calendar apps."));
    if (!get(cal, "PRODID")) findings.push(F("warning", cal.line, "VCALENDAR has no PRODID", "PRODID is required by the standard; some importers insist on it. Added automatically.", { fixable: true, code: "prodid" }));

    const tzDefined = new Set();
    cal.children.filter((c) => c.name === "VTIMEZONE").forEach((z) => { const t = get(z, "TZID"); if (t) tzDefined.add(t.value); });
    const tzUsed = new Map();

    walk(cal, (c) => {
      for (const p of c.props) if (p.params.TZID && !tzUsed.has(p.params.TZID)) tzUsed.set(p.params.TZID, p.line);
    });
    for (const [tz, line] of tzUsed) {
      if (!tzDefined.has(tz) && !tz.startsWith("/")) {
        findings.push(F("warning", line, `TZID ${tz} has no VTIMEZONE`, "The time zone is named but not defined in the file. Google Calendar usually resolves standard names, Outlook often does not and shows the event at the wrong hour or in the wrong zone. Include a VTIMEZONE block, or write the times in UTC (ending in Z). Not fixed automatically because the transition rules cannot be guessed."));
      }
    }

    for (const ev of cal.children.filter((c) => c.name === "VEVENT")) {
      events++;
      const label = (get(ev, "SUMMARY")?.value || "(no title)").slice(0, 40);
      const at = `${label}: `;
      const uid = get(ev, "UID");
      if (!uid || !uid.value.trim()) findings.push(F("error", ev.line, `${at}no UID`, "Every event needs a unique UID; without one, re-importing creates duplicates and updates cannot match. A stable one is generated for you.", { fixable: true, code: "uid" }));
      else {
        const k = uid.value.trim() + "|" + (get(ev, "RECURRENCE-ID")?.value || "");
        if (seenUid.has(k)) findings.push(F("warning", ev.line, `${at}UID repeats the event on line ${seenUid.get(k)}`, "Two events share a UID and no RECURRENCE-ID, so an importer will keep one and drop the other, or merge them. Give each its own UID."));
        else seenUid.set(k, ev.line);
      }
      if (!get(ev, "DTSTAMP")) findings.push(F("warning", ev.line, `${at}no DTSTAMP`, "Required by RFC 5545. Strict importers reject the event. Added automatically using the time you run the fix.", { fixable: true, code: "dtstamp" }));
      else { const t = parseTime(get(ev, "DTSTAMP").value); if (t.error) findings.push(F("error", get(ev, "DTSTAMP").line, `${at}bad DTSTAMP`, t.error)); }

      const ds = get(ev, "DTSTART"), de = get(ev, "DTEND"), du = get(ev, "DURATION");
      if (!ds) {
        if (!cal.props.some((p) => p.name === "METHOD")) findings.push(F("error", ev.line, `${at}no DTSTART`, "An event without a start has no place on a calendar and most importers skip it."));
      } else {
        const s = parseTime(ds.value);
        if (s.error) findings.push(F("error", ds.line, `${at}bad DTSTART`, s.error));
        else {
          if (s.kind === "datetime" && !s.utc && !ds.params.TZID) findings.push(F("info", ds.line, `${at}floating time`, "DTSTART has no Z and no TZID, so it means 'this local time wherever you are'. That is correct for some uses (a reminder at 9:00 anywhere) but a meeting will land at a different hour for people in other zones."));
          if (ds.params.VALUE === "DATE" && s.kind !== "date") findings.push(F("error", ds.line, `${at}VALUE=DATE with a time`, "DTSTART says it is a date but carries a time."));
          if (de && du) findings.push(F("error", de.line, `${at}both DTEND and DURATION`, "An event may have one or the other, not both. Several importers reject the event. Not fixed automatically because it is not provable which is intended."));
          if (de) {
            const e = parseTime(de.value);
            if (e.error) findings.push(F("error", de.line, `${at}bad DTEND`, e.error));
            else {
              if (e.kind !== s.kind) findings.push(F("error", de.line, `${at}DTSTART and DTEND are different types`, `DTSTART is a ${s.kind} and DTEND is a ${e.kind}. They must match.`));
              else if (e.ms < s.ms) findings.push(F("error", de.line, `${at}ends before it starts`, `DTEND ${de.value} is earlier than DTSTART ${ds.value}. Often a swapped pair, or an end time typed without the next day.`));
              else if (e.ms === s.ms && s.kind === "date") findings.push(F("warning", de.line, `${at}all-day event with zero length`, "For all-day events DTEND is the day after the last day (exclusive). With DTEND equal to DTSTART the event has no duration and may not display. DTEND moved forward one day automatically.", { fixable: true, code: "allday-end", ev: ev.line }));
            }
          }
          const rr = get(ev, "RRULE");
          if (rr) {
            const r = parseRrule(rr.value);
            if (!r.FREQ) findings.push(F("error", rr.line, `${at}RRULE has no FREQ`, "FREQ (DAILY, WEEKLY, MONTHLY, YEARLY...) is required."));
            else if (!["SECONDLY", "MINUTELY", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(r.FREQ)) findings.push(F("error", rr.line, `${at}unknown FREQ ${r.FREQ}`, "Not a valid recurrence frequency."));
            if (r.COUNT && r.UNTIL) findings.push(F("error", rr.line, `${at}RRULE has both COUNT and UNTIL`, "The standard forbids both in one rule; importers disagree on which wins."));
            if (r.UNTIL) {
              const u = parseTime(r.UNTIL);
              if (u.error) findings.push(F("error", rr.line, `${at}bad UNTIL`, u.error));
              else {
                if (u.kind !== s.kind) findings.push(F("error", rr.line, `${at}UNTIL type does not match DTSTART`, `DTSTART is a ${s.kind} but UNTIL is a ${u.kind}. Google Calendar and Outlook may drop the end of the series or reject it.`));
                else if (s.kind === "datetime" && (ds.params.TZID || s.utc) && !u.utc) findings.push(F("warning", rr.line, `${at}UNTIL should be in UTC`, "When DTSTART has a time zone or is UTC, the RFC says UNTIL must be UTC (end in Z), otherwise the last occurrence may be dropped."));
                if (!u.error && u.ms < s.ms) findings.push(F("error", rr.line, `${at}UNTIL is before DTSTART`, "The series ends before it begins."));
              }
            }
            if (r.INTERVAL && !/^[1-9]\d*$/.test(r.INTERVAL)) findings.push(F("error", rr.line, `${at}bad INTERVAL`, "INTERVAL must be a positive whole number."));
            if (r.COUNT && !/^[1-9]\d*$/.test(r.COUNT)) findings.push(F("error", rr.line, `${at}bad COUNT`, "COUNT must be a positive whole number."));
            for (const msg of rruleByProblems(r)) findings.push(F("error", rr.line, `${at}${msg.title}`, msg.detail));
          }
          for (const name of ["EXDATE", "RDATE"]) {
            for (const p of all(ev, name)) {
              const vals = p.value.split(",").map((v) => v.trim()).filter(Boolean);
              const kinds = new Set(vals.map((v) => parseTime(v)).filter((t) => !t.error && !p.params.VALUE?.startsWith("PERIOD")).map((t) => t.kind));
              const bad = vals.find((v) => parseTime(v).error && !p.params.VALUE?.startsWith("PERIOD"));
              if (bad) findings.push(F("error", p.line, `${at}bad ${name} value`, `"${bad.slice(0, 30)}" is not a date or date-time (YYYYMMDD or YYYYMMDDTHHMMSS[Z]).`));
              else if ([...kinds].some((k) => k !== s.kind)) findings.push(F("warning", p.line, `${at}${name} type does not match DTSTART`, `DTSTART is a ${s.kind}. An ${name} of the other type (date vs date-time) is ignored by Google Calendar and Outlook, so ${name === "EXDATE" ? "the occurrence you meant to skip still shows" : "the extra occurrence never appears"}.`));
            }
          }
        }
      }
      if (!get(ev, "SUMMARY")) findings.push(F("info", ev.line, `${at}no SUMMARY`, "The event will show as untitled."));
      for (const p of all(ev, "ATTENDEE")) if (!/^mailto:/i.test(p.value)) findings.push(F("info", p.line, `${at}ATTENDEE is not a mailto: address`, `"${p.value.slice(0, 50)}" — importers expect mailto:name@example.com.`));
    }
  }
  return finish(findings, { events, calendars: cals.length });
}

function finish(findings, base) {
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.line || 0) - (b.line || 0));
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  return { findings, summary: { ...base, errors, warnings, fixable: findings.filter((f) => f.fixable).length } };
}

// Apply only provable fixes. `now` is injectable so tests are deterministic.
export function repair(text, { now = Date.now() } = {}) {
  const { root, lines } = parseCalendar(text);
  const changes = [];
  const out = [];
  const cals = root.children.filter((c) => c.name === "VCALENDAR");
  // Rebuild from unfolded lines so folding is regenerated, editing along the way.
  const byLine = new Map();
  const addAfter = new Map(); // line -> [new lines]
  const replace = new Map();
  for (const cal of cals) {
    if (!get(cal, "VERSION")) { addAfter.set(cal.line, [...(addAfter.get(cal.line) || []), "VERSION:2.0"]); changes.push("Added VERSION:2.0"); }
    if (!get(cal, "PRODID")) { addAfter.set(cal.line, [...(addAfter.get(cal.line) || []), "PRODID:-//ics-calendar-check//EN"]); changes.push("Added PRODID"); }
    for (const ev of cal.children.filter((c) => c.name === "VEVENT")) {
      const add = [];
      const ds = get(ev, "DTSTART"), de = get(ev, "DTEND");
      const label = (get(ev, "SUMMARY")?.value || "(no title)").slice(0, 40);
      if (!get(ev, "UID") || !get(ev, "UID").value.trim()) {
        add.push("UID:" + makeUid(`${get(ev, "SUMMARY")?.value || ""}|${ds?.value || ""}|${ev.line}`));
        changes.push(`${label}: added a UID`);
      }
      if (!get(ev, "DTSTAMP")) { add.push("DTSTAMP:" + fmtUtc(now)); changes.push(`${label}: added DTSTAMP`); }
      if (ds && de && !get(ev, "DURATION")) {
        const s = parseTime(ds.value), e = parseTime(de.value);
        if (!s.error && !e.error && s.kind === "date" && e.kind === "date" && s.ms === e.ms) {
          replace.set(de.line, `${de.name}${Object.entries(de.params).map(([k, v]) => `;${k}=${v}`).join("")}:${fmtDate(e.ms + 86400000)}`);
          changes.push(`${label}: all-day DTEND moved to ${fmtDate(e.ms + 86400000)}`);
        }
      }
      if (add.length) addAfter.set(ev.line, [...(addAfter.get(ev.line) || []), ...add]);
    }
  }
  for (const l of lines) {
    if (!l.value.trim()) continue;
    out.push(replace.get(l.line) ?? l.value);
    for (const a of addAfter.get(l.line) || []) out.push(a);
  }
  const folded = out.map(fold);
  if (text.split(/\r\n|\n|\r/).some((raw) => octets(raw) > MAX_OCTETS)) changes.push("Refolded lines longer than 75 octets");
  if (/\n/.test(text.replace(/\r\n/g, ""))) changes.push("Line endings set to CRLF");
  return { text: folded.join("\r\n") + "\r\n", changes };
}

export function findingsCsv(result) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["severity,line,title,detail,auto_fixed", ...result.findings.map((f) => [f.severity, f.line || "", q(f.title), q(f.detail), f.fixable ? "yes" : "no"].join(","))].join("\r\n") + "\r\n";
}

export function sampleFile() {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Example//Team//EN", "BEGIN:VEVENT", "UID:standup-1@example.test", "DTSTAMP:20260105T080000Z", "DTSTART:20260106T150000Z", "DTEND:20260106T151500Z", "SUMMARY:Team standup", "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20260630T150000Z", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}

export function sampleBrokenFile() {
  return [
    "BEGIN:VCALENDAR",
    "PRODID:-//Example//Team//EN",
    "BEGIN:VEVENT",
    "DTSTART;TZID=Europe/Paris:20260106T090000",
    "DTEND;TZID=Europe/Paris:20260106T083000",
    "SUMMARY:Board meeting",
    "DESCRIPTION:Agenda: 1. Budget review for the coming financial year including all the open items from the last quarter and the long list of attachments.",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:offsite@example.test",
    "DTSTAMP:20260101T000000Z",
    "DTSTART;VALUE=DATE:20260210",
    "DTEND;VALUE=DATE:20260210",
    "SUMMARY:Company offsite",
    "RRULE:FREQ=YEARLY;COUNT=3;UNTIL=20290210T000000Z",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:offsite@example.test",
    "DTSTAMP:20260101T000000Z",
    "DTSTART:20260230T100000Z",
    "SUMMARY:Typo date",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\n");
}
