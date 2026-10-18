// EU DAC7 seller reporting: will an online platform (Etsy, eBay, Vinted, Airbnb,
// Amazon, a booking site...) report this seller's activity to a tax authority for
// a calendar year, what does it report, and what does the seller have to do.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// The rules were written from memory of Directive (EU) 2021/514 (DAC7) WITHOUT
// network access in the building session; national transpositions differ in
// detail, so every result names a source to verify. Being reported is not the same
// as owing tax: the report goes to the tax authority, the tax rules are separate.

export const GOODS_MAX_SALES = 30;
export const GOODS_MAX_CONSIDERATION = 2000;
export const REPORT_DEADLINE = "31 January";
export const CLOSE_ACCOUNT_DAYS = 60;

export const ACTIVITIES = [
  { id: "goods", label: "Selling goods (items, handmade, second-hand)", exempt: true },
  { id: "services", label: "Personal services (tutoring, delivery, freelance gigs)", exempt: false },
  { id: "property", label: "Renting out property (holiday home, room, parking space)", exempt: false },
  { id: "transport", label: "Renting out transport (car, bike, boat)", exempt: false },
];

export const SELLER_TYPES = [
  { id: "individual", label: "Individual or sole trader" },
  { id: "company", label: "Company or other entity" },
  { id: "excluded", label: "Listed company, government body or similar" },
];

export const VERIFY = "Council Directive (EU) 2021/514 (DAC7) amending 2011/16/EU, Annex V, and your Member State's transposition law and tax-authority guidance";

const PER_ACTIVITY = {
  goods: "Number of items sold, total consideration, and platform fees or commissions, split by quarter.",
  services: "Number of services, total consideration, and platform fees or commissions, split by quarter.",
  property: "Address of each listing, days rented, type of property and consideration, split by quarter.",
  transport: "Number of days rented, type of transport and consideration, split by quarter.",
};

