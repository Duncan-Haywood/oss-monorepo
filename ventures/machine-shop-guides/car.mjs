// Corrective action report (CAR) builder and checker for a small shop's quality system.
// Pure functions, no DOM, no network.
//
// The fields and the stage are the ones CMMC Workspace's corrective-action log keeps
// (ventures/cmmc/apps/cmmc/src/shared/internal-audits.ts: caStage, caIssues,
// correctiveActionLogCsv, suggestedVerifyDue), so a report made here can be typed into that log
// later with nothing missing. car.test.mjs pins the CSV header to that file.
//
// The review is what an auditor or a customer's supplier quality engineer sends back on a CAR.
// It reads words, not meaning: a root cause that blames a person, an action that is only
// retraining, a correction copied into the action. Every finding says why, and the page says the
// checks are pattern matches. No ISO 9001 text is reproduced; clauses are cited by number only.

export const SOURCES = {
  internal_audit: "Internal audit",
  external_audit: "Customer or registrar audit",
  customer_complaint: "Customer complaint",
  customer_return: "Returned or rejected parts",
  supplier: "Supplier problem",
  process: "Found in the shop (inspection, process)",
  other: "Other",
};

export const STAGE_LABEL = {
  cause: "Find the cause",
  action: "Take the action",
  verify: "Check it worked",
  not_effective: "Did not work: new action",
  closed: "Closed",
};

/** Same header as the workspace's corrective-action log CSV (car.test.mjs reads that file). */
export const CSV_HEAD = [
  "Reference", "Raised on", "Source", "ISO 9001 clause", "Nonconformity", "Correction (immediate)",
  "Root cause", "Corrective action", "Owner", "Action due", "Action done", "Check due", "Checked on",
  "Effective", "What was checked", "Stage", "Closed on",
];

/** Labels without reaching Object.prototype ("constructor", "toString"). */
export const sourceLabel = (k) => (Object.hasOwn(SOURCES, k) ? SOURCES[k] : "");
export const stageLabel = (k) => (Object.hasOwn(STAGE_LABEL, k) ? STAGE_LABEL[k] : "");

