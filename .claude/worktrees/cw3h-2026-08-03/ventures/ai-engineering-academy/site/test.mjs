import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import assert from "assert";

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

// 4. Verify Interactive Sandbox Studio
const sandboxContent = readFileSync(join(DIST, "sandbox.html"), "utf8");
assert.strictEqual(sandboxContent.includes("AI Agent & Multi-Tool Sandbox Studio"), true, "Sandbox title should be rendered");
assert.strictEqual(sandboxContent.includes("runSandboxSimulation()"), true, "Interactive simulator script should be present");
assert.strictEqual(sandboxContent.includes("verifyCheckpoint()"), true, "Mastery Checkpoint verifier should be present");

// 5. Verify Pricing & Pro Tier hypothesis
const pricingContent = readFileSync(join(DIST, "pricing.html"), "utf8");
assert.strictEqual(pricingContent.includes("Pro Learner ($49/mo)"), true, "$49/mo Pro subscription tier card should be rendered");
assert.strictEqual(pricingContent.includes("Interactive Token & Compute Cost Estimator"), true, "Interactive cost calculator should be rendered");
assert.strictEqual(pricingContent.includes("waitlist-modal"), true, "Concierge waitlist modal should be present");

// 6. The waitlist form must actually deliver an application.
// Regression: the form previously hid itself and showed "your application has
// been logged" while discarding the name, email, and track entirely. A signup
// form that silently drops real leads and tells the visitor otherwise is both a
// lost sale and a false statement to a customer.
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

console.log("✔ Waitlist application routes to a real destination and makes no false claim.");

console.log("✔ Interactive Sandbox Studio and Pricing Pro Tier verified successfully!");
console.log("🎉 All site tests passed cleanly!\n");
