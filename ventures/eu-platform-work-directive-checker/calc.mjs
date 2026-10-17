// EU Platform Work Directive (Directive (EU) 2024/2831): is a gig/app platform in
// scope, how strong is the case that its workers are presumed employees, and which
// algorithmic-management rules does the platform's tooling run into. Pure functions,
// no I/O. Bad input is rejected with a message, never clamped.
// Written from memory of the Directive WITHOUT network access in the building
// session. The Directive leaves the facts that trigger the employment presumption
// to national law, so the "indicator count" below is a heuristic for reading your
// own facts, not a legal threshold. Every result names a source to verify.

export const TRANSPOSITION_DEADLINE = "2026-12-02";
export const VERIFY = "Directive (EU) 2024/2831 on improving working conditions in platform work (Chapter II employment status, Chapter III algorithmic management, Chapter IV transparency) and your Member State's transposition law";

export const ROLES = [
  { id: "operator", label: "I run or advise a platform" },
  { id: "worker", label: "I do work through a platform" },
];

export const SCOPE_QUESTIONS = [
  { id: "viaApp", label: "The service is delivered through a website or app, at a distance" },
  { id: "onRequest", label: "It is provided at the request of the customer (the person or business buying)" },
  { id: "organisesWork", label: "The platform organises the work done by individuals (matches, prices, assigns or rates it)" },
  { id: "automated", label: "It uses automated monitoring or automated decision-making to do so" },
];

export const CONTROL_INDICATORS = [
  { id: "paySet", label: "The platform sets or caps the pay level" },
  { id: "conduct", label: "The platform imposes rules on conduct, appearance or how the work is done" },
  { id: "supervised", label: "Work or quality is supervised or checked electronically (ratings, tracking, scores)" },
  { id: "restrictedFreedom", label: "Freedom to choose hours, refuse tasks or send a substitute is restricted (penalties, lost visibility)" },
  { id: "restrictedClients", label: "Workers are limited in building their own client base or working for others" },
];

export const SYSTEMS = [
  { id: "autoDecisions", label: "Automated decisions can restrict, suspend or close an account, or change pay" },
  { id: "emotion", label: "The system infers emotional or psychological state" },
  { id: "privateComms", label: "The platform processes private conversations (including with worker representatives)" },
  { id: "biometricId", label: "Biometric data is matched against a stored record to identify a worker" },
  { id: "offShift", label: "Personal data is collected while the worker is not offering or doing platform work" },
];

const YN = new Set(["yes", "no"]);
const isYes = (v) => v === true || v === "yes";

export function parse(input) {
  const i = input || {};
  const errors = [];
  const role = ROLES.find((r) => r.id === i.role);
  if (!role) errors.push("Choose whether you run a platform or work through one.");
  const flags = {};
  for (const q of [...SCOPE_QUESTIONS, ...CONTROL_INDICATORS, ...SYSTEMS]) {
    const v = i[q.id] === undefined || i[q.id] === "" ? "no" : i[q.id];
    if (typeof v === "boolean") flags[q.id] = v;
    else if (YN.has(v)) flags[q.id] = v === "yes";
    else errors.push(`Answer yes or no: ${q.label}.`);
  }
  let asOf = i.asOf ? new Date(`${i.asOf}T00:00:00Z`) : null;
  if (i.asOf && Number.isNaN(asOf.getTime())) { errors.push("Enter today's date as YYYY-MM-DD."); asOf = null; }
  return { errors, role: role ? role.id : "", flags, asOf };
}

export function daysToDeadline(asOf) {
  const d = new Date(`${TRANSPOSITION_DEADLINE}T00:00:00Z`);
  return Math.round((d - asOf) / 86400000);
}

