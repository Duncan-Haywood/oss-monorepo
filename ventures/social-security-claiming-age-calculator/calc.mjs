// Social Security claiming-age model. Pure functions, no I/O, no imports.
// Rules read from SSA's published text (ssa.gov/oact/quickcalc/early_late.html,
// /benefits/retirement/planner/delayret.html, /benefits/survivors/ifyou.html
// and the spousal-benefit pages). Everything is in today's dollars: COLAs are
// assumed equal to inflation, so the only rate that matters is the real
// discount rate the visitor chooses.

export const MIN_AGE = 62 * 12;
export const MAX_AGE = 70 * 12;

export function money(n) {
  const v = Math.round(Math.abs(n));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Full retirement age in months, from birth year (SSA table).
export function fraMonths(birthYear) {
  const y = Math.trunc(birthYear);
  if (y <= 1937) return 65 * 12;
  if (y >= 1960) return 67 * 12;
  if (y <= 1942) return 65 * 12 + (y - 1937) * 2;
  if (y <= 1954) return 66 * 12;
  return 66 * 12 + (y - 1954) * 2;
}

// Survivor full retirement age in months (SSA survivor table).
export function survivorFraMonths(birthYear) {
  const y = Math.trunc(birthYear);
  if (y <= 1939) return 65 * 12;
  if (y <= 1944) return 65 * 12 + (y - 1939) * 2;
  if (y <= 1956) return 66 * 12;
  if (y <= 1961) return 66 * 12 + (y - 1956) * 2;
  return 67 * 12;
}

// Own retirement benefit as a share of PIA when claimed at `claim` months of age.
export function ownFactor(claim, fra) {
  const c = Math.min(Math.max(claim, MIN_AGE), MAX_AGE);
  if (c >= fra) return 1 + ((c - fra) * 2) / 3 / 100;
  const early = fra - c;
  const first = Math.min(early, 36);
  return 1 - (first * 5) / 9 / 100 - (Math.max(early - 36, 0) * 5) / 12 / 100;
}

// Spousal excess benefit as a share of its full amount when it starts at `start` months of age.
export function spousalFactor(start, fra) {
  if (start >= fra) return 1;
  const early = fra - Math.max(start, MIN_AGE);
  const first = Math.min(early, 36);
  return 1 - (first * 25) / 36 / 100 - (Math.max(early - 36, 0) * 5) / 12 / 100;
}

// Survivor benefit as a share of the deceased's benefit, starting at `start` months of age
// (not before 60): 71.5% at 60 rising evenly to 100% at survivor FRA.
export function survivorFactor(start, sFra) {
  const s = Math.max(start, 60 * 12);
  if (s >= sFra) return 1;
  return 0.715 + (0.285 * (s - 60 * 12)) / (sFra - 60 * 12);
}

function num(v) {
  if (v === "" || v === null || v === undefined) return NaN;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function person(raw, label) {
  const by = num(raw.birthYear), bm = num(raw.birthMonth) || 1, pia = num(raw.pia), die = num(raw.dieAge);
  if (!(by >= 1930 && by <= 2010)) return { error: `${label}: enter a birth year between 1930 and 2010.` };
  if (!(bm >= 1 && bm <= 12)) return { error: `${label}: pick a birth month.` };
  if (!(pia > 0 && pia < 10000)) return { error: `${label}: enter the monthly benefit at full retirement age from your Social Security statement (a positive amount under $10,000).` };
  if (!(die >= 63 && die <= 110)) return { error: `${label}: plan-to age must be between 63 and 110.` };
  const fra = fraMonths(by);
  return { label, birth: by * 12 + (bm - 1), by, pia, fra, sFra: survivorFraMonths(by), die: Math.round(die * 12) };
}

// What a person's own check would be if claimed at `claim` months, in dollars a month.
export function ownBenefit(p, claim) {
  return p.pia * ownFactor(claim, p.fra);
}

// The benefit a survivor inherits: what the deceased was actually receiving (or would have
// been, at death), floored at 82.5% of PIA when they claimed early.
function deceasedBase(d, claimD, deathAbs) {
  const deathAge = deathAbs - d.birth;
  const effClaim = Math.min(claimD, Math.max(deathAge, MIN_AGE));
  const own = ownBenefit(d, effClaim);
  return effClaim < d.fra ? Math.max(own, 0.825 * d.pia) : own;
}

// Lifetime present value of household benefits for one claiming pair and one pair of death ages.
// a, b: person objects (b may be null). ca, cb: claim ages in months. Returns { pv, total, months }.
export function simulate(a, b, ca, cb, disc) {
  const ppl = b ? [a, b] : [a];
  const claim = [ca, cb];
  const start0 = Math.min(...ppl.map((p) => p.birth)) + MIN_AGE;
  const end = Math.max(...ppl.map((p) => p.birth + p.die));
  const dAbs = ppl.map((p) => p.birth + p.die);
  const mDisc = Math.pow(1 + disc, 1 / 12);
  let pv = 0, total = 0, paid = 0;
  // Survivor start month for each person is fixed by the rule below, not per-iteration.
  const surv = ppl.map((p, i) => {
    if (ppl.length < 2) return null;
    const j = 1 - i;
    const deathJ = dAbs[j];
    if (deathJ >= dAbs[i]) return null; // i dies first, or together: no survivor benefit for i
    const startAbs = Math.max(deathJ, p.birth + p.sFra);
    if (startAbs >= dAbs[i]) return null;
    const base = deceasedBase(ppl[j], claim[j], deathJ);
    const amt = base * survivorFactor(startAbs - p.birth, p.sFra);
    return { startAbs, amt };
  });
  for (let t = start0; t < end; t++) {
    let hh = 0;
    for (let i = 0; i < ppl.length; i++) {
      const p = ppl[i];
      if (t >= dAbs[i]) continue;
      const own = t >= p.birth + claim[i] ? ownBenefit(p, claim[i]) : 0;
      let extra = 0;
      if (ppl.length > 1) {
        const j = 1 - i, q = ppl[j];
        const aliveJ = t < dAbs[j];
        if (aliveJ && own > 0 && t >= q.birth + claim[j]) {
          const spStart = Math.max(p.birth + claim[i], q.birth + claim[j]);
          if (t >= spStart) {
            const excess = Math.max(0, 0.5 * q.pia - p.pia);
            extra = excess * spousalFactor(spStart - p.birth, p.fra);
          }
        }
      }
      let mine = own + extra;
      const s = surv[i];
      if (s && t >= s.startAbs) mine = Math.max(mine, s.amt);
      hh += mine;
    }
    total += hh;
    pv += hh / Math.pow(mDisc, t - start0);
    if (hh > 0) paid++;
  }
  return { pv, total, months: paid };
}

// Break-even: the first age (in months) at which cumulative benefits from claiming at `late`
// reach those from claiming at `early`, with no discounting. null when waiting pays no more per month.
export function breakEven(p, early, late) {
  const e = ownBenefit(p, early), l = ownBenefit(p, late);
  if (l <= e) return null;
  const head = e * (late - early);
  const months = head / (l - e);
  return late + Math.ceil(months);
}

export function ageLabel(m) {
  const y = Math.floor(m / 12), r = m % 12;
  return r ? `${y} and ${r} month${r === 1 ? "" : "s"}` : String(y);
}

// Claim ages worth showing: every whole year 62..70 plus the exact full retirement age.
export function candidateAges(fra) {
  const set = new Set();
  for (let y = 62; y <= 70; y++) set.add(y * 12);
  if (fra >= MIN_AGE && fra <= MAX_AGE) set.add(fra);
  return [...set].sort((x, y) => x - y);
}

function single(a, disc) {
  const ages = candidateAges(a.fra);
  const rows = ages.map((c) => {
    const r = simulate(a, null, c, 0, disc);
    return { claim: c, label: ageLabel(c), monthly: ownBenefit(a, c), factor: ownFactor(c, a.fra), pv: r.pv, total: r.total };
  });
  const best = rows.reduce((m, r) => (r.pv > m.pv ? r : m), rows[0]);
  const at = (c) => rows.find((r) => r.claim === c);
  return { rows, best, breakevens: [
    { from: MIN_AGE, to: a.fra, age: breakEven(a, MIN_AGE, a.fra) },
    { from: MIN_AGE, to: MAX_AGE, age: breakEven(a, MIN_AGE, MAX_AGE) },
    { from: a.fra, to: MAX_AGE, age: breakEven(a, a.fra, MAX_AGE) },
  ], at };
}

function couple(a, b, disc, scenarioDeaths) {
  const out = [];
  for (const sc of scenarioDeaths) {
    const aa = { ...a, die: sc.a * 12 }, bb = { ...b, die: sc.b * 12 };
    const ca = candidateAges(a.fra), cb = candidateAges(b.fra);
    let best = null;
    const grid = [];
    for (const x of ca) {
      const row = [];
      for (const y of cb) {
        const r = simulate(aa, bb, x, y, disc);
        row.push(r.pv);
        if (!best || r.pv > best.pv) best = { a: x, b: y, pv: r.pv, total: r.total };
      }
      grid.push(row);
    }
    const both62 = simulate(aa, bb, MIN_AGE, MIN_AGE, disc).pv;
    const bothFra = simulate(aa, bb, a.fra, b.fra, disc).pv;
    out.push({ name: sc.name, deathA: sc.a, deathB: sc.b, best, both62, bothFra, gridAges: { a: ca, b: cb }, grid });
  }
  return out;
}

export function sampleInput() {
  return { mode: "couple", a: { birthYear: "1964", birthMonth: "3", pia: "3200", dieAge: "88" }, b: { birthYear: "1966", birthMonth: "9", pia: "1400", dieAge: "92" }, discount: "1" };
}

export function analyze(raw) {
  const mode = raw.mode === "couple" ? "couple" : "single";
  const a = person(raw.a || {}, mode === "couple" ? "Person A" : "You");
  if (a.error) return { error: a.error };
  let b = null;
  if (mode === "couple") {
    b = person(raw.b || {}, "Person B");
    if (b.error) return { error: b.error };
  }
  const d = raw.discount === "" || raw.discount === undefined ? 1 : num(raw.discount);
  if (!(d >= 0 && d <= 10)) return { error: "Discount rate must be between 0 and 10 percent." };
  const disc = d / 100;
  const s = single(a, disc);
  const findings = [];
  const fraLabel = ageLabel(a.fra);
  findings.push({ severity: "info", title: `${a.label}: full retirement age is ${fraLabel}`, detail: `Claiming at 62 pays ${(ownFactor(MIN_AGE, a.fra) * 100).toFixed(1)}% of the full-retirement-age amount for life; claiming at 70 pays ${(ownFactor(MAX_AGE, a.fra) * 100).toFixed(1)}%.` });
  const be = s.breakevens[1].age;
  if (be) findings.push({ severity: "info", title: `Break-even for waiting from 62 to 70 is about age ${Math.floor(be / 12)}`, detail: `Without discounting, the larger check from 70 has paid more in total than claiming at 62 only if ${a.label === "You" ? "you live" : a.label + " lives"} past about age ${Math.floor(be / 12)} and ${be % 12} months.` });
  const res = { mode, a, b, disc, single: s, findings };
  if (mode === "couple") {
    const high = a.pia >= b.pia ? "a" : "b";
    const hp = high === "a" ? a : b;
    const scenarios = [
      { name: "Planning ages", a: Math.round(a.die / 12), b: Math.round(b.die / 12) },
      { name: "Both die at 80", a: 80, b: 80 },
      { name: "Both live to 95", a: 95, b: 95 },
      high === "a"
        ? { name: "Higher earner dies at 75, the other lives to 95", a: 75, b: 95 }
        : { name: "Higher earner dies at 75, the other lives to 95", a: 95, b: 75 },
    ];
    res.couple = couple(a, b, disc, scenarios);
    res.higher = high;
    const plan = res.couple[0], early = res.couple[3];
    const claimOf = (sc, who) => (who === "a" ? sc.best.a : sc.best.b);
    const hi = claimOf(plan, high), hiEarly = claimOf(early, high);
    findings.push({ severity: "info", title: `Best pair at your planning ages: ${a.label} at ${ageLabel(plan.best.a)}, ${b.label} at ${ageLabel(plan.best.b)}`, detail: `That pair has the highest present value of household benefits in this model, ${plan.best.pv > plan.both62 ? "$" + money(plan.best.pv - plan.both62) + " more than both claiming at 62" : "no better than both claiming at 62"} and ${plan.best.pv >= plan.bothFra ? "$" + money(plan.best.pv - plan.bothFra) + " more" : "$" + money(plan.bothFra - plan.best.pv) + " less"} than both at full retirement age.` });
    if (hi < MAX_AGE) findings.push({ severity: "medium", title: `The higher earner's claim age is what the survivor keeps`, detail: `When one spouse dies the survivor keeps the larger of the two checks, so the higher earner's claim age sets the household's floor for whoever lives longest. Here the best higher-earner claim age is ${ageLabel(hi)} at planning ages and ${ageLabel(hiEarly)} if that person dies at 75 and the other lives to 95.` });
    else findings.push({ severity: "info", title: `Waiting until 70 wins for the higher earner in every case shown`, detail: `The higher earner's delayed credits are inherited by the survivor, which is why it is the claim age most likely to pay off for a couple.` });
    if (Math.min(a.pia, b.pia) * 2 < Math.max(a.pia, b.pia)) findings.push({ severity: "info", title: "A spousal top-up applies", detail: "The lower earner's own benefit is below half of the higher earner's, so a spousal amount is added once both have claimed. It is reduced if it starts before full retirement age and never grows past it." });
  }
  return res;
}

export function reportCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["claim_age", "monthly_benefit", "percent_of_full", "lifetime_total_today_dollars", "present_value_today_dollars"].join(",")];
  for (const r of a.single.rows) lines.push([q(r.label), r.monthly.toFixed(0), (r.factor * 100).toFixed(1), r.total.toFixed(0), r.pv.toFixed(0)].join(","));
  if (a.couple) {
    lines.push("", ["scenario", "a_claim", "b_claim", "present_value"].join(","));
    for (const s of a.couple) lines.push([q(s.name), q(ageLabel(s.best.a)), q(ageLabel(s.best.b)), s.best.pv.toFixed(0)].join(","));
  }
  return lines.join("\n");
}
