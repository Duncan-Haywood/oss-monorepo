// English copy. Facts (dates, rules, prices) come from content/deadlines.mjs and content/pricing.mjs
// through ctx; never type a date or a price in here.

const ui = {
  skip: "Skip to content",
  banner:
    "Early access: the service is not generally available yet. Nothing on this site is tax advice.",
  navLabel: "Main",
  langLabel: "Language",
  nav: {
    accountants: "Accountants",
    api: "API",
    pricing: "Pricing",
    "deadlines-de": "Germany",
    "deadlines-fr": "France",
    "deadlines-pl": "Poland",
    "early-access": "Early access",
    privacy: "Privacy",
  },
  footer:
    "Early access. Deadlines are quoted from official sources with the date we checked them; the official text always wins. Not tax advice.",
  chooser: "English",
  notFound: "Page not found. Go to the English home page",
  kind: { receive: "Receiving", issue: "Issuing" },
  date: "Date",
  what: "Applies to",
  detail: "What changes",
  source: "Source",
  sourcesHeading: "Official sources",
  checkedOn: "Checked on",
  checkedViaSearch:
    "Checked against the official page's text as returned by a search restricted to the official site; open the link for the current wording",
  notTaxAdvice:
    "This page summarises official guidance. It is not tax advice and does not replace the official text or your tax adviser.",
  plan: "Plan",
  perMonth: "Per month",
  clients: "Client companies",
  invoicesChecked: "Invoices checked / month",
  explanations: "Invoices explained / month",
  meterValidation: "Validation (pass/fail with rule codes)",
  meterExplanation: "Validation + plain-language explanation and proposed fix",
  meterMinimum: "Monthly minimum",
  per1000: "per 1,000 invoices",
  perInvoice: "per invoice",
  perMonthCredited: "per month, credited against usage",
  ldPricing: "Proposed early-access plans for accountants; prices excluding VAT.",
  roles: {
    accountant: "Accountant or tax adviser",
    vendor: "Invoicing or accounting software vendor",
    business: "Business that sends or receives invoices",
    other: "Other",
  },
  form: {
    email: "Work email",
    role: "You are",
    countries: "Countries you need (optional)",
    consent: (privacyLink) =>
      `I agree that my email address, role, language and country choice are stored so you can send me a confirmation email and then news about early access to this product. I can withdraw at any time with the link in every email. Details: ${privacyLink}.`,
    submit: "Request early access",
    afterSubmit:
      "We will send one email with a confirmation link. Nothing is kept as confirmed until you click it.",
  },
  mail: {
    subject: "Confirm your early-access request",
    body: (confirmUrl, deleteUrl, siteName) =>
      `Hello,\n\nsomeone (hopefully you) asked for early access to ${siteName} with this address.\n\nConfirm here (the link works for 7 days):\n${confirmUrl}\n\nIf this was not you, ignore this email: the request is deleted automatically after 7 days.\n\nDelete your data now:\n${deleteUrl}\n\n${siteName}`,
  },
  confirmPage: {
    title: "Confirm your early-access request",
    text: "Click the button to confirm. We ask for a click because email security scanners open links automatically.",
    button: "Confirm",
  },
  deletePage: {
    title: "Delete your early-access data",
    text: "This deletes your email address and everything stored with it. It cannot be undone.",
    button: "Delete my data",
  },
};

