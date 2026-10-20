// Turns pasted crontab text into monitor entries: validity, next runs, the
// longest healthy silence, a suggested grace period, a wrapped command line
// and the checks.json the self-hosted server reads.
import { checkTimezone, parseCron, nextRuns, longestGapSeconds, suggestGraceSeconds, formatDuration } from "./cron.mjs";

const MACRO_RE = /^@[a-z]+$/i;

export function slugify(command, taken) {
  const segments = command.split(/&&|;/).map((x) => x.trim()).filter(Boolean);
  const words = (segments[segments.length - 1] || command).replace(/[>|&<].*$/, "").split(/\s+/).filter(Boolean);
  const pick = words.find((w) => /[a-z]/i.test(w) && !/^(sudo|nice|ionice|flock|\/usr\/bin\/env|env|cd|bash|sh|-.*)$/i.test(w) && !/^\w+=/.test(w)) || "job";
  let base = pick.split("/").pop().replace(/\.[a-z0-9]+$/i, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "job";
  if (!/^[a-z0-9]/.test(base)) base = `job-${base}`;
  let slug = base, n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  taken.add(slug);
  return slug;
}

export function splitLine(line) {
  const t = line.trim();
  if (MACRO_RE.test(t.split(/\s+/)[0])) {
    const [schedule, ...rest] = t.split(/\s+/);
    return { schedule, command: rest.join(" ") };
  }
  const parts = t.split(/\s+/);
  return { schedule: parts.slice(0, 5).join(" "), command: parts.slice(5).join(" ") };
}

export function wrapCommand(command, pingUrl) {
  const curl = `curl -fsS -m 10 --retry 3 -o /dev/null ${pingUrl}`;
  return `${command} && ${curl} || ${curl}/fail`;
}

export function analyzeCrontab(text, now, baseUrl = "https://monitor.example.com") {
  const entries = [], taken = new Set();
  let tz = null; // CRON_TZ= (cronie, Vixie) applies to the lines below it
  const lines = String(text || "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const zone = line.match(/^CRON_TZ\s*=\s*["']?([^"'\s]*)["']?$/);
    if (zone) {
      try { tz = zone[1] ? checkTimezone(zone[1]) : null; } catch (e) { entries.push({ line: i + 1, schedule: line, command: "", error: e.message }); tz = null; }
      return;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)) return; // MAILTO=, PATH=, ...
    const { schedule, command } = splitLine(line);
    const entry = { line: i + 1, schedule, command, tz };
    try {
      const cron = parseCron(schedule, tz);
      if (!command) throw new Error("no command after the schedule");
      entry.slug = slugify(command, taken);
      entry.nextRuns = nextRuns(cron, now, 5);
      entry.longestGapSeconds = longestGapSeconds(cron, now);
      entry.graceSeconds = suggestGraceSeconds(cron, now);
      entry.longestGapText = formatDuration(entry.longestGapSeconds);
      entry.graceText = formatDuration(entry.graceSeconds);
      entry.pingUrl = `${baseUrl.replace(/\/$/, "")}/ping/${entry.slug}`;
      entry.wrapped = `${schedule} ${wrapCommand(command, entry.pingUrl)}`;
      entry.warnings = warn(cron, entry);
    } catch (e) {
      entry.error = e.message;
    }
    entries.push(entry);
  });
  const ok = entries.filter((e) => !e.error);
  const config = Object.fromEntries(ok.map((e) => [e.slug, { schedule: e.schedule, ...(e.tz ? { tz: e.tz } : {}), graceSeconds: e.graceSeconds }]));
  return { entries, config, configJson: JSON.stringify(config, null, 2) };
}

function warn(cron, entry) {
  const w = [];
  if (/(^|\s)\*\/?\d*\s+\*\s+\*\s+\*\s+\*/.test(entry.schedule) && entry.longestGapSeconds <= 60) w.push("Runs every minute: a 1-minute grace will page you on ordinary scheduler jitter. Consider a longer grace or a heartbeat on a coarser cadence.");
  if (entry.longestGapSeconds > 7 * 86400) w.push(`Longest gap is ${entry.longestGapText}: confirm that is intended, and set a grace period that fits the job's duration.`);
  if (/>\s*\/dev\/null\s*2>&1\s*$/.test(entry.command) && !/&&|\|\|/.test(entry.command)) w.push("Output is discarded, so failures are silent today. The wrapped line below reports exit status instead of hiding it.");
  if (!cron.domStar && !cron.dowStar) w.push("Both day-of-month and day-of-week are set: cron runs on either match, not both.");
  return w;
}
