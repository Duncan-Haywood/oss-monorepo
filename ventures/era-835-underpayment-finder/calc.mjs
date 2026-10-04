// Analysis of an X12 835 electronic remittance advice (ERA): what each payer paid,
// what it adjusted and why, which service lines paid less than the practice's own
// contract rate, and which claims were denied. Pure functions, no DOM, no network.
//
// The segment layout is written from memory of the 005010X221A1 implementation guide;
// no real remittance was available when this was built, so the parser reads the
// elements it needs by position, reports what it could not read, and the page says so.
// Patient names and member IDs are never read into memory: a claim is identified only
// by the patient control number and payer claim number the practice already holds.

export const CENT = 0.005;

// ---- low-level EDI ---------------------------------------------------------

export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  return new TextDecoder("utf-8").decode(u8);
}

// ISA is fixed width: the element separator is the 4th character, the component
// separator the 105th and the segment terminator the 106th. A file without an ISA
// (a pasted fragment) falls back to * : ~ and says so.
export function detectSeparators(text) {
  const t = String(text ?? "").replace(/^﻿/, "").trimStart();
  if (/^ISA/.test(t) && t.length >= 106) {
    const el = t[3], comp = t[104], seg = t[105];
    if (el !== comp && el !== seg && comp !== seg) return { el, comp, seg, fromIsa: true };
  }
  return { el: "*", comp: ":", seg: "~", fromIsa: false };
}

export function splitSegments(text) {
  const t = String(text ?? "").replace(/^﻿/, "").trimStart();
  const sep = detectSeparators(t);
  const segs = [];
  for (const raw of t.split(sep.seg)) {
    const s = raw.replace(/[\r\n]+/g, "").trim();
    if (s) segs.push(s.split(sep.el));
  }
  return { segs, sep };
}

// "1,234.50", "-12", "" (0). NaN for anything that is not a number.
export function num(v) {
  const s = String(v ?? "").trim();
  if (s === "") return 0;
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return NaN;
  return Number(s);
}

export function ccyymmdd(v) {
  const m = String(v ?? "").trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return new Date(t).getUTCDate() === +m[3] ? t : null;
}

export function dateStr(ms) {
  return ms === null || ms === undefined ? "" : new Date(ms).toISOString().slice(0, 10);
}

const round2 = (x) => Math.round(x * 100) / 100;

// ---- reference text --------------------------------------------------------

export const GROUP_LABEL = {
  CO: "Contractual obligation (provider write-off)",
  PR: "Patient responsibility",
  OA: "Other adjustment",
  PI: "Payer-initiated reduction",
  CR: "Correction or reversal",
};

// Claim Adjustment Reason Codes, from memory and abbreviated. `next` is the usual
// first move, not a rule: resubmit (fix and send again), appeal (contest the
// decision), contract (check against the signed rates), coordinate (another payer or
// plan is primary), bill-patient, none (expected, nothing to do).
export const CARC = {
  1: ["Deductible amount", "bill-patient"],
  2: ["Coinsurance amount", "bill-patient"],
  3: ["Co-payment amount", "bill-patient"],
  4: ["Procedure code inconsistent with the modifier or a modifier is missing", "resubmit"],
  5: ["Procedure code inconsistent with the place of service", "resubmit"],
  6: ["Procedure inconsistent with the patient's age", "resubmit"],
  9: ["Diagnosis inconsistent with the patient's age", "resubmit"],
  11: ["Diagnosis inconsistent with the procedure", "resubmit"],
  15: ["Authorization number missing, invalid or does not apply", "resubmit"],
  16: ["Claim lacks information or has a submission or billing error", "resubmit"],
  18: ["Exact duplicate claim or service", "none"],
  19: ["Work-related injury: another payer is responsible", "coordinate"],
  22: ["Care may be covered by another payer (coordination of benefits)", "coordinate"],
  23: ["Payment adjusted for a prior payer's payment", "coordinate"],
  24: ["Covered by a managed care plan", "coordinate"],
  26: ["Expenses incurred before coverage began", "bill-patient"],
  27: ["Expenses incurred after coverage ended", "bill-patient"],
  29: ["Time limit for filing has expired", "appeal"],
  31: ["Patient cannot be identified as the insured", "resubmit"],
  35: ["Lifetime benefit maximum reached", "bill-patient"],
  45: ["Charge exceeds the fee schedule or maximum allowable (contractual write-off)", "contract"],
  50: ["Not medically necessary under the payer's guidelines", "appeal"],
  55: ["Procedure deemed experimental or investigational", "appeal"],
  58: ["Treatment invalid for the place of service", "resubmit"],
  59: ["Multiple or concurrent procedure reduction", "contract"],
  96: ["Non-covered charge", "appeal"],
  97: ["Benefit included in the allowance for another service (bundled)", "appeal"],
  109: ["Claim not covered by this payer: send it to the right one", "coordinate"],
  119: ["Benefit maximum for the period reached", "bill-patient"],
  129: ["Prior processing information appears incorrect", "resubmit"],
  140: ["Patient or insured ID does not match the payer's records", "resubmit"],
  151: ["Frequency of the service is more than the payer allows", "appeal"],
  167: ["Diagnosis is not covered", "appeal"],
  170: ["Not payable when performed by this provider type", "appeal"],
  197: ["Precertification or authorization was absent", "appeal"],
  204: ["Service not covered under the patient's current benefit plan", "appeal"],
  222: ["Exceeds the contracted maximum number of hours or units", "contract"],
  226: ["Information requested from the provider was not received or was late", "resubmit"],
  227: ["Information requested from the patient was not received", "resubmit"],
  234: ["Not paid separately", "appeal"],
  242: ["Services not provided by network or primary care providers", "appeal"],
  252: ["An attachment or other documentation is required", "resubmit"],
  253: ["Sequestration: payment reduced", "none"],
  B7: ["Provider not certified or eligible for this date of service", "appeal"],
};

