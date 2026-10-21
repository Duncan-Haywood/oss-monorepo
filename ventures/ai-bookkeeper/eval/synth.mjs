// A seeded, synthetic year of bank and card lines for a small design studio,
// with the account each line truly belongs to. Used for the page's example and
// for the learning-curve benchmark (eval/benchmark.mjs). It is NOT real bank
// data: payees, amounts and the messiness of the descriptions are modelled on
// how US bank exports commonly look, and the benchmark says so.

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// [display names (variants), account, direction, perMonth, typical $, spread, where]
// where: "checking" | "card"; accounts on ledger.mjs DEFAULT_ACCOUNTS.
// Several payees are deliberately ambiguous (Amazon, Costco, Venmo) so the
// learner meets the same name filed in two places.
const PAYEES = [
  [["STRIPE TRANSFER", "STRIPE PAYOUT ST-{ref}"], "4000", "in", 4, 1800, 0.5, "checking"],
  [["ACME CORP ACH PMT {ref}", "ACME CORPORATION PAYMENT"], "4000", "in", 1, 4500, 0.2, "checking"],
  [["DEPOSIT MOBILE {ref}", "MOBILE CHECK DEPOSIT"], "4000", "in", 0.6, 1200, 0.6, "checking"],
  [["INTEREST PAID"], "4200", "in", 1, 3, 0.4, "checking"],
  [["GUSTO PAYROLL {ref}", "GUSTO NET PAY"], "6150", "out", 2, 2600, 0.05, "checking"],
  [["GUSTO TAX {ref}"], "6110", "out", 2, 900, 0.05, "checking"],
  [["WEWORK MEMBERSHIP {ref}", "WEWORK {ref} NEW YORK NY"], "6080", "out", 1, 650, 0, "checking"],
  [["HISCOX INC INSURANCE", "HISCOX {ref}"], "6030", "out", 1, 48, 0, "checking"],
  [["MONTHLY SERVICE FEE"], "6010", "out", 1, 15, 0, "checking"],
  [["OWNER DRAW TRANSFER TO {ref}", "ONLINE TRANSFER TO PERSONAL {ref}"], "3100", "out", 1, 3000, 0.3, "checking"],
  [["SBA LOAN PMT {ref}"], "2200", "out", 1, 410, 0, "checking"],
  [["UPWORK {ref} ESCROW", "UPWORK -{ref}REF"], "6020", "out", 1.5, 520, 0.6, "card"],
  [["ADOBE *CREATIVE CLD {ref}", "ADOBE *ADOBE {ref} SAN JOSE CA"], "6060", "out", 1, 59.99, 0, "card"],
  [["FIGMA MONTHLY", "FIGMA {ref} SAN FRANCISCO CA"], "6060", "out", 1, 45, 0, "card"],
  [["GOOGLE *GSUITE_{ref}", "GOOGLE *WORKSPACE {ref}"], "6060", "out", 1, 28.8, 0, "card"],
  [["NOTION LABS INC", "NOTION.SO {ref}"], "6060", "out", 1, 20, 0, "card"],
  [["AMZN MKTP US*{ref}", "AMAZON.COM*{ref} AMZN.COM/BILL WA"], "6100", "out", 2, 60, 0.9, "card"],
  [["AMZN MKTP US*{ref}", "AMAZON.COM*{ref} AMZN.COM/BILL WA"], "6070", "out", 0.8, 30, 0.7, "card"],
  [["COSTCO WHSE #{store}"], "6100", "out", 0.5, 140, 0.5, "card"],
  [["COSTCO WHSE #{store}"], "3100", "out", 0.4, 180, 0.5, "card"],
  [["SQ *BLUE BOTTLE {store} {city}", "SQ *BLUE BOTTLE COFFEE"], "6130", "out", 3, 9.5, 0.4, "card"],
  [["TST* PEARL DINER {store}", "TST*PEARL DINER {city}"], "6130", "out", 1, 42, 0.5, "card"],
  [["UBER   *TRIP {ref}", "UBER *TRIP HELP.UBER.COM"], "6120", "out", 2, 24, 0.6, "card"],
  [["DELTA AIR {ref}", "DELTA AIR LINES {ref} ATLANTA"], "6120", "out", 0.3, 410, 0.4, "card"],
  [["META ADS {ref}", "FACEBK *{ref} FB.ME/ADS CA"], "6000", "out", 1, 300, 0.5, "card"],
  [["VERIZON WRLS {ref}", "VZWRLSS*APOCC VISB"], "6140", "out", 1, 85, 0.05, "card"],
  [["COMCAST BUSINESS {ref}"], "6140", "out", 1, 119, 0, "card"],
  [["USPS PO {store} {city}", "STAMPS.COM"], "6070", "out", 0.7, 18, 0.6, "card"],
  [["PIRATE SHIP {ref}"], "6180", "out", 1, 35, 0.6, "card"],
  [["SHELL OIL {store}", "CHEVRON {store} {city}"], "6160", "out", 1.5, 52, 0.3, "card"],
  [["VENMO *J SMITH DESIGN", "VENMO PAYMENT {ref}"], "6020", "out", 0.5, 300, 0.4, "checking"],
  [["VENMO PAYMENT {ref}"], "3100", "out", 0.4, 60, 0.6, "checking"],
  [["NETFLIX.COM"], "3100", "out", 1, 15.49, 0, "card"],
  [["SMITH & CO CPA", "SMITH AND CO CPA {ref}"], "6050", "out", 0.25, 750, 0.2, "checking"],
  [["UDEMY {ref}", "SKILLSHARE {ref}"], "6170", "out", 0.3, 40, 0.5, "card"],
  [["APPLE.COM/US {ref}", "APPLE STORE #{store}"], "1500", "out", 0.08, 2600, 0.2, "card"],
  [["STRIPE FEE ADJ {ref}"], "6010", "out", 0.3, 12, 0.6, "checking"],
  [["NY DEPT TAX SALES {ref}"], "2100", "out", 0.33, 420, 0.3, "checking"],
];

