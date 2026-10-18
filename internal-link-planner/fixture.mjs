// A small synthetic site used by the tests and by the page's "load example" button.
const B = "https://example.test";
const nav = `<nav><a href="/">Home</a> <a href="/blog/">Blog</a> <a href="/pricing">Pricing</a></nav>`;
const foot = `<footer><a href="/about">About</a></footer>`;
const filler = (t) => `${t} `.repeat(1) + "This paragraph exists so the page has enough words to count as real content for the audit. ".repeat(12);
const page = (path, title, h1, body, extra = "") => ({ url: B + path, html: `<!doctype html><html><head><title>${title} | Acme Dental Software</title>${extra}</head><body>${nav}<main><h1>${h1}</h1>${body}</main>${foot}</body></html>` });
export const SITE = [
  page("/", "Acme", "Acme", `<p>Practice software. Read the <a href="/blog/dental-billing-guide">dental billing guide</a>.</p>` + filler("Welcome.")),
  page("/blog/", "Blog", "Blog", `<ul><li><a href="/blog/dental-billing-guide">Dental billing guide</a></li><li><a href="/blog/insurance-claim-denials">Insurance claim denials</a></li></ul>` + filler("Posts.")),
  page("/pricing", "Pricing", "Pricing", filler("Plans.")),
  page("/about", "About", "About us", filler("We build practice software.")),
  page("/blog/dental-billing-guide", "Dental billing guide", "Dental billing guide", `<p>Billing is where practices lose money. Most losses start with insurance claim denials that nobody reworks, and with a weak patient payment plan.</p><p>See <a href="/blog/insurance-claim-denials">claim denials</a>.</p>` + filler("Billing.")),
  page("/blog/insurance-claim-denials", "Insurance claim denials", "Insurance claim denials", `<p>A denial is rarely final. Track each one, appeal on time and review your fee schedule against what the carrier allows.</p><p>Start with the <a href="/blog/dental-billing-guide">dental billing guide</a>.</p>` + filler("Denials.")),
  page("/blog/patient-payment-plans", "Patient payment plans", "Patient payment plans", `<p>Offering a payment plan raises case acceptance. Compare it with third-party financing.</p>` + filler("Plans.")),
  page("/blog/fee-schedule-review", "Fee schedule review", "Fee schedule review", `<p>Review your fee schedule yearly. Low fees hide behind insurance claim denials and write-offs. Pair this with a patient payment plan policy.</p><a href="https://other.test/x">ext</a><a href="/missing-page">gone</a>` + filler("Fees.")),
  page("/old-draft", "Old draft", "Old draft", `<p>Not for search.</p>` + filler("Draft."), `<meta name="robots" content="noindex">`),
];
export const HOME = B + "/";
