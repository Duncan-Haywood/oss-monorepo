// Workers' compensation experience modification factor (the "x-mod"), NCCI-style split-rating formula:
//   mod = (Ap + W*Ae + (1-W)*Ee + B) / (E + B)
// Ap/Ae are the actual primary/excess losses from the claims, Ee the expected excess losses (E - E*D), E the total
// expected losses. W (weight) and B (ballast) come from the rating worksheet and depend on E and the state; the
// split point, the per-claim accident limit and the medical-only discount (ERA) are state/bureau parameters. They are
// all inputs here because they change by state and year, and a hard-coded table is the way this tool would go stale.
// Independent bureaus (CA, NY, PA, NJ, MI and others) use their own plans; this is NCCI-style arithmetic only.

const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const round3 = (x) => Math.round((x + Number.EPSILON) * 1000) / 1000;

export const DEFAULTS = { splitPoint: 20500, claimLimit: 250000, era: true, eraRate: 0.3 };

// "year, type, amount" per line. type: medical-only (m) or indemnity (i). year is a label only.
export function parseClaims(text) {
  const claims = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split(",").map((s) => s.trim());
    if (p.length > 3) p.splice(2, p.length - 2, p.slice(2).join("")); // "$31,200" keeps its thousands comma
    const amount = Number((p[2] ?? "").replace(/[$ _,]/g, ""));
    const t = (p[1] || "").toLowerCase();
    const type = t === "m" || t.startsWith("med") ? "medical-only" : t === "i" || t.startsWith("ind") || t.startsWith("lost") ? "indemnity" : null;
    if (!p[0] || !type || !(p[2] ?? "") || !Number.isFinite(amount) || amount < 0) {
      return errors.push(`Claim line ${i + 1}: use "policy year, medical-only or indemnity, total incurred".`);
    }
    claims.push({ year: p[0], type, incurred: amount });
  });
  return { claims, errors };
}

// Split one claim into primary and excess losses after the medical-only discount and the per-claim limit.
export function splitClaim(claim, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  let v = claim.incurred;
  if (o.era && claim.type === "medical-only") v *= o.eraRate;
  v = Math.min(v, o.claimLimit);
  const primary = Math.min(v, o.splitPoint);
  return { ...claim, counted: round2(v), primary: round2(primary), excess: round2(v - primary) };
}

export function modFor({ expected, dRatio, weight, ballast }, split) {
  const Ep = expected * dRatio;
  const Ee = expected - Ep;
  const Ap = split.reduce((s, c) => s + c.primary, 0);
  const Ae = split.reduce((s, c) => s + c.excess, 0);
  const num = Ap + weight * Ae + (1 - weight) * Ee + ballast;
  return { mod: num / (expected + ballast), Ap, Ae, Ep, Ee };
}

