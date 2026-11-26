// Sales tax rules with no book engine behind them: state due days, sources,
// filing and discount notes, US federal holidays, business-day rollover and the
// due dates of a year's filing periods. salestaxreturn.mjs re-exports all of it;
// pages that only need dates (tax-calendar.html) import this file directly so
// they do not load engine.mjs.
const ym = (d) => d.slice(0, 7);
const LEN = { monthly: 1, quarterly: 3, semiannual: 6 };
const pad = (n) => String(n).padStart(2, "0");
// A quarter or half-year that does not end in a calendar-aligned month is labelled by the
// month it ends in ("2026-05"); `endMonth` is the month of the year's first period end
// (quarterly: 1-3, semiannual: 1-6). Default 3 and 6 keep "2026-Q1" and "2026-H1".
const periodOf = (d, freq, endMonth) => {
  const [y, m] = [Number(d.slice(0, 4)), Number(d.slice(5, 7))];
  if (freq === "monthly") return ym(d);
  if (freq === "annual") return endMonth == null || endMonth === 12 ? String(y) : `${m > endMonth ? y + 1 : y}-${pad(endMonth)}`;
  const len = LEN[freq];
  if (endMonth == null || endMonth === len) return freq === "semiannual" ? `${y}-H${Math.ceil(m / 6)}` : `${y}-Q${Math.ceil(m / 3)}`;
  const steps = (len - ((m - endMonth) % len + len) % len) % len;
  const t = m + steps;
  return t > 12 ? `${y + 1}-${pad(t - 12)}` : `${y}-${pad(t)}`;
};
const periodEnd = (p) => {
  if (/^\d{4}$/.test(p)) return [Number(p), 12];
  if (/Q/.test(p)) return [Number(p.slice(0, 4)), Number(p.slice(6)) * 3];
  if (/H/.test(p)) return [Number(p.slice(0, 4)), Number(p.slice(6)) * 6];
  return [Number(p.slice(0, 4)), Number(p.slice(5))];
};
// Due day of the month after the period, by state, from the states' published
// monthly/quarterly schedules as the author recalls them: check yours
// (a state's own calendar can differ by filing frequency). "last" = month end.
export const STATE_DUE_DAYS = { CA: "last", TX: 20, FL: 20, NY: 20, WA: 25, IL: 20, PA: 20, NJ: 20, GA: 20, NC: 20, OH: 23, MA: 20, VA: 20, AZ: 20, MI: 20, CT: "last", WI: "last", UT: "last", IN: 30, KS: 25, CO: 20, MN: 20, TN: 20, AL: 20, SC: 20, NM: 25, NV: 20, ID: 20, LA: 20, MD: 20, ME: 15, VT: 25, ND: "last", AR: 20, OK: 20, KY: 20, MS: 20, NE: 20, MO: "last", IA: "last", HI: 20, DC: 20, WV: 20, WY: "last", RI: 20, SD: 20 };
// HI (GET: the 20th; semiannual calendar halves due Jul 20 and Jan 20, tested 2026-10-28 from a 2026 third-party guide, HRS 237-30 not read), DC (the 20th; annual period ends Sep 30, due Oct 20, modelled in stateEndMonth), WV (the 20th) and WY (last day of the month after; Baker Tilly 2025 calendar, TaxCloud 2026 guide) added 2026-10-24 from search excerpts; state sites not read. Rhode Island and South Dakota left out: no schedule found.
// RI (third-party guides via search 2026-10-24: monthly returns the 20th, quarterly dates disagree between sources, not modelled; tax.ri.gov unreachable from the session) and SD (dor.sd.gov sales and use tax page via search excerpt: return due the 20th of the month after the period; electronic payment the 25th, not modelled) added 2026-10-24. Both equal the default of 20.
// AR, OK, KY, MS, NE: the 20th (Kintsugi and TaxJar calendars via search 2026-10-24; state sites not read). All equal the default, listed so the schedule is explicit. 2026-11-07: NE (revenue.nebraska.gov Form 10 instructions, via search excerpt), MS (dor.ms.gov general FAQ citing Miss. Code 27-65-33, via search excerpt) and OK (Okla. Admin. Code 710:65-3-1 and third-party guides, via search; semiannual filers Jan 20 and Jul 20) re-checked against official text: all the 20th, pinned in the test. Full forms not read; check your own notice. Missouri left out: TaxCloud lists month end, TaxJar the 20th.
// MO (dor.mo.gov 2026 monthly due-date table and sales tax FAQ: last day of the month after; the older instructions booklet says the 20th, outdated) and IA (revenue.iowa.gov filing-frequency page: last day of the month after; Streamlined Model 1 sellers the 20th, annual filers Jan 31, not modelled) added 2026-10-24 from search excerpts.
// ME (Rule 304, maine.gov: the 15th of the month after each reporting period), VT (tax.vermont.gov FAQ: the 25th; monthly returns for January are due the 23rd, not modelled) and
// ND (last day of the month after; third-party guides, state site not read) added 2026-10-24 from search excerpts. Iowa still left out: sources conflict (20th prepayments vs month-end returns).
// LA, MD: the 20th (TaxCloud and Kintsugi tables via search 2026-10-24; state sites not read).
// TN (tn.gov/revenue due-dates page: monthly and quarterly the 20th, annual Jan 20), AL (third-party guide: the 20th), SC (dor.sc.gov sales tax Due Dates table, read in full 2026-10-28: monthly, quarterly and annual returns all the 20th after the period, annual Dec 31 -> Jan 20; equals the default; pinned in the test) and NM (aggregator calendars: the 25th; some filers differ) added 2026-10-24 from search excerpts; state sites mostly not read.
// NV, ID: the 20th (Kintsugi/TaxJar tables via search 2026-10-24; Nevada moved from month end to the 20th for periods from January 2026: AB 594, Department of Taxation release 2026-01-23, via search 2026-10-28; a period before that was still due month end). Iowa left out: sources conflict.
// CO (tax.colorado.gov DR 0100 instructions and filing pages, via search 2026-10-24: monthly and quarterly the 20th, annual Jan 20) and MN (revenue.state.mn.us
// "Sales Tax Return Filing Due Dates", via search 2026-10-24: monthly and quarterly the 20th, annual Feb 5, modelled in stateDueDay): the 20th. A 20th on a weekend or holiday moves to the next business day. Check your own notice.
// MI (michigan.gov Treasury: monthly and quarterly the 20th, annual return Feb 28 not modelled), CT (OS-114: last day of the month after, monthly, quarterly
// and annual), WI (revenue.wi.gov FAQ: last day of the month after; "early monthly" filers the 20th, not modelled), UT (tax.utah.gov: last day of the
// month after), IN (DOR filing-deadlines page and bulletin 102: the 30th, early filers the 20th, not modelled; a 30th that does not exist in February
// is clamped to month end) and KS (ST-36 form: the 25th) added 2026-10-24 from search excerpts of those pages, not the full forms.
// VA (tax.virginia.gov ST-9 package, July 2023 and later: "return and payment due on 20th of month following end of period") and AZ
// (TPT: the 20th; azdor.gov and Phoenix guidance; e-filers get until month end, not modelled) added 2026-10-24 from search excerpts.
// Both equal the default of 20, listed so the schedule is explicit and a later change to the default cannot silently move them.
// Added 2026-10-24 from search excerpts (NJ: nj.gov Division of Taxation, 20th after the period, quarterly or monthly;
// GA: dor.georgia.gov File & Pay, the 20th (read 2026-10-24); NC: ncdor.gov, monthly 20th but quarterly last day of the month after (read 2026-10-24, see stateDueDay); OH: 23rd, monthly, quarterly and semiannual Jan-Jun/Jul-Dec; tax.ohio.gov Due Dates and vendor FAQ confirm the 23rd for monthly and semiannual via search 2026-10-28, quarterly not seen there, a weekend or holiday moves to the next banking day per ST 2007-06).
// MA: monthly returns the 20th; quarterly and annual returns 30 days after the period closes (the rule since 2021, from
// memory and search excerpts, not re-read on mass.gov), modelled as `{ after: 30 }` in stateDueDay.
// Checked 2026-10-24 against the states' own pages (via search excerpts): CA quarterly
// = last day of the month after the quarter; TX = 20th, monthly and quarterly; FL = due
// the 1st, late after the 20th; WA monthly = 25th but quarterly = end of the next month.
// Checked 2026-10-24 (search excerpts of tax.ny.gov ST-100 instructions, tax.illinois.gov ST-1
// instructions, revenue.pa.gov REV-819): NY, IL and PA monthly and quarterly returns are due the
// 20th, next business day if that is a weekend or holiday (IL re-read in full on the ST-1 instructions R-01/26, 2026-10-28: the 20th after the period, discount 1.75% capped $1,000 a month, `--discount "<label>=1.75"`). WA annual returns are due April 15 (modelled in stateDueDay, 2026-10-27).
// NY quarters are Mar-May, Jun-Aug, Sep-Nov, Dec-Feb (due the 20th after), not calendar quarters;
// PA semiannual periods are Feb-Jul and Aug-Jan (due Aug 20 and Feb 20). Both are modelled via
// stateEndMonth (NY quarterly ends in Feb, PA semiannual in Jan); other states use calendar periods.
// The 2026-10-24 excerpts were not re-read against the full forms: check your own notice.
// States with no general state sales tax, from the author's memory of each state's
// published position (2026-10-28; state sites not read): the note says so rather than
// letting a return be built for a filing that does not exist. Check yours.
const NO_STATE_SALES_TAX = {
  OR: "Oregon has no statewide sales tax, so there is no sales tax return to file; Oregon's Corporate Activity Tax and local transit or lodging taxes are separate filings.",
  MT: "Montana has no general state sales tax; some resort communities levy a local resort tax filed with the town, not the state.",
  NH: "New Hampshire has no general sales tax; its meals and rooms tax and other taxes are separate returns, which this command does not build.",
  DE: "Delaware has no sales tax; businesses pay a gross receipts tax (monthly, quarterly or annual by size) that is a different return on a different base, which this command does not build.",
  AK: "Alaska has no state sales tax, but many cities and boroughs levy local sales tax with their own return forms and due dates, which this command does not know; use the local schedule.",
};
// "CA state=7.25" -> { "CA state": 0.0725 }; one spec per entry. Bad numbers stay NaN so salesTaxReturn refuses them.
export function parseRateSpecs(specs = []) {
  const rates = {};
  for (const v of specs) { const [k, n] = v.split("="); rates[k.trim()] = Number(n) / 100; }
  return rates;
}

