// SOC 2 readiness: score a self-assessment against the controls auditors most often test,
// rank the gaps, and turn the remaining effort into a rough timeline. Pure functions, no DOM,
// no network. Effort figures are planning defaults for a small SaaS team, not quotes.

export const AREAS = {
  gov: "Governance and risk",
  hr: "People",
  ac: "Access control",
  cm: "Change management",
  op: "Operations and monitoring",
  dt: "Data protection",
  ir: "Incident response",
  vm: "Vendors",
  av: "Availability",
  cf: "Confidentiality",
  pr: "Privacy",
};

// scope: "security" is always in; the others only when chosen. w = how hard an auditor leans on it (3 = commonly an
// exception or a blocker), days = rough remaining effort if the control is entirely missing.
export const CONTROLS = [
  { id: "gov-policies", area: "gov", w: 3, days: 3, scope: "security", title: "Written security policies approved by management and reviewed yearly", evidence: "Approved policy documents with version history and review date" },
  { id: "gov-roles", area: "gov", w: 2, days: 1, scope: "security", title: "A named security owner and documented responsibilities", evidence: "Org chart or role document naming who owns security" },
  { id: "gov-risk", area: "gov", w: 3, days: 3, scope: "security", title: "Annual risk assessment with a risk register and treatment decisions", evidence: "Risk register with owners, ratings and accepted or mitigated decisions" },
  { id: "gov-oversight", area: "gov", w: 1, days: 1, scope: "security", title: "Leadership reviews security at least once a year", evidence: "Minutes or slides from a leadership or board security review" },
  { id: "gov-aup", area: "gov", w: 2, days: 1, scope: "security", title: "Acceptable use policy and code of conduct acknowledged by every employee", evidence: "Signed or logged acknowledgements per employee" },
  { id: "hr-bg", area: "hr", w: 2, days: 1, scope: "security", title: "Background checks on new hires, where lawful", evidence: "Check completion record per hire" },
  { id: "hr-training", area: "hr", w: 3, days: 2, scope: "security", title: "Security awareness training at hire and yearly, with completion tracked", evidence: "Training completion report covering all staff" },
  { id: "hr-offboard", area: "hr", w: 3, days: 2, scope: "security", title: "Onboarding and offboarding checklists; access removed within a business day of leaving", evidence: "Completed checklist per joiner and leaver with timestamps" },
  { id: "ac-mfa", area: "ac", w: 3, days: 1, scope: "security", title: "MFA enforced for email, cloud console, code host and production access", evidence: "Identity provider or admin console screenshots showing enforcement" },
  { id: "ac-sso", area: "ac", w: 2, days: 4, scope: "security", title: "Central identity provider or SSO for company systems", evidence: "List of systems behind SSO and the provider's user export" },
  { id: "ac-review", area: "ac", w: 3, days: 2, scope: "security", title: "Quarterly user access reviews, with removals recorded", evidence: "Dated review of users and permissions per critical system, signed off" },
  { id: "ac-least", area: "ac", w: 3, days: 4, scope: "security", title: "Production access by role and least privilege; no shared accounts", evidence: "Role definitions and a list of who can reach production" },
  { id: "ac-passwords", area: "ac", w: 1, days: 1, scope: "security", title: "Password manager or enforced password policy", evidence: "Password manager admin report or configured policy" },
  { id: "cm-review", area: "cm", w: 3, days: 1, scope: "security", title: "Every code change reviewed by a second person; branch protection on", evidence: "Branch protection settings and a sample of merged pull requests" },
  { id: "cm-cicd", area: "cm", w: 2, days: 3, scope: "security", title: "Automated tests and a CI/CD pipeline; deploys traceable to a change", evidence: "Pipeline configuration and deploy history linked to pull requests" },
  { id: "cm-separation", area: "cm", w: 2, days: 2, scope: "security", title: "Developers cannot push straight to production without approval", evidence: "Deploy permissions and approval gate configuration" },
  { id: "op-logging", area: "op", w: 3, days: 3, scope: "security", title: "Central logs of sign-ins, admin actions and production events, kept a year", evidence: "Log platform retention settings and a sample query" },
  { id: "op-monitoring", area: "op", w: 2, days: 3, scope: "security", title: "Monitoring and alerting with someone on call", evidence: "Alert rules, on-call schedule and a handled alert" },
  { id: "op-vuln", area: "op", w: 3, days: 3, scope: "security", title: "Vulnerability scanning of infrastructure and dependencies, with fix deadlines", evidence: "Scan reports and tickets showing remediation within the stated deadline" },
  { id: "op-pentest", area: "op", w: 2, days: 5, scope: "security", title: "Independent penetration test at least yearly", evidence: "Tester's report and remediation notes" },
  { id: "op-endpoint", area: "op", w: 3, days: 3, scope: "security", title: "Laptops managed: disk encryption, screen lock and patching enforced", evidence: "MDM or device inventory report showing compliance per device" },
  { id: "op-network", area: "op", w: 2, days: 2, scope: "security", title: "Production network segmented; firewall rules reviewed", evidence: "Network diagram and a dated rule review" },
  { id: "dt-rest", area: "dt", w: 3, days: 1, scope: "security", title: "Production data and backups encrypted at rest", evidence: "Cloud settings showing encryption on databases, volumes and buckets" },
  { id: "dt-transit", area: "dt", w: 3, days: 1, scope: "security", title: "TLS on all customer and internal traffic", evidence: "TLS configuration scan of public endpoints" },
  { id: "dt-backup", area: "dt", w: 3, days: 2, scope: "security", title: "Automated backups and a restore test at least yearly", evidence: "Backup schedule and a record of a successful restore" },
  { id: "dt-retention", area: "dt", w: 2, days: 2, scope: "security", title: "Data classification and a retention and deletion policy", evidence: "Policy plus evidence a deletion was carried out" },
  { id: "dt-secrets", area: "dt", w: 2, days: 2, scope: "security", title: "Secrets in a secrets manager, not in code; rotated", evidence: "Secrets manager inventory and a code scan for leaked secrets" },
  { id: "ir-plan", area: "ir", w: 3, days: 2, scope: "security", title: "Documented incident response plan with roles and severity levels", evidence: "Plan document and the last review date" },
  { id: "ir-exercise", area: "ir", w: 2, days: 1, scope: "security", title: "Incident response exercise or a real incident review each year", evidence: "Exercise notes or a post-incident review with actions" },
  { id: "ir-notify", area: "ir", w: 1, days: 1, scope: "security", title: "Process to notify affected customers of a breach", evidence: "Notification procedure and template" },
  { id: "vm-inventory", area: "vm", w: 2, days: 1, scope: "security", title: "Vendor inventory with a risk tier for each", evidence: "Vendor list with data access and tier" },
  { id: "vm-review", area: "vm", w: 2, days: 2, scope: "security", title: "Yearly review of critical vendors, including their SOC 2 or equivalent", evidence: "Dated vendor review with the report obtained" },
  { id: "vm-terms", area: "vm", w: 1, days: 1, scope: "security", title: "Security commitments and data processing terms in customer contracts", evidence: "Standard terms and a signed data processing addendum" },
  { id: "av-dr", area: "av", w: 2, days: 3, scope: "availability", title: "Business continuity and disaster recovery plan, tested", evidence: "Plan and a test record with recovery times" },
  { id: "av-capacity", area: "av", w: 1, days: 1, scope: "availability", title: "Capacity monitoring and a stated uptime commitment", evidence: "Capacity dashboards and uptime history" },
  { id: "cf-nda", area: "cf", w: 2, days: 1, scope: "confidentiality", title: "NDAs with employees, contractors and vendors who see confidential data", evidence: "Signed NDA per person or vendor" },
  { id: "cf-disposal", area: "cf", w: 1, days: 1, scope: "confidentiality", title: "Secure disposal of confidential data and devices", evidence: "Disposal records or deletion confirmations" },
  { id: "pr-notice", area: "pr", w: 2, days: 2, scope: "privacy", title: "Privacy notice and a process for access and deletion requests", evidence: "Published notice and a request log" },
];