export function strength(count) {
  if (count === 0) return { level: "none", text: "No control indicators: nothing here points to a presumption of employment." };
  if (count === 1) return { level: "weak", text: "One control indicator: a single factor is unlikely on its own to be treated as control and direction, but it is the one to watch." };
  if (count <= 3) return { level: "arguable", text: `${count} control indicators: arguable. Whether this triggers the presumption depends on how your Member State defines the facts that count; a worker could plausibly invoke it and a platform would have to rebut.` };
  return { level: "strong", text: `${count} of 5 control indicators: a strong case that facts indicating control and direction exist. Expect the presumption to apply in most Member States, leaving the platform to prove the relationship is not employment.` };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const f = p.flags;
  const findings = [];
  const failed = SCOPE_QUESTIONS.filter((q) => !f[q.id]);
  const inScope = failed.length === 0;
  const borderline = failed.length === 1 && failed[0].id === "automated";
  const count = CONTROL_INDICATORS.filter((q) => f[q.id]).length;
  const str = strength(count);
  const days = p.asOf ? daysToDeadline(p.asOf) : null;
  const op = p.role === "operator";

  if (inScope) {
    findings.push({ severity: "high", title: "Likely a digital labour platform: all four scope tests are met (remote delivery, on customer request, organises work by individuals, uses automated monitoring or decisions). The Directive's rules are likely to apply to it." });
  } else if (borderline) {
    findings.push({ severity: "medium", title: "Borderline: the platform does not use automated monitoring or decision-making, which is the test most often argued. Ratings that rank workers, automatic matching or price setting count as automated decision-making for most readings. Check what your systems really do." });
  } else {
    findings.push({ severity: "info", title: `Probably out of scope: ${failed.map((q) => q.label.toLowerCase()).join("; ")} is not met. Services that only provide payments, listings or rented resources, without organising work done by individuals, are generally outside the Directive.` });
  }

  if (inScope || borderline) {
    findings.push({ severity: str.level === "strong" ? "high" : str.level === "arguable" ? "medium" : "info", title: `Employment presumption: ${str.text}` });
    findings.push({ severity: "info", title: "The presumption is rebuttable and shifts the burden of proof to the platform; it does not itself make anyone an employee. The Directive leaves the triggering facts to national law and collective agreements, and Member States may limit it in tax, criminal and social-security proceedings. The five indicators here are a reading aid, not the legal test." });

    const banned = SYSTEMS.filter((s) => f[s.id] && s.id !== "autoDecisions");
    for (const s of banned) {
      findings.push({ severity: "high", title: op ? `Restricted processing: ${s.label.toLowerCase()}. The Directive prohibits this kind of processing by platforms; stop or get specialist advice before the transposition date.` : `Ask about it: ${s.label.toLowerCase()}. The Directive prohibits platforms from processing data like this, and you can raise it with the platform, a representative or the labour authority.` });
    }
    if (f.autoDecisions) {
      findings.push({ severity: "medium", title: op ? "Automated decisions that restrict, suspend, close an account or change pay need a written statement of reasons, a human contact person and a right to human review. Build the notice and the review path before the transposition date." : "If an automated decision restricts, suspends or closes your account or changes your pay, you can ask for a written statement of reasons and for a human to review it. Keep the decision notice." });
    }
    findings.push({ severity: "medium", title: op ? "Transparency duties: tell workers which automated monitoring and decision systems you use and what they decide, consult worker representatives, and declare platform work to the competent labour authority where the work is done. Most algorithmic-management rules reach genuinely self-employed workers as well." : "You are entitled to information about the automated systems that monitor you or decide about you, whether you are classified as employed or self-employed. Representatives can ask for it too." });
  }

  if (days !== null) {
    findings.push({ severity: days <= 0 ? "info" : days <= 120 ? "high" : "medium", title: days > 0 ? `Member States must have transposed the Directive by ${TRANSPOSITION_DEADLINE}: ${days} day${days === 1 ? "" : "s"} from the date entered. National laws may differ from the text and some may arrive late; check yours.` : `The transposition date (${TRANSPOSITION_DEADLINE}) has passed. National laws should now be in force; check your Member State's law and its entry date.` });
  }
  findings.push({ severity: "info", title: "This covers the EU Directive only. National rules on worker classification (for example court tests in Spain, Germany, France, the Netherlands and Italy) already apply and may be stricter." });

  return { errors: [], input: p, inScope, borderline, indicators: count, strength: str, days, findings };
}

export const SAMPLE = { role: "operator", viaApp: "yes", onRequest: "yes", organisesWork: "yes", automated: "yes", paySet: "yes", conduct: "no", supervised: "yes", restrictedFreedom: "yes", restrictedClients: "no", autoDecisions: "yes", emotion: "no", privateComms: "no", biometricId: "no", offShift: "no", asOf: "2026-10-13" };

export function summaryText(r) {
  return [
    "EU Platform Work Directive check (first read, not legal advice)",
    `In scope as a digital labour platform: ${r.inScope ? "yes" : r.borderline ? "borderline" : "probably not"}`,
    `Control indicators: ${r.indicators} of ${CONTROL_INDICATORS.length} (${r.strength.level})`,
    r.strength.text,
    r.days === null ? "" : r.days > 0 ? `Transposition deadline ${TRANSPOSITION_DEADLINE}: ${r.days} days from the date entered.` : `Transposition deadline ${TRANSPOSITION_DEADLINE} has passed.`,
    `Verify against: ${VERIFY}`,
    "",
    "Confirm with a qualified employment lawyer or your labour authority.",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}
