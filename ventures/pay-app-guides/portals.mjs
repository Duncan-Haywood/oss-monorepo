// What a GC's payment portal charges the subcontractor, from the portal
// vendors' own published help pages (read 2026-11-25 through search results
// limited to docs.oracle.com, support.procore.com and help.trimble.com).
//
// Money is in integer cents, like calc.mjs. A rate is a fraction (0.0022).
import { toCents } from "./calc.mjs";

export const PORTALS = {
  textura: {
    name: "Oracle Textura Payment Management",
    rate: 0.0022,
    cap: 500000,
    capBefore2023: 375000,
    subTierFlat: 10000,
    basis: "contract value, charged when the contract is confirmed",
    source: "https://docs.oracle.com/cd/E97085_01/TPMhelp/en/North_America/10316948.htm",
  },
  procore: {
    name: "Procore Pay",
    rate: 0.002,
    cap: 400000,
    basis: "each invoice paid, capped per commitment, only when the GC leaves the fee on the subcontractor",
    source: "https://support.procore.com/products/online/procore-pay/faq/what-fee-models-does-procore-offer-to-payors-using-procore-pay",
  },
  trimble: {
    name: "Trimble Pay (invited by the GC)",
    rate: 0,
    cap: 0,
    basis: "free to submit when a prime contractor invites you",
    source: "https://help.trimble.com/doc/trimble-pay/trimble-pay/invited-subcontractors/quick-start",
  },
};

// Fee one subcontract pays on a portal.
// opts.before2023: Textura project created before 20 Jan 2023 (old cap).
// opts.subTier: you are a lower-tier sub on Textura (flat fee per contract).
// opts.gcPays: Procore Pay with the "General Contractor Pays" fee model.
export function portalFee({ contract, portal, before2023 = false, subTier = false, gcPays = false }) {
  const errors = [];
  const p = PORTALS[portal];
  if (!p) errors.push("Pick a portal.");
  const c = toCents(contract);
  if (Number.isNaN(c) || String(contract ?? "").trim() === "") errors.push("Enter the subcontract value as a number, like 250000.");
  else if (c <= 0) errors.push("The subcontract value must be more than zero.");
  if (errors.length) return { errors };
  let fee;
  let rule;
  if (portal === "textura" && subTier) {
    fee = p.subTierFlat;
    rule = "flat fee per contract for a lower-tier subcontractor";
  } else if (portal === "procore" && gcPays) {
    fee = 0;
    rule = "the GC pays the fee under the General Contractor Pays model";
  } else {
    const cap = portal === "textura" && before2023 ? p.capBefore2023 : p.cap;
    const raw = Math.round(c * p.rate);
    fee = cap ? Math.min(raw, cap) : raw;
    rule = p.rate === 0 ? p.basis : `${(p.rate * 100).toFixed(2)}% of ${p.basis}${cap && raw > cap ? `, capped at the maximum` : ""}`;
  }
  return { errors: [], fee, share: fee / c, rule, source: p.source };
}

// Yearly cost of the portal fees across a year's subcontracts (one fee per
// subcontract) next to a monthly software price, so the two can be read
// side by side. Not a recommendation: a GC's portal is usually not optional.
export function yearOfPortalFees({ jobs, averageContract, portal, before2023 = false, subTier = false, gcPays = false }) {
  const t = String(jobs ?? "").trim();
  const n = Number(t);
  if (!/^\d+$/.test(t)) return { errors: ["Enter the number of portal jobs a year as a whole number."] };
  const one = portalFee({ contract: averageContract, portal, before2023, subTier, gcPays });
  if (one.errors.length) return one;
  return { errors: [], perJob: one.fee, total: one.fee * n, rule: one.rule, source: one.source };
}