// "CA state=0.5,100" (cap per return) or "IL state=1.75,1000/mo" (cap per month), caps in dollars.
export function parseDiscountSpecs(specs = []) {
  const discounts = {};
  for (const v of specs) {
    const [k, spec = ""] = v.split("=");
    const [pct, cap] = spec.split(",");
    const perMonth = cap != null && /\/mo$/.test(cap.trim());
    const c = cap == null ? undefined : Math.round(Number(cap.trim().replace(/\/mo$/, "")) * 100);
    discounts[k.trim()] = { rate: Number(pct) / 100, ...(perMonth ? { capPerMonth: c } : { cap: c }) };
  }
  return discounts;
}

// Read in full on each state's own site on 2026-11-12 (pages saved and every quoted sentence checked
// against the saved text; README "State due dates read on the states' own pages"). `freqs` lists the
// sales tax filing frequencies the page names, in this module's terms; a frequency outside it gets a
// note instead of a silent date. Only states whose page names its frequencies carry `freqs`.
export const STATE_SOURCES = {
  AL: { url: "https://www.revenue.alabama.gov/sales-use/due-date-calendar-for-taxes-administered-by-sales-use/", freqs: ["monthly", "quarterly", "semiannual", "annual"] },
  AZ: { url: "https://azdor.gov/transaction-privilege-tax/tpt-license/tpt-filing-frequency", freqs: ["monthly", "quarterly", "annual"] },
  CA: { url: "https://www.cdtfa.ca.gov/taxes-and-fees/sales-use-tax-returns-filing-dates.htm", freqs: ["monthly", "quarterly", "annual"] },
  CT: { url: "https://portal.ct.gov/drs/sales-tax/tax-information", freqs: ["monthly", "quarterly", "annual"] },
  DC: { url: "https://otr.cfo.dc.gov/page/sales-and-use-tax-faqs", freqs: ["monthly", "quarterly", "annual"] },
  FL: { url: "https://floridarevenue.com/taxes/taxesfees/Pages/sales_tax.aspx" },
  HI: { url: "https://tax.hawaii.gov/geninfo/get/", freqs: ["monthly", "quarterly", "semiannual", "annual"] },
  IA: { url: "https://revenue.iowa.gov/taxes/file-my-taxes/business-taxes/filing-frequency-return-due-dates", freqs: ["monthly", "annual"] },
  ID: { url: "https://tax.idaho.gov/taxes/sales-use/stfiling/", freqs: ["monthly", "quarterly", "semiannual", "annual"] },
  IN: { url: "https://secure.in.gov/dor/files/gb102.pdf", freqs: ["monthly", "annual"], read: "2026-11-14" },
  KS: { url: "https://www.ksrevenue.gov/pdf/pub1510.pdf", freqs: ["monthly", "quarterly", "annual"] },
  KY: { url: "https://revenue.ky.gov/News/Pages/January.aspx", freqs: ["monthly", "quarterly", "annual"] },
  LA: { url: "https://revenue.louisiana.gov/businesses/general-sales-and-use-taxes/general-sales-use-tax/" },
  MI: { url: "https://www.michigan.gov/taxes/business-taxes/sales-use-tax", freqs: ["monthly", "quarterly", "annual"] },
  MS: { url: "https://www.dor.ms.gov/business/business-tax-frequently-asked-questions", freqs: ["monthly", "quarterly", "annual"] },
  ND: { url: "https://www.tax.nd.gov/sales-and-use-tax-deadlines", freqs: ["monthly", "quarterly", "semiannual", "annual"] },
  NE: { url: "https://revenue.nebraska.gov/about/frequently-asked-questions/nebraska-sales-and-use-tax-faqs" },
  NM: { url: "https://realfile.tax.newmexico.gov/FYI-105.pdf", freqs: ["monthly", "quarterly", "semiannual"] },
  OK: { url: "https://oklahoma.gov/tax/helpcenter/businesses.html", freqs: ["monthly", "semiannual"] },
  PA: { url: "https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforbusinesses/sut/documents/rev-717.pdf", freqs: ["monthly", "quarterly", "semiannual"] },
  SD: { url: "https://dor.sd.gov/businesses/taxes/sales-use-tax/filing-and-paying-taxes-online-help/" },
  TX: { url: "https://comptroller.texas.gov/taxes/sales/", freqs: ["monthly", "quarterly", "annual"] },
  VT: { url: "https://tax.vermont.gov/business/sales-and-use-tax", freqs: ["monthly", "quarterly", "annual"] },
  WI: { url: "https://www.revenue.wi.gov/Pages/FAQS/pcs-sales.aspx", freqs: ["monthly", "quarterly", "annual"] },
  WV: { url: "https://tax.wv.gov/Documents/CST/cst200cu.instructions.pdf", freqs: ["monthly", "quarterly", "annual"] },
  WY: { url: "https://excise-tax-div.wyo.gov/salesuselodging-tax/salesuselodging-returns", freqs: ["monthly", "quarterly", "annual"] },
  // Read in full on 2026-11-14 (eval/state-pages-2026-11-14.md quotes each sentence relied on). All eight match the
  // presets already here; what is new is that a frequency the page does not list now gets a note.
  GA: { url: "https://dor.georgia.gov/taxes/business-taxes/sales-use-tax/file-pay", read: "2026-11-14" },
  IL: { url: "https://tax.illinois.gov/research/taxinformation/sales/rot.html", freqs: ["monthly", "quarterly", "annual"], read: "2026-11-14" },
  MN: { url: "https://www.revenue.state.mn.us/guide/filing-information", freqs: ["monthly", "quarterly", "annual"], read: "2026-11-14" },
  NC: { url: "https://www.ncdor.gov/taxes-forms/sales-and-use-tax/sales-and-use-tax-filing-requirements-payment-options/filing-frequency-and-due-dates", freqs: ["monthly", "quarterly"], read: "2026-11-14" },
  NV: { url: "https://tax.nv.gov/faqs/sales-tax-information/", read: "2026-11-14" },
  SC: { url: "https://dor.sc.gov/tax/sales", freqs: ["monthly", "quarterly", "annual"], read: "2026-11-14" },
  VA: { url: "https://www.tax.virginia.gov/retail-sales-and-use-tax", freqs: ["monthly", "quarterly"], read: "2026-11-14" },
  WA: { url: "https://dor.wa.gov/file-pay-taxes/filing-frequencies-due-dates", freqs: ["monthly", "quarterly", "annual"], read: "2026-11-14" },
  // Second 2026-11-14 batch (eval/state-pages-2026-11-14b.md): four states that refused or moved their pages on the first pass.
  // All four match the presets already here; Missouri's 2% and New York's vendor collection credit are new discount presets.
  MO: { url: "https://dor.mo.gov/faq/taxation/business/sales-tax-filing.html", freqs: ["monthly", "quarterly", "annual"], read: "2026-11-14" },
  NY: { url: "https://www.tax.ny.gov/pubs_and_bulls/tg_bulletins/st/filing_requirements_for_sales_and_use_tax_returns.htm", freqs: ["monthly", "quarterly", "annual"], read: "2026-11-14" },
  OH: { url: "https://codes.ohio.gov/ohio-revised-code/section-5739.12", read: "2026-11-14" },
  TN: { url: "https://www.tn.gov/revenue/taxes/sales-and-use-tax/due-dates-and-tax-rates.html", freqs: ["monthly", "quarterly", "annual"], read: "2026-11-14" },
  // Fifth 2026-11-14 batch (eval/state-pages-2026-11-14e.md quotes each sentence): the six states item (8) still listed as unread.
  // AR from its rules GR-77 and GR-84 (the Arkansas Administrative Code as published on law.cornell.edu; dfa.arkansas.gov's FAQ prints
  // neither), NJ from its own filing page, RI, ME and MA from their statutes, IN from DOR bulletins #102 and #83.
  AR: { url: "https://www.law.cornell.edu/regulations/arkansas/006-05-06-Ark-Code-R-005-GR-77", freqs: ["monthly", "quarterly", "annual"], read: "2026-11-14" },
  NJ: { url: "https://www.nj.gov/treasury/taxation/su_12.shtml", freqs: ["quarterly"], read: "2026-11-14" },
  RI: { url: "https://webserver.rilegislature.gov/Statutes/TITLE44/44-19/44-19-10.htm", freqs: ["monthly", "quarterly"], read: "2026-11-14" },
  ME: { url: "https://legislature.maine.gov/statutes/36/title36sec1951-A.html", read: "2026-11-14" },
  MA: { url: "https://malegislature.gov/Laws/GeneralLaws/PartI/TitleIX/Chapter62C/Section16", read: "2026-11-14" },
};
export const STATE_SOURCES_READ = "2026-11-12";
// The day a state's page was read: its own `read`, else the first batch's date.
export const stateSourceRead = (s) => STATE_SOURCES[s]?.read ?? STATE_SOURCES_READ;
const FREQ_WORD = { monthly: "monthly", quarterly: "quarterly", semiannual: "semiannual", annual: "annual" };
const STATE_NAME = { AL: "Alabama", AR: "Arkansas", AZ: "Arizona", CA: "California", CT: "Connecticut", DC: "The District of Columbia", GA: "Georgia", HI: "Hawaii", IA: "Iowa", ID: "Idaho", IL: "Illinois", IN: "Indiana", KS: "Kansas", KY: "Kentucky", MA: "Massachusetts", MD: "Maryland", ME: "Maine", MI: "Michigan", MN: "Minnesota", MO: "Missouri", MS: "Mississippi", NC: "North Carolina", ND: "North Dakota", NJ: "New Jersey", NM: "New Mexico", NV: "Nevada", NY: "New York", OH: "Ohio", OK: "Oklahoma", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", TN: "Tennessee", TX: "Texas", UT: "Utah", VA: "Virginia", VT: "Vermont", WA: "Washington", WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming" };

