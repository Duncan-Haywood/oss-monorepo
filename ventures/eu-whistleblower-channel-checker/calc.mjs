// EU Whistleblower Directive (Directive (EU) 2019/1937) first read for an employer: does an
// internal reporting channel have to exist at your headcount, which of the channel
// requirements are still open, and (optionally) the two statutory clocks for one report:
// acknowledgement within 7 days, feedback within 3 months. Pure functions, no I/O. Bad input
// is rejected with a message, never clamped. Member States transposed the Directive
// differently and many go further (lower thresholds, anonymous reports, fines); the answer is
// a first read. Article numbers and periods were written from the published text without
// network access in the building session and must be checked against the Directive
// (CELEX 32019L1937) and your national law before being quoted.

export const REQUIREMENTS = [
  { id: "written", label: "Reports can be made in writing (online form, email or post)", article: "Art 9(2)" },
  { id: "oral", label: "Reports can be made orally by phone or voice message", article: "Art 9(2)" },
  { id: "meeting", label: "A physical meeting is offered within a reasonable time on request", article: "Art 9(2)" },
  { id: "confidential", label: "The channel is designed and run so the reporter's identity and any third party named stay confidential, with access limited to authorised staff", article: "Art 9(1)(a), Art 16" },
  { id: "ack", label: "Every report is acknowledged to the reporter within 7 days", article: "Art 9(1)(b)" },
  { id: "designated", label: "An impartial person or department is designated to receive reports and follow up", article: "Art 9(1)(c)" },
  { id: "followup", label: "Diligent follow-up of each report is done and documented", article: "Art 9(1)(d)" },
  { id: "feedback", label: "The reporter gets feedback within 3 months of the acknowledgement", article: "Art 9(1)(f)" },
  { id: "external", label: "Clear, easy-to-find information on external reporting to the competent authorities is published", article: "Art 9(1)(g)" },
  { id: "records", label: "Every report is recorded, kept only as long as necessary and proportionate, with confidentiality preserved", article: "Art 18" },
  { id: "retaliation", label: "A written no-retaliation rule exists and managers know retaliation (dismissal, demotion, threats) is prohibited", article: "Art 19" },
  { id: "dataProtection", label: "Reports are processed under GDPR: privacy notice, minimal data, no collection of irrelevant personal data", article: "Art 17" },
];

export const SECTORS = {
  private: "Private-sector employer",
  public: "Public-sector body",
  financial: "Financial services, anti-money-laundering or similar regulated entity",
};

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);

function parseDate(raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw || ""))) return null;
  const d = new Date(raw + "T00:00:00Z");
  return Number.isNaN(d.getTime()) || iso(d) !== raw ? null : d;
}

// Add whole calendar months in UTC, clamping to the month end (31 Jan + 1 month = 28/29 Feb).
export function addMonths(d, n) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
}

// Does an internal channel have to exist? Art 8.
export function obligation(headcount, sector, shared) {
  if (sector === "financial") return { required: true, basis: "Regulated financial-services entities must have a channel whatever their size (Art 8(4)).", article: "Art 8(4)", sharing: false };
  if (sector === "public") {
    return { required: true, basis: "Public-sector bodies must have a channel. A Member State may exempt municipalities under 10,000 inhabitants or under 50 workers (Art 8(9)); check national law.", article: "Art 8(9)", sharing: headcount < 250 };
  }
  if (headcount >= 250) return { required: true, basis: "Private employers with 250 or more workers must have an internal channel (Art 8(3)). It applied from 17 December 2021.", article: "Art 8(3)", sharing: false };
  if (headcount >= 50) return { required: true, basis: "Private employers with 50 to 249 workers must have an internal channel (Art 8(3)). It applied from 17 December 2023 (Art 26(2)).", article: "Art 8(3), Art 26(2)", sharing: true };
  return { required: false, basis: "Private employers under 50 workers have no duty under the Directive, but a Member State may set a lower threshold, and workers can still report externally and are protected. Check national law.", article: "Art 8(3)", sharing: false };
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const headcount = Number(i.headcount);
  if (i.headcount === "" || i.headcount == null || !Number.isInteger(headcount) || headcount < 1 || headcount > 5000000) errors.push("Enter your number of workers as a whole number of 1 or more.");
  const sector = Object.hasOwn(SECTORS, i.sector) ? i.sector : "private";
  const shared = i.shared === "yes";
  const done = {};
  for (const r of REQUIREMENTS) done[r.id] = Boolean(i[r.id]) && i[r.id] !== "0";
  const received = i.received ? parseDate(i.received) : null;
  if (i.received && !received) errors.push("Report received date must be a real date in YYYY-MM-DD form.");
  const acknowledged = i.acknowledged ? parseDate(i.acknowledged) : null;
  if (i.acknowledged && !acknowledged) errors.push("Acknowledgement date must be a real date in YYYY-MM-DD form.");
  if (acknowledged && !received) errors.push("Enter the date the report was received before the acknowledgement date.");
  if (acknowledged && received && acknowledged < received) errors.push("The acknowledgement date cannot be before the date the report was received.");
  const today = i.today ? parseDate(i.today) : new Date();
  if (i.today && !today) errors.push("Today must be a real date in YYYY-MM-DD form.");
  return { errors, headcount, sector, shared, done, received, acknowledged, today };
}