export function plan(input) {
  const num = (k) => Number(String(input[k] ?? "").replace(/[$ ,_]/g, ""));
  const expected = num("expected"), dRatio = num("dRatio"), weight = num("weight"), ballast = num("ballast");
  const manualPremium = num("manualPremium");
  const opts = {
    splitPoint: input.splitPoint === "" || input.splitPoint == null ? DEFAULTS.splitPoint : num("splitPoint"),
    claimLimit: input.claimLimit === "" || input.claimLimit == null ? DEFAULTS.claimLimit : num("claimLimit"),
    era: input.era !== false && input.era !== "false" && input.era !== "off",
    eraRate: DEFAULTS.eraRate,
  };
  if (!(expected > 0)) return { error: "Expected losses (E) must be above zero. It is on your experience rating worksheet." };
  if (!(dRatio >= 0 && dRatio <= 1)) return { error: "D-ratio must be between 0 and 1 (for example 0.38)." };
  if (!(weight >= 0 && weight <= 1)) return { error: "Weight (W) must be between 0 and 1." };
  if (!(ballast >= 0)) return { error: "Ballast (B) must be zero or more." };
  if (!(opts.splitPoint > 0) || !(opts.claimLimit >= opts.splitPoint)) return { error: "Split point must be above zero and the per-claim limit at least the split point." };
  if (input.manualPremium !== "" && input.manualPremium != null && !(manualPremium >= 0)) return { error: "Manual premium must be zero or more." };
  const { claims, errors } = parseClaims(input.claims);
  if (errors.length) return { error: errors[0], errors };

  const params = { expected, dRatio, weight, ballast };
  const split = claims.map((c) => splitClaim(c, opts));
  const base = modFor(params, split);
  const mod = round3(base.mod);
  const noClaims = round3(modFor(params, []).mod);

  const premium = manualPremium > 0 ? round2(manualPremium * mod) : null;
  const perClaim = split.map((c, i) => {
    const without = round3(modFor(params, split.filter((_, j) => j !== i)).mod);
    const dMod = round3(mod - without);
    return { ...c, modWithout: without, modPoints: dMod, perYear: manualPremium > 0 ? round2(dMod * manualPremium) : null, threeYear: manualPremium > 0 ? round2(dMod * manualPremium * 3) : null };
  });

  const hypo = [];
  for (const amount of [2000, opts.splitPoint, 100000]) {
    const m = round3(modFor(params, [...split, splitClaim({ year: "new", type: "indemnity", incurred: amount }, opts)]).mod);
    hypo.push({ amount, mod: m, perYear: manualPremium > 0 ? round2((m - mod) * manualPremium) : null });
  }

  const advice = [`Estimated experience mod: ${mod.toFixed(3)}${mod < 1 ? " (a credit mod: premium below manual)" : mod > 1 ? " (a debit mod: premium above manual)" : " (unity)"}.`];
  advice.push(`Primary losses counted ${fmt(base.Ap)}, excess ${fmt(base.Ae)}, against expected ${fmt(expected)} (primary share ${fmt(base.Ep)} at D-ratio ${dRatio}).`);
  if (premium !== null) advice.push(`On a manual premium of ${fmt(manualPremium)} the mod puts your premium at ${fmt(premium)}, which is ${fmt(Math.abs(round2(premium - manualPremium)))} ${premium >= manualPremium ? "above" : "below"} manual.`);
  if (claims.length) {
    const worst = [...perClaim].sort((a, b) => b.modPoints - a.modPoints)[0];
    advice.push(`Your most expensive claim for the mod is the ${worst.year} ${worst.type} claim of ${fmt(worst.incurred)}: it adds ${worst.modPoints.toFixed(3)} to the mod${worst.perYear !== null ? `, about ${fmt(worst.perYear)} a year for each of the 3 policy years it stays in the calculation (${fmt(worst.threeYear)})` : ""}.`);
    const medOnly = split.filter((c) => c.type === "medical-only").length;
    if (medOnly && opts.era) advice.push(`${medOnly} medical-only claim${medOnly === 1 ? "" : "s"} counted at ${Math.round(opts.eraRate * 100)}% (the experience rating adjustment). Turn it off if your state does not apply it.`);
  } else advice.push(`With no claims the mod would be ${noClaims.toFixed(3)}: the ballast and weight keep a clean record from reaching zero.`);
  const small = hypo[0], mid = hypo[1];
  advice.push(`Frequency matters more than size here: another $2,000 indemnity claim would move the mod to ${small.mod.toFixed(3)}; a claim at the split point (${fmt(opts.splitPoint)}) to ${mid.mod.toFixed(3)}. Every claim dollar up to the split point counts at full weight.`);
  advice.push("The mod you are charged comes from your rating bureau's worksheet. Check this estimate against it and dispute errors in claim valuation, ownership changes or classification before the worksheet is final.");
  return { mod, noClaims, premium, manualPremium: manualPremium > 0 ? manualPremium : null, parts: base, split, perClaim, hypo, advice, opts };
}

function fmt(x) {
  return "$" + Math.round(x).toLocaleString("en-US");
}

export function sampleInput() {
  return {
    expected: "62000", dRatio: "0.36", weight: "0.19", ballast: "34000", manualPremium: "48000",
    splitPoint: "20500", claimLimit: "250000", era: "on",
    claims: ["2024, indemnity, 31200", "2023, medical-only, 4800", "2023, indemnity, 9100", "2022, medical-only, 1200"].join("\n"),
  };
}

export function toCsv(r) {
  const head = "policy_year,type,incurred,counted,primary,excess,mod_without,mod_points,per_year_cost";
  const lines = r.perClaim.map((c) => [c.year, c.type, c.incurred, c.counted, c.primary, c.excess, c.modWithout.toFixed(3), c.modPoints.toFixed(3), c.perYear === null ? "" : c.perYear.toFixed(2)].map((x) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x)).join(","));
  return [head, ...lines, `mod,,,,,,${r.mod.toFixed(3)},,`].join("\n") + "\n";
}