function whole(v, name, errors) {
  if (v === "" || v === null || v === undefined) { errors.push(`Enter ${name}.`); return null; }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) { errors.push(`${name[0].toUpperCase()}${name.slice(1)} must be a number, zero or more.`); return null; }
  return n;
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const activity = ACTIVITIES.find((a) => a.id === i.activity);
  if (!activity) errors.push("Choose the kind of activity you do on the platform.");
  const sellerType = SELLER_TYPES.some((s) => s.id === i.sellerType) ? i.sellerType : null;
  if (!sellerType) errors.push("Choose whether you sell as an individual, a company or an excluded entity.");
  const transactions = whole(i.transactions, "the number of transactions this calendar year", errors);
  if (transactions !== null && !Number.isInteger(transactions)) errors.push("The number of transactions must be a whole number.");
  const consideration = whole(i.consideration, "the total amount paid to you this calendar year (EUR)", errors);
  const platforms = i.platforms === "" || i.platforms === undefined ? 1 : Number(i.platforms);
  if (!Number.isInteger(platforms) || platforms < 1) errors.push("Number of platforms must be a whole number, one or more.");
  const hasTin = i.hasTin === true || i.hasTin === "yes";
  return { errors, activity: activity ? activity.id : "", sellerType, transactions, consideration, platforms, hasTin };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const act = ACTIVITIES.find((a) => a.id === p.activity);
  const findings = [];
  let reportable;
  let reason;
  let headroom = null;

  if (p.sellerType === "excluded") {
    reportable = false;
    reason = "Government bodies, listed companies and their related entities are excluded sellers; the platform does not report them.";
  } else if (act.exempt && p.transactions < GOODS_MAX_SALES && p.consideration <= GOODS_MAX_CONSIDERATION) {
    reportable = false;
    reason = `Selling goods: fewer than ${GOODS_MAX_SALES} sales and no more than EUR ${GOODS_MAX_CONSIDERATION.toLocaleString("en-GB")} in the year, on this platform, is below the de minimis line.`;
    headroom = {
      sales: GOODS_MAX_SALES - 1 - p.transactions,
      amount: GOODS_MAX_CONSIDERATION - p.consideration,
    };
  } else if (act.exempt) {
    reportable = true;
    const which = [];
    if (p.transactions >= GOODS_MAX_SALES) which.push(`${p.transactions} sales (the exemption needs fewer than ${GOODS_MAX_SALES})`);
    if (p.consideration > GOODS_MAX_CONSIDERATION) which.push(`EUR ${p.consideration.toLocaleString("en-GB")} (the exemption needs EUR ${GOODS_MAX_CONSIDERATION.toLocaleString("en-GB")} or less)`);
    reason = `Selling goods: you are over the de minimis line on ${which.join(" and ")}. Either limit being crossed makes the whole year reportable.`;
  } else {
    reportable = true;
    reason = `${act.label.split(" (")[0]} has no de minimis exemption: if you are active on a platform in a covered Member State, the platform reports you even for one transaction.`;
  }

  findings.push({ severity: reportable ? "high" : "info", title: reportable ? `Likely reported: ${reason}` : `Likely not reported: ${reason}` });

  if (reportable) {
    findings.push({ severity: "info", title: `What the platform sends: your name, address, tax identification number (TIN), date of birth if an individual, VAT number if you have one, and the financial account paid. For the activity: ${PER_ACTIVITY[p.activity]}` });
    findings.push({ severity: "medium", title: `When: the platform reports to its tax authority by ${REPORT_DEADLINE} after the year ends, and gives you a copy of what it reported. The tax authority can then share it with the authority where you live or where the property is.` });
    findings.push({ severity: p.hasTin ? "info" : "high", title: p.hasTin ? "You have your tax identification number ready. Give the platform the same number you use on your tax return." : `You have not got your tax identification number to hand. The platform must ask for it and, after two reminders, close your account or withhold payments about ${CLOSE_ACCOUNT_DAYS} days after the first request. Get your TIN and fill in the platform's tax form before the reminders.` });
    findings.push({ severity: "medium", title: "Reported does not mean taxable, and not reported does not mean tax-free. Check that your own return already shows this income; the authority will now be able to match what the platform sent against it." });
  } else {
    findings.push({ severity: "info", title: "The platform may still ask for your details and report you if you cross the line later in the year; the count restarts each calendar year." });
    if (headroom && headroom.sales >= 0 && headroom.amount >= 0) {
      findings.push({ severity: "medium", title: `Headroom this year on this platform: up to ${headroom.sales} more sale${headroom.sales === 1 ? "" : "s"} and EUR ${headroom.amount.toLocaleString("en-GB")} more before the exemption is lost, whichever comes first.` });
    }
  }
  if (p.platforms > 1) findings.push({ severity: "medium", title: `You use ${p.platforms} platforms. The de minimis line is measured per platform operator, so each platform counts only its own sales for you, but each one that crosses it reports separately. Run this for each platform with its own totals.` });
  findings.push({ severity: "info", title: "Platforms outside the EU that serve EU sellers must register and report too. The UK and several other countries run similar reporting rules; this tool covers the EU DAC7 only." });
  return { errors: [], input: p, reportable, reason, headroom, findings };
}

export const SAMPLE = { activity: "goods", sellerType: "individual", transactions: 41, consideration: 1650, platforms: 1, hasTin: "no" };

export function summaryText(r) {
  return [
    "DAC7 seller reporting check (first read, not legal or tax advice)",
    `Likely reported by the platform: ${r.reportable ? "yes" : "no"}`,
    r.reason,
    r.headroom && r.headroom.sales >= 0 ? `Headroom: ${r.headroom.sales} more sales / EUR ${r.headroom.amount} more` : "",
    `Platform reports by ${REPORT_DEADLINE} following the year.`,
    `Verify against: ${VERIFY}`,
    "",
    "Confirm with your tax authority or adviser.",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}