export const ANSWERS = ["yes", "partial", "no", "na"];
const SCORE = { yes: 1, partial: 0.5, no: 0 };

function normAnswer(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (["yes", "y", "done", "true", "1"].includes(s)) return "yes";
  if (["partial", "p", "some", "half", "in progress", "wip"].includes(s)) return "partial";
  if (["no", "n", "not yet", "false", "0", ""].includes(s)) return "no";
  if (["na", "n/a", "not applicable"].includes(s)) return "na";
  return null;
}

// Accepts {id: answer} or CSV text "id,answer" (a header row is tolerated, '#' lines are ignored).
export function parseAnswers(input) {
  const out = {}, unknown = [], bad = [];
  let pairs;
  if (input && typeof input === "object") pairs = Object.entries(input);
  else {
    const text = String(input ?? "").trim();
    if (text.startsWith("{")) {
      try { pairs = Object.entries(JSON.parse(text)); } catch { return { error: "That is not valid JSON.", answers: {}, unknown, bad }; }
    } else {
      pairs = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/[,\t]/).map((x) => x.trim()));
    }
  }
  const known = new Set(CONTROLS.map((c) => c.id));
  for (const [id, raw] of pairs) {
    if (String(id).toLowerCase() === "id" || String(id).toLowerCase() === "control") continue;
    if (!known.has(id)) { unknown.push(id); continue; }
    const a = normAnswer(raw);
    if (a === null) { bad.push(`${id}: "${raw}"`); continue; }
    out[id] = a;
  }
  return { answers: out, unknown, bad };
}