// A frequency the state's own page does not offer: say so and name the ones it does.
function frequencyNote(s, frequency) {
  const src = STATE_SOURCES[s];
  if (!src?.freqs || src.freqs.includes(frequency)) return null;
  if (s === "PA") return null; // PA's annual case has its own, more specific note below
  if (s === "NJ" && frequency === "monthly") return null; // NJ's monthly payments have their own note below
  return `${STATE_NAME[s] ?? s}'s own page lists ${src.freqs.map((f) => FREQ_WORD[f]).join(", ")} sales tax filing, not ${FREQ_WORD[frequency] ?? frequency} (${src.url}, read ${stateSourceRead(s)}). Use the frequency on your own notice.`;
}

// What the preset discount leaves out, or why a state has none (read 2026-11-12; README "Vendor discounts read on the states' own pages").
const DISCOUNT_NOTES = {
  AZ: "Arizona discount: 1.2% for returns filed electronically (A.R.S. 42-5017); paper filers get 1%, and any paper return in the year loses the higher rate. The yearly cap ($12,000 e-filed, $10,000 paper, all locations together) is not tracked here; city TPT gets no credit.",
  SC: "South Carolina discount: 3% when the return's tax is under $100, otherwise 2% of the whole amount (Code 12-36-2610), applied here to \"SC state\". It is capped at $3,000 a state fiscal year ($3,100 filed electronically), which is not tracked here.",
  WY: "Wyoming discount: 1.95% of the tax, up to $500 per filing period, only if the return and payment are postmarked by the 15th, earlier than the due date (Return 41 instructions). Pay by the 15th or remove the discount with --discount \"WY state=0\".",
  FL: "Florida's collection allowance applies only when the return is filed and paid electronically and on time (DR-15 instructions).",
  TX: "Texas: the 0.5% timely discount is applied; prepayers may claim another 1.25% (comptroller.texas.gov), which is not applied here.",
  PA: "Pennsylvania's discount cap is shared between state and local tax in proportion to each; here it is applied to \"PA state\" alone.",
  LA: "Louisiana's 0.84% is figured on state tax due plus excess tax collected; parish taxes are filed separately and are not covered here.",
  NE: "Nebraska's 2.5% collection fee is on state and local sales tax together (Form 10 line 8, $75 at most); book both under \"NE state\" or add a --discount for the local label.",
  MI: "Michigan's discount is applied for payment by the 20th (2026 Form 5080): the greater of 0.5% of the 4% part of the tax (2/3 of it), at most $15,000 a period, and $6 a month of the period ($18 a quarter, $72 a year for annual filers, or 2/3 of the tax when less). Paid by the 12th it is 0.75% with a $20,000 maximum, and accelerated filers have no maximum; neither is applied here. Use tax booked under \"MI state\" is discounted the same way.",
  IN: "Indiana's collection allowance (Sales Tax Information Bulletin #83, effective January 1, 2026) is 0.73% of the tax when your tax for the 12 months to June 30 of the year before was $60,000 or less, 0.53% to $600,000 and 0.26% above, only on timely payment. It is worked out from the \"IN state\" tax lines of this book when the book covers those 12 months, and not applied for a year it does not; INTIME shows your own rate, which --discount \"IN state=<percent>\" sets.",
  AR: "Arkansas's 2% prompt-payment discount (rule GR-84) is applied to \"AR state\", at most $1,000 for each month the return covers ($1,000 a month across all locations together). City and county tax gets 2% with no cap: add --discount \"<label>=2\" for each local label. Paying late, or not by EFT when EFT is required, forfeits it, and it cannot be taken off prepayments.",
  NJ: "New Jersey: no vendor discount or collection allowance is applied; the Division of Taxation's filing page prints none.",
  RI: "Rhode Island: no vendor discount is applied; R.I. Gen. Laws 44-19-10 prints none.",
  ME: "Maine: no vendor discount is applied; 36 M.R.S. 1951-A prints none.",
  MA: "Massachusetts: no vendor discount is applied; G.L. c. 62C, s. 16 prints none.",
  VA: "Virginia's dealer discount is applied from the Form ST-1 worksheet (Rev. 09/26): taxable sales x 0.043 x .01116, .00837 or .00558 by monthly taxable sales (a quarter divided by 3; under $62,501, under $208,001, more), figured on the \"VA state\" line's taxable sales. It assumes those are your total taxable general sales across all your returns. Dealers notified that their average monthly liability exceeds $20,000, and consumer's use accounts (numbers starting 14), get none: remove it with --discount \"VA state=0\".",
  MD: "Maryland's timely-filing credit is applied (Tax-General 11-105): 1.2% of the first $6,000 of tax on each return and 0.9% of the rest, at most $500 a return. It does not cover use tax on your own purchases booked under \"MD state\"; a consolidated return shares one $500 cap across its locations.",
  UT: "Utah: monthly filers retain 1.31% of the state and local sales tax they remit (Utah Code 59-12-108), applied here to \"UT state\" for --freq monthly only; quarterly and annual filers retain nothing. Monthly filing is required at $50,000 of tax a year and may be chosen below it. Book local sales tax under \"UT state\" or add a --discount for its label.",
  CO: "Colorado: no state vendor fee from January 1, 2026 (HB25B-1005, 39-26-105(1)(d)(V)). For a 2025 or earlier period it was 4% of the tax, at most $1,000 a filing period and none above $1 million of taxable sales: --discount \"CO state=4,1000\". Home-rule and local vendor fees are separate.",
  OK: "Oklahoma's current return (STS-20002-C, from August 2024) has no vendor discount line.",
  NM: "New Mexico's gross receipts tax return (TRD-41413) has no vendor discount line.",
};

