// UK Self Assessment payments on account: what the 31 January bill really is, what 31 July adds, and what reducing the payments risks.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Written from memory WITHOUT network access in the building session. Rules modelled: each payment on account is 50% of the previous year's
// Self Assessment bill (income tax and Class 4 NIC, net of tax collected at source); due 31 January in and 31 July after the tax year;
// not required when that bill was under GBP 1,000 or when 80% or more of the year's liability was collected at source; the balancing payment
// and first payment on account for the next year fall due together on 31 January after the tax year. Interest rate is an input: HMRC's
// late payment rate changes with the Bank of England base rate.

export const VERIFY = "GOV.UK 'Understand your Self Assessment tax bill' (payments on account), 'Reduce your payments on account' and 'Rates and thresholds for late payment interest'; Taxes Management Act 1970 s59A";
export const THRESHOLD = 1000;
export const SOURCE_SHARE = 0.8;
export const DEFAULT_RATE = 7.75;
export const YEARS = { 2025: "2025/26", 2026: "2026/27" };

const money = (n) => "GBP " + Number(Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;

export function parse(input) {
  const i = input || {};
  const errors = [];
  const num = (key, label, optional) => {
    const v = i[key];
    if (v === undefined || v === null || v === "") { if (!optional) errors.push(`Enter ${label}.`); return 0; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) { errors.push(`Enter ${label} as zero or more.`); return 0; }
    return n;
  };
  const bill = num("bill", "your total Self Assessment liability for the year (income tax plus Class 4 NIC, before anything already deducted)");
  const atSource = num("atSource", "tax already collected at source, such as PAYE (zero if none)", true);
  const paid = num("paid", "payments on account already made towards this year (zero if none)", true);
  const next = num("next", "your expected liability next year (leave blank to skip)", true);
  const rate = i.rate === undefined || i.rate === null || i.rate === "" ? DEFAULT_RATE : Number(i.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 30) errors.push("Enter the HMRC late payment interest rate as a percentage between 0 and 30.");
  const year = Number(i.year);
  if (!YEARS[year]) errors.push("Pick the tax year.");
  if (!errors.length && atSource > bill) errors.push("Tax collected at source cannot be more than the total liability; a refund is not a payment on account.");
  return { errors, bill, atSource, paid, next, nextGiven: !(i.next === undefined || i.next === null || i.next === ""), rate, year };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const { bill, atSource, paid, next, nextGiven, rate, year } = p;
  const label = YEARS[year];
  const y2 = year + 2;
  const dates = { jan: `${y2}-01-31`, jul: `${y2}-07-31`, nextJan: `${y2 + 1}-01-31` };
  const net = r2(bill - atSource);
  const sourceShare = bill > 0 ? atSource / bill : 0;
  const findings = [];
  const required = net >= THRESHOLD && sourceShare < SOURCE_SHARE;
  const each = required ? r2(net / 2) : 0;
  const balancing = r2(net - paid);
  const janTotal = r2(Math.max(0, balancing) + each);
  const timeline = [
    { date: dates.jan, what: balancing >= 0 ? `Balancing payment for ${label}` : `Refund due for ${label} (overpaid on account)`, amount: balancing },
  ];
  if (required) timeline.push({ date: dates.jan, what: "First payment on account for the next tax year", amount: each }, { date: dates.jul, what: "Second payment on account for the next tax year", amount: each });
  const result = { errors: [], label, bill, atSource, net, paid, required, each, balancing, janTotal, dates, timeline, findings, reduction: null, verify: VERIFY, rate };

  if (!required) {
    const why = net < THRESHOLD ? `your bill after tax collected at source (${money(net)}) is under ${money(THRESHOLD)}` : `${Math.round(sourceShare * 100)}% of your liability was collected at source (the cut-off is ${SOURCE_SHARE * 100}%)`;
    findings.push({ severity: "info", title: `No payments on account are asked for next year: ${why}. You pay ${money(Math.max(0, balancing))} on ${dates.jan} and nothing on ${dates.jul}.` });
  } else {
    findings.push({ severity: "high", title: `You owe ${money(janTotal)} on ${dates.jan}: the ${money(Math.max(0, balancing))} balancing payment for ${label} plus ${money(each)} as the first payment on account for the following year.` });
    findings.push({ severity: "high", title: `A second ${money(each)} falls due on ${dates.jul}. Over the two dates you pay ${money(janTotal + each)} in the 6 months after the January return.` });
    if (paid === 0 && balancing > 0) findings.push({ severity: "medium", title: `Because you paid nothing on account for ${label}, January asks for ${Math.round((janTotal / net) * 100)}% of the year's bill at once. This is the usual shock in the first year of self-employment, and it is why money should be set aside as you earn.` });
    findings.push({ severity: "info", title: `Each payment is 50% of ${money(net)}, your bill net of tax collected at source. The balance is settled on ${dates.nextJan}: if next year's net bill is more than ${money(each * 2)} you pay the difference, if less HMRC refunds or credits it.` });
  }
  if (balancing < 0) findings.push({ severity: "medium", title: `You paid ${money(-balancing)} more on account than the year's net bill. HMRC refunds it or credits it against the payments next year; ask for the one you want.` });

  if (required && nextGiven) {
    const nextNet = r2(next);
    const reducedEach = r2(Math.min(each, nextNet / 2));
    const saving = r2((each - reducedEach) * 2);
    if (reducedEach < each) {
      const shortfallEach = r2(each - reducedEach);
      const interestIfWrong = r2(shortfallEach * (rate / 100) * (12 / 12) + shortfallEach * (rate / 100) * (6 / 12));
      result.reduction = { reducedEach, saving, interestIfWrong, nextNet };
      findings.push({ severity: "info", title: `If next year's bill really is ${money(nextNet)}, you can claim to reduce each payment on account from ${money(each)} to ${money(reducedEach)} (online, or form SA303). That keeps ${money(saving)} in your account until ${dates.nextJan}.` });
      findings.push({ severity: "medium", title: `The risk: if next year's bill turns out to be the same as this year's, you will have underpaid by ${money(shortfallEach)} on each date, and interest at ${rate}% runs from the original due dates, about ${money(interestIfWrong)} by ${dates.nextJan}. A reduction that HMRC finds was not honestly believed can also bring a penalty. This tool does not predict your income.` });
    } else {
      findings.push({ severity: "info", title: `Your expected bill next year (${money(next)}) is not lower than this year's net bill, so there is nothing to reduce. Expect to pay at least the amounts shown.` });
    }
  }
  findings.push({ severity: "info", title: "Student loan repayments, Capital Gains Tax and the High Income Child Benefit Charge follow different rules for payments on account (the first two are not included). Check them separately." });
  return result;
}

export const SAMPLE = { year: 2025, bill: 6400, atSource: 0, paid: 0, next: 4000, rate: 7.75 };

export function summaryText(r) {
  const L = [`UK payments on account, tax year ${r.label}`, "", `Total liability: ${money(r.bill)}`, `Collected at source: ${money(r.atSource)}`, `Net bill: ${money(r.net)}`, `Already paid on account: ${money(r.paid)}`, ""];
  L.push(...r.timeline.map((t) => `${t.date}  ${money(Math.abs(t.amount))}  ${t.what}`));
  if (r.required) L.push("", `Total due ${r.dates.jan}: ${money(r.janTotal)}`);
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", `Verify against: ${r.verify}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
