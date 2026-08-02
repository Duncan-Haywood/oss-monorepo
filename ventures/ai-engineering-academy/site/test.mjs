import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import assert from "assert";
import vm from "node:vm";
import { validateToolSchema } from "./checkpoint-validator.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "dist");

console.log("▶ Running AI Engineering Academy Site Unit & Verification Suite...");

// 1. Run build script
try {
  execSync("node build.mjs", { cwd: __dirname, stdio: "inherit" });
} catch (err) {
  assert.fail("build.mjs execution failed: " + err.message);
}

// 2. Verify output files exist
const expectedPages = [
  "index.html",
  "brief.html",
  "01-philosophy-and-vision.html",
  "02-learning-science-and-ai-mentor.html",
  "03-curriculum-and-assessment.html",
  "04-technical-architecture.html",
  "05-business-and-strategy.html",
  "06-market-and-roadmap.html",
  "sandbox.html",
  "pricing.html",
  "style.css"
];

for (const file of expectedPages) {
  const filePath = join(DIST, file);
  assert.strictEqual(existsSync(filePath), true, `Expected ${file} to exist in dist directory.`);
}

console.log("✔ All expected HTML pages and CSS assets generated in dist/.");

// 3. Verify markdown link rewriting in index.html
const indexContent = readFileSync(join(DIST, "index.html"), "utf8");
assert.strictEqual(indexContent.includes('href="01-philosophy-and-vision.html"'), true, "Markdown links should be rewritten to .html");
assert.strictEqual(indexContent.includes('01-philosophy-and-vision.md'), false, "Raw .md links should not be present in index.html");

const sandboxContent = readFileSync(join(DIST, "sandbox.html"), "utf8");
const pricingContent = readFileSync(join(DIST, "pricing.html"), "utf8");
const cssContent = readFileSync(join(DIST, "style.css"), "utf8");

// ---------------------------------------------------------------------------
// 4. The mastery checkpoint must grade the answer, not the length of it.
//
// Regression: verifyCheckpoint() passed anything containing "type", containing
// "properties", or simply longer than ten characters, and answered "Checkpoint
// passed! Schema structure verified. Portfolio point awarded (+25 pts)". So
// "aaaaaaaaaaaa" was graded as a correct SQL-injection-safe tool schema, no
// schema was verified, and no point was stored anywhere. Each case below fails
// against that grader.
// ---------------------------------------------------------------------------

const failing = (input) => {
  const result = validateToolSchema(input);
  assert.strictEqual(result.ok, false, `Expected to be rejected: ${JSON.stringify(input)}`);
  return result;
};
const failedIds = (input) =>
  failing(input).checks.filter((c) => !c.passed).map((c) => c.id);

// Every one of these passed the old grader.
assert.ok(failedIds("aaaaaaaaaaaa").includes("parses"), "Filler text is not a schema.");
assert.ok(failedIds("the type of properties I would use").includes("parses"), "Prose naming the keywords is not a schema.");
assert.ok(failedIds('{"type": "object"}').includes("properties"), "A schema with no parameters must not pass.");
assert.strictEqual(validateToolSchema("").ok, false, "Empty input must not pass.");
assert.strictEqual(validateToolSchema("   ").ok, false, "Whitespace must not pass.");
assert.strictEqual(validateToolSchema(undefined).ok, false, "Missing input must not pass.");
assert.strictEqual(validateToolSchema("[1,2,3]").ok, false, "A JSON array is not a tool schema.");
assert.strictEqual(validateToolSchema("null").ok, false, "JSON null is not a tool schema.");
assert.strictEqual(validateToolSchema('"a string"').ok, false, "A JSON string is not a tool schema.");

// The rule the question is actually about: an unconstrained string parameter
// is the injection path, so it must fail even when everything else is right.
const unconstrained = {
  type: "object",
  properties: { query: { type: "string" } },
  required: ["query"],
  additionalProperties: false
};
assert.deepStrictEqual(
  failedIds(JSON.stringify(unconstrained)),
  ["constrained-strings"],
  "A free-text string parameter must fail, and must fail on its own rule."
);

