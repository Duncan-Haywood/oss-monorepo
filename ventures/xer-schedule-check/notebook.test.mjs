import { test } from "node:test";
import assert from "node:assert/strict";
import { memoText, memoHtml, notesText, parseNotes, notebookSections } from "./notebook.mjs";
import { parseXer } from "./xer.mjs";
import { mspdiText } from "./msproject.mjs";
import { parseMspdi } from "./mspdi.mjs";
import { p6XerText, p6Problems } from "./p6xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";

test("memoText reads P6 desktop's DHTML notebook with 0x7F line breaks", () => {
  const m = '<HTML>\x7f\x7f<HEAD>\x7f\x7f<META NAME="GENERATOR" Content="Microsoft DHTML Editing Control">\x7f\x7f<TITLE>x</TITLE>\x7f\x7f</HEAD>\x7f\x7f<BODY bgColor=#ffffff>\x7f\x7f<P> Submitted as clause 14</P>\x7f\x7f</BODY>\x7f\x7f</HTML>';
  assert.equal(memoText(m), "Submitted as clause 14");
});

test("memoText keeps paragraphs, breaks and list items, decodes entities", () => {
  const m = "<HTML><BODY><P><B>Pour</B> after cubes &amp; <I>sign-off</I></P><P>Line one<BR>line&nbsp;two</P><UL><LI>rebar &lt;16mm&gt;</LI><LI>2&#176;C min</LI></UL></BODY></HTML>";
  assert.equal(memoText(m), "Pour after cubes & sign-off\nLine one\nline two\n- rebar <16mm>\n- 2°C min");
  assert.equal(memoText("G1"), "G1");
  assert.equal(memoText(""), "");
});

test("memoHtml -> memoText gives the text back, and holds no tab or line break", () => {
  const t = "Rain 12-14 March\n\n<not> a tag & \"quoted\"\tTabbed";
  const h = memoHtml(t);
  assert.doesNotMatch(h, /[\t\r\n]/);
  assert.equal(memoText(h), "Rain 12-14 March\n\n<not> a tag & \"quoted\" Tabbed");
});

test("notes sections: written under bracketed topics and read back in order", () => {
  const s = [{ topic: "Description", text: "Pour slab\nafter cubes" }, { topic: "Delays", text: "Rain\n\n[see RFI 12]\nmore" }];
  const n = notesText(s);
  assert.equal(n, "[Description]\nPour slab\nafter cubes\n\n[Delays]\nRain\n\n [see RFI 12]\nmore");
  const back = parseNotes(n).map((x) => ({ ...x, text: memoText(memoHtml(x.text)) }));
  assert.deepEqual(back, [{ topic: "Description", text: "Pour slab\nafter cubes" }, { topic: "Delays", text: "Rain\n\n[see RFI 12]\nmore" }]);
});

test("a Project planner's own note is one entry under Notes, and comes back as it was", () => {
  assert.deepEqual(parseNotes("Check with the client\nbefore pouring\n"), [{ topic: "Notes", text: "Check with the client\nbefore pouring" }]);
  assert.equal(notesText([{ topic: "Notes", text: "Check with the client" }]), "Check with the client");
  assert.deepEqual(parseNotes("[Converted from P6]\nP6 level of effort activity L1"), []);
  assert.deepEqual(parseNotes(""), []);
});

test("notebookSections orders topics by MEMOTYPE seq_num and names unknown ones", () => {
  const T = {
    MEMOTYPE: [{ memo_type_id: "5", seq_num: "20", memo_type: "Delays" }, { memo_type_id: "6", seq_num: "10", memo_type: "Description" }],
    TASKMEMO: [{ task_id: "1", memo_type_id: "5", task_memo: "late" }, { task_id: "1", memo_type_id: "6", task_memo: "<P>pour</P>" }, { task_id: "1", memo_type_id: "9", task_memo: "x" }, { task_id: "2", memo_type_id: "6", task_memo: "<HTML><BODY></BODY></HTML>" }],
    WBSMEMO: [{ wbs_id: "w", memo_type_id: "6", wbs_memo: "area" }],
  };
  const nb = notebookSections(T);
  assert.deepEqual(nb.task.get("1").map((x) => x.topic), ["Description", "Delays", "Notebook 9"]);
  assert.equal(nb.task.has("2"), false); // an empty entry is not a note
  assert.equal(nb.wbs.get("w")[0].text, "area");
});

