// RFI drafter for subcontractors: turns the fields of a request for information into the text
// to paste into an email, a GC portal's RFI form or a letterhead, and says what a reviewer at the
// GC usually sends back for. Pure functions, no DOM: how-to-write-an-rfi.html wires them up and
// rfi.test.mjs pins them.

export const IMPACTS = {
  none: "None expected",
  possible: "Possible: we will price it once the answer is in",
  yes: "Yes: this answer is expected to change our cost and/or time",
};

const clean = (s) => String(s ?? "").trim();
const impactText = (k) => (Object.hasOwn(IMPACTS, k) ? IMPACTS[k] : null);

// "RFI 4" -> "RFI-004"; keeps a GC's own scheme (e.g. "E-12") as typed.
export function rfiNumber(raw) {
  const s = clean(raw);
  if (/^\d+$/.test(s)) return `RFI-${s.padStart(3, "0")}`;
  return s;
}

const parseDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(s)) ? new Date(`${clean(s)}T00:00:00Z`) : null);
const days = (a, b) => Math.round((b - a) / 86400000);

// Count the questions in the question box: sentences ending in "?" plus numbered items.
export function questionCount(q) {
  const text = clean(q);
  if (!text) return 0;
  const marks = (text.match(/\?/g) || []).length;
  const numbered = (text.match(/(^|\n)\s*(\d+[.)]|[a-z][.)])\s+/gi) || []).length;
  return Math.max(marks, numbered, 1);
}

export function checkRfi(f) {
  const warnings = [];
  const q = clean(f.question);
  if (!q) warnings.push({ field: "question", text: "Ask the question. An RFI without one gets returned unanswered." });
  else {
    if (questionCount(q) > 1) warnings.push({ field: "question", text: "More than one question. One question per RFI gets each answered and tracked on its own; a second one can hold the first up." });
    if (q.length < 40) warnings.push({ field: "question", text: "The question is very short. Say what the documents show, what conflicts or is missing, and what you need to know." });
  }
  if (!clean(f.subject)) warnings.push({ field: "subject", text: "Add a subject: the log and the GC's portal list RFIs by it." });
  if (!clean(f.drawings) && !clean(f.spec)) warnings.push({ field: "drawings", text: "Name the drawing sheet, detail or spec section. The reviewer starts there." });
  if (!clean(f.proposal)) warnings.push({ field: "proposal", text: "Offer a proposed answer if you have one. \"Proceed as proposed\" is the fastest answer a design team can give." });
  if (!impactText(f.impact)) warnings.push({ field: "impact", text: "Say whether you expect a cost or time impact. Many subcontracts set a deadline for notice of a change; the RFI is an early record of it." });
  const sent = parseDate(f.sent);
  const due = parseDate(f.due);
  if (!due) warnings.push({ field: "due", text: "Ask for an answer by a date, tied to when the work needs it." });
  else if (sent) {
    const d = days(sent, due);
    if (d < 0) warnings.push({ field: "due", text: "The answer date is before the date sent." });
    else if (d < 3 && !clean(f.reason)) warnings.push({ field: "due", text: `Answer needed in ${d} day${d === 1 ? "" : "s"}. Say why (what work is waiting) or the date will be treated as a wish.` });
  }
  if (!clean(f.to)) warnings.push({ field: "to", text: "Address it to the GC's project manager (or whoever the subcontract names). Subs usually send RFIs to the GC, not to the architect directly." });
  return warnings;
}

export function emailSubject(f) {
  const parts = [clean(f.project), rfiNumber(f.number), clean(f.subject)].filter(Boolean);
  return parts.join(" | ");
}

export function rfiText(f) {
  const line = (label, value) => (clean(value) ? `${label}: ${clean(value)}` : null);
  const head = [
    `REQUEST FOR INFORMATION ${rfiNumber(f.number)}`.trim(),
    line("Project", f.project),
    line("To", f.to),
    line("From", f.from),
    line("Date sent", f.sent),
    line("Subject", f.subject),
    line("Drawing / detail", f.drawings),
    line("Spec section", f.spec),
  ].filter(Boolean);
  const body = [];
  if (clean(f.question)) body.push("QUESTION", clean(f.question));
  if (clean(f.proposal)) body.push("", "PROPOSED ANSWER", clean(f.proposal));
  const tail = [];
  if (impactText(f.impact)) tail.push(`Cost or time impact: ${impactText(f.impact)}`);
  if (clean(f.due)) tail.push(`Answer needed by: ${clean(f.due)}${clean(f.reason) ? ` (${clean(f.reason)})` : ""}`);
  if (clean(f.attachments)) tail.push(`Attached: ${clean(f.attachments)}`);
  if (f.impact === "possible" || f.impact === "yes") {
    tail.push("", "This RFI does not authorize extra work. If the answer changes our scope, cost or time, we will submit a change order request before proceeding with the changed work.");
  }
  const response = ["", "RESPONSE (by the GC or design team)", "", "Answer:", "", "Answered by:                      Date:"];
  return [...head, "", ...body, ...(tail.length ? ["", ...tail] : []), ...response].join("\n");
}

export const EXAMPLE = {
  number: "4",
  project: "Riverside Clinic TI",
  to: "Dana Lee, Project Manager, Northline Builders",
  from: "Sam Ortiz, Ortiz Electric",
  sent: "2026-03-02",
  subject: "Ceiling height conflict at corridor 104",
  drawings: "A-501 detail 3; E-201",
  spec: "26 51 00",
  question: "A-501 detail 3 shows the corridor 104 ceiling at 9'-0\" AFF, but the duct shown on M-201 runs at 8'-10\" bottom, below the ceiling. The recessed fixtures on E-201 need 6\" above the ceiling grid. What ceiling height should we lay out the corridor 104 lighting to?",
  proposal: "Lower the corridor 104 ceiling to 8'-6\" AFF and use the 4\" deep fixture type B2 from the fixture schedule in place of type B.",
  impact: "possible",
  due: "2026-03-09",
  reason: "rough-in for corridor 104 starts 2026-03-11",
  attachments: "marked-up A-501 and E-201 (PDF), site photo of the duct",
};