// Each of the four constraint keywords is a sufficient answer on its own.
for (const constraint of [
  { enum: ["orders", "customers"] },
  { pattern: "^[a-z_]+$" },
  { maxLength: 64 },
  { format: "uuid" }
]) {
  const schema = {
    type: "object",
    properties: { table: { type: "string", ...constraint } },
    required: ["table"],
    additionalProperties: false
  };
  assert.strictEqual(
    validateToolSchema(JSON.stringify(schema)).ok,
    true,
    `A string constrained by ${Object.keys(constraint)[0]} should be accepted.`
  );
}

// A union type including "string" is still a string parameter.
assert.ok(
  failedIds(JSON.stringify({
    type: "object",
    properties: { table: { type: ["string", "null"] } },
    required: ["table"],
    additionalProperties: false
  })).includes("constrained-strings"),
  'type: ["string","null"] must be treated as a string parameter.'
);

// Non-string parameters have nothing to constrain and must not be penalised.
assert.strictEqual(
  validateToolSchema(JSON.stringify({
    type: "object",
    properties: { limit: { type: "integer", maximum: 100 } },
    required: ["limit"],
    additionalProperties: false
  })).ok,
  true,
  "An integer parameter needs no string constraint."
);

// The remaining rules each fail alone.
assert.deepStrictEqual(
  failedIds(JSON.stringify({
    type: "object",
    properties: { table: { type: "string", enum: ["orders"] } },
    required: ["table"]
  })),
  ["no-additional"],
  "Omitting additionalProperties:false must fail on its own rule."
);
assert.deepStrictEqual(
  failedIds(JSON.stringify({
    type: "object",
    properties: { table: { type: "string", enum: ["orders"] } },
    required: [],
    additionalProperties: false
  })),
  ["required"],
  "An empty required array must fail on its own rule."
);
assert.deepStrictEqual(
  failedIds(JSON.stringify({
    type: "object",
    properties: { table: { type: "string", enum: ["orders"] } },
    required: ["tbl"],
    additionalProperties: false
  })),
  ["required"],
  'A "required" entry naming no declared property must fail.'
);
assert.deepStrictEqual(
  failedIds(JSON.stringify({
    type: "array",
    properties: { table: { type: "string", enum: ["orders"] } },
    required: ["table"],
    additionalProperties: false
  })),
  ["object-type"],
  'A top-level type other than "object" must fail on its own rule.'
);

// A complete answer passes, and reports every rule it satisfied.
const good = validateToolSchema(JSON.stringify({
  type: "object",
  properties: {
    table: { type: "string", enum: ["orders", "customers"] },
    search_term: { type: "string", maxLength: 128 },
    limit: { type: "integer", maximum: 100 }
  },
  required: ["table", "search_term"],
  additionalProperties: false
}));
assert.strictEqual(good.ok, true, "A correct schema must pass.");
assert.strictEqual(good.checks.length, 6, "A passing answer must report all six rules.");
assert.strictEqual(good.checks.every((c) => c.passed), true, "A passing answer must show no failed rule.");

// A parse failure must say so rather than silently grading the rest.
const parseFail = validateToolSchema("{not json");
assert.strictEqual(parseFail.checks.length, 1, "A parse failure should stop at the parse rule.");
assert.ok(/JSON parse error/.test(parseFail.checks[0].detail), "A parse failure should report the parser's message.");

console.log("✔ Mastery checkpoint grades the schema (17 rejection cases, 6 acceptance cases).");

