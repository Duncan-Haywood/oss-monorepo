// P6 resource notes (RSRC.rsrc_notes) <-> Microsoft Project resource Notes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoText } from "./notebook.mjs";
import { parseXer } from "./xer.mjs";
import { mspdiText } from "./msproject.mjs";
import { p6XerText, p6Problems } from "./p6xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";

test("XER resource notes -> Project resource Notes -> XER, on the same resource", () => {
  const x = parseXer(EXAMPLE_XER);
  const [gc, dry] = x.tables.RSRC;
  gc.rsrc_notes = `<HTML>\x7f\x7f<HEAD><TITLE></TITLE></HEAD>\x7f\x7f<BODY><P>Rate per <B>union</B> agreement &amp; clause 4</P>\x7f\x7f<UL><LI>Foreman: J. site lead</LI><LI>Call 24 h ahead</LI></UL></BODY></HTML>`;
  dry.rsrc_notes = "<HTML><BODY></BODY></HTML>"; // P6's empty shell: no note
  const r = mspdiText(x);
  assert.equal(r.counts.rsrcNotes, 1);
  assert.ok(r.xml.includes("<Initials>GC</Initials><CalendarUID>"));
  assert.ok(r.xml.includes("<Notes>Rate per union agreement &amp; clause 4\n- Foreman: J. site lead\n- Call 24 h ahead</Notes>"));
  // Notes sits after CalendarUID and before any ExtendedAttribute (Project's schema order)
  const res = r.xml.slice(r.xml.indexOf("<Resource>"), r.xml.indexOf("</Resource>"));
  assert.ok(res.indexOf("<CalendarUID>") < res.indexOf("<Notes>"));
  assert.equal((r.xml.match(/<Resource>[^]*?<\/Resource>/g) || []).filter((s) => s.includes("<Notes>")).length, 1);
  assert.ok(r.warnings.some((w) => /1 resource note\(s\) written/.test(w)));
  const back = p6XerText(r.xml);
  assert.deepEqual(p6Problems(back.xer.tables), []);
  const y = parseXer(back.text).tables.RSRC;
  assert.equal(memoText(y.find((q) => q.rsrc_short_name === "GC").rsrc_notes), "Rate per union agreement & clause 4\n- Foreman: J. site lead\n- Call 24 h ahead");
  assert.equal(y.find((q) => q.rsrc_short_name === "DRY").rsrc_notes, "");
  assert.ok(!/\t|\n/.test(y.find((q) => q.rsrc_short_name === "GC").rsrc_notes));
});

const WEEK = [1, 7].map((d) => `<WeekDay><DayType>${d}</DayType><DayWorking>0</DayWorking></WeekDay>`).join("") +
  [2, 3, 4, 5, 6].map((d) => `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`).join("");
const projectXml = (resources) => `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Name>N</Name><StartDate>2026-03-02T08:00:00</StartDate><CalendarUID>1</CalendarUID><Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${WEEK}</WeekDays></Calendar></Calendars><Tasks><Task><UID>0</UID><ID>0</ID><Name>N</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task><Task><UID>1</UID><ID>1</ID><Name>Dig</Name><OutlineLevel>1</OutlineLevel><Start>2026-03-02T08:00:00</Start><Duration>PT16H0M0S</Duration></Task></Tasks><Resources>${resources}</Resources><Assignments><Assignment><UID>1</UID><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID><Units>1</Units></Assignment><Assignment><UID>2</UID><TaskUID>1</TaskUID><ResourceUID>2</ResourceUID><Cost>50000</Cost></Assignment></Assignments></Project>`;