// One-off local merchants: a word that carries the category plus a random name.
const NAMES = ["RIVERSIDE", "MAPLE", "SUMMIT", "HARBOR", "OAK", "UNION", "PIONEER", "LIBERTY", "CEDAR", "GOLDEN", "NORTHSIDE", "CITY", "METRO", "VALLEY", "EASTSIDE", "PARK"];
const ONE_OFF = [
  ["{n} HARDWARE", "6100"], ["{n} DINER", "6130"], ["{n} CAFE", "6130"], ["{n} PIZZA", "6130"], ["{n} PARKING", "6160"],
  ["{n} PRINT SHOP", "6000"], ["{n} OFFICE SUPPLY", "6070"], ["{n} HOTEL", "6120"], ["{n} TAXI", "6120"], ["{n} AUTO REPAIR", "6090"],
  ["{n} COMPUTER REPAIR", "6090"], ["{n} BAKERY", "6130"], ["{n} FUEL", "6160"], ["{n} STATIONERS", "6070"], ["{n} LUMBER", "6100"],
];
const CITIES = ["BROOKLYN NY", "NEW YORK NY", "JERSEY CITY NJ", "HOBOKEN NJ"];
const WRAP = ["{d}", "{d}", "POS DEBIT {d}", "PURCHASE AUTHORIZED ON {mm}/{dd} {d} CARD 4417", "DEBIT CARD PURCHASE {d}", "{d} {mm}/{dd}"];

const pad = (n) => String(n).padStart(2, "0");
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

function render(r, tpl, mm, dd, wrapIt) {
  let d = tpl.replace("{ref}", () => Math.floor(r() * 1e8).toString(36).toUpperCase()).replace("{store}", () => String(Math.floor(r() * 9000) + 100)).replace("{city}", () => pick(r, CITIES));
  return wrapIt ? pick(r, WRAP).replace("{d}", d).replace("{mm}", mm).replace("{dd}", dd) : d;
}

// -> [{ date, desc, cents, account: "checking"|"card", truth }] sorted by date.
export function generateYear({ seed = 1, year = 2026, months = 12, oneOffPerMonth = 6 } = {}) {
  const r = rng(seed);
  const out = [];
  for (let m = 0; m < months; m++) {
    const mm = pad(m + 1);
    const dim = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    for (const [names, truth, d, perMonth, typical, spread, where] of PAYEES) {
      let k = Math.floor(perMonth) + (r() < perMonth % 1 ? 1 : 0);
      for (let i = 0; i < k; i++) {
        const day = Math.floor(r() * dim) + 1;
        const amt = Math.max(1, Math.round(typical * (1 + spread * (r() * 2 - 1)) * 100));
        out.push({ date: `${year}-${mm}-${pad(day)}`, desc: render(r, pick(r, names), mm, pad(day), where === "checking" && d === "out"), cents: d === "in" ? amt : -amt, account: where, truth });
      }
    }
    for (let i = 0; i < oneOffPerMonth; i++) {
      const [tpl, truth] = pick(r, ONE_OFF);
      const day = Math.floor(r() * dim) + 1;
      out.push({ date: `${year}-${mm}-${pad(day)}`, desc: render(r, tpl.replace("{n}", pick(r, NAMES)) + " {city}", mm, pad(day), r() < 0.4), cents: -Math.round((15 + r() * 120) * 100), account: "card", truth });
    }
    // The card is paid from checking each month: the two sides of a transfer.
    const pay = Math.round((1200 + r() * 600) * 100);
    out.push({ date: `${year}-${mm}-${pad(Math.min(dim, 25))}`, desc: "CHASE CREDIT CRD AUTOPAY {ref}".replace("{ref}", Math.floor(r() * 1e6)), cents: -pay, account: "checking", truth: "2000" });
    out.push({ date: `${year}-${mm}-${pad(Math.min(dim, 27))}`, desc: "AUTOMATIC PAYMENT - THANK YOU", cents: pay, account: "card", truth: "1000" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Statement CSVs in the shape banks export: checking with a running balance,
// the card with charges as positive numbers (so import it with invert).
export function toCsv(lines, where, { opening = 0 } = {}) {
  const q = (s) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const usd = (c) => (c / 100).toFixed(2);
  const rows = lines.filter((l) => l.account === where);
  if (where === "card") return ["Transaction Date,Description,Amount", ...rows.map((l) => `${l.date.slice(5, 7)}/${l.date.slice(8)}/${l.date.slice(0, 4)},${q(l.desc)},${usd(-l.cents)}`)].join("\n") + "\n";
  let bal = opening;
  return ["Date,Description,Amount,Balance", ...rows.map((l) => { bal += l.cents; return `${l.date},${q(l.desc)},${usd(l.cents)},${usd(bal)}`; })].join("\n") + "\n";
}