// The page must carry that grader rather than a second copy of the rules.
assert.strictEqual(
  sandboxContent.includes("function validateToolSchema("),
  true,
  "sandbox.html must inline the tested validator, not reimplement the rules."
);
assert.strictEqual(
  /export\s*\{/.test(sandboxContent),
  false,
  "The inlined validator must have its ESM export stripped, or the page script throws."
);

// Asserting the source is present does not prove the page runs it: a syntax
// error in the inlined script, or a stripped export leaving a dangling brace,
// would ship silently and the checkpoint would do nothing on click. So execute
// the page's own script against a stub DOM and drive verifyCheckpoint through
// it, the way a visitor does.
const pageScript = sandboxContent.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(pageScript, "sandbox.html must carry an inline script.");

const elements = new Map();
const stubElement = (id) => {
  if (!elements.has(id)) {
    elements.set(id, { id, value: "", innerText: "", innerHTML: "", getAttribute: () => null });
  }
  return elements.get(id);
};
const sandboxWindow = {
  document: {
    getElementById: stubElement,
    querySelector: () => null,
    querySelectorAll: () => []
  }
};
try {
  vm.createContext(sandboxWindow);
  vm.runInContext(pageScript[1], sandboxWindow);
} catch (err) {
  assert.fail("The inlined sandbox script does not evaluate: " + err.message);
}
assert.strictEqual(
  typeof sandboxWindow.verifyCheckpoint,
  "function",
  "The page must define verifyCheckpoint."
);

// A wrong answer, graded through the page rather than through the module.
stubElement("checkpoint-answer").value = "aaaaaaaaaaaa";
sandboxWindow.verifyCheckpoint();
let rendered = stubElement("checkpoint-feedback").innerHTML;
assert.ok(/Not yet/.test(rendered), "The page must reject filler text: " + rendered);
assert.ok(!/Checkpoint passed/.test(rendered), "The page must not answer the old success string.");

// A correct answer, through the same path.
stubElement("checkpoint-answer").value = JSON.stringify({
  type: "object",
  properties: { table: { type: "string", enum: ["orders"] } },
  required: ["table"],
  additionalProperties: false
});
sandboxWindow.verifyCheckpoint();
rendered = stubElement("checkpoint-feedback").innerHTML;
assert.ok(/All six rules hold/.test(rendered), "The page must accept a correct schema: " + rendered);

// Property names reach innerHTML, so they must be escaped on the way.
stubElement("checkpoint-answer").value = JSON.stringify({
  type: "object",
  properties: { "<img src=x onerror=alert(1)>": { type: "string" } },
  required: ["<img src=x onerror=alert(1)>"],
  additionalProperties: false
});
sandboxWindow.verifyCheckpoint();
rendered = stubElement("checkpoint-feedback").innerHTML;
assert.ok(
  !/<img /.test(rendered),
  "Feedback must escape names taken from the parsed schema before writing innerHTML."
);
assert.ok(/&lt;img /.test(rendered), "The escaped form should still be shown to the learner.");

// The walkthrough writes the visitor's own text into innerHTML too.
stubElement("user-prompt").value = "<script>alert(1)<\/script>";
sandboxWindow.showWalkthrough();
const walkthrough = stubElement("console-output").innerHTML;
assert.ok(!/<script>alert/.test(walkthrough), "The walkthrough must escape the entered goal.");
assert.ok(/&lt;script&gt;/.test(walkthrough), "The escaped goal should still be shown.");
assert.ok(
  /no code was run/.test(walkthrough),
  "Every walkthrough must repeat that nothing executed."
);
for (const banned of [
  "input.length > 10",
  "Portfolio point awarded",
  "Schema structure verified"
]) {
  assert.strictEqual(
    sandboxContent.includes(banned),
    false,
    `The length-based grader must not return: found ${JSON.stringify(banned)}.`
  );
}

// ---------------------------------------------------------------------------
// 5. The sandbox must not report a result it did not produce.
//
// Regression: pressing "Run Multi-Agent Execution" printed a fixed trace with
// invented sub-second timings ending "12/12 passing" and "Subgoal satisfaction
// score: 100%", with no model, no execution and no test suite behind any of
// it. The same Track 1 trace printed on all three tracks.
// ---------------------------------------------------------------------------

for (const fabricated of [
  "12/12 passing",
  "satisfaction score",
  "[0.82s]",
  "Sandbox Runtime v2.4",
  "runSandboxSimulation"
]) {
  assert.strictEqual(
    sandboxContent.includes(fabricated),
    false,
    `Sandbox must not present a fabricated execution result: found ${JSON.stringify(fabricated)}.`
  );
}
assert.strictEqual(
  /\[\d+\.\d\ds\]/.test(sandboxContent),
  false,
  "Sandbox must not print timings for work it never performed."
);
assert.strictEqual(
  sandboxContent.includes("nothing is executed"),
  true,
  "The walkthrough box must state that nothing runs."
);
assert.strictEqual(
  sandboxContent.includes("no model is called, no code is executed"),
  true,
  "The page must say up front that no model is called."
);

// Each track must carry its own stages. Previously all three shared Track 1's.
for (const marker of ["[Observer]", "[Hypothesis]", "[Model]", "[Tune]", "[Planner]", "[Executor]"]) {
  assert.strictEqual(
    sandboxContent.includes(marker),
    true,
    `Track walkthroughs must be track-specific: missing ${marker}.`
  );
}

console.log("✔ Sandbox presents a labelled walkthrough and claims no execution.");

// ---------------------------------------------------------------------------
// 6. Pricing must separate what exists from what is planned.
//
// Regression: the "Always Free" card listed "All 50+ Project Specifications",
// "Complete Engineering Knowledge Graph", "Public Portfolio Page Hosting" and
// "Community Forums & Peer Review" as present-tense entitlements. None exists:
// the knowledge graph and portfolio hosting are designs in docs 02 and 04, no
// per-project specification artifacts exist, there is no forum, and no count of
// project specifications supports "50+". The Pro card carried a "Most Popular"
// badge on a tier with no checkout anywhere in the venture.
// ---------------------------------------------------------------------------

for (const unbacked of [
  "50+ Project Specifications",
  "Most Popular",
  "Always Free"
]) {
  assert.strictEqual(
    pricingContent.includes(unbacked),
    false,
    `Pricing must not make an unbacked claim: found ${JSON.stringify(unbacked)}.`
  );
}

assert.strictEqual(
  pricingContent.includes("Nothing on this page is on sale yet"),
  true,
  "Pricing must state that no tier can currently be bought."
);
assert.strictEqual(
  pricingContent.includes("Designed, not yet built:"),
  true,
  "The free tier must separate published material from designed material."
);
assert.strictEqual(
  (pricingContent.match(/Not yet available/g) || []).length,
  2,
  "Both unbuyable tiers must be marked as unavailable."
);

// Anything still listed as available has to exist. Each entry names the file
// that makes its claim true, so a claim cannot outlive its evidence.
const ACADEMY_ROOT = join(__dirname, "..");
const AVAILABLE_CLAIMS = [
  {
    claim: "All seven curriculum and strategy documents, in full",
    evidence: () =>
      [
        "docs/00-overview.md",
        "docs/01-philosophy-and-vision.md",
        "docs/02-learning-science-and-ai-mentor.md",
        "docs/03-curriculum-and-assessment.md",
        "docs/04-technical-architecture.md",
        "docs/05-business-and-strategy.md",
        "docs/06-market-and-roadmap.md"
      ].every((p) => existsSync(join(ACADEMY_ROOT, p)))
  },
  {
    claim: "The mastery checkpoint grader on the sandbox page",
    evidence: () => sandboxContent.includes("function validateToolSchema(")
  },
  {
    claim: "The agent-loop walkthrough for all three project tracks",
    evidence: () =>
      ["tool-calling", "autonomous-debug", "pid-controller"].every((k) =>
        sandboxContent.includes("'" + k + "'")
      )
  }
];

for (const { claim, evidence } of AVAILABLE_CLAIMS) {
  assert.strictEqual(
    pricingContent.includes(claim),
    true,
    `The available-now list changed without its contract: "${claim}" is no longer offered.`
  );
  assert.strictEqual(
    evidence(),
    true,
    `"${claim}" is offered as available but the code no longer backs it.`
  );
}

// ---------------------------------------------------------------------------
// 7. The estimator must not assert a saving from rates it invented.
//
// Regression: it hardcoded $1.50/sandbox-hour and $0.35/mentor-query — neither
// measured nor quoted — and rendered the result as "Retail LLM & Compute
// Value" against "Your Savings & Value Surplus: $93.50 / mo (65% Savings)".
// The saving was also floored at zero, so inputs where the subscription cost
// more still displayed a saving.
// ---------------------------------------------------------------------------

for (const asserted of ["Savings & Value Surplus", "% Savings", "Retail LLM & Compute Value"]) {
  assert.strictEqual(
    pricingContent.includes(asserted),
    false,
    `Estimator must not assert a saving: found ${JSON.stringify(asserted)}.`
  );
}
// Drive the real arithmetic rather than grepping for the old expression: a
// floor reintroduced under a different variable name is the same defect, and a
// text assertion pinned to `retailCost` cannot see it.
const pricingScript = pricingContent.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(pricingScript, "pricing.html must carry an inline script.");

const calcElements = new Map();
const calcElement = (id) => {
  if (!calcElements.has(id)) calcElements.set(id, { id, value: "", innerText: "" });
  return calcElements.get(id);
};
const pricingWindow = {
  document: { getElementById: calcElement, querySelector: () => null, querySelectorAll: () => [] }
};
try {
  vm.createContext(pricingWindow);
  vm.runInContext(pricingScript[1], pricingWindow);
} catch (err) {
  assert.fail("The inlined pricing script does not evaluate: " + err.message);
}

const calcWith = ({ hours, hourRate, queries, queryRate }) => {
  calcElement("hours-slider").value = String(hours);
  calcElement("hour-rate").value = String(hourRate);
  calcElement("queries-slider").value = String(queries);
  calcElement("query-rate").value = String(queryRate);
  pricingWindow.updateCalc();
  return {
    usage: calcElement("retail-val").innerText,
    label: calcElement("difference-label").innerText,
    amount: calcElement("savings-val").innerText
  };
};

// Usage worth less than the subscription must be reported as the worse deal.
const cheapUsage = calcWith({ hours: 5, hourRate: 1, queries: 50, queryRate: 0.1 });
assert.strictEqual(cheapUsage.usage, "$10.00 / mo", "Usage total must follow the entered rates.");
assert.strictEqual(
  cheapUsage.label,
  "Subscription is more expensive by:",
  "A subscription costing more than the usage must say so, not show a saving of $0."
);
assert.strictEqual(cheapUsage.amount, "$39.00 / mo", "The shortfall must be the real difference.");

// And the other direction still works.
const heavyUsage = calcWith({ hours: 25, hourRate: 1.5, queries: 300, queryRate: 0.35 });
assert.strictEqual(heavyUsage.usage, "$142.50 / mo");
assert.strictEqual(heavyUsage.label, "Subscription is cheaper by:");
assert.strictEqual(heavyUsage.amount, "$93.50 / mo");

// Zeroed rates must not produce a claim at all.
const zeroed = calcWith({ hours: 25, hourRate: 0, queries: 300, queryRate: 0 });
assert.strictEqual(zeroed.usage, "$0.00 / mo", "Zero rates must total zero, not fall back to defaults.");
assert.strictEqual(zeroed.label, "Subscription is more expensive by:");
assert.strictEqual(
  pricingContent.includes("not quoted prices"),
  true,
  "The estimator must say its default rates are placeholders."
);
for (const rateInput of ['id="hour-rate"', 'id="query-rate"']) {
  assert.strictEqual(
    pricingContent.includes(rateInput),
    true,
    `Both rates must be visitor-editable: missing ${rateInput}.`
  );
}
assert.strictEqual(
  pricingContent.includes("Subscription is more expensive by:"),
  true,
  "The estimator must be able to report the subscription as the worse deal."
);

console.log("✔ Pricing separates shipped from planned and asserts no saving.");

// ---------------------------------------------------------------------------
// 8. The waitlist form must actually deliver an application.
//
// Regression: the form previously hid itself and showed "your application has
// been logged" while discarding the name, email, and track entirely. A signup
// form that silently drops real leads and tells the visitor otherwise is both a
// lost sale and a false statement to a customer.
// ---------------------------------------------------------------------------

assert.strictEqual(
  /has been logged/.test(pricingContent),
  false,
  "Waitlist must not claim an application was logged: this static site has no store."
);
assert.strictEqual(
  pricingContent.includes("mailto:duncan.andrew.haywood@gmail.com"),
  true,
  "Waitlist submission must route the application to a real destination."
);
for (const field of ["waitlist-name", "waitlist-email", "waitlist-track"]) {
  assert.strictEqual(
    pricingContent.includes("getElementById('" + field + "').value")
      || pricingContent.includes("getElementById('" + field + "');"),
    true,
    `Waitlist handler must read ${field} rather than discarding it.`
  );
}
assert.strictEqual(
  pricingContent.includes("waitlist-fallback"),
  true,
  "Waitlist must offer a copyable fallback address when no mail client opens."
);
// The team button opened the individual Pro form verbatim.
assert.strictEqual(
  pricingContent.includes("Team / employer-sponsored seats"),
  true,
  "A team enquiry must reach the inbox distinguishable from an individual signup."
);

console.log("✔ Waitlist application routes to a real destination and makes no false claim.");

// ---------------------------------------------------------------------------
// 9. Every class the generated pages use must have a rule in the stylesheet.
//
// Regression: the two custom pages referenced ~20 classes — .pricing-card,
// .modal-overlay, .btn, .console-box among them — that style.css never
// defined. The venture's only conversion surface rendered as unstyled text,
// and .modal-overlay having no positioning meant "Join the waitlist" appended
// the form to the foot of the document instead of opening it over the page.
// ---------------------------------------------------------------------------

const usedClasses = new Set();
for (const page of [sandboxContent, pricingContent]) {
  // Scan the markup only. Inside a <script> a class="…" fragment is spliced
  // together from expressions, so scanning it yields tokens like
  // "(check.passed" that are not classes at all.
  const markup = page.replace(/<script>[\s\S]*?<\/script>/g, "");
  for (const match of markup.matchAll(/class="([^"]+)"/g)) {
    for (const cls of match[1].trim().split(/\s+/)) {
      if (cls) usedClasses.add(cls);
    }
  }
}
// Written by script rather than by markup, so they never appear in a static
// class="" attribute. Keep this list in step with what verifyCheckpoint emits.
for (const scripted of [
  "check-list", "check-pass", "check-fail", "check-detail",
  "alert", "alert-success", "alert-warning"
]) {
  usedClasses.add(scripted);
}

assert.ok(usedClasses.size >= 20, `Expected the custom pages to use many classes, found ${usedClasses.size}.`);

// Match the selector as a whole token. A substring test passes when the rule
// has been renamed rather than kept: ".pricing-card" is inside
// ".pricing-card-DELETED", so deleting the rule went undetected.
const escapeForRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unstyled = [...usedClasses].filter(
  (cls) => !new RegExp("\\." + escapeForRegex(cls) + "(?![\\w-])").test(cssContent)
);
assert.deepStrictEqual(
  unstyled,
  [],
  `Classes used by the generated pages with no rule in style.css: ${unstyled.join(", ")}`
);

// The modal has to overlay rather than land at the foot of the page.
assert.ok(
  /\.modal-overlay\s*\{[^}]*position:\s*fixed/.test(cssContent),
  ".modal-overlay must be positioned over the page, not left in normal flow."
);

console.log(`✔ All ${usedClasses.size} classes used by the generated pages are styled.`);
console.log("🎉 All site tests passed cleanly!\n");