export const NEXT_LABEL = {
  resubmit: "Usually fixable and resubmittable",
  appeal: "Usually needs an appeal or reconsideration",
  contract: "Check against your contract",
  coordinate: "Bill the other payer or plan",
  "bill-patient": "Usually patient balance",
  none: "Expected; nothing to do",
  unknown: "Code not in this tool's list",
};

export function carcInfo(code) {
  const hit = CARC[String(code).toUpperCase()] ?? CARC[Number(code)];
  return hit ? { text: hit[0], next: hit[1] } : { text: "Reason code not in this tool's list", next: "unknown" };
}

export const PLB_REASON = {
  50: "Late charge",
  51: "Interest penalty",
  72: "Authorized return",
  90: "Early payment allowance",
  94: "Participation fee",
  AH: "Origination fee",
  B2: "Rebate",
  BD: "Bad debt adjustment",
  CS: "Adjustment",
  CT: "Capitation payment",
  CV: "Capital passthru",
  FB: "Forwarding balance",
  GO: "Special payment",
  IR: "Internal revenue service withholding",
  IS: "Interim settlement",
  J1: "Non-reimbursable",
  L3: "Penalty",
  L6: "Interest owed",
  LE: "Levy",
  LS: "Lump sum",
  OB: "Offset for affiliated providers",
  PI: "Periodic installment",
  RA: "Retro-activity adjustment",
  TL: "Third-party liability",
  WO: "Overpayment recovery",
  WU: "Unspecified recovery",
};

export const CLAIM_STATUS = {
  1: "Processed as primary",
  2: "Processed as secondary",
  3: "Processed as tertiary",
  4: "Denied",
  19: "Processed as primary, forwarded to another payer",
  20: "Processed as secondary, forwarded to another payer",
  21: "Processed as tertiary, forwarded to another payer",
  22: "Reversal of a previous payment",
  23: "Not our claim, forwarded to another payer",
  25: "Predetermination pricing only, no payment",
};

// ---- parsing ---------------------------------------------------------------

