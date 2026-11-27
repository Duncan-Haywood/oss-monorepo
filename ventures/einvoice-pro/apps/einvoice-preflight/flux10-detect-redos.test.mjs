// The Flux 10 sniffing regex (detectSyntax in schematron-core.mjs, looksLikeFlux10 in flux10.mjs) skips a
// prolog of processing instructions and comments before <Report>. Its first version, PR #17149, used
// `(?:<\?[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*)*`: each lazy body could stretch past its own terminator, so a
// file with n leading comments and a root other than Report backtracked through ~2^n splits (22 comments:
// 11 ms; 40 comments: hours). detectSyntax runs on the whole pasted file, in the visitor's browser.
// The rewrite ends each PI or comment at its first terminator, as XML does, which makes the repeat linear.
// These tests pin the speed and that the answers are the old ones wherever the input is well formed.
import assert from "node:assert/strict";
import test from "node:test";
import { detectSyntax } from "./schematron-core.mjs";
import { looksLikeFlux10 } from "./flux10.mjs";

// The PR #17149 pattern, kept only as the reference for the comparison below. It is the slow
// one on purpose (it backtracks exponentially on many leading comments), so it is a fixture
// string compiled here, run only on the generator's short prologs (at most 4 items), and never
// shipped; the product's own sniffers are the linear rewrite.
const VULNERABLE_PR17149_SOURCE = String.raw`^(?:\uFEFF)?\s*(?:<\?[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*)*<Report\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<ReportDocument\b`;
const OLD = new RegExp(VULNERABLE_PR17149_SOURCE);

test("flux10 sniffing: 200 leading comments or PIs before another root answer at once", () => {
  for (const item of ["<!-- note -->\n", "<?pi data?>", "<!--a-->", "<?a?>"]) {
    const other = item.repeat(200) + '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>';
    const flux = item.repeat(200) + "<Report>" + "<!--c-->".repeat(200) + "<ReportDocument/></Report>";
    const t = performance.now();
    assert.equal(detectSyntax(other), "ubl");
    assert.equal(detectSyntax(flux), "flux10");
    assert.equal(looksLikeFlux10(flux), true);
    assert.equal(looksLikeFlux10(other), false);
    // The old pattern needed ~11 ms at 22 items and doubled per item; 200 items is out of reach for it.
    assert.ok(performance.now() - t < 500, `took ${performance.now() - t} ms`);
  }
});

test("flux10 sniffing: same answers as the PR #17149 pattern on well-formed prologs", () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const pick = (a) => a[rnd(a.length)];
  const body = (bad) => {
    for (;;) {
      let s = "";
      for (let k = rnd(5); k > 0; k--) s += pick(["a", "?", "-", ">", "<", " ", "Report"]);
      if (!s.includes(bad)) return s;
    }
  };
  const item = () => pick([
    () => pick([" ", "\n", "\t"]),
    () => "<?" + body("?>") + "?>",
    () => "<!--" + body("-->") + "-->",
  ])();
  const items = (n) => Array.from({ length: rnd(n + 1) }, item).join("");
  let positives = 0;
  for (let i = 0; i < 20000; i++) {
    const root = pick(["<Report", "<Reports", "<Report ", "<Invoice", "<ReportDocument"]);
    const child = pick(["<ReportDocument", "<ReportDocuments", "<Header", "<ReportDocument "]);
    const commentsOnly = () => Array.from({ length: rnd(3) }, () => pick([" ", "<!--" + body("-->") + "-->"])).join("");
    const s = pick(["", "\uFEFF"]) + items(4) + root + pick(["", " a='1'", "/"]) + ">" + commentsOnly() + child + "/>";
    const want = OLD.test(s);
    if (want) positives++;
    assert.equal(detectSyntax(s) === "flux10", want, JSON.stringify(s));
    assert.equal(looksLikeFlux10(s), want, JSON.stringify(s));
  }
  assert.ok(positives > 1000, `only ${positives} positive cases; the generator drifted`);
});

test("flux10 sniffing: a PI or comment ends at its first terminator (text after it is not a prolog)", () => {
  // The old pattern let `<?a?>x?>` be one PI; that prolog is not well-formed XML, and now it is not Flux 10.
  assert.equal(looksLikeFlux10("<?a?>x?><Report><ReportDocument/></Report>"), false);
  assert.equal(looksLikeFlux10("<!--a-->x--><Report><ReportDocument/></Report>"), false);
  // Terminator-like text inside a body is still fine.
  assert.equal(looksLikeFlux10("<?a ? > ??><!-- - -- ---><Report><!-- x --><ReportDocument/></Report>"), true);
});