export function stateDiscountNote(state) { return DISCOUNT_NOTES[String(state ?? "").toUpperCase()] ?? null; }

// A state preset discount applies only to tax lines labelled "<ST> state". When no row of the return carries that label (or a label with
// its own discount), say so: before 2026-11-14 a book labelled "MI" or "Michigan" took no discount while the state note said it "is applied".
export function presetDiscountWarning(state, frequency, result, discounts = {}) {
  const s = String(state ?? "").toUpperCase();
  const key = Object.keys(stateDiscounts(s, frequency))[0];
  if (!key) return null;
  const labels = [...new Set((result?.periods ?? []).flatMap((p) => p.rows.map((r) => r.jurisdiction)))];
  if (!labels.length || labels.some((l) => l === key || discounts[l] != null)) return null;
  return `${STATE_NAME[s] ?? s}'s preset discount was not applied: it is taken on tax lines labelled "${key}", and this return's tax lines are labelled ${labels.map((l) => `"${l}"`).join(", ")}. Put "${key}" in the state tax line's description, or add a discount for your own label ("<label>=<percent>").`;
}

export function stateFilingNote(state, frequency = "quarterly") {
  const s = String(state ?? "").toUpperCase();
  if (NO_STATE_SALES_TAX[s]) return NO_STATE_SALES_TAX[s];
  const notes = [frequencyNote(s, frequency), stateRuleNote(s, frequency)].filter(Boolean);
  return notes.length ? notes.join(" ") : null;
}

