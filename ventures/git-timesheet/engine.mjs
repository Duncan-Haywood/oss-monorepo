// Turn `git log` output into an hours estimate and a client-ready report.
// Method (same family as git-hours): commits closer together than `gap`
// minutes belong to one working session; a session is worth its span plus
// `lead` minutes for the work before its first commit. Pure, no I/O.

export const DEFAULTS = { gap: 120, lead: 30, rate: 0 };
export const LOG_FORMAT = "%H|%an|%aI|%s";

export function parseLog(text) {
  const commits = [];
  const bad = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const m = /^([0-9a-f]{4,40})\|([^|]*)\|(\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:?\d\d))\|(.*)$/.exec(line);
    const t = m && Date.parse(m[3]);
    if (!m || Number.isNaN(t)) return bad.push({ line: i + 1, text: line.slice(0, 80) });
    // Local calendar day as written in the timestamp, not UTC, so late-evening work stays on its day.
    commits.push({ sha: m[1], author: m[2].trim() || "unknown", iso: m[3], t, day: m[3].slice(0, 10), subject: m[4].trim() });
  });
  commits.sort((a, b) => a.t - b.t);
  return { commits, bad };
}

export function sessions(commits, opts = {}) {
  const { gap, lead } = { ...DEFAULTS, ...opts };
  const out = [];
  for (const c of commits) {
    const last = out[out.length - 1];
    if (last && c.t - last.end <= gap * 60000) { last.end = c.t; last.commits.push(c); }
    else out.push({ start: c.t, end: c.t, day: c.day, commits: [c] });
  }
  for (const s of out) s.minutes = (s.end - s.start) / 60000 + lead;
  return out;
}

const round2 = (n) => Math.round(n * 100) / 100;
export const hours = (min) => round2(min / 60);

// Group sessions by day (and optionally by author). Sessions are computed per
// author so two people committing in the same hour are both billed.
export function summarize(commits, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const authors = [...new Set(commits.map((c) => c.author))].sort();
  const byAuthor = authors.map((a) => {
    const ss = sessions(commits.filter((c) => c.author === a), o);
    return { author: a, sessions: ss, minutes: ss.reduce((n, s) => n + s.minutes, 0), commits: ss.reduce((n, s) => n + s.commits.length, 0) };
  });
  const days = new Map();
  for (const a of byAuthor) for (const s of a.sessions) {
    const d = days.get(s.day) || { day: s.day, minutes: 0, commits: [] };
    d.minutes += s.minutes;
    d.commits.push(...s.commits);
    days.set(s.day, d);
  }
  const dayList = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  const minutes = byAuthor.reduce((n, a) => n + a.minutes, 0);
  return {
    opts: o, commits: commits.length, minutes, hours: hours(minutes),
    amount: o.rate ? round2((minutes / 60) * o.rate) : null,
    from: dayList[0]?.day ?? null, to: dayList.at(-1)?.day ?? null,
    authors: byAuthor.map((a) => ({ author: a.author, commits: a.commits, sessions: a.sessions.length, hours: hours(a.minutes) })),
    days: dayList.map((d) => ({ day: d.day, hours: hours(d.minutes), commits: d.commits.sort((x, y) => x.t - y.t) })),
  };
}

// "feat(api): add x" -> { type: "feat", text: "add x" }; "JIRA-12 fix y" -> ticket.
export function describe(subject) {
  const cc = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/.exec(subject);
  if (cc) return { type: cc[1].toLowerCase(), text: cc[2] };
  return { type: null, text: subject };
}

export function isNoise(subject) {
  return /^(merge (branch|pull request|remote)|wip\b|fixup!|squash!|revert "?merge)/i.test(subject);
}

export function toMarkdown(sum, { title = "Work report", client = "", showAuthors = true } = {}) {
  const L = [`# ${title}${client ? ` — ${client}` : ""}`, ""];
  if (!sum.commits) return L.concat("No commits in range.", "").join("\n");
  L.push(`Period: ${sum.from} to ${sum.to} · ${sum.commits} commits · **${sum.hours} h** estimated`
    + (sum.amount != null ? ` · **${sum.amount.toFixed(2)}** at ${sum.opts.rate}/h` : ""), "");
  if (showAuthors && sum.authors.length > 1) {
    L.push("| Contributor | Commits | Sessions | Hours |", "|---|---:|---:|---:|");
    for (const a of sum.authors) L.push(`| ${a.author} | ${a.commits} | ${a.sessions} | ${a.hours} |`);
    L.push("");
  }
  for (const d of sum.days) {
    L.push(`## ${d.day} — ${d.hours} h`, "");
    const seen = new Set();
    for (const c of d.commits) {
      if (isNoise(c.subject)) continue;
      const { type, text } = describe(c.subject);
      const line = `- ${type ? `**${type}**: ` : ""}${text}`;
      if (!seen.has(line)) { seen.add(line); L.push(line); }
    }
    L.push("");
  }
  L.push(`_Hours are estimated from commit timestamps (sessions split after ${sum.opts.gap} min idle, ${sum.opts.lead} min added before each session's first commit). Time spent without commits (meetings, research, review) is not included._`, "");
  return L.join("\n");
}

export function toCsv(sum) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = ["date,hours,commits,summary"];
  for (const d of sum.days) rows.push([d.day, d.hours, d.commits.length, q(d.commits.filter((c) => !isNoise(c.subject)).map((c) => describe(c.subject).text).join("; "))].join(","));
  return rows.join("\n") + "\n";
}

// Budget gate: returns { ok, text }.
export function gate(sum, { maxHours = null, maxAmount = null } = {}) {
  const fails = [];
  if (maxHours != null && sum.hours > maxHours) fails.push(`${sum.hours} h exceeds --max-hours ${maxHours}`);
  if (maxAmount != null && sum.amount != null && sum.amount > maxAmount) fails.push(`${sum.amount.toFixed(2)} exceeds --max-amount ${maxAmount}`);
  return { ok: !fails.length, text: fails.length ? fails.join("; ") : `${sum.hours} h within limits` };
}