const pages = {
  home: (c) => ({
    title: "E-invoices that pass, every error explained",
    description:
      "Early access: check XRechnung, ZUGFeRD, Factur-X and UBL e-invoices for Germany and France, with each validation error explained in plain English, German or French.",
    body: `<h1>E-invoices that pass. Every error explained.</h1>
<p class="lead">Germany and France now require structured e-invoices between businesses. When an XRechnung, ZUGFeRD, Factur-X or UBL file is rejected, the validator's message rarely says what to change. We check the file, explain each error in plain language, and propose a fix where the fix needs no new facts.</p>
<p><a class="cta" href="${c.link("early-access")}">Request early access</a></p>

<h2>The deadlines</h2>
<p>Every date below links to the official page it comes from. The country pages have the details and the date we last checked each source.</p>
<div class="grid">
${c.deadlineSummary()}
</div>

<h2>What fix-and-explain does</h2>
<ol>
<li><strong>Check.</strong> Upload an invoice file (or send it through the API). We detect the format and profile and run the validation rules.</li>
<li><strong>Explain.</strong> Each error comes back with the rule it breaks, where in the invoice it is, and what it means in plain language, in German, French, Dutch or English.</li>
<li><strong>Fix, carefully.</strong> Where the correction needs no new facts, we propose a corrected XML file with a diff: a date in the wrong form (24.08.2026 becomes 2026-08-24), an amount with more than two decimals, a currency code in lower case, a missing currency code where the amounts name one currency, and a missing Peppol business process identifier. A fix is kept only if the corrected file passes the rule it targets and raises no new finding. Totals, identifiers and missing business data are never changed: where a fact is missing, such as a customer's SIREN, we say which one and ask. PDFs are reported, not rewritten.</li>
<li><strong>From a PDF.</strong> An invoice that is still a PDF from Word, Excel or an older program can become an e-invoice in the workspace. Every value is read from the page and shown beside the line it came from, never guessed. Rows are taken only when quantity times price equals the amount, and the PDF's printed totals are the test. You confirm the values that took judgment and add what the PDF lacks (usually the buyer's e-invoice address). Then you download a Factur-X / ZUGFeRD, CII or UBL file that has been through the checks above. The download stays locked until its totals match the PDF. Scanned PDFs are not read yet.</li>
</ol>

<h2>What is checked, and what is not</h2>
<p>This list matches what the service checks today. Pass or fail comes only from deterministic rules; an explanation never changes a result.</p>
<div class="checks">
<div class="card"><h3>Checked</h3><ul>
<li>The CII XSD schema (UN/CEFACT D16B, the EN 16931 subset CEN publishes) for EN 16931 files and their CIUSes such as XRechnung and Factur-X BASIC: element order, required and unknown elements, number, date and true/false values, and namespaces (udt: where the schema wants qdt:). On 499 altered test files every verdict matched xmllint running the same schema.</li>
<li>Factur-X / ZUGFeRD MINIMUM, BASIC WL and EXTENDED files against their own profile's schema from the Factur-X 1.0.9 package, with the same checks plus attributes the profile does not allow (listID on a BASIC WL currency code, for example). On 1,199 altered test files every verdict matched xmllint running the same schemas. Files declared as the French EXTENDED-CTC-FR profile are checked against its own UN/CEFACT D22B schema from the same source; on 1,499 altered copies of FNFE-MPE's five examples every verdict matched xmllint.</li>
<li>Reading the file: UBL 2.1 and UN/CEFACT CII XML, the XML attached to a Factur-X / ZUGFeRD PDF, and the PDF around it (PDF/A-3 marker, attachment name and relationship, the profile named in the PDF's metadata).</li>
<li>The UBL 2.1 schema (XSD) on every UBL invoice and credit note, before any business rule: unknown or repeated elements, element order, missing elements, values that are not a number, date, time or true/false, missing <code>currencyID</code> and other attributes, and the namespace of each element.</li>
<li>The EN 16931 business rules (BR-…) through the official CEN Schematron, and the official XRechnung or Peppol BIS add-on when the file declares one, wherever the server has them installed; each result says whether they ran. Beside them, our own checks: required fields, totals exact to the cent, at most two decimals, date and currency codes, VAT-number and IBAN check digits.</li>
<li>Germany: a ZUGFeRD / Factur-X MINIMUM or BASIC WL file from a German seller is flagged as not an e-invoice. With the XRechnung rules (chosen, or detected from the file's specification identifier), nine checks after BR-DE: buyer reference and Leitweg-ID check digits, payment instructions, seller contact, seller and buyer address, invoice type code, specification identifier and the seller's tax number.</li>
<li>France: with the French rules (chosen, or detected when seller and buyer are both in France), the seller's and buyer's SIREN or SIRET and their check digit, the SIREN inside the seller's French VAT number, the category of the operation (one of the new details on the ${c.a("deadlines-fr", "France page")}), and the late-payment penalty, €40 recovery indemnity and early-payment discount mentions.</li>
<li>Poland: KSeF FA(3) files against the FA(3) schema, the checks KSeF runs on every file it receives that a file can show (encoding, forbidden characters, size, an issue date in the future, a repeated invoice number in one batch), NIP check digits, and the totals per tax rate, including corrections, advances and settlements (${c.a("deadlines-pl", "Poland page")}).</li>
</ul></div>
<div class="card"><h3>Not checked</h3><ul>
<li>Whether the VAT rate or VAT treatment is right for the transaction.</li>
<li>Whether a VAT number, SIREN or Leitweg-ID exists or is active: only its form and check digits.</li>
<li>France: whether the option to pay VAT on debits applies and is stated.</li>
<li>Whether the PDF as a whole conforms to PDF/A-3: we are not a PDF/A validator.</li>
<li>Whether the goods or services were actually supplied, or the amounts agreed.</li>
<li>Transmission: we are not a French <em>plateforme agréée</em> and do not send invoices or e-reporting data to any tax authority.</li>
<li>Archiving obligations.</li>
</ul></div>
</div>

<h2>Who it is for</h2>
<div class="grid">
<div class="card"><h3>${c.a("accountants", "Accountants")}</h3><p>A plan per client: which deadline applies, what their software produces, and which errors to fix first.</p></div>
<div class="card"><h3>${c.a("api", "Invoicing software vendors")}</h3><p>A metered API that returns each error with an explanation your users can act on.</p></div>
<div class="card"><h3>${c.a("pricing", "Pricing")}</h3><p>Proposed plans from ${c.euro(c.minPlanCents)} a month, cost-plus. Early-access prices.</p></div>
</div>
`,
  }),

  accountants: (c) => ({
    title: "E-invoicing plan per client, for accountants",
    description:
      "For accountants and tax advisers: one e-invoicing plan per client for Germany and France, with the applicable deadline, format check and each error explained. Early access.",
    body: `<h1>One e-invoicing plan per client</h1>
<p class="lead">Your clients will ask you whether their invoices are ready. The answer depends on the client: where they are, how large they are, and what their invoicing software produces. Early access.</p>

<h2>What the plan contains</h2>
<ol>
<li><strong>The deadline that applies.</strong> From what you enter (country, prior-year turnover band in Germany, size category in France), the plan picks the matching date from the official calendar. In Germany, for example, the extended transition period applies only to issuers below a prior-year turnover threshold (${c.a("deadlines-de", "Germany page")}).</li>
<li><strong>Receiving.</strong> Whether the client can already receive e-invoices: required in Germany since ${c.when("de", "receive")} and in France since ${c.when("fr", "receive")}, according to the official sources on the country pages.</li>
<li><strong>Sample check.</strong> Upload a few invoices the client's software produces. You see the format, the profile, and every error explained.</li>
<li><strong>What to fix, in order.</strong> Errors that make the invoice not count as an e-invoice first, then the rest. Each item says whether it is a software setting, a missing master-data field (for example the customer's SIREN) or a one-off mistake.</li>
<li><strong>A dated checklist</strong> you can send to the client, in German, French or English.</li>
</ol>
<p>The plan only states deadlines from our sourced table and facts you entered. It does not decide a client's VAT treatment: that remains your professional judgement.</p>

<h2>All your clients at a glance</h2>
<p>The workspace lists every client with its status over the last 7 to 365 days: which ones sent invoices that still fail, the rules that fail most often, and who has not been checked lately. Clients that need you come first. Download the same table as a CSV for your own records. It is built from the check history alone (file names, checksums and rule ids), so it does not count against your invoice allowance.</p>

<h2>Pricing for firms</h2>
${c.plansTable()}
<p class="small">Proposed early-access prices, excluding VAT. How we set them: ${c.a("pricing", "pricing")}.</p>
<p><a class="cta" href="${c.link("early-access")}">Request early access</a></p>
`,
  }),

  api: (c) => ({
    title: "E-invoice validation API with explanations",
    description:
      "Metered API for invoicing software vendors: validate XRechnung, ZUGFeRD, Factur-X, UBL and CII invoices and get each error explained in German, French, Dutch or English.",
    body: `<h1>An API that explains why an e-invoice fails</h1>
<p class="lead">Your users see "BR-CO-15" and call support. Send us the invoice; get back each error with its location and an explanation they can act on, in their language. Early access.</p>

<h2>Request and response</h2>
<p>This is the response the service returns today, shortened (one finding of four shown; the date fix clears two, and the seller contact and buyer address, XR-004 and XR-006, need facts only you have). Field names may still change before release; early-access partners will be told before any change.</p>
<pre><code>POST /v1/check?lang=en&amp;fix=1&amp;profile=auto&amp;name=rechnung.xml
Authorization: Bearer epk_…
Content-Type: application/xml   (or application/pdf for Factur-X / ZUGFeRD)

200 OK
{
  "file": "rechnung.xml",
  "sha256": "04f41338…",
  "profile": "xrechnung",
  "profileDetected": true,
  "status": "fail",
  "findings": [
    {
      "rule": "PRO-DATE-001",
      "message": "IssueDate \\"24.08.2026\\" is not a date in the form YYYY-MM-DD.",
      "path": "/IssueDate@1367",
      "explanation": {
        "lang": "en",
        "source": "template",
        "title": "A date is not written in the only form the e-invoice schema accepts …",
        "action": "Rewrite the date in that form; the schema rejects 24.08.2026 or 24/08/2026."
      }
    }
  ],
  "fixes": {
    "applied": [{ "id": "date-format", "resolves": ["INV-003", "PRO-DATE-001"],
                  "changes": [{ "element": "IssueDate", "before": "24.08.2026", "after": "2026-08-24" }] }],
    "skipped": [],
    "diff": "--- a/rechnung.xml\\n+++ b/rechnung.xml\\n…",
    "content": "&lt;?xml …",
    "revalidation": { "status": "fail", "findings": [ … XR-004, XR-006 … ] }
  }
}</code></pre>
<ul>
<li>A fix is returned only from the whitelist below (dates, decimals, currency code, Peppol process identifier), and only if the corrected file clears the rule it targets and raises no new finding. Totals, identifiers and missing business data are never changed; a fix that would need them is listed under <code>skipped</code> with the reason.</li>
<li><code>status</code> comes only from deterministic rules. <code>explanation.source</code> is <code>template</code> (written by us), <code>llm</code> (a model's wording for a rule without a template, marked as such and never allowed to change the result) or <code>checker</code>.</li>
<li><code>schematron</code> says whether the official EN 16931 Schematron ran (<code>ok</code>) or was not available on that server (<code>unavailable</code>), in which case only the built-in checks ran.</li>
<li>Data handling: invoice contents are not stored. History keeps file names, SHA-256 hashes, rule ids and fix ids. Where a rule has no template, only its rule id and message are sent to the model, not the invoice.</li>
</ul>

<h2>Metered pricing</h2>
${c.meterTable()}
<p class="small">Proposed early-access prices, excluding VAT, billed monthly in arrears. How we set them: ${c.a("pricing", "pricing")}.</p>
<p><a class="cta" href="${c.link("early-access")}">Request API early access</a></p>
`,
  }),

  pricing: (c) => ({
    title: "Pricing",
    description: `Proposed early-access prices for e-invoice checks with explanations: plans for accounting firms from ${c.euro(c.minPlanCents)} a month and a metered API for software vendors. Cost-plus.`,
    body: `<h1>Pricing</h1>
<p class="lead">Proposed early-access prices, excluding VAT. We price cost-plus: each plan costs 1.3 to 2 times what it costs us to serve a customer who uses all of it.</p>

<h2>Accounting firms</h2>
${c.plansTable()}
<p>An invoice counts once a month however often you re-check it. "Explained" means an invoice with errors that we explained in plain language; valid invoices only use the "checked" allowance.</p>

<h2>API for software vendors</h2>
${c.meterTable()}

<h2>Why these numbers</h2>
<p>The costly part is the plain-language explanation, which uses a large language model. Rule validation itself is cheap. Our cost estimate per plan covers those model calls, hosting, the payment provider's fees and a refund reserve, and assumes you use the whole allowance. If our costs fall, prices fall.</p>
<p><a class="cta" href="${c.link("early-access")}">Request early access</a></p>
`,
  }),

  "deadlines-de": (c) => ({
    title: "E-invoicing deadlines in Germany",
    description:
      "Germany's B2B e-invoice deadlines: receiving since 1 January 2025, transition periods to the end of 2026 and 2027, accepted formats. Each date cited to the BMF.",
    body: `<h1>E-invoicing deadlines in Germany</h1>
<p class="lead">${c.esc(c.COUNTRIES[0].scope.en)}</p>
${c.deadlineTable("de")}
<h2>What counts as an e-invoice</h2>
${c.rulesList("de")}
<h2>How we help</h2>
<p>We check XRechnung and ZUGFeRD files against these rules and explain every error. ${c.a("accountants", "For accountants")} · ${c.a("early-access", "Early access")}</p>
${c.sourcesBlock("de")}
`,
  }),

  "deadlines-fr": (c) => ({
    title: "E-invoicing deadlines in France",
    description:
      "France's B2B e-invoicing and e-reporting deadlines: receiving for all from 1 September 2026, issuing from 2026 or 2027 by size, formats and new mandatory details.",
    body: `<h1>E-invoicing deadlines in France</h1>
<p class="lead">${c.esc(c.COUNTRIES[1].scope.en)}</p>
${c.deadlineTable("fr")}
<h2>Formats and new mandatory details</h2>
${c.rulesList("fr")}
<h2>How we help</h2>
<p>We check Factur-X, UBL and CII files and explain every error. We are not a <em>plateforme agréée</em>: you still need an approved platform to send and receive invoices. ${c.a("early-access", "Early access")}</p>
${c.sourcesBlock("fr")}
`,
  }),

  "deadlines-pl": (c) => ({
    title: "KSeF e-invoicing deadlines in Poland",
    description:
      "Poland's KSeF deadlines: receiving and issuing for large businesses from 1 February 2026, everyone else from 1 April 2026, the PLN 10,000 relief to the end of 2026. Each date cited to the Ministry of Finance.",
    body: `<h1>KSeF e-invoicing deadlines in Poland</h1>
<p class="lead">${c.esc(c.COUNTRIES.find((x) => x.key === "pl").scope.en)}</p>
${c.deadlineTable("pl")}
<h2>How KSeF works, and what it means for foreign businesses</h2>
${c.rulesList("pl")}
<h2>How we help</h2>
<p>We check FA(3) files before they are sent: the FA(3) schema, the checks KSeF runs on every file it receives that a file can show (encoding, forbidden characters, size, an issue date in the future, the same invoice number twice in one batch), NIP check digits and the totals per tax rate, including corrections, advances and settlements. Each error is explained in plain English, German, French or Polish. We do not send invoices to KSeF and cannot give a KSeF number: your invoicing program or the Ministry's own tools do that. ${c.a("accountants", "For accountants")} · ${c.a("early-access", "Early access")}</p>
${c.sourcesBlock("pl")}
`,
  }),

  "early-access": (c) => ({
    title: "Request early access",
    description:
      "Request early access to e-invoice checks with explanations for Germany, France and Poland. Double opt-in; we store only what the form asks for.",
    body: `<h1>Request early access</h1>
<p class="lead">Tell us who you are and which countries you need. We will email you when there is a place for you.</p>
${c.form()}
`,
  }),

  privacy: (c) => privacy(c),

  "check-inbox": () => ({
    title: "Check your inbox",
    description: "Confirm your early-access request with the link we emailed you.",
    body: `<h1>Check your inbox</h1><p>If the address is valid, we have sent a confirmation link. It works for 7 days. Unconfirmed requests are deleted automatically after 7 days.</p>`,
  }),
  confirmed: (c) => ({
    title: "Confirmed",
    description: "Your early-access request is confirmed.",
    body: `<h1>Confirmed</h1><p>Thank you. We will email you about early access. Every email has a link to delete your data.</p><p>${c.a("home", "Back to the home page")}</p>`,
  }),
  deleted: (c) => ({
    title: "Deleted",
    description: "Your early-access data has been deleted.",
    body: `<h1>Deleted</h1><p>Your email address and everything stored with it have been deleted.</p><p>${c.a("home", "Back to the home page")}</p>`,
  }),
  "form-error": (c) => ({
    title: "Something went wrong",
    description: "The request could not be processed.",
    body: `<h1>Something went wrong</h1><p>The link may have expired, or the form was incomplete. ${c.a("early-access", "Try again")}.</p>`,
  }),
};

