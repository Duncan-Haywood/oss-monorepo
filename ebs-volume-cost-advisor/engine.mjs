// Zero-dependency, deterministic EBS volume advisor. One row per volume
// (type, size, provisioned IOPS/throughput, observed peak IOPS/throughput,
// attached or not) in; per-volume cheapest type that still covers the peak,
// the monthly saving, and the `aws ec2 modify-volume` command out.
//
// What is arithmetic and what is a model: prices are list prices times the
// row, and gp3/io2 sizing is "observed peak plus headroom, never below the
// type's free baseline". What is NOT known: the peak is one number you read
// from CloudWatch, so anything shorter than your sampling period is invisible,
// and gp2 burst-bucket state is modelled only as "peak above baseline".

// ILLUSTRATIVE and dated; AWS reprices by region. Overridable.
export const PRICES_AS_OF = "us-east-1 list prices per month (gp2 $0.10/GB; gp3 $0.08/GB + $0.005 per IOPS over 3,000 + $0.04 per MiB/s over 125; io1/io2 $0.125/GB + $0.065 per IOPS; st1 $0.045/GB; sc1 $0.015/GB); no snapshots, no free tier; verify against the EBS pricing page";
export const DEFAULT_PRICES = {
  gp2: { gb: 0.10 },
  gp3: { gb: 0.08, iopsOver: 0.005, mibpsOver: 0.04, freeIops: 3000, freeMibps: 125 },
  io1: { gb: 0.125, iops: 0.065 },
  io2: { gb: 0.125, iops: 0.065 },
  st1: { gb: 0.045 },
  sc1: { gb: 0.015 },
};
export const LIMITS = { gp2: { iops: 16000, mibps: 250 }, gp3: { iops: 16000, mibps: 1000 }, io1: { iops: 64000, mibps: 1000 }, io2: { iops: 64000, mibps: 1000 }, st1: { iops: 500, mibps: 500 }, sc1: { iops: 250, mibps: 250 } };
export const DEFAULTS = { headroom: 1.2, minMonthlySaving: 1, switchSavings: 0.1 };
const TYPES = Object.keys(DEFAULT_PRICES);

const toNum = (s) => {
  const n = Number(String(s ?? "").trim().replace(/,/g, ""));
  return String(s ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 ? n : NaN;
};

/** Parses `volume,type,size_gb,provisioned_iops,provisioned_mibps,peak_iops,peak_mibps[,state]`; header names remap columns. */
export function parseVolumes(text) {
  const rows = [];
  let skipped = 0;
  let col = { name: 0, type: 1, size: 2, piops: 3, pmibps: 4, peakIops: 5, peakMibps: 6, state: 7 };
  let sawHeader = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\s*[,\t]\s*/);
    if (!sawHeader && rows.length === 0 && /type/i.test(line) && /size|iops/i.test(line)) {
      sawHeader = true;
      const find = (re) => cells.findIndex((c) => re.test(c));
      const m = { name: find(/vol|name|id/i), type: find(/type/i), size: find(/size|gb/i), piops: find(/prov.*iops/i), pmibps: find(/prov.*(mib|thr)/i), peakIops: find(/peak.*iops/i), peakMibps: find(/peak.*(mib|thr)/i), state: find(/state|attach/i) };
      for (const k of Object.keys(m)) if (m[k] >= 0) col[k] = m[k];
      continue;
    }
    const type = String(cells[col.type] ?? "").trim().toLowerCase();
    const size = toNum(cells[col.size]);
    const num = (i) => { const v = String(cells[i] ?? "").trim() === "" ? 0 : toNum(cells[i]); return v; };
    const piops = num(col.piops); const pmibps = num(col.pmibps); const peakIops = num(col.peakIops); const peakMibps = num(col.peakMibps);
    if (!TYPES.includes(type) || Number.isNaN(size) || size < 1 || [piops, pmibps, peakIops, peakMibps].some(Number.isNaN)) { skipped += 1; continue; }
    const state = /avail|unattach|detach/i.test(String(cells[col.state] ?? "")) ? "available" : "in-use";
    rows.push({ name: cells[col.name] || `volume ${rows.length + 1}`, type, sizeGb: size, provIops: piops, provMibps: pmibps, peakIops, peakMibps, state });
  }
  return { rows, skipped };
}

/** gp2 baseline IOPS: 3 per GB, 100 minimum, 16,000 maximum. Volumes under 1,000 GB can burst to 3,000 until the bucket empties. */
export const gp2Baseline = (sizeGb) => Math.min(16000, Math.max(100, 3 * sizeGb));

/** Monthly cost of a volume of `type`; for gp3/io1/io2 `iops`/`mibps` are the provisioned numbers. */
export function volumeCost(type, sizeGb, iops, mibps, prices = DEFAULT_PRICES) {
  const p = prices[type];
  const base = sizeGb * p.gb;
  if (type === "gp3") return base + Math.max(0, iops - p.freeIops) * p.iopsOver + Math.max(0, mibps - p.freeMibps) * p.mibpsOver;
  if (type === "io1" || type === "io2") return base + iops * p.iops;
  return base;
}