function addWeeks(iso, weeks) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  const base = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : Date.UTC(2026, 0, 1);
  return new Date(base + Math.round(weeks * 7) * 86400000).toISOString().slice(0, 10);
}
function addMonths(iso, months) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// opts: { scopes: ["availability",...], daysPerWeek: team days/week on this, effortScale: 1, start: "YYYY-MM-DD", windowMonths: 6 }
export function assess(answers, opts = {}) {
  const scopes = new Set(["security", ...(opts.scopes || [])]);
  const daysPerWeek = Math.max(0.5, Number(opts.daysPerWeek) || 3);
  const scale = Math.max(0.25, Number(opts.effortScale) || 1);
  const windowMonths = [3, 6, 9, 12].includes(Number(opts.windowMonths)) ? Number(opts.windowMonths) : 6;
  const start = opts.start || new Date().toISOString().slice(0, 10);

  const rows = [];
  const unanswered = [];
  for (const c of CONTROLS) {
    if (!scopes.has(c.scope)) continue;
    let a = answers[c.id];
    if (a === undefined) { unanswered.push(c.id); a = "no"; }
    rows.push({ ...c, answer: a, score: a === "na" ? null : SCORE[a], remaining: a === "na" ? 0 : c.days * scale * (1 - SCORE[a]) });
  }
  const live = rows.filter((r) => r.answer !== "na");
  const wTotal = live.reduce((s, r) => s + r.w, 0);
  const wDone = live.reduce((s, r) => s + r.w * r.score, 0);
  const readiness = wTotal ? Math.round((wDone / wTotal) * 1000) / 10 : 0;

  const byArea = {};
  for (const r of live) {
    const a = (byArea[r.area] ||= { area: r.area, name: AREAS[r.area], w: 0, done: 0, gaps: 0 });
    a.w += r.w; a.done += r.w * r.score; if (r.score < 1) a.gaps++;
  }
  const areas = Object.values(byArea).map((a) => ({ area: a.area, name: a.name, readiness: Math.round((a.done / a.w) * 1000) / 10, gaps: a.gaps }))
    .sort((x, y) => x.readiness - y.readiness);

  const blockers = live.filter((r) => r.w === 3 && r.answer === "no");
  const naHeavy = rows.filter((r) => r.answer === "na").length;

  // Order: highest weight x missing share per day of effort first, so cheap high-value fixes come early.
  const gaps = live.filter((r) => r.score < 1).map((r) => ({ ...r, value: (r.w * (1 - r.score)) / Math.max(r.remaining, 0.25) }))
    .sort((x, y) => y.value - x.value || y.w - x.w || x.id.localeCompare(y.id));
  let cum = 0;
  for (const g of gaps) { cum += g.remaining; g.finishWeek = Math.ceil((cum / daysPerWeek) * 10) / 10; g.finishDate = addWeeks(start, g.finishWeek); }
  const totalDays = Math.round(cum * 10) / 10;
  const weeks = Math.ceil((cum / daysPerWeek) * 10) / 10;
  const typeIReady = addWeeks(start, weeks);
  const typeIIReport = addMonths(typeIReady, windowMonths);

  const advice = [];
  if (!gaps.length) advice.push("Every in-scope control is marked done. The remaining work is collecting evidence for each one and choosing an auditor.");
  else {
    advice.push(`Readiness is ${readiness}% across ${live.length} controls. About ${totalDays} person-days of work remain, which is ${weeks} weeks at ${daysPerWeek} days a week.`);
    if (blockers.length) advice.push(`${blockers.length} control${blockers.length === 1 ? "" : "s"} that auditors most often test ${blockers.length === 1 ? "is" : "are"} not started: ${blockers.slice(0, 4).map((b) => b.title.toLowerCase()).join("; ")}${blockers.length > 4 ? "; and more" : ""}.`);
    advice.push(`A Type II report needs the controls operating for the whole observation window. Starting the window on ${typeIReady} with a ${windowMonths}-month window puts the earliest report around ${typeIIReport}.`);
  }
  if (unanswered.length) advice.push(`${unanswered.length} control${unanswered.length === 1 ? "" : "s"} had no answer and ${unanswered.length === 1 ? "was" : "were"} counted as not done.`);
  if (naHeavy > 4) advice.push(`${naHeavy} controls are marked not applicable. An auditor will ask why for each, so write the reason down.`);

  return {
    readiness, areas, gaps, blockers, rows, unanswered,
    summary: { controls: live.length, done: live.filter((r) => r.score === 1).length, partial: live.filter((r) => r.score === 0.5).length, missing: live.filter((r) => r.score === 0).length, na: naHeavy, totalDays, weeks, typeIReady, typeIIReport, windowMonths },
    advice,
  };
}

export function sampleAnswers() {
  const yes = ["gov-roles", "hr-training", "ac-mfa", "ac-passwords", "cm-review", "cm-cicd", "dt-rest", "dt-transit", "op-monitoring", "vm-inventory", "dt-secrets"];
  const partial = ["gov-policies", "hr-offboard", "ac-sso", "ac-least", "op-logging", "op-vuln", "dt-backup", "ir-plan", "hr-bg", "op-endpoint"];
  const out = {};
  for (const c of CONTROLS) out[c.id] = yes.includes(c.id) ? "yes" : partial.includes(c.id) ? "partial" : "no";
  return out;
}

export function toCsv(r) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["order,control,area,answer,weight,remaining_days,finish_week,finish_date,evidence_to_collect"];
  r.gaps.forEach((g, i) => lines.push([i + 1, q(g.title), q(AREAS[g.area]), g.answer, g.w, Math.round(g.remaining * 10) / 10, g.finishWeek, g.finishDate, q(g.evidence)].join(",")));
  return lines.join("\n");
}

export const pct = (n) => `${n.toFixed(1)}%`;