// Reads one or more 835 transactions (one ST..SE per payment) from a text. Never
// throws: anything unreadable goes to `issues` with the segment that caused it.
export function parseEra(text) {
  const { segs, sep } = splitSegments(text);
  const out = { transactions: [], claims: [], lines: [], plb: [], issues: [], segmentCount: segs.length, sep };
  if (!segs.length) { out.error = "The file is empty."; return out; }
  if (!segs.some((s) => s[0] === "CLP")) {
    out.error = segs.some((s) => s[0] === "ST" && s[1] === "835")
      ? "This 835 holds no claim payments (no CLP segments)."
      : "No 835 claim payment segments found. This tool reads X12 835 remittance files (often .835, .txt, .edi or .era); an 837 claim file or a PDF explanation of benefits will not work.";
    return out;
  }
  if (!sep.fromIsa) out.issues.push("No ISA header found, so the standard * : ~ separators were assumed.");

  let tx = null, claim = null, line = null, loop = "";
  const issue = (msg, seg) => out.issues.push(`${msg} (${seg ? seg.slice(0, 4).join(sep.el) : "?"})`);
  const pushTx = (st) => {
    tx = { id: out.transactions.length + 1, control: st?.[2] ?? "", payer: "", payee: "", payDate: null, payTotal: null, method: "", trace: "", credit: true, claimPaid: 0, plbNet: 0, claims: 0 };
    out.transactions.push(tx);
  };

  for (const s of segs) {
    const id = s[0];
    if (id === "ST") { pushTx(s); claim = null; line = null; loop = ""; continue; }
    if (!tx && ["BPR", "TRN", "N1", "CLP"].includes(id)) pushTx(null);
    switch (id) {
      case "BPR": {
        const amt = num(s[2]);
        tx.payTotal = Number.isNaN(amt) ? null : amt;
        tx.credit = s[3] !== "D";
        tx.method = s[4] ?? "";
        tx.payDate = ccyymmdd(s[16]);
        if (tx.payTotal === null) issue("Payment amount is not a number", s);
        break;
      }
      case "TRN": tx.trace = s[2] ?? tx.trace; break;
      case "N1":
        if (s[1] === "PR") { tx.payer = (s[2] ?? "").trim(); loop = "payer"; }
        else if (s[1] === "PE") { tx.payee = (s[2] ?? "").trim(); loop = "payee"; }
        break;
      case "LX": claim = null; line = null; loop = "header"; break;
      case "CLP": {
        const charge = num(s[3]), paid = num(s[4]), pr = num(s[5]);
        if ([charge, paid, pr].some(Number.isNaN)) { issue("Claim amounts are not numbers", s); claim = null; line = null; break; }
        claim = {
          tx: tx.id, payer: tx.payer, payDate: tx.payDate, trace: tx.trace,
          id: s[1] ?? "", status: String(s[2] ?? ""), charge, paid, patientResp: pr,
          filing: s[6] ?? "", payerClaimId: s[7] ?? "", cas: [], lines: [], from: null, to: null,
        };
        out.claims.push(claim);
        tx.claimPaid += paid; tx.claims += 1;
        line = null; loop = "claim";
        break;
      }
      case "CAS": {
        if (!claim) { issue("Adjustment outside a claim", s); break; }
        const group = (s[1] ?? "").toUpperCase();
        const target = line ?? claim;
        for (let i = 2; i + 1 < s.length; i += 3) {
          if (!s[i]) continue;
          const amount = num(s[i + 1]);
          if (Number.isNaN(amount)) { issue("Adjustment amount is not a number", s); continue; }
          target.cas.push({ group, reason: s[i].trim(), amount, qty: num(s[i + 2]) || 0 });
        }
        break;
      }
      case "DTM": {
        if (!claim) break;
        const d = ccyymmdd(s[2]);
        if (line && s[1] === "472") line.date = d;
        else if (!line && (s[1] === "232" || s[1] === "233")) { if (s[1] === "232") claim.from = d; else claim.to = d; }
        break;
      }
      case "SVC": {
        if (!claim) { issue("Service line outside a claim", s); break; }
        const comp = (s[1] ?? "").split(sep.comp);
        const charge = num(s[2]), paid = num(s[3]);
        const units = s[5] === undefined || s[5] === "" ? 1 : num(s[5]);
        if ([charge, paid, units].some(Number.isNaN)) { issue("Service line amounts are not numbers", s); line = null; break; }
        const billed = (s[6] ?? "").split(sep.comp);
        line = {
          tx: tx.id, claim, payer: tx.payer, payDate: tx.payDate, claimId: claim.id, payerClaimId: claim.payerClaimId,
          code: (comp[1] ?? "").trim(), mods: comp.slice(2, 6).filter(Boolean), qualifier: comp[0] ?? "",
          billedCode: billed[1] ? billed[1].trim() : "", charge, paid, units: units || 1, allowed: null, date: claim.from, cas: [],
        };
        claim.lines.push(line);
        out.lines.push(line);
        loop = "line";
        break;
      }
      case "AMT": {
        if (s[1] === "B6" && line) { const a = num(s[2]); if (!Number.isNaN(a)) line.allowed = a; }
        break;
      }
      case "PLB": {
        const provider = s[1] ?? "", period = ccyymmdd(s[2]);
        for (let i = 3; i + 1 < s.length; i += 2) {
          const reason = (s[i] ?? "").split(sep.comp)[0];
          const amount = num(s[i + 1]);
          if (!reason || Number.isNaN(amount)) continue;
          out.plb.push({ tx: tx.id, payer: tx.payer, provider, period, reason, amount, ref: (s[i] ?? "").split(sep.comp)[1] ?? "" });
          tx.plbNet += amount;
        }
        claim = null; line = null; loop = "plb";
        break;
      }
      default: break;
    }
  }
  return out;
}