/** Cheapest gp3 setting that covers the observed peak with headroom, or null when gp3 cannot serve it. */
export function sizeGp3(row, o, prices) {
  const f = prices.gp3;
  const cap = (need, peak, max) => (peak > max ? need : Math.min(need, max)); // headroom is trimmed to the type's ceiling, the peak itself is not
  const needIops = cap(Math.ceil(row.peakIops * o.headroom), row.peakIops, LIMITS.gp3.iops);
  const needMibps = cap(Math.ceil(row.peakMibps * o.headroom), row.peakMibps, LIMITS.gp3.mibps);
  const mibps = Math.max(f.freeMibps, needMibps);
  const iops = Math.min(LIMITS.gp3.iops, Math.max(f.freeIops, needIops, mibps > f.freeMibps ? mibps * 4 : 0)); // throughput above 125 MiB/s needs 1 IOPS per 0.25 MiB/s
  if (row.peakIops > LIMITS.gp3.iops || row.peakMibps > LIMITS.gp3.mibps || mibps * 4 > Math.max(iops, 0) && mibps > f.freeMibps || row.sizeGb * 500 < iops) return null;
  return { iops, mibps, cost: volumeCost("gp3", row.sizeGb, iops, mibps, prices) };
}

export function analyze(parsed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const prices = { ...DEFAULT_PRICES, ...(options.prices ?? {}) };
  const rows = parsed.rows;
  if (!rows.length) return { count: 0, findings: [], skipped: parsed.skipped ?? 0 };
  const findings = [];
  const add = (rule, severity, row, message) => findings.push({ rule, severity, row, message });
  const usd = (n) => {
    const format = (n) => `$${n.toFixed(2)}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const vols = rows.map((row) => {
    const provIops = row.type === "gp3" ? Math.max(row.provIops, 3000) : row.provIops;
    const provMibps = row.type === "gp3" ? Math.max(row.provMibps, 125) : row.provMibps;
    const current = volumeCost(row.type, row.sizeGb, provIops, provMibps, prices);
    let rec = { type: row.type, iops: provIops, mibps: provMibps, cost: current };
    const limit = LIMITS[row.type];
    const exceeds = row.peakIops > limit.iops || row.peakMibps > limit.mibps;
    if (row.state === "available") {
      rec = { type: "delete", iops: 0, mibps: 0, cost: 0 };
    } else if (row.type === "st1" || row.type === "sc1") {
      // HDD is the cheapest per GB; only leave it when it cannot serve the peak.
      if (exceeds) { const g = sizeGp3(row, o, prices); if (g) rec = { type: "gp3", iops: g.iops, mibps: g.mibps, cost: g.cost }; }
    } else {
      const g = sizeGp3(row, o, prices);
      if (g && g.cost < current) rec = { type: "gp3", iops: g.iops, mibps: g.mibps, cost: g.cost };
      else if (!g && (row.type === "gp2" || row.type === "gp3")) {
        const iops = Math.ceil(row.peakIops * o.headroom);
        if (iops <= LIMITS.io2.iops) rec = { type: "io2", iops, mibps: 0, cost: volumeCost("io2", row.sizeGb, iops, 0, prices) };
      } else if (row.type === "io1" && rec.type === "io1") {
        rec = { type: "io2", iops: row.provIops, mibps: 0, cost: volumeCost("io2", row.sizeGb, row.provIops, 0, prices) };
      }
    }
    const saving = current - rec.cost;
    const change = rec.type !== row.type || (rec.type === "gp3" && (rec.iops !== provIops || rec.mibps !== provMibps));
    const worthIt = rec.type === "delete" ? current > 0 : change && ((exceeds && rec.type !== row.type) || (saving >= o.minMonthlySaving && saving / (current || 1) >= o.switchSavings));
    const command = rec.type === "delete" ? `aws ec2 create-snapshot --volume-id ${row.name} && aws ec2 delete-volume --volume-id ${row.name}  # snapshot first, then delete once the snapshot completes`
      : rec.type === "gp3" ? `aws ec2 modify-volume --volume-id ${row.name} --volume-type gp3 --iops ${rec.iops} --throughput ${rec.mibps}`
      : rec.type === "io2" && row.type === "io1" ? `aws ec2 modify-volume --volume-id ${row.name} --volume-type io2 --iops ${rec.iops}`
      : rec.type === "io2" ? `aws ec2 modify-volume --volume-id ${row.name} --volume-type io2 --iops ${rec.iops}` : null;
    return { row, current, rec, saving: worthIt ? Math.max(0, saving) : 0, delta: saving, worthIt, command: worthIt ? command : null, provIops, provMibps, exceeds };
  });

  for (const v of vols) {
    const { row, rec } = v;
    if (row.state === "available") {
      add("unattached-volume", "warn", row.name, `${row.name}: not attached to any instance but billing ${usd(v.current)}/month (${row.sizeGb} GB ${row.type}). Snapshot it and delete it if nothing needs it.`);
      continue;
    }
    if (v.exceeds) add("peak-exceeds-type-limit", "error", row.name, `${row.name}: observed peak (${row.peakIops} IOPS, ${row.peakMibps} MiB/s) is above what ${row.type} can deliver (${LIMITS[row.type].iops} IOPS, ${LIMITS[row.type].mibps} MiB/s); it is throttled today.`);
    if (row.type === "gp2") {
      const base = gp2Baseline(row.sizeGb);
      if (row.peakIops > base) {
        const burst = row.sizeGb < 1000;
        add("gp2-burst-dependent", burst ? "warn" : "error", row.name, `${row.name}: peak ${row.peakIops} IOPS is above the gp2 baseline of ${base} for ${row.sizeGb} GB.${burst ? " It runs on burst credits (3,000 IOPS until the bucket empties), then drops to baseline." : " At 1,000 GB or more gp2 cannot burst, so it is throttled whenever it is above baseline."}${rec.type === "gp3" ? ` gp3 provisions ${rec.iops} IOPS directly.` : ""}`);
      }
    }
    if (v.worthIt && rec.type !== "delete") {
      const why = row.type === "gp3" ? `Provisioned ${v.provIops} IOPS / ${v.provMibps} MiB/s is more than the observed peak needs (${row.peakIops} IOPS, ${row.peakMibps} MiB/s plus ${Math.round((o.headroom - 1) * 100)}% headroom).` : "";
      add("switch-volume-type", "warn", row.name, `${row.name}: ${rec.type}${rec.type === "gp3" ? ` at ${rec.iops} IOPS / ${rec.mibps} MiB/s` : ""} models at ${usd(rec.cost)}/month against ${usd(v.current)} for ${row.type}: ${v.delta >= 0 ? `about ${usd(v.saving)} (${Math.round((v.saving / v.current) * 100)}%) a month cheaper` : `${usd(-v.delta)} a month more, but ${row.type} cannot serve the observed peak`}. ${why ? `${why} ` : ""}Live change, no detach: ${v.command}`.trim());
    }
    if (row.type === "io1" && rec.type === "io2" && !v.worthIt) add("io1-to-io2", "info", row.name, `${row.name}: io2 is the same price as io1 with higher durability; the same modify-volume command switches it.`);
    if (row.type === "st1" || row.type === "sc1") if (!v.exceeds && row.peakIops > LIMITS[row.type].iops * 0.7) add("hdd-near-iops-limit", "info", row.name, `${row.name}: peak ${row.peakIops} IOPS is within 30% of the ${row.type} limit of ${LIMITS[row.type].iops}; random-I/O growth will throttle it.`);
  }
  const totals = vols.reduce((a, v) => ({ current: a.current + v.current, best: a.best + (v.worthIt ? v.rec.cost : v.current), saving: a.saving + v.saving }), { current: 0, best: 0, saving: 0 });
  if (!findings.some((f) => f.severity !== "info")) add("volumes-fine", "info", "", `Every volume is within ${Math.round(o.switchSavings * 100)}% or ${usd(o.minMonthlySaving)} of its cheapest type that covers the observed peak.`);
  return { count: rows.length, skipped: parsed.skipped ?? 0, volumes: vols.map((v) => ({ name: v.row.name, type: v.row.type, sizeGb: v.row.sizeGb, state: v.row.state, current: v.current, recommended: v.worthIt ? v.rec.type : v.row.type, recommendedIops: v.rec.iops, recommendedMibps: v.rec.mibps, recommendedCost: v.worthIt ? v.rec.cost : v.current, saving: v.saving, command: v.command })), totals: { ...totals, annual: totals.saving * 12 }, prices, options: o, findings };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No usable rows found. Expected lines like: vol-0a1,gp2,500,,,900,60,in-use (volume, type, size GB, provisioned IOPS, provisioned MiB/s, peak IOPS, peak MiB/s, state)." };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const status = errors ? "error" : warns ? "warn" : "ok";
  const t = report.totals;
  return { status, errors, warns, text: `${report.count} volume(s). Modelled today $${t.current.toFixed(2)}/month; after the suggested changes $${t.best.toFixed(2)}/month${t.saving > 0.005 ? ` (save about $${t.saving.toFixed(2)}/month, $${t.annual.toFixed(0)}/year)` : ""}.` };
}

export const INPUT_NOTES = [
  { what: "volume,type,size_gb,provisioned_iops,provisioned_mibps,peak_iops,peak_mibps", detail: "One row per EBS volume. Type is gp2, gp3, io1, io2, st1 or sc1. Peak IOPS = max of (VolumeReadOps + VolumeWriteOps) / period in CloudWatch; peak MiB/s from VolumeReadBytes + VolumeWriteBytes." },
  { what: "state (optional 8th column)", detail: "in-use (default) or available; an available volume is unattached and bills for nothing." },
  { what: "header row", detail: "One optional header; column names (type, size, provisioned iops, peak iops, state ...) remap the fields in any order." },
  { what: "# comment / blank lines", detail: "Ignored." },
  { what: "other lines", detail: "Counted as skipped, never guessed at." },
];
