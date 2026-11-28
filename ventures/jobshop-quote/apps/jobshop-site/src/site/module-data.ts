// One landing page per built module of the app, each aimed at the search a shop owner or estimator
// makes for that job ("CNC quoting software", "job traveler software"). Rendered by ./modules.ts,
// routed by ./routes.ts (MODULE_ROUTES), linked from the how-it-works page.
//
// Copy rules are the site's (README.md, "Honesty rules" in pages.ts' header): say only what the
// hosted app does today, from apps/jobshop-quote/ROADMAP.md's "Done" list; every limit the ROADMAP
// names goes in `limits`; no customers, results, time saved, ratings or competitor claims. Every
// module is on every plan: plans differ by RFQs a month and seats, not by features
// (apps/jobshop-quote/docs/BILLING.md). Parts that are built but switched off in the hosted app
// (AI reading, inbound RFQ email, the live QuickBooks connection) are not given pages until they are
// on; the QuickBooks import file, which needs no connection, is on and has one.
//
// Data only, no imports from ./pages, so pages.ts can link the list without an import cycle.

export interface ModuleFaq {
  q: string;
  a: string;
}

export interface ModuleData {
  /** Short id, used in tests. */
  id: string;
  path: `/${string}`;
  /** Breadcrumb and llms.txt label. */
  label: string;
  /** Document title without the site name (routes.ts appends " · Job Shop Quote"). */
  title: string;
  /** Meta description, 70-160 characters. */
  description: string;
  h1: string;
  /** Who it is for and the job it does. No claim the bullets don't carry. */
  intro: string;
  /** What the module does in the hosted app today. */
  does: readonly string[];
  /** What it does not do yet, as the ROADMAP says. */
  limits: readonly string[];
  /** Site guides on the topic (paths on this site). */
  guides: readonly { label: string; path: `/${string}` }[];
  /** One question specific to the module; the plan and "is it new" questions are added for all. */
  faq: ModuleFaq;
  /** A still of the app (a key of SHOTS in ./pages) and its caption, where one shows this module. */
  shot?: {
    key: "quoteLine" | "rateCard" | "customerPdf" | "customerPage" | "quoteLog";
    caption: string;
  };
}

/** The day these pages were written or last checked against the ROADMAP. */
export const MODULES_DATE = "2026-11-28";