test("XER notebooks -> Project notes -> XER notebooks, on the same activities and WBS nodes", () => {
  const x = parseXer(EXAMPLE_XER);
  const T = x.tables;
  T.PROJWBS = [{ wbs_id: "699", proj_id: "77", proj_node_flag: "Y", seq_num: "0", wbs_short_name: "OFFICE-FITOUT", wbs_name: "Office fit-out", parent_wbs_id: "" }, { wbs_id: "700", proj_id: "77", proj_node_flag: "N", seq_num: "10", wbs_short_name: "L1", wbs_name: "Level 1", parent_wbs_id: "699" }];
  const [a, b] = T.TASK.filter((t) => t.task_type === "TT_Task");
  const wbs = T.PROJWBS.find((w) => w.proj_node_flag !== "Y");
  const root = T.PROJWBS.find((w) => w.proj_node_flag === "Y");
  T.MEMOTYPE = [{ memo_type_id: "30", seq_num: "10", eps_flag: "Y", proj_flag: "Y", wbs_flag: "Y", task_flag: "Y", memo_type: "Description" }, { memo_type_id: "31", seq_num: "20", eps_flag: "Y", proj_flag: "Y", wbs_flag: "Y", task_flag: "Y", memo_type: "Delays" }];
  T.TASKMEMO = [
    { memo_id: "1", task_id: a.task_id, memo_type_id: "31", proj_id: a.proj_id, task_memo: "<HTML><BODY><P>Rain 12-14 March</P></BODY></HTML>" },
    { memo_id: "2", task_id: a.task_id, memo_type_id: "30", proj_id: a.proj_id, task_memo: "<HTML><BODY><P>Pour &amp; cure</P><P>7 days</P></BODY></HTML>" },
    { memo_id: "3", task_id: b.task_id, memo_type_id: "30", proj_id: b.proj_id, task_memo: "G1" },
  ];
  T.WBSMEMO = [{ wbs_memo_id: "1", proj_id: wbs.proj_id, memo_type_id: "30", wbs_id: wbs.wbs_id, wbs_memo: "Area A scope" }, { wbs_memo_id: "2", proj_id: root.proj_id, memo_type_id: "30", wbs_id: root.wbs_id, wbs_memo: "Contract 14" }];
  const r = mspdiText(x);
  assert.equal(r.counts.notebookEntries, 3);
  assert.equal(r.counts.notebookWbsEntries, 2);
  assert.ok(r.xml.includes("<Notes>[Description]\nPour &amp; cure\n7 days\n\n[Delays]\nRain 12-14 March</Notes>"));
  assert.ok(!r.warnings.some((w) => /not carried:.*notebook/.test(w)));
  const back = p6XerText(r.xml);
  assert.deepEqual(p6Problems(back.xer.tables), []);
  const y = parseXer(back.text);
  const code = new Map(y.tables.TASK.map((t) => [t.task_id, t.task_code]));
  const topic = new Map(y.tables.MEMOTYPE.map((m) => [m.memo_type_id, m.memo_type]));
  const got = y.tables.TASKMEMO.map((m) => `${code.get(m.task_id)}|${topic.get(m.memo_type_id)}|${memoText(m.task_memo)}`).sort();
  assert.deepEqual(got, [`${a.task_code}|Delays|Rain 12-14 March`, `${a.task_code}|Description|Pour & cure\n7 days`, `${b.task_code}|Description|G1`].sort());
  const wname = new Map(y.tables.PROJWBS.map((w) => [w.wbs_id, w.proj_node_flag === "Y" ? "(project)" : w.wbs_name]));
  assert.deepEqual(y.tables.WBSMEMO.map((m) => `${wname.get(m.wbs_id)}|${memoText(m.wbs_memo)}`).sort(), [`${wbs.wbs_name}|Area A scope`, "(project)|Contract 14"].sort());
});

const WEEK = [1, 7].map((d) => `<WeekDay><DayType>${d}</DayType><DayWorking>0</DayWorking></WeekDay>`).join("") +
  [2, 3, 4, 5, 6].map((d) => `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`).join("");

test("a Project task note becomes a P6 notebook entry under Notes", () => {
  const xml = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Name>N</Name><StartDate>2026-03-02T08:00:00</StartDate><CalendarUID>1</CalendarUID><Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${WEEK}</WeekDays></Calendar></Calendars><Tasks><Task><UID>0</UID><ID>0</ID><Name>N</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary><Notes>Whole job</Notes></Task><Task><UID>1</UID><ID>1</ID><Name>Dig</Name><OutlineLevel>1</OutlineLevel><Start>2026-03-02T08:00:00</Start><Duration>PT16H0M0S</Duration><Notes><![CDATA[Check services
before digging]]></Notes></Task></Tasks></Project>`;
  const t = parseMspdi(xml).tables;
  assert.equal(t.TASKMEMO.length, 1);
  assert.equal(memoText(t.TASKMEMO[0].task_memo), "Check services\nbefore digging");
  const out = p6XerText(xml);
  assert.deepEqual(p6Problems(out.xer.tables), []);
  assert.deepEqual(out.xer.tables.MEMOTYPE.map((m) => m.memo_type), ["Notes"]);
  assert.equal(out.xer.tables.WBSMEMO[0].wbs_id, "1"); // the project node
  assert.equal(out.counts.taskNotebooks, 1);
});