// ---- fee schedule ----------------------------------------------------------

// One line per code: "99213,92.50", "99213-25,80", "99213 25 80" or "99213\t92.5".
// A code and modifier may be joined by a dash. Dollar signs are ignored.
export function parseSchedule(text) {
  const rates = new Map(), bad = [];
  let n = 0;
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const l = raw.replace(/\$/g, "").trim();
    if (!l || /^(code|cpt|hcpcs|procedure)\b/i.test(l)) continue;
    const m = l.match(/^([A-Za-z0-9]{4,5})(?:[-: ]([A-Za-z0-9]{2}))?\s*[,;\t ]\s*([\d,]*\.?\d+)\s*$/);
    if (!m) { bad.push(i + 1); continue; }
    const rate = Number(m[3].replace(/,/g, ""));
    rates.set(m[2] ? `${m[1].toUpperCase()}|${m[2].toUpperCase()}` : m[1].toUpperCase(), rate);
    n++;
  }
  return { rates, bad, count: n };
}

function contractRate(schedule, line) {
  if (!schedule) return null;
  const code = line.code.toUpperCase();
  for (const mod of line.mods) {
    const hit = schedule.rates.get(`${code}|${mod.toUpperCase()}`);
    if (hit !== undefined) return hit;
  }
  const base = schedule.rates.get(code);
  return base === undefined ? null : base;
}

// ---- analysis --------------------------------------------------------------

const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
const casTotal = (cas, pred = () => true) => sum(cas.filter(pred), (c) => c.amount);

// Reasons that mean the payer did something to the line other than apply the fee
// schedule. A line carrying one of these is not a clean test of the contract rate.
const NEUTRAL_REASONS = new Set(["45", "253", "1", "2", "3"]);

export function lineAllowed(line) {
  if (line.allowed !== null) return { amount: line.allowed, source: "AMT*B6" };
  const pr = casTotal(line.cas, (c) => c.group === "PR");
  const seq = casTotal(line.cas, (c) => c.reason === "253");
  return { amount: round2(line.paid + pr + seq), source: "paid + patient responsibility" };
}

function lineIsClean(line) {
  if (line.paid <= CENT) return false;
  return line.cas.every((c) => c.group === "PR" || NEUTRAL_REASONS.has(c.reason));
}

function claimBalances(claim) {
  const gap = round2(claim.charge - claim.paid);
  const c = round2(casTotal(claim.cas));
  const l = round2(sum(claim.lines, (x) => casTotal(x.cas)));
  return [c, l, round2(c + l)].some((x) => Math.abs(x - gap) < 0.015) || (claim.cas.length === 0 && claim.lines.length === 0 && Math.abs(gap) < 0.015);
}

function lineBalances(line) {
  return !line.cas.length || Math.abs(round2(line.charge - line.paid - casTotal(line.cas))) < 0.015;
}