function stateRuleNote(s, frequency) {
  if (s === "PA" && frequency === "annual") return "Pennsylvania has no annual return; assigned filers file monthly, quarterly or semiannually (due Aug 20 and Feb 20), use --freq semiannual with --state PA for the Feb-Jul and Aug-Jan periods.";
  // IA (revenue.iowa.gov "Filing Frequency & Return Due Dates" and "Sales and Use Tax Permit, Return Filing and Payment Changes", read 2026-11-12):
  // sales tax filers are annual (under $1,200 a year, due Jan 31) or monthly (due the last day of the next month); the July 1, 2022 changes
  // "eliminate the semimonthly remittance". The quarterly and semimonthly rows on that page are withholding tax, not sales tax.
  // Corrected 2026-11-12: the note used to describe semi-monthly prepayments from secondary guides.
  if (s === "IA") return "Iowa: sales tax returns are annual (under $1,200 of tax a year, due January 31) or monthly (due the last day of the next month, filed electronically); semimonthly remittance ended on July 1, 2022. Seasonal filers file monthly for the months they operate. Check your own notice.";
  // AZ (azdor.gov TPT filing-frequency page, read 2026-11-12): due the 20th; a return is timely by the last business day of the month
  // (electronic) or the second-to-last business day (paper, received not postmarked); "Penalties and interest ... will accrue from the
  // statutory due date of the 20th and not from the last date of the grace period."
  if (s === "AZ") return "Arizona: TPT is due the 20th of the month after the period, the date here. azdor.gov allows a grace period (electronic returns and payments received by the last business day of that month, paper by the second-to-last business day, received not postmarked), but says penalties and interest accrue from the 20th, not from the end of the grace period.";
  // IN (in.gov New Small Business Handbook and ST-103 instructions, read 2026-11-12): monthly, or annual under $1,000 a year; neither names
  // the day of the month for sales tax (the handbook's 20th/30th table is withholding). The 30th stays from earlier search excerpts.
  // IN (General Tax Information Bulletin #102, March 2023, read on secure.in.gov 2026-11-14): "sales tax returns are due on the 30th day of
  // the month following the close of the reporting period, unless the average monthly tax due for the preceding year is in excess of
  // $1,000.00, in which case the returns must be filed by the 20th day". stateHistoryPresets picks the day from the book's own year before.
  if (s === "IN") return "Indiana: returns are due the 30th of the month after the period, or the 20th when your average monthly sales tax for the year before was over $1,000 (DOR Bulletin #102). The day is worked out from the \"IN state\" tax lines of the year before when this book holds that whole year; otherwise the 30th is used, so check the due date on your INTIME return.";
  // NJ (nj.gov "How to Pay" su_12, read 2026-11-14): quarterly ST-50 returns by the 20th; monthly payments only for sellers who "Collected more than
  // $30,000 in Sales and Use Tax in New Jersey during the prior calendar year; and Collected more than $500 in the first and/or second month".
  if (s === "NJ" && frequency === "monthly") return "New Jersey files quarterly returns (ST-50, due the 20th after the quarter). Monthly payments (Monthly Voucher, due the 20th) are required only if you collected more than $30,000 of New Jersey sales and use tax in the prior calendar year, and only for a first or second month of a quarter over $500; the quarter's ST-50 then credits them. These monthly rows are payments, not returns.";
  // RI (R.I. Gen. Laws 44-19-10, read 2026-11-14): quarterly "when specially authorized, in writing" for an average under $200 a month over six months;
  // revoked if "the liability ... exceeds six hundred dollars ($600) in sales and use taxes for any subsequent quarter".
  if (s === "RI" && frequency === "quarterly") return "Rhode Island: quarterly returns (due the last day of April, July, October and January) need the tax administrator's written authorization, given when tax has averaged under $200 a month for six months; it can be revoked once a quarter's tax exceeds $600 (R.I. Gen. Laws 44-19-10).";
  // AR (rule GR-77, read 2026-11-14): monthly the 20th; quarterly (average under $100 a month in the prior July-June year) "on or before July 20,
  // October 20, January 20, and April 20"; annual (under $25 a month) January 20; "Taxpayers should continue to file monthly reports until they receive the notice".
  if (s === "AR" && frequency !== "monthly") return "Arkansas: quarterly filing (tax averaging $100 a month or less in the prior July-June year) and annual filing ($25 or less, due January 20) start only once the Department notifies you; until then, file monthly (rule GR-77).";
  // KY (Retail Packet 11-17 and the DOR January 2026 calendar, read 2026-11-12): accelerated filers are due the 25th
  if (s === "KY" && frequency === "monthly") return "Kentucky: monthly returns are due the 20th, but accelerated filers are due the 25th of the next month (revenue.ky.gov). Check which you are.";
  // WI (revenue.wi.gov sales tax FAQ, read 2026-11-12): "Early monthly sales tax filers are required to file by the 20th"
  if (s === "WI" && frequency === "monthly") return "Wisconsin: monthly returns are due the last day of the next month, except early monthly filers, who file by the 20th (revenue.wi.gov). Check which you are.";
  // MI (michigan.gov Sales, Use and Withholding page, read 2026-11-12): "All filers must submit an annual return by February 28, regardless of assigned filing frequency."
  if (s === "MI" && frequency !== "annual") return "Michigan: every filer also submits an annual return by February 28 of the next year, whatever its filing frequency (michigan.gov).";
  // OK (oklahoma.gov help center, read 2026-11-12): semiannual only when the tax does not exceed $50 a month
  if (s === "OK" && frequency === "semiannual") return "Oklahoma: semiannual filing is allowed only when the tax does not exceed $50 a month; due July 20 and January 20.";
  // NM (FYI-105, 08/11/2025, read 2026-11-12): quarterly or semiannual only on approved application, at $500 a month or less
  if (s === "NM" && (frequency === "quarterly" || frequency === "semiannual")) return "New Mexico: quarterly or semiannual filing needs the Department's approval (ACD-31015) and an average of $500 a month or less in tax; returns are due the 25th after the period (FYI-105).";
  return null;
}
// Timely-filing discounts pinned in tests (IL ST-1 R-01/26, TX comptroller, FL DR-15 instructions, and 15 more read 2026-11-12), keyed by the
// "<ST> state" label; the CLI applies them under --state unless --discount names that label. Check yours.
export function stateDiscounts(state, frequency = "quarterly") {
  const s = String(state ?? "").toUpperCase();
  // MO timely payment allowance (dor.mo.gov sales tax filing FAQ, read 2026-11-14): "On all sales tax returns filed and paid by the required
  // due date, you are granted a 2 percent timely payment allowance. Take the amount of tax due times 2 percent." No cap is printed.
  // NY vendor collection credit (Tax Bulletin TB-ST-925, tax.ny.gov, read 2026-11-14): quarterly (ST-100) and annual (ST-101) filers who
  // file and pay in full on time; "the credit equals 5% of the taxes and fees reported on your return, up to a maximum of $200 for each
  // quarterly or annual reporting period". Monthly (part-quarterly, ST-809/ST-810) filers get none, so no preset for --freq monthly.
  if (s === "NY") return frequency === "monthly" ? {} : { "NY state": { rate: 0.05, cap: 20000 } };
  // MI (2026 Form 5080 instructions, Rev. 12-25, and 2026 Form 5081 instructions, read on michigan.gov 2026-11-14; MCL 205.54 on
  // legislature.mi.gov the same day): "Discounts apply only to 2/3 (0.6667) of the sales and/or use tax collected at the 6 percent tax
  // rate." Monthly: under $9 of tax, tax x 2/3; $9 to $1,800 paid by the 20th, $6; more, "(Tax x .6667 x .005). The maximum discount is
  // $15,000 for the tax period." Quarterly the same with $27, $18 and $5,400. Annual (Form 5081 line 10): "$72 if the tax due on line 9
  // is $108 or more", else tax x 2/3. Paying by the 12th (0.75%, $20,000) and accelerated filers (no maximum) are in the note.
  if (s === "MI") return { "MI state": frequency === "annual" ? { rate: 0, floorPerMonth: 600, floorShare: 0.6667 } : { rate: 0.6667 * 0.005, cap: 1500000, floorPerMonth: 600, floorShare: 0.6667 } };
  // VA (Form ST-1 instructions, Rev. 09/26, "For tax returns filed for return filing periods beginning on or after January 1, 2025",
  // read on tax.virginia.gov 2026-11-14): "1. Multiply Line 5 by 0.043", "2. Enter your rate", "3. Multiply Line 1 by Line 2", the
  // rate .01116 for monthly taxable sales under $62,501, .00837 under $208,001, .00558 above; "If you file on a quarterly basis, divide
  // the taxable sales by 3". Line 5 is total taxable general sales; the discount "applies only to state sales and use taxes".
  if (s === "VA") return { "VA state": { rate: 0, onSales: 0.043, bands: [{ belowMonthlySales: 6250100, rate: 0.01116 }, { belowMonthlySales: 20800100, rate: 0.00837 }, { rate: 0.00558 }] } };
  // GA vendor's compensation (Form ST-3 Rev. 07/25/22 and its instructions, read on dor.georgia.gov 2026-11-14; earlier from search 2026-10-28): Part C prints 3% on the first $3,000 of state and local tax on non-motor-fuel sales and .5% on the rest, only when return and payment are both timely. A 2026 fiscal note describes a proposal to raise the $3,000 step to $10,000: unconfirmed, not modelled. The tax of one return is the whole base here, local tax included only if booked under the same label.
  // OH vendor discount (R.C. 5739.12, read whole on codes.ohio.gov 2026-11-14; earlier from search excerpts and ODT notice ST 2025-02): (B)(1) "a discount of three-fourths of one per cent of the amount shown to be due on the return", not exceeding "seven hundred fifty dollars per vendor's license for each month covered by the return" on sales other than motor vehicles (vehicle sales uncapped, not modelled); return filed and tax paid by the due date; (A)(1) monthly returns "on or before the twenty-third day of each month". No discount if a certified service provider receives the monetary allowance.
  // Read on the states' own sites 2026-11-12 (saved and quote-checked; README "Vendor discounts read on the states' own pages"):
  // PA (Sales Tax Discount Q&A, pa.gov): the lesser of 1% of tax or $25 monthly / $75 quarterly / $150 semiannual, i.e. $25 a month, periods ending after 2016-08-01.
  // SC (Code 12-36-2610, scstatehouse.gov; ST-3): 3% when the return's tax is under $100, else 2%, on the whole amount; capped at $3,000 a state fiscal year ($3,100 e-filed), not modelled per year (note).
  // WI (Publication 201): 0.75% of tax, at least the lesser of $10 or the tax, at most $8,000 per reporting period; not on tax paid late.
  // MO (RSMo 144.140, revisor.mo.gov; Form 53-1 line 2): 2% of the tax, no cap, timely only.
  // WY (Return 41 instructions, rev. 7.10.24): 1.95% of total tax due, up to $500 per filing period per vendor, only if postmarked by the 15th (note).
  // FL (DR-15 instructions): 2.5% of the first $1,200 of the amount due, max $30, only when filed and paid electronically and on time; matches the 2026-10 preset.
  // TX (comptroller.texas.gov sales tax page): 0.5% of tax timely reported and paid; prepayers add 1.25% (not applied, note).
  // AL (revenue.alabama.gov due-date calendar): 5% of the first $100 of tax and 2% of the rest, at most $400 a month (local: the same, per jurisdiction), timely only.
  // KY (KRS 139.570, apps.legislature.ky.gov): 1.75% of the first $1,000 of tax and 1.5% of the rest, at most $50 per reporting period, not delinquent.
  // LA (R-1029 instructions rev. 06/01/26): 0.84% of state tax due plus excess tax collected, at most $750 a month from 2025-01-01; timely and paid in full. Parish tax is filed separately.
  // MS (dor.ms.gov business FAQ): 2% of tax due, not to exceed $50 (per return assumed), paid by the 20th.
  // NE (Neb. Rev. Stat. 77-2708; Form 10 1-2026 line 8): 2.5% of state and local sales tax, $75 at most on the return.
  // ND (N.D.C.C. 57-39.2-12.1, ndlegis.gov): 1.5% of the tax due, at most $110 per return, paid on time.
  // AZ (A.R.S. 42-5017, azleg.gov): 1.2% for e-filers (1% on paper), capped at $12,000 ($10,000) a calendar year, which is not tracked here (note).
  // MD (Tax-General 11-105, read on mgaleg.maryland.gov 2026-11-14): a vendor who timely files gets "1.2% of the first $6,000 of the gross
  // amount of sales and use tax that the vendor is to pay with each return" and 0.9% of the rest; "may not exceed $500 for each return".
  // It does not cover use tax on the vendor's own purchases (note).
  // UT (Utah Code 59-12-108, read on le.utah.gov 2026-11-14, as amended 2023): a monthly filer "may retain each month 1.31% of any amounts
  // the seller is required to remit" of state and local sales tax. Monthly filing is required at $50,000 of tax a year and voluntary below
  // it; quarterly and annual filers retain nothing, so no preset for those.
  if (s === "UT") return frequency === "monthly" ? { "UT state": { rate: 0.0131 } } : {};
  // AR (rule GR-84, Arkansas Administrative Code, read 2026-11-14): remitted by the GR-77 due date, "the taxpayer is entitled to deduct two
  // percent (2%) of the state tax due"; "shall not exceed $1,000.00 for each month included in the tax report, regardless of whether the
  // taxpayer files a report monthly, quarterly, annually"; city and county 2% with "no limitation" (note). Not from prepayments.
  // CO: none. HB25B-1005 (signed August 2025, read on leg.colorado.gov 2026-11-14) adds 39-26-105(1)(d)(V): "BEGINNING JANUARY 1, 2026, A
  // RETAILER IS NOT PERMITTED TO RETAIN ANY MONEY" for collecting state sales tax. Before 2026 it was 4%, at most $1,000 a filing period (note).
  const d = { MD: { rate: 0.012, tiers: [{ upTo: 600000, rate: 0.012 }, { rate: 0.009 }], cap: 50000 }, AL: { rate: 0.05, tiers: [{ upTo: 10000, rate: 0.05 }, { rate: 0.02 }], capPerMonth: 40000 }, KY: { rate: 0.0175, tiers: [{ upTo: 100000, rate: 0.0175 }, { rate: 0.015 }], cap: 5000 }, LA: { rate: 0.0084, capPerMonth: 75000 }, MS: { rate: 0.02, cap: 5000 }, NE: { rate: 0.025, cap: 7500 }, ND: { rate: 0.015, cap: 11000 }, AZ: { rate: 0.012 }, PA: { rate: 0.01, capPerMonth: 2500 }, SC: { rate: 0.02, steps: [{ below: 10000, rate: 0.03 }, { rate: 0.02 }] }, WI: { rate: 0.0075, min: 1000, cap: 800000 }, MO: { rate: 0.02 }, WY: { rate: 0.0195, cap: 50000 }, OH: { rate: 0.0075, capPerMonth: 75000 }, IL: { rate: 0.0175, capPerMonth: 100000 }, TX: { rate: 0.005 }, FL: { rate: 0.025, cap: 3000 }, GA: { rate: 0.03, tiers: [{ upTo: 300000, rate: 0.03 }, { rate: 0.005 }] }, AR: { rate: 0.02, capPerMonth: 100000 } }[s];
  return d ? { [`${s} state`]: { ...d } } : {};
}
// Monthly tax on the book's invoice and credit-note lines labelled `label` (credit notes negative), with the first and last date the book
// holds anything: { months: { "2025-07": cents }, first, last }. A month with no line counts as zero only inside first..last.
export function monthlyTaxByLabel(books, label, account = "2100") {
  const months = {};
  const dates = [];
  for (const d of books.documents ?? []) {
    if (d.date) dates.push(d.date);
    if (d.kind !== "invoice") continue;
    for (const l of d.lines ?? []) if (l.account === account && (l.desc || "Unlabelled") === label) months[ym(d.date)] = (months[ym(d.date)] ?? 0) + (d.credit ? -l.cents : l.cents);
  }
  for (const t of books.transactions ?? []) if (t.date) dates.push(t.date);
  dates.sort();
  return { months, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null };
}
const sumMonths = (months, from, to) => Object.entries(months).reduce((a, [k, v]) => (k >= from && k <= to ? a + v : a), 0);
// the sign goes outside the symbol: -$5.00, not $-5.00 (a credit-heavy look-back year can be negative)
const usd = (c) => {
  const text = `$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return c < 0 && /[1-9]/.test(text) ? `-${text}` : text;
};

// Presets a state sets from your own past tax, worked out from the book when it holds the months the rule looks at:
// { discounts, dueDay, notes }. Merged over stateDiscounts and stateDueDay by the CLI and the page; an explicit --discount or --due-day wins.
// Indiana (read on secure.in.gov 2026-11-14, eval/state-pages-2026-11-14e.md):
//   allowance, Sales Tax Information Bulletin #83 (December 2025, effective January 1, 2026): "The collection allowance for a calendar year
//   will be based on the total sales tax ... liability accrued for the 12-month period ending on June 30 of the preceding calendar year":
//   "$60,000.00 or Less 0.73%", "$60,000.01 through $600,000.00 0.53%", "$600,000.01 or More 0.26%".
//   due day, General Tax Information Bulletin #102 (March 2023): the 30th, "unless the average monthly tax due for the preceding year is
//   in excess of $1,000.00, in which case the returns must be filed by the 20th day of the month following".
// A year whose look-back months the book does not hold gets no allowance and the 30th, and a note says which months are missing.
export function stateHistoryPresets(state, books, frequency = "monthly", { from = null, to = null } = {}) {
  const s = String(state ?? "").toUpperCase();
  if (s !== "IN" || !books) return { discounts: {}, dueDay: null, notes: [] };
  const label = "IN state";
  const h = monthlyTaxByLabel(books, label);
  const years = [...new Set((books.documents ?? []).filter((d) => d.kind === "invoice" && d.date && (!from || d.date >= from) && (!to || d.date <= to)).map((d) => Number(d.date.slice(0, 4))))].sort();
  const holds = (a, b) => h.first != null && h.first.slice(0, 7) <= a && h.last.slice(0, 7) >= b;
  const byYear = {}, dueByYear = {}, notes = [], missing = [];
  for (const y of years) {
    const a0 = `${y - 2}-07`, a1 = `${y - 1}-06`;
    if (holds(a0, a1)) {
      const t = sumMonths(h.months, a0, a1);
      byYear[y] = t <= 6000000 ? 0.0073 : t <= 60000000 ? 0.0053 : 0.0026;
      notes.push(`Indiana ${y}: ${(byYear[y] * 100).toFixed(2)}% collection allowance, from ${usd(t)} of "${label}" tax in July ${y - 2} to June ${y - 1} (Bulletin #83).`);
    } else missing.push(`${y}'s allowance needs July ${y - 2} to June ${y - 1}`);
    const d0 = `${y - 1}-01`, d1 = `${y - 1}-12`;
    if (frequency === "monthly" && holds(d0, d1)) {
      const t = sumMonths(h.months, d0, d1);
      dueByYear[y] = t / 12 > 100000 ? 20 : 30;
      notes.push(`Indiana ${y}: returns due the ${dueByYear[y]}th, from an average of ${usd(Math.round(t / 12))} a month of "${label}" tax in ${y - 1} (Bulletin #102: the 20th above $1,000).`);
    } else if (frequency === "monthly") missing.push(`${y}'s due day needs all of ${y - 1}`);
  }
  if (missing.length) notes.push(`Indiana: this book does not hold the months the rule looks at (${missing.join("; ")}), so for those years no allowance is applied and the 30th is used; check your INTIME account or add --discount "${label}=<percent>".`);
  return {
    discounts: Object.keys(byYear).length ? { [label]: { rate: 0, byYear } } : {},
    dueDay: Object.keys(dueByYear).length ? { byYear: dueByYear, otherwise: 30 } : null,
    notes,
  };
}
export function stateEndMonth(state, frequency = "quarterly") {
  const s = String(state ?? "").toUpperCase();
  if (s === "NY" && (frequency === "quarterly" || frequency === "annual")) return 2;
  if (s === "PA" && frequency === "semiannual") return 1;
  // DC (OTR FAQ via search 2026-10-28: annual filers' return is due October 20, the 20th after a September 30 year end; site not read)
  if (s === "DC" && frequency === "annual") return 9;
  return null;
}
export function stateDueDay(state, frequency = "quarterly") {
  const s = String(state ?? "").toUpperCase();
  // WA (dor.wa.gov "Filing frequencies & due dates", read 2026-10-27): monthly the 25th, quarterly the end of the next month, annual April 15
  // NY (tax.ny.gov Tax Bulletin ST-... "Filing requirements for sales and use tax returns", read 2026-10-27): annual ST-101 covers Mar 1 to Feb 28/29, due March 20; quarters Mar-May, Jun-Aug, Sep-Nov, Dec-Feb; returns due 20 days after the period (modelled via stateEndMonth)
  if (s === "WA" && frequency === "annual") return { months: 4, day: 15 };
  if (s === "WA" && frequency !== "monthly") return "last";
  // UT (tax.utah.gov/sales/due-dates, read 2026-10-28): the Aug 2026 monthly Sales and Use (STC) return is due 2026-09-30, the last day of the next month; equals the "last" preset (quarterly and annual dates unseen)
  // MO (dor.mo.gov sales tax filing FAQ, read whole 2026-10-28): monthly the last day of the next month, quarterly the last day of Apr/Jul/Oct/Jan, annual January 31; equals the "last" preset
  // MA (G.L. c. 62C, s. 16(h), read on malegislature.gov 2026-11-14; earlier from the mass.gov guide via search 2026-10-27): "Every such return
  // shall be filed within 30 days after the expiration of the period covered thereby" (a materialman's within 50 days, not modelled)
  if (s === "MA") return { after: 30 };
  // VA (tax.virginia.gov "Sales and use tax", read 2026-10-27): monthly the 20th; quarterly Jan-Mar Apr 20, Apr-Jun Jul 20, Jul-Sep Oct 20, Oct-Dec Jan 20; equals the default of 20
  // NC: monthly the 20th, quarterly the last day of Jan/Apr/Jul/Oct (ncdor.gov "Filing Frequency and Due Dates", read 2026-10-24)
  if (s === "NC" && frequency !== "monthly") return "last";
  // RI: monthly the 20th, quarterly the last day of Apr/Jul/Oct/Jan (tax.ri.gov sales tax calendars, 2022 and 2024 PDFs via search excerpts 2026-10-24; weekend dates move to the next business day)
  if (s === "RI" && frequency !== "monthly") return "last";
  // MN: annual filers (under $100 a month) pay and file by February 5; the whole 2026 table read on revenue.state.mn.us 2026-10-27 and pinned in salestaxreturn.test.mjs
  if (s === "MN" && frequency === "annual") return { months: 2, day: 5 };
  // MI: annual filers file by February 28 (michigan.gov Treasury "Filing and Payment Due Dates" and Sales and Use Tax pages, via search 2026-10-26; monthly and quarterly are the 20th)
  if (s === "MI" && frequency === "annual") return { months: 2, day: 28 };
  // HI (tax.hawaii.gov GET general information, read 2026-11-12): periodic returns (monthly, quarterly, semiannual) the 20th after the period;
  // "What is the due date for filing an annual GET return? The due date is the 20th day of the fourth month following the close of the taxable
  // year. For calendar year filers, the due date is April 20th". Corrected 2026-11-12: annual used to fall on January 20.
  if (s === "HI" && frequency === "annual") return { months: 4, day: 20 };
  return STATE_DUE_DAYS[s] ?? 20;
}
export function dueDate(period, dueDay = 20) {
  let [y, m] = periodEnd(period);
  // { byYear: { 2026: 20 }, otherwise: 30 } = a due day that depends on the year the period ends in (Indiana: the 20th after a year over $1,000 a month)
  if (dueDay && typeof dueDay === "object" && dueDay.byYear) dueDay = dueDay.byYear[y] ?? dueDay.otherwise;
  // { after: N } = N calendar days after the period's last day (Massachusetts quarterly and annual)
  if (dueDay && typeof dueDay === "object" && dueDay.after != null) return iso(new Date(Date.UTC(y, m, dueDay.after)));
  // { months: N, day: D } = day D of the Nth month after the period's last month (Minnesota annual: February 5)
  const ahead = dueDay && typeof dueDay === "object" ? dueDay.months : 1;
  m += ahead; while (m > 12) { m -= 12; y += 1; }
  if (dueDay && typeof dueDay === "object") dueDay = dueDay.day;
  const monthEnd = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = dueDay === "last" ? monthEnd : Math.min(dueDay, monthEnd);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const iso = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
// nth (1-based) weekday (0 Sun .. 6 Sat) of a month; n = -1 for the last
const nthWeekday = (y, m, wd, n) => {
  if (n > 0) return 1 + ((wd - new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 7) % 7) + (n - 1) * 7;
  const last = new Date(Date.UTC(y, m, 0));
  return last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7);
};
// US federal holidays for a year, observed on the nearest weekday (Sat -> Fri, Sun -> Mon)
export function usHolidays(y) {
  const fixed = [[1, 1], [6, 19], [7, 4], [11, 11], [12, 25]].map(([m, d]) => {
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const dt = new Date(Date.UTC(y, m - 1, d + (wd === 6 ? -1 : wd === 0 ? 1 : 0)));
    return iso(dt);
  });
  const mk = (m, wd, n) => `${y}-${pad(m)}-${pad(nthWeekday(y, m, wd, n))}`;
  return new Set([...fixed, mk(1, 1, 3), mk(2, 1, 3), mk(5, 1, -1), mk(9, 1, 1), mk(10, 1, 2), mk(11, 4, 4)]);
}
export function nextBusinessDay(date) {
  const dt = new Date(`${date}T00:00:00Z`);
  for (;;) {
    const wd = dt.getUTCDay();
    // a Jan 1 observed on the prior Dec 31 belongs to the next year's set
    const hol = usHolidays(dt.getUTCFullYear()).has(iso(dt)) || usHolidays(dt.getUTCFullYear() + 1).has(iso(dt));
    if (wd !== 0 && wd !== 6 && !hol) return iso(dt);
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
}
// Every return due in a calendar year for a state and filing frequency:
// [{ period, due }], due moved to the next business day. Uses the same period
// and due-day rules as `salesTaxReturn`, so a calendar and a worksheet agree.
// A frequency, period end or state it does not know throws (red team 2026-11-26: "weekly" and "ZZ" used to get quarterly
// 20th dates), and a state with no general sales tax gets no dates: there is no return to file.
export function salesTaxDueDates(year, { state = null, frequency = "quarterly", endMonth = undefined, dueDay = undefined } = {}) {
  if (!["monthly", "quarterly", "semiannual", "annual"].includes(frequency)) throw new Error("frequency must be monthly, quarterly, semiannual or annual");
  if (endMonth != null && !(Number.isInteger(endMonth) && endMonth >= 1 && endMonth <= (frequency === "annual" ? 12 : LEN[frequency] ?? 1))) throw new Error("endMonth must be a month within the first period of the year");
  if (state != null && state !== "") {
    const s = String(state).toUpperCase();
    if (NO_STATE_SALES_TAX[s]) return [];
    if (!(s in STATE_DUE_DAYS)) throw new Error(`"${state}" is not a US state or DC this calendar knows; use a two-letter code such as TX`);
  }
  const em = endMonth === undefined ? stateEndMonth(state, frequency) : endMonth;
  const dd = dueDay === undefined ? stateDueDay(state, frequency) : dueDay;
  const periods = new Set();
  for (let y = year - 1; y <= year; y++) for (let m = 1; m <= 12; m++) periods.add(periodOf(`${y}-${pad(m)}-01`, frequency, em));
  return [...periods].map((period) => ({ period, due: nextBusinessDay(dueDate(period, dd)) }))
    .filter((e) => e.due.startsWith(String(year))).sort((a, b) => a.due.localeCompare(b.due));
}
// the filing period that ended before the one a payment falls in
const periodBefore = (d, freq, endMonth) => {
  if (freq === "annual") {
    if (endMonth == null || endMonth === 12) return String(Number(d.slice(0, 4)) - 1);
    const [y, m] = periodEnd(periodOf(d, freq, endMonth));
    return `${y - 1}-${pad(m)}`;
  }
  let [y, m] = periodEnd(periodOf(d, freq, endMonth));
  m -= LEN[freq];
  while (m < 1) { m += 12; y -= 1; }
  return periodOf(`${y}-${pad(m)}-01`, freq, endMonth);
};


// for salesTaxReturn in salestaxreturn.mjs
export { LEN, periodOf, periodEnd, periodBefore };
