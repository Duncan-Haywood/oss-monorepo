// Class-slot optimizer for studios (fitness, yoga, pilates, dance, climbing).
// Input: one row per class actually held: slot label, attendance, optional capacity.
// Output: per slot, an empirical-Bayes adjusted average attendance, a seeded
// bootstrap range, and the money gained or lost per class by cutting the slot
// once attendees who move to another class are counted. Pure functions, no I/O.

const BOOT = 300;
const MIN_CLASSES = 20, MIN_SLOTS = 4, MIN_PER_SLOT = 3;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const variance = (v) => (v.length < 2 ? 0 : v.reduce((s, x) => s + (x - mean(v)) ** 2, 0) / (v.length - 1));
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

export const money = (v) => (Number.isFinite(v) ? (v < 0 ? "-$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-US") : "n/a");
export const pct = (v, d = 0) => (Number.isFinite(v) ? (v * 100).toFixed(d) + "%" : "n/a");

function splitLine(line) {
  const d = line.includes("\t") ? "\t" : ",";
  return line.split(d).map((c) => c.trim().replace(/^"|"$/g, ""));
}

export function parseRows(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { error: "Paste or upload your classes first.", rows: [], warnings: [] };
  let cols = { slot: 0, attended: 1, capacity: 2 };
  let start = 0;
  const first = splitLine(lines[0]).map((c) => c.toLowerCase());
  if (first.some((c) => /[a-z]/.test(c) && /slot|class|time|attend|capacity|cap|count|size|people|head|sign/.test(c))) {
    start = 1;
    const find = (re) => first.findIndex((c) => re.test(c));
    const slot = find(/slot|class|time|name|day/), att = find(/attend|count|people|head|checked|sign|size|booked/), cap = find(/capacity|cap|max|spots|limit/);
    cols = { slot: slot >= 0 ? slot : 0, attended: att >= 0 ? att : 1, capacity: cap };
  }
  const rows = [], warnings = [];
  let skipped = 0;
  for (const line of lines.slice(start)) {
    const c = splitLine(line);
    const slot = (c[cols.slot] || "").trim();
    const attended = Number((c[cols.attended] || "").replace(/,/g, ""));
    const capRaw = cols.capacity >= 0 && c[cols.capacity] !== undefined && c[cols.capacity] !== "" ? Number(c[cols.capacity]) : null;
    if (!slot || !Number.isFinite(attended) || attended < 0 || (capRaw !== null && !(capRaw > 0))) { skipped++; continue; }
    rows.push({ slot, attended, capacity: capRaw });
  }
  if (skipped) warnings.push(`${skipped} row(s) could not be read and were skipped (need a slot label and a non-negative attendance).`);
  return { rows, warnings };
}

export function analyze(rows, opts = {}) {
  const warnings = [];
  const revenue = Number(opts.revenue), varCost = Number(opts.varCost ?? 0), instructor = Number(opts.instructorCost);
  const transfer = opts.transfer === undefined || opts.transfer === "" ? 0.4 : Number(opts.transfer);
  const defCap = Number(opts.capacity);
  if (!(revenue > 0)) return { error: "Enter what one attendee is worth per class (average revenue per head), above zero." };
  if (!(varCost >= 0) || varCost >= revenue) return { error: "Cost per attendee must be zero or more, and below revenue per attendee." };
  if (!(instructor >= 0)) return { error: "Enter the cost of running one class (instructor pay plus room time), zero or more." };
  if (!(transfer >= 0 && transfer <= 1)) return { error: "Share of a cut class's attendees who would switch must be between 0 and 1." };

  const data = [];
  let capped = 0;
  for (const r of rows) {
    const cap = r.capacity ?? (defCap > 0 ? defCap : null);
    if (cap === null) return { error: "No capacity: add a capacity column or enter a default capacity." };
    let a = r.attended;
    if (a > cap) { a = cap; capped++; }
    data.push({ slot: r.slot, a, cap });
  }
  if (capped) warnings.push(`${capped} class(es) reported more attendees than capacity; counted at capacity.`);
  if (data.length < MIN_CLASSES) return { error: `Need at least ${MIN_CLASSES} classes held; you gave ${data.length}. Fewer cannot separate a weak slot from a quiet week.` };

  const by = new Map();
  for (const d of data) { if (!by.has(d.slot)) by.set(d.slot, []); by.get(d.slot).push(d); }
  const slots = [...by.entries()].filter(([, v]) => v.length >= MIN_PER_SLOT);
  const thin = [...by.entries()].filter(([, v]) => v.length < MIN_PER_SLOT).map(([s, v]) => ({ slot: s, classes: v.length }));
  if (slots.length < MIN_SLOTS) return { error: `Need at least ${MIN_SLOTS} slots with ${MIN_PER_SLOT}+ classes each; found ${slots.length}. The tool compares slots with each other.` };
  if (thin.length) warnings.push(`${thin.length} slot(s) have fewer than ${MIN_PER_SLOT} classes and get no verdict: ${thin.map((t) => t.slot).join(", ")}.`);

  const margin = revenue - varCost;
  const breakEven = instructor / margin;
  const rand = rng(opts.seed ?? 7);

  // Empirical-Bayes shrinkage toward the all-slot mean: a slot seen 3 times is
  // pulled toward the studio average more than one seen 30 times.
  const att = slots.map(([, v]) => v.map((d) => d.a));
  const means = att.map(mean);
  const grand = mean(att.flat());
  const within = mean(att.map((v) => variance(v)).filter((x) => x >= 0)) || 0;
  const noise = mean(att.map((v) => variance(v) / v.length));
  const tau2 = Math.max(0, variance(means) - noise);
  const k = tau2 > 0 ? Math.min(20, Math.max(0.5, within / tau2)) : 20;

  const out = slots.map(([slot, v], i) => {
    const n = v.length, raw = means[i], cap = mean(v.map((d) => d.cap));
    const adj = (n * raw + k * grand) / (n + k);
    const shift = adj - raw;
    const gains = [], fills = [];
    for (let b = 0; b < BOOT; b++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += att[i][Math.floor(rand() * n)];
      const m = s / n + shift;
      gains.push(instructor - (1 - transfer) * m * margin);
      fills.push(m / cap);
    }
    gains.sort((x, y) => x - y); fills.sort((x, y) => x - y);
    const gain = instructor - (1 - transfer) * adj * margin;
    const pCut = gains.filter((g) => g > 0).length / BOOT;
    const fill = adj / cap;
    let verdict = "watch";
    if (gain > 0 && pCut >= 0.8) verdict = "cut or move";
    else if (gain < 0 && pCut <= 0.2) verdict = fill >= 0.9 && quantile(fills, 0.1) >= 0.85 ? "full: add a class" : "keep";
    return {
      slot, classes: n, rawMean: raw, adjMean: adj, capacity: cap, fill, fillRange80: [quantile(fills, 0.1), quantile(fills, 0.9)],
      perClass: adj * margin - instructor, cutGain: gain, cutGainRange80: [quantile(gains, 0.1), quantile(gains, 0.9)], pCut, verdict,
    };
  }).sort((x, y) => y.cutGain - x.cutGain);

  const movers = out.filter((s) => s.verdict === "cut or move");
  const spare = out.filter((s) => s.verdict !== "cut or move").reduce((t, s) => t + Math.max(0, s.capacity - s.adjMean), 0);
  const moving = movers.reduce((t, s) => t + transfer * s.adjMean, 0);
  if (moving > spare) warnings.push(`Cutting all flagged slots would move about ${moving.toFixed(0)} attendees per round of classes but the remaining slots only have about ${spare.toFixed(0)} spare spots, so the switch rate you entered is optimistic.`);
  const full = out.filter((s) => s.verdict === "full: add a class").length;
  if (full) warnings.push("Classes at or near capacity hide demand: attendance cannot exceed the room, so a full slot may want more than it shows.");

  return {
    classes: data.length, slots: out.length, grand, margin, breakEven, transfer, k, thin, warnings, rows: out,
    totalCutGain: movers.reduce((t, s) => t + s.cutGain, 0), flagged: movers.length,
    verdict: out.every((s) => s.classes >= 8) ? "usable" : "weak evidence",
  };
}

