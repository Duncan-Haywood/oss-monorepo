// Verification suite for the rendered site.
//
// The two authored pages (pricing.html, sandbox.html) are this venture's only
// revenue surface, so most of what follows checks that they do not claim more
// than the project can deliver. An earlier version of this suite asserted that
// the fabrications were *present* — that the fake execution trace and the
// invented savings calculator existed — which would have locked them in as soon
// as the missing `test` script made this file run in CI.
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import assert from "assert";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "dist");

console.log("▶ Running AI Engineering Academy site suite...");

// --- 1. The build runs -----------------------------------------------------

try {
  execSync("node build.mjs", { cwd: __dirname, stdio: "inherit" });
} catch (err) {
  assert.fail("build.mjs execution failed: " + err.message);
}

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
  "style.css",
];

for (const file of expectedPages) {
  assert.strictEqual(
    existsSync(join(DIST, file)),
    true,
    `Expected ${file} to exist in dist/.`
  );
}

const read = (f) => readFileSync(join(DIST, f), "utf8");
const indexContent = read("index.html");
const sandboxContent = read("sandbox.html");
const pricingContent = read("pricing.html");
const cssContent = read("style.css");

console.log("✔ All expected pages and assets generated.");

// --- 2. Markdown links resolve inside the built site -----------------------

assert.strictEqual(
  indexContent.includes('href="01-philosophy-and-vision.html"'),
  true,
  "Markdown links should be rewritten to .html"
);
assert.strictEqual(
  indexContent.includes("01-philosophy-and-vision.md"),
  false,
  "Raw .md links should not survive into index.html"
);

// --- 3. Every class the pages use must actually be styled ------------------
//
// Both authored pages shipped referencing about twenty-five class names that
// style.css never defined. The pricing cards rendered as an undifferentiated
// run of text, and the waitlist modal — the only conversion path this venture
// has — appeared as an unstyled block at the foot of the page instead of a
// dialog, so pressing the call to action looked like nothing happening.

function classesUsedIn(html) {
  const found = new Set();
  for (const m of html.matchAll(/\sclass="([^"]+)"/g)) {
    for (const cls of m[1].trim().split(/\s+/)) if (cls) found.add(cls);
  }
  return found;
}

const definedClasses = new Set(
  [...cssContent.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1])
);

for (const [name, html] of [
  ["sandbox.html", sandboxContent],
  ["pricing.html", pricingContent],
]) {
  const undefinedClasses = [...classesUsedIn(html)].filter(
    (c) => !definedClasses.has(c)
  );
  assert.deepStrictEqual(
    undefinedClasses,
    [],
    `${name} uses class names that style.css never defines, so those elements ` +
      `render unstyled: ${undefinedClasses.join(", ")}`
  );
}

console.log("✔ Every class used by the authored pages is defined in style.css.");

// --- 4. The sandbox does not claim to run the visitor's input --------------
//
// It previously printed a fixed transcript ending "12/12 passing" and
// "Subgoal satisfaction score: 100%" for any prompt, including an empty one,
// under copy offering to "test real multi-agent tool-calling workflows ...
// directly in your browser".

for (const claim of [
  "12/12 passing",
  "Subgoal satisfaction score: 100%",
  "Sandbox Runtime v2.4",
  "Run Multi-Agent Execution",
]) {
  assert.strictEqual(
    sandboxContent.includes(claim),
    false,
    `sandbox.html must not assert "${claim}": nothing on this page executes anything.`
  );
}

assert.match(
  sandboxContent,
  /authored walkthroughs, not a live sandbox/i,
  "sandbox.html must say plainly that its traces are authored, not executed."
);
assert.match(
  sandboxContent,
  /<textarea id="user-prompt"[^>]*\breadonly\b/,
  "The goal field must be read-only: editing it does not change the trace, so " +
    "the page must not imply that it would."
);

// Each track must carry its own trace. The old handler ignored the selected
// track entirely and always printed Track 1's transcript.
for (const key of ["tool-calling", "autonomous-debug", "pid-controller"]) {
  assert.strictEqual(
    sandboxContent.includes(`"${key}"`),
    true,
    `sandbox.html must carry per-track content for ${key}.`
  );
}

console.log("✔ Sandbox presents authored walkthroughs without claiming execution.");

// --- 5. The pricing page makes no unsourced comparison ---------------------
//
// It previously multiplied the two sliders by invented unit prices
// ($1.50/sandbox-hour, $0.35/mentor-query) to headline a "65% Savings" against
// a "Retail LLM & Compute Value" that nothing in this repository sources. The
// saving was also clamped at zero, so the widget could never show the case
// where the subscription costs more than the usage is worth.

for (const claim of [
  "Retail LLM & Compute Value",
  "Savings & Value Surplus",
  "% Savings",
  "Most Popular",
]) {
  assert.strictEqual(
    pricingContent.includes(claim),
    false,
    `pricing.html must not claim "${claim}" — nothing in the repository substantiates it.`
  );
}

assert.strictEqual(
  /\*\s*1\.50|\*\s*0\.35/.test(pricingContent),
  false,
  "pricing.html must not price usage from invented per-unit rates."
);

// $49 is recorded in VENTURE.yaml as an untested hypothesis, and the venture
// has never charged anyone. The page has to say so.
assert.match(
  pricingContent,
  /Nothing on this page can be bought yet/i,
  "pricing.html must state that nothing is purchasable yet."
);
assert.match(
  pricingContent,
  /untested hypothesis/i,
  "pricing.html must present the $49 price as the untested hypothesis it is."
);