function privacy(c) {
  const ctl = c.cfg.controller;
  const controller = ctl.name
    ? `${c.esc(ctl.name)}, ${c.esc(ctl.address)}, <a href="mailto:${c.esc(ctl.email)}">${c.esc(ctl.email)}</a>`
    : "[Controller name, address and email: set before launch. A production build fails without them.]";
  return {
    title: "Privacy",
    description:
      "What this site stores when you request early access, why, for how long, who processes it, and your rights under the GDPR.",
    body: `<h1>Privacy</h1>
<p>This notice covers this website and the early-access form. It will be replaced by a full notice for the service itself before launch.</p>

<h2>Controller</h2>
<p>${controller}</p>

<h2>Visiting the site</h2>
<p>No cookies, no analytics, no tracking pixels, no fonts or scripts from other servers. The site is hosted by Cloudflare, which processes your IP address and request data to deliver pages and protect them against attacks. We do not store this data in our database and have not enabled request logging.</p>

<h2>The early-access form</h2>
<p>When you submit the form we store:</p>
<ul>
<li>your email address;</li>
<li>the role you chose, the countries you ticked, and the page language;</li>
<li>the version of the consent text you agreed to and the time you submitted and confirmed (proof of consent, Art. 7(1) GDPR);</li>
<li>a hash of the confirmation link (not the link itself), its expiry, and when and how many confirmation emails were sent (to limit resending).</li>
</ul>
<p>We do not store your IP address. Purpose: to confirm your address (double opt-in) and then email you about early access to this product. Legal basis: your consent, Art. 6(1)(a) GDPR. You can withdraw it at any time with the delete link in every email; this does not affect what happened before.</p>
<p>Who can see the list: only the people who run this service (the controller above) can view it, in an internal overview showing your email address, whether you confirmed, and the date. Each such view is logged.</p>

<h2>How long</h2>
<ul>
<li>Unconfirmed requests: deleted automatically after 7 days.</li>
<li>Confirmed requests: until you delete them, and at most 24 months after you confirmed.</li>
<li>Deleting removes the whole entry immediately.</li>
</ul>

<h2>Who processes it</h2>
<p>Cloudflare, Inc. hosts the site, the database (Cloudflare D1) and sends the emails (Cloudflare Email Service), as our processor under Art. 28 GDPR. Cloudflare may process data in the United States. Cloudflare is certified under the EU-U.S. Data Privacy Framework (adequacy decision, Art. 45 GDPR), and its data processing addendum includes the EU standard contractual clauses (Art. 46 GDPR). We do not sell or share your data with anyone else.</p>

<h2>Your rights</h2>
<p>You have the right of access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction (Art. 18), data portability (Art. 20) and to object (Art. 21), and to withdraw consent (Art. 7(3)). Write to the controller above. You can also complain to a data protection supervisory authority, in particular in the EU member state where you live or work (Art. 77). There is no automated decision-making. Giving us your data is voluntary; without an email address we cannot contact you.</p>
<p class="small">Version ${c.esc(c.consentVersion)}.</p>
`,
  };
}

export default { ui, pages };
