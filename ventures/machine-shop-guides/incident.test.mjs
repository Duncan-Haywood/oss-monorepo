import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  QUOTES, emptyIncident, normaliseIncident, parseLocal, fmtLocal, fmtDuration,
  applicability, deadlines, checklist, clockText, incidentToMarkdown, incidentToJson, STEPS,
} from "./incident.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");

test("clause quotes are pinned to the text read on 25 Nov 2026 (GSA DFARS source, MAY 2024)", () => {
  // Each string was checked as a verbatim substring of dita/252.204-7012.dita
  // (sha256 99af021d...b18c1). Changing a quote means re-reading the clause.
  assert.equal(sha(QUOTES.rapidly), "753ff21390d7be3c1e99ac6573528754c716e361bc201eb013b26bf9faff27cb");
  assert.equal(sha(QUOTES.preserve), "67233ccf1430b6c0fae8741d5455c21baaf465515d6106479f0cf7a619209d25");
  assert.equal(sha(QUOTES.malware), "8b99712bb48cc762f38e925a27a098b853de0c03852a80cfd2f73f52182900e2");
  assert.match(QUOTES.rapidly, /72 hours of discovery/);
  assert.match(QUOTES.preserve, /at least 90 days from the submission/);
});

test("parseLocal reads datetime-local values and rejects rollovers and junk", () => {
  const d = parseLocal("2026-11-25T14:30");
  assert.equal(fmtLocal(d), "2026-11-25 14:30");
  assert.equal(fmtLocal(parseLocal("2026-11-25T14:30:59")), "2026-11-25 14:30");
  for (const bad of ["", "2026-02-30T10:00", "2026-11-25", "25/11/2026 10:00", "2026-11-25T24:00", null, 42]) assert.equal(parseLocal(bad), null, String(bad));
});

test("the 72-hour clock runs from discovery and counts down", () => {
  const r = { ...emptyIncident(), discoveredAt: "2026-11-25T09:15" };
  const now = new Date(parseLocal("2026-11-25T09:15").getTime() + 10 * 3600e3);
  const d = deadlines(r, { now });
  assert.equal(d.reportDue.getTime() - d.discovered.getTime(), 72 * 3600e3);
  assert.equal(d.msLeft, 62 * 3600e3);
  assert.equal(d.overdue, false);
  assert.match(clockText(d), /^Report due by .*: 2 d 14 h 0 min left\.$/);
});

test("overdue when 72 hours pass with no report", () => {
  const r = { ...emptyIncident(), discoveredAt: "2026-11-20T08:00" };
  const now = new Date(parseLocal("2026-11-20T08:00").getTime() + 73.5 * 3600e3);
  const d = deadlines(r, { now });
  assert.equal(d.overdue, true);
  assert.match(clockText(d), /ran out at .* \(1 h 30 min ago\)\. Report now/);
});

test("a report at exactly 72 hours is on time; one minute later is late", () => {
  const base = { ...emptyIncident(), discoveredAt: "2026-11-02T00:00" };
  const t0 = parseLocal("2026-11-02T00:00").getTime();
  const on = fmtLocal(new Date(t0 + 72 * 3600e3)).replace(" ", "T");
  const late = fmtLocal(new Date(t0 + 72 * 3600e3 + 60e3)).replace(" ", "T");
  assert.equal(deadlines({ ...base, reportedAt: on }).reportedLate, false);
  assert.equal(deadlines({ ...base, reportedAt: late }).reportedLate, true);
  assert.match(clockText(deadlines({ ...base, reportedAt: late })), /later than the 72 hours/);
});

test("preservation runs at least 90 days from report submission, not from discovery", () => {
  const r = { ...emptyIncident(), discoveredAt: "2026-11-01T10:00", reportedAt: "2026-11-03T16:00" };
  const d = deadlines(r);
  assert.equal(fmtLocal(d.preserveUntil), "2027-02-01 16:00"); // 90 calendar days, same wall clock
  assert.equal(deadlines({ ...emptyIncident(), discoveredAt: "2026-11-01T10:00" }).preserveUntil, null);
});

test("a report time before discovery is flagged, not scored", () => {
  const d = deadlines({ ...emptyIncident(), discoveredAt: "2026-11-03T10:00", reportedAt: "2026-11-02T10:00" });
  assert.ok(d.error);
  assert.equal(d.reportedLate, null);
  assert.equal(clockText(d), d.error);
});