// Unbuilt features must not be listed as delivered ones.
const proCardFeatures = pricingContent.match(/<li class="planned">[^<]*/g) || [];
assert.ok(
  proCardFeatures.length >= 6,
  "Unbuilt tier features must be marked Planned rather than ticked as delivered."
);
for (const claim of [
  "Unlimited Interactive Sandbox Runtimes",
  "24/7 Code & Arch Review",
  "All 50+ Project Specifications",
  "Discord Private Mentor Channel Access",
]) {
  assert.strictEqual(
    pricingContent.includes(claim),
    false,
    `pricing.html must not advertise "${claim}" — it does not exist.`
  );
}

console.log("✔ Pricing page distinguishes what exists from what is proposed.");

// --- 6. The waitlist still delivers a real application ---------------------
//
// Regression: the form once hid itself and reported "your application has been
// logged" while discarding the name, email and track entirely.

assert.strictEqual(
  /has been logged/.test(pricingContent),
  false,
  "Waitlist must not claim an application was stored: this static site has no store."
);
assert.strictEqual(
  pricingContent.includes("mailto:duncan.andrew.haywood@gmail.com"),
  true,
  "Waitlist submission must route the application to a real destination."
);
for (const field of ["waitlist-name", "waitlist-email", "waitlist-track"]) {
  assert.strictEqual(
    pricingContent.includes("getElementById('" + field + "')"),
    true,
    `Waitlist handler must read ${field} rather than discarding it.`
  );
}
assert.strictEqual(
  pricingContent.includes("waitlist-fallback"),
  true,
  "Waitlist must offer a copyable fallback address when no mail client opens."
);

// The stated usage is the whole point of asking for it: it has to reach the
// application, or the sliders are decoration.
for (const line of [
  "Expected sandbox hours per month",
  "Expected mentor questions per month",
  "Enquiry type",
]) {
  assert.strictEqual(
    pricingContent.includes(line),
    true,
    `The waitlist application must carry "${line}" through to the email body.`
  );
}

console.log("✔ Waitlist routes a complete application to a real destination.");

// --- 7. The checkpoint actually validates ----------------------------------
//
// It previously replied "Schema structure verified. Portfolio point awarded
// (+25 pts)" to any input over ten characters, and awarded a point that is
// stored nowhere.

function extractScript(html, name) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1]
  );
  assert.ok(scripts.length > 0, `${name} should carry an inline script.`);
  return scripts.join("\n");
}

function makeDom(values) {
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        value: values[id] ?? "",
        innerHTML: "",
        innerText: "",
        style: {},
        classList: { add() {}, remove() {} },
        focus() {},
        getAttribute: () => null,
        setAttribute() {},
      });
    }
    return nodes.get(id);
  };
  return {
    dom: {
      getElementById: get,
      querySelectorAll: () => [],
    },
    nodes,
    get,
  };
}

function runCheckpoint(answer) {
  const src = extractScript(sandboxContent, "sandbox.html");
  const { dom, get } = makeDom({ "checkpoint-answer": answer });
  const fn = new Function(
    "document",
    src + "\nreturn { verifyCheckpoint: verifyCheckpoint };"
  );
  fn(dom).verifyCheckpoint();
  return get("checkpoint-feedback").innerHTML;
}

const passes = (html) => html.includes("alert-success");

// The exact regression: eleven characters of nonsense used to pass.
assert.strictEqual(
  passes(runCheckpoint("aaaaaaaaaaa")),
  false,
  "Checkpoint must reject arbitrary text: the old check passed anything over " +
    "ten characters and replied that the schema was verified."
);
assert.match(
  runCheckpoint("aaaaaaaaaaa"),
  /not valid JSON/i,
  "Rejecting invalid JSON should say so."
);

assert.strictEqual(
  passes(runCheckpoint('{"type": "string"}')),
  false,
  "A non-object schema must be rejected."
);
assert.strictEqual(
  passes(runCheckpoint('{"type": "object", "properties": {}}')),
  false,
  "A schema with no arguments must be rejected."
);

// The point of the exercise: an unconstrained free-text argument is the
// injection route, so it must not pass.
assert.strictEqual(
  passes(
    runCheckpoint(
      '{"type":"object","properties":{"table":{"type":"string"}},"required":["table"]}'
    )
  ),
  false,
  "A free-text table argument must not pass: that is the injection route."
);

// A genuinely constrained schema passes.
const good = runCheckpoint(
  '{"type":"object","properties":{"table":{"type":"string","enum":["orders","customers"]},' +
    '"limit":{"type":"integer"}},"required":["table"]}'
);
assert.strictEqual(
  passes(good),
  true,
  "A schema constraining the table to an enum should pass."
);
assert.match(good, /enum/, "Passing feedback should name why it passed.");

// Nothing is stored, so nothing may be awarded.
assert.strictEqual(
  /\+25 pts|Portfolio point awarded/.test(sandboxContent),
  false,
  "The checkpoint must not award points it does not store."
);

console.log("✔ Mastery checkpoint parses and inspects the submitted schema.");

// --- 8. Both page scripts are syntactically valid --------------------------

for (const [name, html] of [
  ["sandbox.html", sandboxContent],
  ["pricing.html", pricingContent],
]) {
  try {
    new Function(extractScript(html, name));
  } catch (err) {
    assert.fail(`${name} emitted invalid JavaScript: ${err.message}`);
  }
}

console.log("✔ Emitted page scripts parse.");
console.log("🎉 All site tests passed.\n");