export function analyze(parsed, opts = {}) {
  const tolerance = Number.isFinite(opts.tolerance) && opts.tolerance >= 0 ? opts.tolerance : 1;
  const schedule = opts.schedule && opts.schedule.count ? opts.schedule : null;
  const payerFilter = String(opts.payerFilter ?? "").trim().toLowerCase();
  const { claims, lines, plb, transactions } = parsed;

  const inScope = (l) => !payerFilter || l.payer.toLowerCase().includes(payerFilter);
  const findings = [];

  // -- money totals
  const billed = sum(claims, (c) => c.charge);
  const paid = sum(claims, (c) => c.paid);
  const patientResp = sum(claims, (c) => c.patientResp);
  const plbNet = sum(plb, (p) => p.amount);
  const summary = {
    payments: transactions.length, claims: claims.length, lines: lines.length,
    billed: round2(billed), paid: round2(paid), patientResp: round2(patientResp), plbNet: round2(plbNet),
    firstPay: transactions.map((t) => t.payDate).filter((d) => d !== null).sort()[0] ?? null,
    lastPay: transactions.map((t) => t.payDate).filter((d) => d !== null).sort().at(-1) ?? null,
    collectRate: billed > CENT ? paid / billed : null,
  };

  // -- adjustments by group and reason, claim-level and line-level together
  const casAll = [];
  for (const c of claims) {
    // A reason reported at line level is the same dollars as the claim total, so
    // count the line copy when lines exist and the claim copy otherwise.
    const src = c.lines.some((l) => l.cas.length) ? c.lines.flatMap((l) => l.cas) : c.cas;
    for (const a of src) casAll.push({ ...a, payer: c.payer });
  }
  const byGroup = new Map(), byReason = new Map();
  for (const a of casAll) {
    byGroup.set(a.group, (byGroup.get(a.group) ?? 0) + a.amount);
    const k = `${a.group}-${a.reason}`;
    const r = byReason.get(k) ?? { group: a.group, reason: a.reason, amount: 0, count: 0 };
    r.amount += a.amount; r.count += 1;
    byReason.set(k, r);
  }
  const adjustmentsByGroup = [...byGroup].map(([group, amount]) => ({ group, label: GROUP_LABEL[group] ?? "Other", amount: round2(amount) }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const adjustmentsByReason = [...byReason.values()].map((r) => ({ ...r, amount: round2(r.amount), ...carcInfo(r.reason) }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  // -- denials: status 4, or nothing paid with a non-patient-responsibility reason
  const denials = [];
  for (const c of claims) {
    const isDenied = c.status === "4" || (c.paid <= CENT && c.charge > CENT && c.status !== "22" && c.status !== "25" && c.cas.concat(...c.lines.map((l) => l.cas)).some((a) => a.group !== "PR"));
    if (!isDenied) continue;
    const src = c.cas.length ? c.cas : c.lines.flatMap((l) => l.cas);
    const lead = src.filter((a) => a.group !== "PR").sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0] ?? src[0];
    denials.push({
      payer: c.payer, claimId: c.id, payerClaimId: c.payerClaimId, charge: c.charge, payDate: c.payDate, serviceDate: c.from,
      group: lead?.group ?? "", reason: lead?.reason ?? "", ...carcInfo(lead?.reason ?? ""),
      reasons: [...new Set(src.map((a) => `${a.group}-${a.reason}`))],
    });
  }
  const denialsByReason = new Map();
  for (const d of denials) {
    const k = d.reason || "?";
    const r = denialsByReason.get(k) ?? { reason: k, text: d.text, next: d.next, count: 0, amount: 0 };
    r.count += 1; r.amount += d.charge;
    denialsByReason.set(k, r);
  }
  const denialSummary = [...denialsByReason.values()].map((r) => ({ ...r, amount: round2(r.amount) })).sort((a, b) => b.amount - a.amount);
  const denialTotal = round2(sum(denials, (d) => d.charge));
  const fixable = denials.filter((d) => d.next === "resubmit" || d.next === "appeal");

  // -- underpayments
  const usable = lines.filter((l) => inScope(l) && lineIsClean(l));
  const flagged = [];
  let mode = "none";
  if (schedule) {
    mode = "contract";
    for (const l of usable) {
      const rate = contractRate(schedule, l);
      if (rate === null) continue;
      const exp = round2(rate * l.units);
      const got = lineAllowed(l);
      const short = round2(exp - got.amount);
      if (short > tolerance) flagged.push({ line: l, basis: "contract", expected: exp, allowed: got.amount, source: got.source, shortfall: short, unitRate: rate });
    }
  } else {
    // No contract on hand: compare a payer's own allowed amount per unit for the same
    // code (and first modifier) against the amount it allows most often. Needs three
    // clean lines of the code from one payer; below that there is no "usual" to compare.
    mode = "inferred";
    const groups = new Map();
    for (const l of usable) {
      const k = `${l.payer}|${l.code}|${l.mods[0] ?? ""}`;
      (groups.get(k) ?? groups.set(k, []).get(k)).push(l);
    }
    for (const g of groups.values()) {
      if (g.length < 3) continue;
      const freq = new Map();
      for (const l of g) {
        const per = round2(lineAllowed(l).amount / l.units);
        freq.set(per, (freq.get(per) ?? 0) + 1);
      }
      const [usual, n] = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      if (n < 2 || n / g.length < 0.5) continue;
      for (const l of g) {
        const got = lineAllowed(l);
        const per = round2(got.amount / l.units);
        const short = round2((usual - per) * l.units);
        if (short > tolerance) flagged.push({ line: l, basis: "inferred", expected: round2(usual * l.units), allowed: got.amount, source: got.source, shortfall: short, unitRate: usual, usualCount: n, groupSize: g.length });
      }
    }
  }
  flagged.sort((a, b) => b.shortfall - a.shortfall);
  const shortfallTotal = round2(sum(flagged, (f) => f.shortfall));

  const byPayerShort = new Map(), byCodeShort = new Map();
  for (const f of flagged) {
    const p = byPayerShort.get(f.line.payer) ?? { payer: f.line.payer, lines: 0, shortfall: 0 };
    p.lines += 1; p.shortfall += f.shortfall; byPayerShort.set(f.line.payer, p);
    const c = byCodeShort.get(f.line.code) ?? { code: f.line.code, lines: 0, shortfall: 0, expected: 0, allowed: 0 };
    c.lines += 1; c.shortfall += f.shortfall; c.expected += f.expected; c.allowed += f.allowed; byCodeShort.set(f.line.code, c);
  }
  const shortByPayer = [...byPayerShort.values()].map((x) => ({ ...x, shortfall: round2(x.shortfall) })).sort((a, b) => b.shortfall - a.shortfall);
  const shortByCode = [...byCodeShort.values()].map((x) => ({ ...x, shortfall: round2(x.shortfall), expected: round2(x.expected), allowed: round2(x.allowed) })).sort((a, b) => b.shortfall - a.shortfall);

  const testedLines = mode === "contract" ? usable.filter((l) => contractRate(schedule, l) !== null).length : usable.length;
  const unmatchedCodes = mode === "contract"
    ? [...new Set(usable.filter((l) => contractRate(schedule, l) === null).map((l) => l.code))].sort()
    : [];

  // -- payers
  const byPayer = new Map();
  for (const c of claims) {
    const p = byPayer.get(c.payer) ?? { payer: c.payer || "(unnamed payer)", claims: 0, billed: 0, paid: 0, denied: 0 };
    p.claims += 1; p.billed += c.charge; p.paid += c.paid; byPayer.set(c.payer, p);
  }
  for (const d of denials) { const p = byPayer.get(d.payer); if (p) p.denied += 1; }
  const payers = [...byPayer.values()].map((p) => ({ ...p, billed: round2(p.billed), paid: round2(p.paid), rate: p.billed > CENT ? p.paid / p.billed : null })).sort((a, b) => b.paid - a.paid);

  // -- integrity: does the file add up to itself?
  const unbalancedClaims = claims.filter((c) => !claimBalances(c));
  const unbalancedLines = lines.filter((l) => !lineBalances(l));
  const paymentMismatch = transactions
    .filter((t) => t.payTotal !== null && Math.abs(round2(t.payTotal - (t.claimPaid - t.plbNet))) > 0.015)
    .map((t) => ({ trace: t.trace || `#${t.id}`, payer: t.payer, total: t.payTotal, claims: round2(t.claimPaid), plb: round2(t.plbNet), gap: round2(t.payTotal - (t.claimPaid - t.plbNet)) }));

  // -- findings, ranked
  if (flagged.length) {
    findings.push({
      severity: "high",
      title: mode === "contract"
        ? `${flagged.length} line${flagged.length === 1 ? "" : "s"} paid ${money(shortfallTotal)} below your contract rates`
        : `${flagged.length} line${flagged.length === 1 ? "" : "s"} paid ${money(shortfallTotal)} below what the same payer usually allows for the same code`,
      detail: mode === "contract"
        ? `Largest: ${flagged[0].line.code} for claim ${flagged[0].line.claimId || "?"}, expected ${money(flagged[0].expected)} and allowed ${money(flagged[0].allowed)}. Check each against the contract, the date of service and any modifier or place-of-service rate before disputing.`
        : "No contract was entered, so this compares each payer against its own most common allowed amount per unit. A real fee-schedule difference (place of service, plan, modifier) looks the same. Enter your contract rates to test them properly.",
    });
  } else if (schedule && testedLines > 0) {
    findings.push({ severity: "info", title: `All ${testedLines} comparable lines paid at or above your contract rates`, detail: `Within the $${tolerance.toFixed(2)} tolerance. Lines with denials, bundling or other adjustments are not tested; ${lines.length - usable.length} such line(s) were skipped.` });
  }
  if (schedule && unmatchedCodes.length) {
    findings.push({ severity: "info", title: `${unmatchedCodes.length} billed code${unmatchedCodes.length === 1 ? " has" : "s have"} no rate in your schedule`, detail: `Not tested: ${unmatchedCodes.slice(0, 12).join(", ")}${unmatchedCodes.length > 12 ? ", …" : ""}.` });
  }
  if (denials.length) {
    findings.push({
      severity: "high",
      title: `${denials.length} denied claim${denials.length === 1 ? "" : "s"} worth ${money(denialTotal)} billed`,
      detail: `${fixable.length} carry reasons that are usually resubmittable or appealable (${money(round2(sum(fixable, (d) => d.charge)))} billed). Most payers cap how long you have to appeal, so check each plan's deadline against the payment date.`,
    });
  }
  if (plb.length) {
    findings.push({
      severity: plbNet > CENT ? "medium" : "info",
      title: `${plb.length} provider-level adjustment${plb.length === 1 ? "" : "s"} netting ${money(plbNet)} against payments`,
      detail: "These sit outside any claim: recoupments, interest, forwarded balances. A positive figure reduced the payment. They are easy to miss because the claim totals still look right.",
    });
  }
  if (unbalancedClaims.length || unbalancedLines.length) {
    findings.push({
      severity: "medium",
      title: `${unbalancedClaims.length} claim${unbalancedClaims.length === 1 ? "" : "s"} and ${unbalancedLines.length} line${unbalancedLines.length === 1 ? "" : "s"} do not balance`,
      detail: "Charge less payment should equal the adjustments the payer lists. When it does not, a figure was misread or the payer left an adjustment out; either way, treat that claim's numbers as unreliable until checked against the payer's portal.",
    });
  }
  if (paymentMismatch.length) {
    findings.push({
      severity: "medium",
      title: `${paymentMismatch.length} payment total${paymentMismatch.length === 1 ? "" : "s"} differ from the claims less provider adjustments`,
      detail: `The deposit amount in the header should equal claim payments minus provider-level adjustments. First gap: ${money(paymentMismatch[0].gap)} on ${paymentMismatch[0].trace}.`,
    });
  }
  const order = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    summary, findings, adjustmentsByGroup, adjustmentsByReason, denials, denialSummary, denialTotal,
    flagged, shortfallTotal, shortByPayer, shortByCode, mode, tolerance, testedLines, unmatchedCodes,
    payers, plb: plb.map((p) => ({ ...p, label: PLB_REASON[p.reason] ?? "Provider adjustment" })), unbalancedClaims, unbalancedLines, paymentMismatch,
    skippedLines: lines.length - usable.length,
  };
}

// ---- formatting and export -------------------------------------------------

export function money(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  const neg = x < -CENT;
  return (neg ? "-" : "") + "$" + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(x) {
  return x === null || x === undefined || Number.isNaN(x) ? "–" : (x * 100).toFixed(1) + "%";
}

const csvCell = (v) => {
  let s = String(v ?? "");
  // A cell starting with = + - @ is read as a formula by spreadsheets; prefix it.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// The worksheet a billing person works from: flagged lines first, then denials.
export function worksheetCsv(result) {
  const rows = [["type", "payer", "patient_control_no", "payer_claim_no", "service_date", "payment_date", "code", "modifiers", "units", "billed", "paid", "expected", "allowed", "shortfall_or_billed", "reason", "next_step"]];
  for (const f of result.flagged) {
    const l = f.line;
    rows.push([f.basis === "contract" ? "underpaid vs contract" : "underpaid vs payer's usual", l.payer, l.claimId, l.payerClaimId, dateStr(l.date), dateStr(l.payDate), l.code, l.mods.join(" "), l.units, l.charge.toFixed(2), l.paid.toFixed(2), f.expected.toFixed(2), f.allowed.toFixed(2), f.shortfall.toFixed(2), "", "Compare to contract, then dispute with the payer"]);
  }
  for (const d of result.denials) {
    rows.push(["denied claim", d.payer, d.claimId, d.payerClaimId, dateStr(d.serviceDate), dateStr(d.payDate), "", "", "", d.charge.toFixed(2), "0.00", "", "", d.charge.toFixed(2), `${d.group}-${d.reason}: ${d.text}`, NEXT_LABEL[d.next]]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

// ---- worked example --------------------------------------------------------

// Builds a valid-looking 835 from plain data. Used by the example and the tests.
export function buildEra(payments) {
  const E = "*", C = ":", S = "~";
  const isa = ["ISA", "00", " ".repeat(10), "00", " ".repeat(10), "ZZ", "SENDERID".padEnd(15), "ZZ", "RECEIVER".padEnd(15), "251001", "1200", "^", "00501", "000000001", "0", "P", C].join(E);
  const segs = [isa + S, `GS${E}HP${E}SENDER${E}RECEIVER${E}20251001${E}1200${E}1${E}X${E}005010X221A1${S}`];
  let st = 0;
  for (const p of payments) {
    st += 1;
    const body = [];
    const claimPaid = p.claims.reduce((a, c) => a + c.paid, 0);
    const plbNet = (p.plb ?? []).reduce((a, x) => a + x.amount, 0);
    const total = p.total ?? round2(claimPaid - plbNet);
    body.push(`ST${E}835${E}${String(st).padStart(4, "0")}`);
    body.push(`BPR${E}I${E}${total.toFixed(2)}${E}C${E}ACH${E}CCP${E}01${E}999999999${E}DA${E}123456${E}1512345678${E}${E}01${E}888888888${E}DA${E}654321${E}${p.date}`);
    body.push(`TRN${E}1${E}${p.trace}${E}1512345678`);
    body.push(`N1${E}PR${E}${p.payer}`);
    body.push(`N1${E}PE${E}SAMPLE FAMILY PRACTICE${E}XX${E}1234567893`);
    p.claims.forEach((c, i) => {
      body.push(`LX${E}${i + 1}`);
      const pr = c.lines.reduce((a, l) => a + (l.cas ?? []).filter((x) => x[0] === "PR").reduce((b, x) => b + x[2], 0), 0);
      body.push(`CLP${E}${c.id}${E}${c.status ?? 1}${E}${c.charge.toFixed(2)}${E}${c.paid.toFixed(2)}${E}${(c.pr ?? pr).toFixed(2)}${E}12${E}${c.payerId ?? "PCN" + c.id}${E}11${E}1`);
      body.push(`NM1${E}QC${E}1${E}SYNTHETIC${E}PATIENT`);
      body.push(`DTM${E}232${E}${c.date}`);
      body.push(`DTM${E}233${E}${c.date}`);
      for (const l of c.lines) {
        body.push(`SVC${E}HC${C}${l.code}${(l.mods ?? []).map((m) => C + m).join("")}${E}${l.charge.toFixed(2)}${E}${l.paid.toFixed(2)}${E}${E}${l.units ?? 1}`);
        body.push(`DTM${E}472${E}${c.date}`);
        for (const [group, reason, amount] of l.cas ?? []) body.push(`CAS${E}${group}${E}${reason}${E}${amount.toFixed(2)}`);
        if (l.allowed !== undefined) body.push(`AMT${E}B6${E}${l.allowed.toFixed(2)}`);
      }
    });
    for (const x of p.plb ?? []) body.push(`PLB${E}1234567893${E}${p.date.slice(0, 4)}1231${E}${x.reason}${C}${x.ref ?? "ADJ"}${E}${x.amount.toFixed(2)}`);
    body.push(`SE${E}${body.length + 1}${E}${String(st).padStart(4, "0")}`);
    for (const b of body) segs.push(b + S);
  }
  segs.push(`GE${E}${payments.length}${E}1${S}`, `IEA${E}1${E}000000001${S}`);
  return segs.join("\n");
}

export function sampleEra() {
  const mk = (id, date, code, units, charge, allowed, pr, mods = [], extra = []) => ({
    id, date, charge, paid: round2(allowed - pr), pr,
    lines: [{ code, mods, units, charge, paid: round2(allowed - pr), allowed, cas: [["PR", "2", pr], ["CO", "45", round2(charge - allowed)], ...extra] }],
  });
  return buildEra([
    {
      payer: "EXAMPLE HEALTH PLAN", date: "20251003", trace: "EXAMPLE0001",
      claims: [
        mk("A1001", "20250915", "99213", 1, 150, 92.5, 20),
        mk("A1002", "20250915", "99213", 1, 150, 92.5, 20),
        mk("A1003", "20250916", "99213", 1, 150, 74, 20),
        mk("A1004", "20250916", "99214", 1, 220, 131, 30),
        mk("A1005", "20250917", "99214", 1, 220, 131, 30),
        mk("A1006", "20250917", "99214", 1, 220, 104.8, 30),
        mk("A1007", "20250918", "93000", 1, 70, 17.5, 0),
        mk("A1008", "20250918", "93000", 1, 70, 17.5, 0),
        mk("A1009", "20250919", "93000", 1, 70, 17.5, 0),
        {
          id: "A1010", date: "20250919", charge: 180, paid: 0, pr: 0, status: 4,
          lines: [{ code: "99215", units: 1, charge: 180, paid: 0, cas: [["CO", "197", 180]] }],
        },
        {
          id: "A1011", date: "20250920", charge: 95, paid: 0, pr: 0, status: 4,
          lines: [{ code: "36415", units: 1, charge: 95, paid: 0, cas: [["CO", "16", 95]] }],
        },
      ],
      plb: [{ reason: "WO", ref: "OVERPAY0809", amount: 41.2 }],
    },
  ]);
}

export function sampleSchedule() {
  return "99213,92.50\n99214,131.00\n99215,184.00\n93000,17.50\n36415,3.00";
}