// The two clocks for one report. Acknowledgement: 7 days from receipt. Feedback: 3 months from the
// acknowledgement, or if none was sent, 3 months from the end of the 7-day period (Art 9(1)(f)).
export function clocks(p) {
  if (!p.received) return null;
  const ackDue = new Date(p.received.getTime() + 7 * DAY);
  const feedbackFrom = p.acknowledged || ackDue;
  const feedbackDue = addMonths(feedbackFrom, 3);
  const today = new Date(Date.UTC(p.today.getUTCFullYear(), p.today.getUTCMonth(), p.today.getUTCDate()));
  const days = (d) => Math.round((d - today) / DAY);
  return {
    ackDue: iso(ackDue), ackLate: !p.acknowledged && today > ackDue, ackLateOnSend: Boolean(p.acknowledged) && p.acknowledged > ackDue,
    ackDaysLeft: p.acknowledged ? null : days(ackDue),
    feedbackFrom: iso(feedbackFrom), feedbackDue: iso(feedbackDue), feedbackLate: today > feedbackDue, feedbackDaysLeft: days(feedbackDue),
  };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const ob = obligation(p.headcount, p.sector, p.shared);
  const open = REQUIREMENTS.filter((r) => !p.done[r.id]);
  const c = clocks(p);
  const findings = [];
  findings.push({ severity: "info", title: "Your national whistleblower law, not the Directive itself, binds you. Many Member States set lower thresholds, require anonymous reports to be handled, or add fines; check how yours transposed it." });
  findings.push({ severity: ob.required ? "high" : "info", title: ob.basis });
  if (ob.required && ob.sharing && p.sector === "private") {
    findings.push({ severity: "info", title: p.shared ? "With 50 to 249 workers you may share one channel and its resources with other employers (Art 8(6)). Each employer still has to keep its own confidentiality, feedback and follow-up duties." : "With 50 to 249 workers you may share one channel and its resources with other employers (Art 8(6)), which is often cheaper than running your own." });
  }
  if (ob.required) for (const r of open) findings.push({ severity: r.id === "ack" || r.id === "feedback" || r.id === "confidential" ? "high" : "medium", title: `Open: ${r.label} (${r.article}).` });
  if (ob.required && open.length === 0) findings.push({ severity: "info", title: "Every channel requirement is marked done. Keep the evidence (policy, test report, training record): the burden of proof in a retaliation case is on the employer (Art 21(5))." });
  if (c) {
    if (c.ackLate) findings.push({ severity: "high", title: `Acknowledgement was due ${c.ackDue} and is not recorded. Acknowledge now and keep the date (Art 9(1)(b)).` });
    else if (c.ackLateOnSend) findings.push({ severity: "medium", title: `The acknowledgement was sent after the 7-day limit (${c.ackDue}). Record why and fix the process.` });
    else if (c.ackDaysLeft != null) findings.push({ severity: c.ackDaysLeft <= 2 ? "high" : "medium", title: `Acknowledge the reporter by ${c.ackDue} (${c.ackDaysLeft} day${Math.abs(c.ackDaysLeft) === 1 ? "" : "s"} left).` });
    findings.push({ severity: c.feedbackLate ? "high" : "info", title: c.feedbackLate ? `Feedback was due ${c.feedbackDue} and is overdue (Art 9(1)(f)).` : `Give the reporter feedback by ${c.feedbackDue} (${c.feedbackDaysLeft} days left): what was done, or is planned, in response.` });
  }
  return { input: p, obligation: ob, required: ob.required, open, clocks: c, findings };
}

export const SAMPLE = {
  headcount: "120", sector: "private", shared: "no", written: "1", oral: "", meeting: "", confidential: "1", ack: "", designated: "1",
  followup: "", feedback: "", external: "", records: "1", retaliation: "", dataProtection: "1", received: "2026-09-01", acknowledged: "", today: "2026-10-13",
};

export function summaryText(r) {
  const lines = [
    "EU Whistleblower Directive check (first read, not legal advice)",
    `Workers: ${r.input.headcount} (${SECTORS[r.input.sector]})`,
    `Internal channel required: ${r.required ? "yes" : "not under the Directive"} [${r.obligation.article}]`,
  ];
  if (r.required && r.open.length) lines.push("", "Open requirements:", ...r.open.map((d) => `  - ${d.label} (${d.article})`));
  if (r.clocks) {
    lines.push("", "Report clocks:", `  Acknowledge by: ${r.clocks.ackDue}${r.clocks.ackLate ? "  <-- overdue" : ""}`, `  Feedback by:    ${r.clocks.feedbackDue}${r.clocks.feedbackLate ? "  <-- overdue" : ""}`);
  }
  lines.push("", "Confirm with your national authority or counsel.");
  return lines.join("\n");
}

export function requirementsCsv(r) {
  const q = (c) => `"${String(c).replace(/"/g, '""')}"`;
  return ["requirement,article,status", ...REQUIREMENTS.map((d) => [d.label, d.article, r.open.includes(d) ? "open" : "done"].map(q).join(","))].join("\n");
}