export function reportCsv(r) {
  const head = "slot,classes,avg_attendance,adjusted_avg,fill,per_class_contribution,gain_from_cutting_per_class,chance_cutting_helps,verdict";
  const lines = r.rows.map((s) => [`"${s.slot.replace(/"/g, '""')}"`, s.classes, s.rawMean.toFixed(2), s.adjMean.toFixed(2), s.fill.toFixed(3), s.perClass.toFixed(2), s.cutGain.toFixed(2), s.pCut.toFixed(2), s.verdict].join(","));
  return [head, ...lines].join("\n") + "\n";
}

// Reads a verdict CSV that reportCsv wrote on an earlier run (last term's download).
export function parseReport(text) {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2 || !/^slot,classes,avg_attendance,adjusted_avg/.test(lines[0])) return { error: "That is not a verdict CSV from this tool. Use the file its Download button wrote." };
  const rows = [];
  for (const l of lines.slice(1)) {
    const m = l.match(/^"((?:[^"]|"")*)",([^,]*),([^,]*),([^,]*),[^,]*,[^,]*,([^,]*),[^,]*,(.*)$/);
    if (!m) continue;
    const adjMean = Number(m[4]);
    if (!Number.isFinite(adjMean)) continue;
    rows.push({ slot: m[1].replace(/""/g, '"'), classes: Number(m[2]), adjMean, cutGain: Number(m[5]), verdict: m[6].trim() });
  }
  return rows.length ? { rows } : { error: "No slot rows could be read from that file." };
}

// Slot-by-slot change between last term's verdicts and this run's result.
export function compareReports(prevRows, r) {
  const prev = new Map(prevRows.map((p) => [p.slot, p]));
  const seen = new Set();
  const out = r.rows.map((s) => {
    const p = prev.get(s.slot);
    seen.add(s.slot);
    if (!p) return { slot: s.slot, status: "new slot", adjMean: s.adjMean, delta: null, cutGain: s.cutGain, verdict: s.verdict, prevVerdict: null };
    return { slot: s.slot, status: p.verdict === s.verdict ? "same" : "changed", adjMean: s.adjMean, delta: s.adjMean - p.adjMean, cutGain: s.cutGain, verdict: s.verdict, prevVerdict: p.verdict };
  });
  for (const p of prevRows) if (!seen.has(p.slot)) out.push({ slot: p.slot, status: "dropped", adjMean: null, delta: null, cutGain: null, verdict: null, prevVerdict: p.verdict });
  return out;
}

// Invented data: 8 slots, 10 weeks each, with known true means.
export function sampleText() {
  const slots = [["Mon 6am", 6], ["Mon 6pm", 16], ["Tue 12pm", 4], ["Wed 6pm", 17], ["Thu 6am", 8], ["Fri 5pm", 5], ["Sat 9am", 19], ["Sun 10am", 13]];
  const r = rng(11);
  const lines = ["slot,attended,capacity"];
  for (const [s, m] of slots) for (let w = 0; w < 10; w++) lines.push(`${s},${Math.max(0, Math.min(20, Math.round(m + (r() + r() + r() - 1.5) * 4)))},20`);
  return lines.join("\n");
}