export const MODULES: readonly ModuleData[] = [
  {
    id: "quoting",
    path: "/cnc-quoting-software",
    label: "CNC quoting software",
    title: "CNC quoting software for machine shops",
    description:
      "Price machined parts from your own rate card: setup and cycle per operation, material, outside processing, minimums and quantity breaks, as a quote PDF.",
    h1: "CNC quoting software that prices from your own rate card",
    intro:
      "For the owner or estimator who quotes machined parts today in a spreadsheet or from memory. You enter your machines, materials and outside processes once; each quote line is then priced by plain arithmetic on those rates, with every figure showing the rate it used.",
    does: [
      "A rate card of machines (hourly rate, optional setup rate, default setup), materials (per lb with density and scrap, per stock piece or by the foot, with a minimum charge), finishing and outside services (per part with a lot minimum), markups on labor, material and outside work, and a line minimum",
      "Each line priced at every quantity break from setup, cycle time, material and finishing, with the rates frozen into the quote so later rate changes never move a sent price",
      "Blocking issues instead of guesses: a line missing a cycle time, a material price or a blank size says so and is not priced",
      "Import the rate card from your own spreadsheet (.xlsx or CSV, read in the browser), and download it again as one Excel workbook with a tab per kind",
      "A quote PDF on your letterhead with your logo, showing prices, dates, lead time and terms and none of the costs, rates or markups behind them",
      'Revisions (Q-1001 Rev 2) with what changed from the last one, side by side, and an optional "Changes from" section on the customer PDF',
      "A default fallout percentage, so 100 good parts at 3% start 104 without typing it on each line",
    ],
    limits: [
      "Reading RFQ emails and PDF drawings with AI is built but not switched on in the hosted app yet; until it is, labelled lines and parts tables are read by fixed rules and you enter the rest",
      "Setup and cycle times are yours to enter, or suggested from STEP and DXF measurements at the rates you set; nothing is assumed",
      "No ERP connection is on yet; the quote is a PDF you download or email",
    ],
    guides: [
      { label: "How to quote a CNC machining job", path: "/how-to-quote-cnc-machining" },
      { label: "How to quote CNC turning and lathe parts", path: "/how-to-quote-cnc-turning" },
      { label: "How to work out a machine shop hourly rate", path: "/machine-shop-hourly-rate" },
      { label: "Machine shop markup and margin", path: "/machine-shop-markup" },
      { label: "Machine shop quote template (free CSV)", path: "/machine-shop-quote-template" },
      { label: "Machine shop quoting software compared", path: "/compare" },
    ],
    faq: {
      q: "Where do the prices come from?",
      a: "Only from your rate card. The same inputs always give the same price, every line lists the rates it used, and a value the app cannot work out stops the line instead of being guessed.",
    },
    shot: {
      key: "quoteLine",
      caption:
        "A priced line on a made-up bracket: one operation and a finish, every quantity break worked out, and the rate behind each figure listed under the table.",
    },
  },
  {
    id: "sheet-metal",
    path: "/sheet-metal-quoting-software",
    label: "Sheet metal quoting software",
    title: "Sheet metal and laser cutting quoting software",
    description:
      "Quote laser, waterjet and plasma parts from the DXF: cut length and pierces at your own cut speeds, bends, parts per sheet from the nest, and the finish.",
    h1: "Sheet metal quoting from the DXF flat pattern",
    intro:
      "For fabrication shops that quote laser-cut, waterjet or plasma parts and press-brake work. Upload the customer's DXF and the quote line starts with the cut, pierce and bend times at your own speeds, and the sheets the order needs from a nest of the flat pattern.",
    does: [
      "Cut length, pierces and bend lines measured from an ASCII DXF flat pattern, each with a confidence and flag shown on the RFQ",
      '"Cut from DXF" and "Bend from DXF" operations pre-filled at the machine\'s cut speed, pierce seconds and seconds per bend',
      "Cut speeds per material and thickness from your own cut chart, typed in or imported from a CSV, so a 0.5 in A36 part is timed at that gauge's speed",
      "The blank from the flat size and the material row's sheet thickness, and parts per sheet from a rectangular nest on the row's sheet width, length and gap",
      "The same rate card, quantity breaks, finishing and quote PDF as machined parts",
    ],
    limits: [
      "Nesting is rectangular: L-shapes and other odd outlines are not nested by their true shape yet",
      "A DXF whose outline or holes read with low confidence, or whose bend lines are only dashed, gets no suggestion; you enter the times",
      "No cut speeds are assumed: with none on your card for the material, the machine's default speed applies, and with none at all nothing is suggested",
    ],
    guides: [
      { label: "How to quote sheet metal and laser cut parts", path: "/how-to-quote-sheet-metal" },
      { label: "How to quote welding and fabrication jobs", path: "/how-to-quote-welding" },
      { label: "How to work out a machine shop hourly rate", path: "/machine-shop-hourly-rate" },
    ],
    faq: {
      q: "Does it need my cut chart?",
      a: "It needs the speeds you cut at. Enter a default per machine, or a speed per material and thickness, typed in or imported from the cut chart as a CSV; the quote line names which speed it used.",
    },
  },
  {
    id: "cad",
    path: "/step-file-quoting",
    label: "Quoting from STEP files",
    title: "Quote machined parts from STEP files",
    description:
      "Upload a STEP file: the size of the solid sets the blank, and its holes pre-fill drilling, tapping and peck time at your own feeds and seconds per hole.",
    h1: "Quote from the customer's STEP file",
    intro:
      "For machine shops that get 3D models with their RFQs. The app measures the solid and turns what it finds into suggested operations at the rates you set, each labelled with how it was worked out, for the estimator to accept or change.",
    does: [
      "STEP solids measured for size, volume and holes; IGES solids for size and holes; STL meshes for size and volume",
      'The solid\'s bounding box pre-fills the blank, and with one machine that has a measured removal rate, a "Rough from CAD" operation',
      "Hole locations pre-fill \"Drill from CAD\" at the machine's seconds per hole plus each hole's depth at its drill feed, with counterbores counted once and bores over 1 in left out",
      "Drill feeds by material, and peck time for holes deeper than 3×D at the machine's peck depth and seconds per peck",
      'Tapping: the estimator ticks which hole sizes are threaded and the quote adds "Tap from CAD" at the machine\'s seconds per tapped hole',
    ],
    limits: [
      "Native SolidWorks and other proprietary CAD files are stored but not measured",
      "One time per tapped hole: tap size and pitch are not timed separately yet",
      "Only roughing, drilling, tapping and pecking are timed from the model; enter the other operations' times yourself",
    ],
    guides: [
      { label: "How to quote a CNC machining job", path: "/how-to-quote-cnc-machining" },
      { label: "How to work out a machine shop hourly rate", path: "/machine-shop-hourly-rate" },
    ],
    faq: {
      q: "Does it write CAM toolpaths?",
      a: "No. It measures the model for quoting: the blank, roughing from a removal rate you measured, and drilling, tapping and pecking from the holes. It does not program the part.",
    },
  },
  {
    id: "repeat-parts",
    path: "/repeat-part-quoting",
    label: "Repeat parts and routings",
    title: "Quoting repeat parts and saved routings",
    description:
      "See every earlier quote of a part number, start a repeat from the last won quote's inputs at today's rates, and reuse saved routings by part family.",
    h1: "Repeat parts quoted from what you quoted before",
    intro:
      "Most job shops quote the same part numbers again and again. The app shows what you quoted a part at before, what won and what lost, and lets you start the new quote from the last won one, priced from today's rate card.",
    does: [
      '"Quoted before: N earlier quotes" on each line and on the RFQ review: quote number, customer, date, status, PO or loss reason, revision, unit price at each break, material and operations',
      "\"Use these inputs\" copies an earlier line's cost inputs onto a draft and re-prices it from today's rates",
      'An optional shop setting pre-fills each new line whose part number and revision match a won quote, labelled "Pre-filled from Q-1001"',
      "Routings: save a line's operations and finishing as a named routing with a part family, apply or append it on any line, edit it on its own page",
      "Up to three routings suggested from the line's material and description, each with the evidence it rests on from your own earlier lines",
    ],
    limits: [
      "Routings hold operations and times, never prices: a routing always prices at today's rate card",
      "Suggestions come only from your shop's own records, so a new shop has none until it has quoted",
    ],
    guides: [
      { label: "How to quote a CNC machining job", path: "/how-to-quote-cnc-machining" },
      { label: "Machine shop quote template (free CSV)", path: "/machine-shop-quote-template" },
    ],
    faq: {
      q: "Does a repeat part keep last year's price?",
      a: "No. It keeps last time's inputs (operations, times, material, blank) and prices them from today's rate card, and the earlier prices are shown beside it so you can see the difference.",
    },
  },
  {
    id: "material-prices",
    path: "/material-price-tracking",
    label: "Material price tracking",
    title: "Material price tracking for machine and fab shops",
    description:
      "Date every material price, keep its history, import a supplier's price sheet, price bar stock by the foot, and see which open quotes a price change affects.",
    h1: "Material prices with dates, history and the quotes they change",
    intro:
      "Metal prices move, and a quote priced off a stale number loses money or loses the job. The app dates every price on your rate card, keeps its history, and shows which open quotes were priced at a price the card no longer has.",
    does: [
      '"Price set N days ago" on each material, amber past the shop\'s limit (90 days by default), and a flag on draft lines that use a stale price',
      "A price history per material: who set it, when, by how much it moved, and from which supplier's price list and date",
      "A supplier's price sheet imported from a spreadsheet, with a preview of each price move and the open quotes it touches before anything is saved",
      '"Quotes this changes": every open quote priced at a price the card no longer has, filtered by how far it moved',
      "Bar, tube and extrusion priced by the foot, with cut allowance, bar length and remnant, charged in whole bars; prices per cwt and per metre kept exactly",
    ],
    limits: [
      "Nothing re-prices on its own: drafts are re-priced when the estimator presses Re-price, and sent quotes keep the price the customer saw",
      "Prices come from your rate card and your suppliers' sheets; there is no live metal price feed",
    ],
    guides: [
      { label: "How to quote a CNC machining job", path: "/how-to-quote-cnc-machining" },
      { label: "How to quote CNC turning and lathe parts", path: "/how-to-quote-cnc-turning" },
      { label: "How to quote sheet metal and laser cut parts", path: "/how-to-quote-sheet-metal" },
      { label: "Machine shop markup and margin", path: "/machine-shop-markup" },
    ],
    faq: {
      q: "Can I load my supplier's price list?",
      a: "Yes, as a spreadsheet: the Materials import reads price per lb, per piece, per foot, per cwt or per metre, keeps the supplier and the list's date in each price's history, and shows the moves before you save.",
    },
    shot: {
      key: "rateCard",
      caption:
        "The rate card's materials, each with its price, density, scrap, minimum and the date the price was set. Made-up shop.",
    },
  },
  {
    id: "acceptance",
    path: "/online-quote-acceptance",
    label: "Online quote acceptance",
    title: "Email quotes and let customers accept online",
    description:
      "Email the quote PDF from the estimator's send button with a link where the customer picks a quantity, adds a PO number and accepts or declines.",
    h1: "Quotes your customer can accept online, with a PO number",
    intro:
      "Once the estimator marks a quote sent, the app emails the exact PDF and can add a link where the customer accepts or declines without an account. An acceptance marks the quote won at the quantity they chose; a decline marks it lost with their reason.",
    does: [
      '"Email to customer" sends the PDF frozen at sending (checked against its SHA-256), From your shop, Reply-To the estimator, with the shop\'s signature',
      "The customer's link shows the quote as sent and the PDF, never rates, costs or markups; they pick one quoted quantity per part, type a name and an optional PO number and note",
      'Accepting marks the quote won at the chosen breaks\' total with the PO; declining marks it lost with "Declined online" and the reason',
      "The estimators who made or emailed the quote get the answer by email; links can be turned off at once",
    ],
    limits: [
      "One answer per quote; a quantity the quote does not carry needs a new quote",
      "No e-signature line on acceptance yet",
      "The app never sends a quote by itself: an estimator presses send",
    ],
    guides: [
      { label: "Machine shop quote template (free CSV)", path: "/machine-shop-quote-template" },
      { label: "How to quote a CNC machining job", path: "/how-to-quote-cnc-machining" },
    ],
    faq: {
      q: "Does my customer need an account?",
      a: "No. The link opens the quote as it was sent. Only a hash of the link's token is stored, and the link takes no answer past the quote's valid-until day, and stops working when you turn it off.",
    },
    shot: {
      key: "customerPage",
      caption:
        "The customer's page for a made-up quote on a phone, opened from the link with no account: the quote as sent, the PDF, and the form to pick a quantity and accept or decline.",
    },
  },
  {
    id: "follow-up",
    path: "/quote-follow-up-software",
    label: "Quote follow-up",
    title: "Quote follow-up reminders for job shops",
    description:
      "Every sent quote gets a follow-up day. A morning email lists each estimator's quotes due, and the quote log keeps every call, so no quote goes quiet.",
    h1: "Follow up on every quote you send",
    intro:
      "A quote that is never followed up is a quote half lost. Sending a quote sets its first follow-up day; the quote log and a morning email tell each estimator which quotes are due, and every call or email is logged on the quote.",
    does: [
      "A first follow-up day set when the quote is sent, a number of days after sending that the shop chooses (3 by default; a weekend moves to Monday)",
      'A "Follow up" card on the quote log: quotes due today, longest overdue first, with contact, total, sent day, valid-until, estimator and the last note',
      '"Log follow-up" records what happened and the next day: in 1 to 14 days, a date, or no more follow-ups',
      "One email each morning to each estimator listing their own quotes due, and another listing quotes that expire today or tomorrow",
      "Quotes expire the day after their valid-until day, and Revise starts the next revision",
    ],
    limits: [
      "The follow-up itself is yours: the app reminds and logs, it does not email the customer for you",
      "Each member can turn the reminder emails off for themselves",
    ],
    guides: [
      { label: "Machine shop quote template (free CSV)", path: "/machine-shop-quote-template" },
      { label: "Machine shop quoting software compared", path: "/compare" },
    ],
    faq: {
      q: "Which quotes come up for follow-up?",
      a: "Sent quotes whose follow-up day has come. Won, lost, expired and replaced quotes never do, and a quote the expiry email already names is left out of the follow-up email.",
    },
    shot: {
      key: "quoteLog",
      caption:
        "The quote log for a made-up shop: open quotes, win rate, the follow-up card with what is coming up, and each quote with its status.",
    },
  },
  {
    id: "win-loss",
    path: "/quote-win-rate-tracking",
    label: "Win/loss tracking",
    title: "Quote win rate and win/loss tracking for job shops",
    description:
      "See your win rate by customer, material, machine, markup, estimator, routing and month, the reasons you lose, and the unit prices you won and lost at.",
    h1: "Your quote win rate, and where you win and lose",
    intro:
      "Mark each quote won (with the PO) or lost (with the reason), or let the customer's online answer do it, and the Win/loss page shows where your prices win, where they lose, and at what price.",
    does: [
      "Win rate and won value by customer, material, machine and markup band, over 90 days, 12 months or all time",
      "Win rate by month and by estimator, by the routing a line was built from, and by part family",
      "The cost-weighted markup of won against lost quotes, and lost reasons tallied",
      "\"What price did we win at\": each part's won and lost quotes with every quantity break's unit price",
      "A CSV download of the report",
    ],
    limits: [
      'Counted from your own decided quotes only; rows under 5 decided quotes are marked "few"',
      "Expired quotes are shown but not counted in the win rate",
    ],
    guides: [
      { label: "How to work out a machine shop hourly rate", path: "/machine-shop-hourly-rate" },
      { label: "How to quote a CNC machining job", path: "/how-to-quote-cnc-machining" },
    ],
    faq: {
      q: "How is the win rate counted?",
      a: "Won divided by won plus lost, from the quotes your shop marked won or lost (or the customer answered online). Expired quotes are listed but left out of the rate.",
    },
    shot: {
      key: "quoteLog",
      caption:
        "The quote log for a made-up shop, with its win rate from the quotes marked won and lost, and the reason a lost one was lost.",
    },
  },
  {
    id: "traveler",
    path: "/job-traveler-software",
    label: "Job travelers",
    title: "Job traveler software: travelers from won quotes",
    description:
      "Print a job traveler from a won quote: material and stock to pull, every operation with setup, cycle and run time, finishing, inspection and sign-off lines.",
    h1: "A job traveler from the quote you won",
    intro:
      "The estimate already holds the routing, so the floor's copy should not be typed again. Once a quote is won, the app prints a traveler per part from the quote's own operations, with no prices on it.",
    does: [
      "One sheet per part: customer, quote, PO and due date; quantity ordered and parts to start at the line's fallout",
      "The material, its stock description, the blank and the stock pieces or bars to pull, with a cut list for bar stock",
      "Every operation numbered 10, 20, 30 in the estimate's order with its work center, setup, cycle per part and run time",
      "Finishing and outside services after them, final inspection, a sign-off line per step and a heat/lot box",
      "The quantity from the PO you type, or the break the customer accepted online; a multi-break line with neither is refused, never guessed",
    ],
    limits: [
      "A traveler is a PDF to print: there is no saved work order number, status or barcode time tracking yet",
      "Won quotes only",
    ],
    guides: [
      { label: "How to quote a CNC machining job", path: "/how-to-quote-cnc-machining" },
      { label: "How to quote welding and fabrication jobs", path: "/how-to-quote-welding" },
    ],
    faq: {
      q: "Do prices show on the traveler?",
      a: "No. It carries quantities, material, operations and times only; no price, rate or markup appears on it.",
    },
  },
  {
    id: "quickbooks-import",
    path: "/quickbooks-invoices-from-quotes",
    label: "QuickBooks invoices from quotes",
    title: "Machine shop quotes to QuickBooks invoices",
    description:
      "Turn a won quote into a QuickBooks Online invoice import file: each part at the break it was quoted at, the PO on the invoice, no retyping.",
    h1: "Invoice a won quote in QuickBooks without retyping it",
    intro:
      "The quote already says what the customer agreed to pay, so the bookkeeper should not key it in again. On a won quote, the app writes the invoice as a CSV in the shape QuickBooks Online's own invoice import takes.",
    does: [
      "One row per part at the quantity it was quoted at and that quantity's unit price and amount, the stored price exactly",
      "The quantity the customer accepted online, the only break, or the one you pick; a multi-break line with none of these is refused, never priced between breaks",
      'The invoice number Q1001 (Q1001-R2 for a revision), the customer, the invoice and due dates, and "Your PO ... Per our quote ..." as the message on the invoice',
      'The due date from "Net N" in your quote terms, else 30 days, changeable before download',
      "No costs, rates, markups or operations in the file: the same facts the customer's PDF prints",
    ],
    limits: [
      "One won quote per file; there is no batch export of several quotes yet",
      "You upload the file in QuickBooks and match its columns there; the app does not know when it was imported",
      "QuickBooks Online does not take invoice imports in a company that has set up sales tax",
      "The one-click send to a connected QuickBooks company is built but not switched on in the hosted app yet",
    ],
    guides: [
      { label: "Machine shop quote template", path: "/machine-shop-quote-template" },
      { label: "How to quote a CNC machining job", path: "/how-to-quote-cnc-machining" },
    ],
    faq: {
      q: "Does it work with QuickBooks Desktop?",
      a: "The file is laid out for QuickBooks Online's invoice import. QuickBooks Desktop imports invoices differently, and the app does not write a Desktop file.",
    },
  },
  {
    id: "shop-load",
    path: "/machine-shop-lead-time",
    label: "Shop load and lead time",
    title: "Machine shop capacity and quoted lead times",
    description:
      "Put your open jobs on your machines, see the day each one finishes and each machine is booked until, and quote a lead time behind the backlog.",
    h1: "Quote lead times from your real shop load",
    intro:
      'A lead time typed from habit ("3 weeks ARO") is the one promise a shop most often breaks. The Shop load page puts the open jobs on the machines, and a draft quote\'s card plans each quantity break behind them.',
    does: [
      "Open jobs (won and not shipped) placed on the machines by due date, each operation in the estimate's order at setup plus cycle times the starts",
      "Each machine's hours a day, Monday to Friday, set by an admin",
      "Each job's finish day and \"after the due date\" when it is late; each machine's open hours and the day it is booked until",
      'On a draft quote, "Lead time from shop load" gives the day, the working days and "N weeks ARO" for every quantity break',
      "A won quote's Job card saves the due date, the quantity ordered and the shipped day",
    ],
    limits: [
      "Holidays, work already done on a job, finishing and outside-service days are not counted, and the page says so",
      'A machine with no hours a day or a line with no cycle time is listed as "can\'t plan" with the reason',
    ],
    guides: [
      { label: "How to work out a machine shop hourly rate", path: "/machine-shop-hourly-rate" },
      { label: "Machine shop quote template (free CSV)", path: "/machine-shop-quote-template" },
    ],
    faq: {
      q: "Is this a full scheduling system?",
      a: "No. It is a finite-capacity estimate from your quotes' own routings, good enough to quote a date. It does not track work done on the floor or move jobs around for you.",
    },
  },
];

export const moduleByPath = (path: string): ModuleData | undefined =>
  MODULES.find((m) => m.path === path);