test("applicability follows (c)(1) and never says 'nothing owed' while unsure", () => {
  assert.equal(applicability({ clause: "yes", affects: "cdi" }).required, true);
  assert.equal(applicability({ clause: "yes", affects: "ocs" }).required, true);
  assert.equal(applicability({ clause: "yes", affects: "neither" }).required, false);
  assert.equal(applicability({ clause: "no", affects: "cdi" }).required, false);
  assert.match(applicability({ clause: "no" }).reason, /paragraph \(l\)/);
  assert.equal(applicability({ clause: "unsure", affects: "cdi" }).required, null);
  assert.equal(applicability({ clause: "unsure", affects: "neither" }).required, null);
  assert.match(applicability({}).reason, /run the 72-hour clock/);
});

test("checklist: subcontractor step only for subs; malware and cloud steps drop when ruled out", () => {
  const ids = (r) => checklist(r).map((s) => s.id);
  assert.ok(!ids({ role: "prime" }).includes("higher"));
  assert.ok(ids({ role: "sub" }).includes("higher"));
  assert.ok(ids({}).includes("malware"));
  assert.ok(!ids({ malware: "none" }).includes("malware"));
  assert.ok(!ids({ cloud: "no" }).includes("cloud"));
  for (const s of STEPS) assert.match(s.cite, /^\([a-m]\)/, s.id);
  const c = checklist({ steps: { report: { done: true, note: "filed" } } });
  assert.deepEqual(c.find((s) => s.id === "report"), { ...c.find((s) => s.id === "report"), done: true, note: "filed" });
});

test("normalise drops unknown enums, non-strings, unknown steps and oversize text", () => {
  const r = normaliseIncident({ role: "boss", clause: "maybe", company: 5, steps: { report: { done: "yes" }, nope: { done: true } }, timeline: [null, { at: "2026-11-25T10:00", text: "found" }, { at: "", text: "" }], summary: "x".repeat(30000) });
  assert.equal(r.role, "prime");
  assert.equal(r.clause, "unsure");
  assert.equal(r.company, "");
  assert.deepEqual(r.steps, { report: { done: false, note: "" } });
  assert.deepEqual(r.timeline, [{ at: "2026-11-25T10:00", text: "found" }]);
  assert.equal(r.summary.length, 20000);
  assert.deepEqual(normaliseIncident([1, 2]), emptyIncident());
});

test("Markdown record escapes user text, lists dates, steps and a sorted timeline", () => {
  const r = {
    ...emptyIncident(),
    company: "# Acme <script>alert(1)</script>",
    role: "sub", higherTier: "Big Prime | Inc",
    discoveredAt: "2026-11-25T09:00", reportedAt: "2026-11-26T08:30", reportNumber: "ICF-123",
    malware: "found",
    steps: { report: { done: true, note: "filed via DIBNet\nsecond line" } },
    timeline: [{ at: "2026-11-25T11:00", text: "isolated host" }, { at: "2026-11-25T09:00", text: "alert from EDR" }],
  };
  const md = incidentToMarkdown(r, { now: parseLocal("2026-11-26T09:00") });
  assert.ok(md.startsWith("# Cyber incident record: \\# Acme \\<script\\>alert\\(1\\)\\</script\\>"));
  assert.doesNotMatch(md, /(^|[^\\])<\/?script/i); // only backslash-escaped, so Markdown renders it as text
  assert.match(md, /reports to Big Prime \\\| Inc/);
  assert.match(md, /\| 72-hour report due \| 2026-11-28 09:00 \|/);
  assert.match(md, /\| DoD incident report number \| ICF-123 \|/);
  assert.match(md, /- \[x\] \*\*Report to DoD .*: filed via DIBNet second line/);
  assert.match(md, /Submit isolated malicious software/);
  assert.match(md, /Give the report number to your prime/);
  assert.ok(md.indexOf("alert from EDR") < md.indexOf("isolated host"));
  assert.match(md, /inside the 72 hours/);
});

test("JSON round-trips through normalise", () => {
  const r = { ...emptyIncident(), company: "Acme", discoveredAt: "2026-11-25T09:00", steps: { review: { done: true, note: "" } } };
  const back = normaliseIncident(JSON.parse(incidentToJson(r)));
  assert.deepEqual(back, normaliseIncident(r));
});

test("fmtDuration", () => {
  assert.equal(fmtDuration(0), "0 min");
  assert.equal(fmtDuration(59 * 60e3), "59 min");
  assert.equal(fmtDuration(26 * 3600e3 + 5 * 60e3), "1 d 2 h 5 min");
  assert.equal(fmtDuration(-90 * 60e3), "-1 h 30 min");
});

test("a discovery time in the future is flagged", () => {
  const now = parseLocal("2026-11-25T08:00");
  const d = deadlines({ ...emptyIncident(), discoveredAt: "2026-11-25T09:00" }, { now });
  assert.match(clockText(d), /in the future/);
  assert.equal(deadlines({ ...emptyIncident(), discoveredAt: "2026-11-25T08:00" }, { now }).error, null);
});