export const FIELDS = [
  "ref", "raisedOn", "source", "clause", "customer", "partNumber", "quantity", "nonconformity",
  "containment", "whys", "rootCause", "elsewhere", "action", "documents", "owner", "dueOn",
  "completedOn", "verifyDueOn", "verifiedOn", "effective", "verificationNotes", "closedOn",
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(s) {
  if (!ISO.test(String(s ?? ""))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** The workspace suggests checking an action worked 90 days after it is done. */
export const VERIFY_AFTER_DAYS = 90;
export const WARNING_DAYS = 14;

const str = (v) => String(v ?? "").trim();
const norm = (s) => str(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Turns whatever the form holds into a clean record: trimmed text, dates or "", effective true/false/null. */
export function normalise(input = {}) {
  const r = {};
  for (const k of FIELDS) r[k] = k === "whys" ? [] : "";
  for (const k of FIELDS) {
    if (k === "whys") continue;
    if (k === "effective") continue;
    r[k] = str(input[k]);
  }
  const whys = Array.isArray(input.whys) ? input.whys : String(input.whys ?? "").split(/\r?\n/);
  r.whys = whys.map(str).filter(Boolean).slice(0, 10);
  const e = input.effective;
  r.effective = e === true || e === "yes" ? true : e === false || e === "no" ? false : null;
  if (!Object.hasOwn(SOURCES, r.source)) r.source = r.source ? "other" : "";
  return r;
}

/** How far the action has got, read from what is filled in (the workspace's caStage). */
export function stage(r) {
  if (r.closedOn) return "closed";
  if (r.verifiedOn && r.effective === false) return "not_effective";
  if (!r.rootCause) return "cause";
  if (!r.completedOn) return "action";
  return "verify";
}

// A root cause that stops at a person. Auditors ask why the slip was possible and why it was not caught.
const BLAME = /\b(operator|human|employee|machinist|inspector|worker|someone|he|she|they)\s+(error|mistake|fault|forgot|did not|didn t|failed|was careless|missed)\b|\bhuman error\b|\boperator error\b|\bcareless(ness)?\b|\b(not|didn t|did not) follow(ing)? (the )?(procedure|instructions?|process)\b|\binattentive|\black of attention\b|\bnot paying attention\b/;
// An action that only tells people again.
const TRAIN = /\b(re ?train(ed|ing)?|train(ed|ing)?|remind(ed)?|reminder|counsel(l)?(ed|ing)?|coach(ed|ing)?|talked to|spoke (to|with)|told|re ?brief(ed)?|toolbox talk|be more careful|pay (more )?attention|retrain)\b/;
// A change to something other than people's memory: a verb that changes a thing.
const CHANGE = /\b(revis\w*|chang\w*|add(ed|ing)?|updat\w*|install\w*|replac\w*|introduc\w*|creat\w*|wr(o|i)te|written|reprogram\w*|programm?ed|increas\w*|reduc\w*|moved?|new|redesign\w*|fixtur\w*|poka|error ?proof\w*|mistake ?proof\w*|interlock\w*)\b/;

/**
 * What would get the report sent back, in the order a reader works down it.
 * Each finding: { field, kind: "gap" | "soon" | "note", message }.
 * gap: missing or wrong; soon: a date within 14 days; note: worth a second look.
 */
export function review(input, today) {
  const r = normalise(input);
  const out = [];
  const add = (field, kind, message) => out.push({ field, kind, message });
  const st = stage(r);

  if (!r.ref) add("ref", "note", "No reference number. A log needs one per report (CA-0001, CA-0002 ...) so audits and customers can point to it.");
  if (!r.raisedOn) add("raisedOn", "gap", "No date raised.");
  else if (!isIsoDate(r.raisedOn)) add("raisedOn", "gap", "The date raised is not a date.");
  else if (today && r.raisedOn > today) add("raisedOn", "gap", "The date raised is in the future.");
  if (!r.source) add("source", "note", "Where the problem came from is blank (audit, complaint, return, supplier, the shop floor).");

  // The nonconformity: what was found, against which requirement, how many.
  if (!r.nonconformity) add("nonconformity", "gap", "No description of the nonconformity: what was found, against which requirement (drawing, spec, PO, procedure), on how many parts.");
  else {
    if (r.nonconformity.length < 25) add("nonconformity", "note", "The description is very short. Say what the requirement was and what was found instead, so someone who was not there can follow it.");
    if (!/\d/.test(r.nonconformity) && !r.quantity) add("nonconformity", "note", "No number in the description and no quantity: how many parts, which dimension or what measured value?");
  }

  // Correction: what was done with the affected parts at once.
  if (!r.containment) add("containment", "gap", "No correction (containment): what was done at once with the affected parts and any others like them (quarantined, sorted, reworked, scrapped, customer told).");

  // Root cause.
  if (!r.rootCause) {
    if (r.action) add("rootCause", "gap", "An action is written but no root cause: the action has to answer a cause, or it treats the symptom.");
    else add("rootCause", "gap", "No root cause yet.");
  } else {
    const rc = norm(r.rootCause);
    if (r.nonconformity && (rc === norm(r.nonconformity) || norm(r.nonconformity).includes(rc) && rc.length > 0 && rc.split(" ").length < 6))
      add("rootCause", "gap", "The root cause restates the problem. Ask why it happened, and why it was not caught, until you reach something the shop can change.");
    if (BLAME.test(rc)) add("rootCause", "note", "The root cause stops at a person (operator error, did not follow the procedure). Auditors ask why the slip was possible and why the check did not catch it; keep asking why until you reach the process.");
    if (r.whys.length === 1) add("whys", "note", "One why is usually a symptom. Most root causes take three to five.");
    if (r.containment && rc === norm(r.containment)) add("rootCause", "gap", "The root cause is the same text as the correction.");
  }

  // Corrective action.
  if (r.rootCause && !r.action && st !== "closed") add("action", "gap", "No corrective action: what will change so the cause cannot come back.");
  if (r.action) {
    const a = norm(r.action);
    if (r.containment && (a === norm(r.containment)))
      add("action", "gap", "The corrective action repeats the correction. The correction deals with these parts; the corrective action removes the cause so it does not happen again.");
    if (TRAIN.test(a) && !CHANGE.test(a))
      add("action", "note", "The action is only training or a reminder. On its own it rarely stops a repeat; auditors look for a change to the process, the fixture, the check, the program or the document as well.");
    if (/^(n\/?a|none|tbd|to be determined|-|\.)$/i.test(r.action)) add("action", "gap", "The action says none or to be decided.");
  }
  if (!r.elsewhere && st !== "cause") add("elsewhere", "note", "Could the same thing happen on other parts, machines, jobs or shifts? ISO 9001 clause 10.2 asks you to look, and the answer belongs on the report (\"checked, none\" counts).");
  if (r.completedOn && !r.documents) add("documents", "note", "No documents named as changed. List the procedure, work instruction, setup sheet, control plan or PFMEA that now says the new way, or write none and why.");

  // People and dates.
  if (!r.owner && st !== "closed") add("owner", "note", "No owner: who is doing the action?");
  for (const [k, name] of [["dueOn", "action due date"], ["completedOn", "date the action was done"], ["verifyDueOn", "effectiveness check date"], ["verifiedOn", "date of the check"], ["closedOn", "date closed"]]) {
    if (r[k] && !isIsoDate(r[k])) add(k, "gap", `The ${name} is not a date.`);
  }
  const ok = (k) => r[k] && isIsoDate(r[k]);
  if (ok("completedOn") && ok("raisedOn") && r.completedOn < r.raisedOn) add("completedOn", "gap", "The action is dated before the problem was raised.");
  if (ok("completedOn") && today && r.completedOn > today) add("completedOn", "gap", "The action is dated in the future.");
  if (ok("verifiedOn") && ok("completedOn") && r.verifiedOn < r.completedOn) add("verifiedOn", "gap", "The effectiveness check is dated before the action was done.");
  if (ok("verifiedOn") && !r.completedOn) add("verifiedOn", "gap", "An effectiveness check is recorded but the action has no done date.");
  if (ok("verifiedOn") && today && r.verifiedOn > today) add("verifiedOn", "gap", "The check is dated in the future.");

  if ((st === "cause" || st === "action" || st === "not_effective") && !r.dueOn && r.raisedOn) add("dueOn", "note", "No due date for the action.");
  if ((st === "cause" || st === "action" || st === "not_effective") && ok("dueOn") && today) {
    const d = daysBetween(today, r.dueOn);
    if (d < 0) add("dueOn", "gap", `The action was due ${r.dueOn}.`);
    else if (d <= WARNING_DAYS) add("dueOn", "soon", `The action is due ${r.dueOn}.`);
  }
  if (st === "verify") {
    if (!r.verifyDueOn) add("verifyDueOn", "note", `No date set to check the action worked. ${VERIFY_AFTER_DAYS} days after it was done is a common choice${ok("completedOn") ? ` (${addDays(r.completedOn, VERIFY_AFTER_DAYS)})` : ""}.`);
    else if (ok("verifyDueOn") && today) {
      const d = daysBetween(today, r.verifyDueOn);
      if (d < 0) add("verifyDueOn", "gap", `The check that the action worked was due ${r.verifyDueOn}.`);
      else if (d <= WARNING_DAYS) add("verifyDueOn", "soon", `The check that the action worked is due ${r.verifyDueOn}.`);
    }
  }
  if (r.verifiedOn && r.effective === null) add("effective", "gap", "A check date is recorded but not whether the action worked.");
  if (r.effective !== null && !r.verifiedOn) add("verifiedOn", "gap", "Worked / did not work is set but the check has no date.");
  if (r.verifiedOn && !r.verificationNotes) add("verificationNotes", "gap", "Say what was checked: the parts, lots, records or period looked at, and what was found.");
  if (st === "not_effective") add("effective", "gap", "The check found the action did not work. Go back to the cause, record a new action, and check again.");
  if (r.closedOn) {
    if (r.effective !== true) add("closedOn", "gap", "Closed without a check that found the action worked.");
    if (ok("closedOn") && ok("verifiedOn") && r.closedOn < r.verifiedOn) add("closedOn", "gap", "Closed before the effectiveness check.");
  }
  return { record: r, stage: st, findings: out };
}

/** One line for the top of the result. */
export function summary(res) {
  const n = (k) => res.findings.filter((f) => f.kind === k).length;
  const g = n("gap"), s = n("soon"), o = n("note");
  const head = `${res.record.ref || "This report"}: ${stageLabel(res.stage).toLowerCase()}.`;
  if (!g && !s && !o) return `${head} Nothing an auditor would obviously send back.`;
  const parts = [];
  if (g) parts.push(`${g} to fix`);
  if (s) parts.push(`${s} due soon`);
  if (o) parts.push(`${o} worth a second look`);
  return `${head} ${parts.join(", ")}.`;
}

const md = (s) => str(s).replace(/([\\`*_[\]#|<>])/g, "\\$1");
const para = (s) => md(s).split(/\r?\n/).join("  \n") || "_(blank)_";

/** The report as Markdown (paste into an email, a ticket or a document). */
export function toMarkdown(res) {
  const r = res.record;
  const L = [];
  L.push(`# Corrective action report ${md(r.ref)}`.trimEnd(), "");
  const row = (k, v) => { if (str(v)) L.push(`- **${k}:** ${md(v)}`); };
  row("Raised on", r.raisedOn);
  row("Source", sourceLabel(r.source));
  row("ISO 9001 clause", r.clause);
  row("Customer", r.customer);
  row("Part number", r.partNumber);
  row("Quantity affected", r.quantity);
  row("Owner", r.owner);
  row("Stage", stageLabel(res.stage));
  L.push("", "## 1. Nonconformity", "", para(r.nonconformity));
  L.push("", "## 2. Correction (immediate)", "", para(r.containment));
  L.push("", "## 3. Root cause", "");
  if (r.whys.length) { r.whys.forEach((w, i) => L.push(`${i + 1}. Why? ${md(w)}`)); L.push(""); }
  L.push(para(r.rootCause));
  L.push("", "## 4. Could it happen elsewhere?", "", para(r.elsewhere));
  L.push("", "## 5. Corrective action", "", para(r.action));
  if (r.documents) L.push("", `Documents changed: ${md(r.documents)}`);
  L.push("", `Due: ${r.dueOn || "—"} · Done: ${r.completedOn || "—"}`);
  L.push("", "## 6. Effectiveness check", "", `Check due: ${r.verifyDueOn || "—"} · Checked on: ${r.verifiedOn || "—"} · Worked: ${r.effective === null ? "—" : r.effective ? "yes" : "no"}`);
  if (r.verificationNotes) L.push("", para(r.verificationNotes));
  if (r.closedOn) L.push("", `Closed on ${md(r.closedOn)}.`);
  if (res.findings.length) {
    L.push("", "## Open points", "");
    for (const f of res.findings) L.push(`- (${f.kind === "gap" ? "fix" : f.kind === "soon" ? "due soon" : "check"}) ${md(f.message)}`);
  }
  return `${L.join("\n")}\n`;
}

/** A spreadsheet would run a cell starting = + - @ as a formula; such a cell gets an apostrophe. */
export function csvCell(v) {
  const s = String(v ?? "");
  const guarded = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** One log row with the workspace's columns. The whys go in front of the root cause. */
export function toCsv(res) {
  const r = res.record;
  const cause = r.whys.length ? `${r.whys.map((w, i) => `Why ${i + 1}: ${w}`).join("\n")}\nRoot cause: ${r.rootCause}` : r.rootCause;
  const action = r.documents ? `${r.action}\nDocuments changed: ${r.documents}` : r.action;
  const nc = [r.nonconformity, r.partNumber && `Part: ${r.partNumber}`, r.quantity && `Quantity: ${r.quantity}`, r.customer && `Customer: ${r.customer}`].filter(Boolean).join("\n");
  const row = [
    r.ref, r.raisedOn, sourceLabel(r.source), r.clause, nc, r.containment, cause, action, r.owner,
    r.dueOn, r.completedOn, r.verifyDueOn, r.verifiedOn, r.effective === null ? "" : r.effective ? "Yes" : "No",
    r.verificationNotes, stageLabel(res.stage), r.closedOn,
  ];
  return `${[CSV_HEAD, row].map((x) => x.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** An invented example with the usual faults, for the "load an example" button. */
export const EXAMPLE = {
  ref: "CA-0007",
  raisedOn: "2026-11-02",
  source: "customer_return",
  clause: "10.2",
  customer: "Invented Aero Co.",
  partNumber: "EX-1042 rev C",
  quantity: "18 of 200",
  nonconformity: "Customer returned 18 brackets: Ø.375 +.001/-.000 bore measured .3742 to .3746, undersize.",
  containment: "Sorted the remaining 182 at the customer and in stock with a pin gauge; 18 rejects scrapped, 182 accepted and shipped with a sort record.",
  whys: "Bore was undersize\nThe boring bar wore past the offset during the run\nThe in-process check was every 50 parts, set when the job ran in aluminium\nThe job moved to 17-4 stainless and the setup sheet was not revised",
  rootCause: "Operator error: did not follow the procedure",
  elsewhere: "",
  action: "Retrained the operator on the inspection procedure.",
  documents: "",
  owner: "Quality lead",
  dueOn: "2026-11-20",
  completedOn: "2026-11-10",
  verifyDueOn: "",
  verifiedOn: "",
  effective: "",
  verificationNotes: "",
  closedOn: "",
};