test("a Project resource note becomes P6 resource notes; a cost resource's is reported as not carried", () => {
  const xml = projectXml(`<Resource><UID>1</UID><ID>1</ID><Name>Excavator</Name><Type>1</Type><Notes><![CDATA[Hire from depot B
<needs> banksman]]></Notes></Resource><Resource><UID>2</UID><ID>2</ID><Name>Skip hire</Name><Type>2</Type><Notes>PO 4471</Notes></Resource>`);
  const out = p6XerText(xml);
  assert.deepEqual(p6Problems(out.xer.tables), []);
  const ex = out.xer.tables.RSRC.find((q) => q.rsrc_name === "Excavator");
  assert.equal(ex.rsrc_notes, "<HTML><BODY><P>Hire from depot B</P><P>&lt;needs&gt; banksman</P></BODY></HTML>");
  assert.equal(memoText(ex.rsrc_notes), "Hire from depot B\n<needs> banksman");
  assert.ok(out.warnings.some((w) => /1 resource note\(s\) written/.test(w)));
  assert.ok(out.warnings.some((w) => /1 cost resource note\(s\) not carried/.test(w)));
  // and back to Project: the same note on the same resource
  const again = mspdiText(parseXer(out.text));
  assert.ok(again.xml.includes("<Name>Excavator</Name>"));
  assert.ok(again.xml.includes("<Notes>Hire from depot B\n&lt;needs&gt; banksman</Notes>"));
});

test("a resource with no note writes no Notes element and no warning", () => {
  const out = p6XerText(projectXml(`<Resource><UID>1</UID><ID>1</ID><Name>Excavator</Name><Type>1</Type></Resource>`));
  assert.equal(out.xer.tables.RSRC[0].rsrc_notes, "");
  assert.ok(!out.warnings.some((w) => /resource note/.test(w)));
  assert.equal(mspdiText(parseXer(EXAMPLE_XER)).counts.rsrcNotes, 0);
});

test("--all-resources keeps an unassigned resource and its note on Project -> XER -> Project", () => {
  // resource 3 has no assignment: by default it is left out of the Project XML
  // (and counted); with allResources it comes back with its note and calendar
  const xml = projectXml(`<Resource><UID>1</UID><ID>1</ID><Name>Excavator</Name><Type>1</Type></Resource><Resource><UID>2</UID><ID>2</ID><Name>Skip hire</Name><Type>2</Type></Resource><Resource><UID>3</UID><ID>3</ID><Name>Tower crane</Name><Type>1</Type><Notes>Book 6 weeks ahead</Notes></Resource>`);
  const xer = parseXer(p6XerText(xml).text);
  assert.ok(xer.tables.RSRC.some((q) => q.rsrc_name === "Tower crane"));
  const used = mspdiText(xer);
  assert.ok(!used.xml.includes("Tower crane"));
  assert.equal(used.counts.resourcesLeftOut, 1);
  assert.ok(used.warnings.some((w) => /1 resource\(s\) with no assignment in this project left out/.test(w)));
  const all = mspdiText(xer, { allResources: true });
  assert.equal(all.counts.unassignedResources, 1);
  assert.equal(all.counts.resourcesLeftOut, 0);
  assert.equal(all.counts.resources, used.counts.resources + 1);
  assert.ok(all.xml.includes("<Name>Tower crane</Name>"));
  assert.ok(all.xml.includes("<Notes>Book 6 weeks ahead</Notes>"));
  assert.ok(all.warnings.some((w) => /1 resource\(s\) with no assignment in this project written too/.test(w)));
  // assignments are unchanged, and UIDs stay unique
  assert.equal(all.counts.assignments, used.counts.assignments);
  const uids = [...all.xml.matchAll(/<Resource><UID>(\d+)<\/UID>/g)].map((m) => m[1]);
  assert.equal(new Set(uids).size, uids.length);
  // and back to XER again: still three resources' worth, the note intact
  const again = p6XerText(all.xml);
  assert.deepEqual(p6Problems(again.xer.tables), []);
  assert.equal(memoText(again.xer.tables.RSRC.find((q) => q.rsrc_name === "Tower crane").rsrc_notes), "Book 6 weeks ahead");
});

test("a file whose resources are all assigned warns of nothing left out, and allResources changes nothing", () => {
  const x = parseXer(EXAMPLE_XER);
  const r = mspdiText(x);
  assert.equal(r.counts.resourcesLeftOut, 0);
  assert.ok(!r.warnings.some((w) => /no assignment in this project/.test(w)));
  assert.equal(mspdiText(x, { allResources: true }).xml, r.xml);
});
