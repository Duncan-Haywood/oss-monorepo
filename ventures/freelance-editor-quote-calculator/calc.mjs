// Freelance editor / proofreader quote maths. Pure functions, no DOM, no network.
// Paces are editable inputs: defaults are rule-of-thumb figures, not a published standard.

export const LEVELS = {
  proofread: { label: "Proofreading", pace: 2000, note: "typos, punctuation, formatting slips on a near-final text" },
  copyedit: { label: "Copyediting", pace: 1000, note: "grammar, consistency, style sheet, light fact flags" },
  line: { label: "Line editing", pace: 600, note: "sentence-level rewrite for voice, flow and clarity" },
  developmental: { label: "Developmental editing", pace: 350, note: "structure, argument, pacing, with a written editorial letter" },
};

export const CONDITION = { clean: 0.85, average: 1, rough: 1.3 };
export const WORDS_PER_PAGE = 250;

export const SAMPLE = {
  words: "80000", level: "copyedit", condition: "average", pace: "", rate: "45",
  overhead: "15", extraHours: "3", rushDays: "", rushPct: "25", workDays: "14", hoursPerDay: "5", slower: "25",
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
export const dollars = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round(n * 100) / 100;

export function parse(raw) {
  const errors = [];
  const words = num(raw.words), rate = num(raw.rate);
  if (!(words > 0)) errors.push("Enter the manuscript length in words (more than 0).");
  if (!(rate > 0)) errors.push("Enter the hourly rate you want to earn (more than 0).");
  const level = LEVELS[raw.level] ? raw.level : null;
  if (!level) errors.push("Choose a level of edit.");
  const condition = CONDITION[raw.condition] ? raw.condition : "average";
  const pace = opt(raw.pace, level ? LEVELS[level].pace : NaN);
  if (level && !(pace > 0)) errors.push("Pace must be words per hour, more than 0.");
  const overhead = opt(raw.overhead, 0), extraHours = opt(raw.extraHours, 0), rushPct = opt(raw.rushPct, 0);
  const rushDays = opt(raw.rushDays, 0), workDays = opt(raw.workDays, NaN), hoursPerDay = opt(raw.hoursPerDay, 5), slower = opt(raw.slower, 25);
  for (const [n, v] of [["Overhead", overhead], ["Extra hours", extraHours], ["Rush surcharge", rushPct], ["Rush window", rushDays], ["Slower-pace risk", slower]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(hoursPerDay > 0)) errors.push("Hours per working day must be more than 0.");
  return { errors, words, rate, level, condition, pace, overhead, extraHours, rushPct, rushDays, workDays, hoursPerDay, slower };
}

function price(p, level, pace) {
  const editHours = p.words / (pace / CONDITION[p.condition]);
  const billable = (editHours + p.extraHours) * (1 + p.overhead / 100);
  return { editHours, billable, fee: billable * p.rate };
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const base = price(p, p.level, p.pace);
  const rush = p.workDays > 0 && p.rushDays > 0 && p.workDays <= p.rushDays;
  const fee = round2(base.fee * (rush ? 1 + p.rushPct / 100 : 1));
  const pages = p.words / WORDS_PER_PAGE;
  const needDays = base.billable / p.hoursPerDay;
  const slowPace = p.pace * (1 - Math.min(p.slower, 90) / 100);
  const slowHours = price(p, p.level, slowPace).billable;
  const slowEff = fee / slowHours;
  const findings = [];
  if (p.workDays > 0 && needDays > p.workDays)
    findings.push({ severity: "high", title: `The job needs about ${needDays.toFixed(1)} working days at ${p.hoursPerDay} h/day but the deadline is ${p.workDays}. Ask for more time or charge for the extra hours.` });
  if (rush) findings.push({ severity: "medium", title: `Deadline is inside your ${p.rushDays}-day rush window: a ${p.rushPct}% surcharge is included.` });
  if (slowEff < p.rate * 0.75)
    findings.push({ severity: "medium", title: `If you edit ${p.slower}% slower than planned, a flat fee of ${dollars(fee)} pays ${dollars(slowEff)}/h instead of ${dollars(p.rate)}/h. Cap the scope or add a per-hour overage clause.` });
  if (p.condition === "rough" && p.level === "proofread")
    findings.push({ severity: "medium", title: "A rough manuscript usually needs a copyedit, not a proofread. Quote the level the text actually needs." });
  findings.push({ severity: "info", title: `Quote ${dollars(fee)} flat, which is ${dollars(fee / p.words)} per word or ${dollars(fee / pages)} per ${WORDS_PER_PAGE}-word page.` });
  const sweep = Object.entries(LEVELS).map(([key, l]) => {
    const r = price({ ...p }, key, l.pace);
    return { key, label: l.label, pace: l.pace, hours: r.billable, fee: round2(r.fee), perWord: r.fee / p.words };
  });
  return { errors: [], input: p, editHours: base.editHours, billable: base.billable, fee, perWord: fee / p.words, perPage: fee / pages, pages, needDays, rush, slowEff, findings, sweep };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `Edit quote: ${LEVELS[p.level].label}, ${p.words.toLocaleString("en-US")} words (${r.pages.toFixed(0)} pages), ${p.condition} manuscript`,
    `Pace: ${p.pace} words/hour; edit time ${r.editHours.toFixed(1)} h; billable incl. ${p.overhead}% admin and ${p.extraHours} extra h: ${r.billable.toFixed(1)} h`,
    `Quote: ${dollars(r.fee)} flat (${dollars(r.perWord)}/word, ${dollars(r.perPage)}/page) at a target ${dollars(p.rate)}/h${r.rush ? `, rush +${p.rushPct}%` : ""}`,
    `Working days needed: ${r.needDays.toFixed(1)} at ${p.hoursPerDay} h/day`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["level,pace_words_per_hour,billable_hours,fee,per_word", ...r.sweep.map((x) => `${x.label},${x.pace},${x.hours.toFixed(2)},${x.fee.toFixed(2)},${x.perWord.toFixed(4)}`)].join("\n");
}
