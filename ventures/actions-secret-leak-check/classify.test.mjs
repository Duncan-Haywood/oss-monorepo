import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  scanText,
  scanFiles,
  hasRisk,
  summaryLine,
  collectSteps,
  stepSecretEnvVars,
  TRANSFORMED_SECRET,
  UNMASKED_ENV_EXPORT,
} from "./classify.mjs";

function workflowWithStep(stepYaml) {
  return (
    "name: ci\n" +
    "on: push\n" +
    "jobs:\n" +
    "  build:\n" +
    "    runs-on: ubuntu-latest\n" +
    "    steps:\n" +
    "      - uses: actions/checkout@v4\n" +
    stepYaml
  );
}

test("base64 of inline secret flagged", () => {
  const text = workflowWithStep('      - run: echo "${{ secrets.API_KEY }}" | base64\n');
  const findings = scanText(text);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, TRANSFORMED_SECRET);
  assert.equal(findings[0].line, 8);
});

test("base64 of env-sourced secret flagged", () => {
  const text = workflowWithStep(
    "      - env:\n" +
      "          TOKEN: ${{ secrets.API_KEY }}\n" +
      '        run: echo "$TOKEN" | base64 -w0\n',
  );
  const findings = scanText(text);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, TRANSFORMED_SECRET);
});

test("substring expansion of secret flagged", () => {
  const text = workflowWithStep(
    "      - env:\n" +
      "          TOKEN: ${{ secrets.API_KEY }}\n" +
      '        run: echo "prefix=${TOKEN:0:8}"\n',
  );
  const findings = scanText(text);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, TRANSFORMED_SECRET);
});

test("transform of a non-secret value is not flagged", () => {
  const text = workflowWithStep('      - run: echo "$BUILD_ID" | base64\n');
  assert.deepEqual(scanText(text), []);
});

test("secret used without transform is not flagged (GitHub already masks it)", () => {
  const text = workflowWithStep('      - run: echo "${{ secrets.API_KEY }}"\n');
  assert.deepEqual(scanText(text), []);
});

test("an env var name that is a substring of another is not confused", () => {
  const text = workflowWithStep(
    "      - env:\n" +
      "          TOKEN: ${{ secrets.API_KEY }}\n" +
      "          TOKEN_EXTRA: not-a-secret\n" +
      '        run: echo "$TOKEN_EXTRA" | base64\n',
  );
  assert.deepEqual(scanText(text), []);
});

test("inline secret to GITHUB_ENV without a mask is flagged", () => {
  const text = workflowWithStep(
    '      - run: echo "TOKEN=${{ secrets.API_KEY }}" >> "$GITHUB_ENV"\n',
  );
  const findings = scanText(text);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, UNMASKED_ENV_EXPORT);
  assert.match(findings[0].detail, /GITHUB_ENV/);
});

test("env-sourced secret to GITHUB_OUTPUT without a mask is flagged", () => {
  const text = workflowWithStep(
    "      - env:\n" +
      "          TOKEN: ${{ secrets.API_KEY }}\n" +
      "        run: |\n" +
      '          echo "token=$TOKEN" >> "$GITHUB_OUTPUT"\n',
  );
  const findings = scanText(text);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, UNMASKED_ENV_EXPORT);
});

test("a masked export is not flagged", () => {
  const text = workflowWithStep(
    "      - env:\n" +
      "          TOKEN: ${{ secrets.API_KEY }}\n" +
      "        run: |\n" +
      '          echo "::add-mask::$TOKEN"\n' +
      '          echo "token=$TOKEN" >> "$GITHUB_OUTPUT"\n',
  );
  assert.deepEqual(scanText(text), []);
});

test("a non-secret export is not flagged", () => {
  const text = workflowWithStep('      - run: echo "BUILD_ID=$RANDOM" >> "$GITHUB_ENV"\n');
  assert.deepEqual(scanText(text), []);
});

test("GITHUB_STATE target is recognised", () => {
  const text = workflowWithStep(
    '      - run: echo "secret=${{ secrets.API_KEY }}" >> "$GITHUB_STATE"\n',
  );
  const findings = scanText(text);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /GITHUB_STATE/);
});

test("a secret env var from one step does not leak into the next step", () => {
  const text = workflowWithStep(
    "      - env:\n" +
      "          TOKEN: ${{ secrets.API_KEY }}\n" +
      "        run: echo hello\n" +
      '      - run: echo "$TOKEN" | base64\n',
  );
  assert.deepEqual(scanText(text), []);
});

test("two independent steps are each flagged", () => {
  const text = workflowWithStep(
    '      - run: echo "${{ secrets.A }}" | base64\n' + '      - run: echo "${{ secrets.B }}" | base64\n',
  );
  assert.equal(scanText(text).length, 2);
});

test("an ::add-mask:: in one step does not suppress a later step", () => {
  const text = workflowWithStep(
    "      - env:\n" +
      "          A: ${{ secrets.A }}\n" +
      "        run: |\n" +
      '          echo "::add-mask::$A"\n' +
      '          echo "a=$A" >> "$GITHUB_ENV"\n' +
      "      - env:\n" +
      "          B: ${{ secrets.B }}\n" +
      '        run: echo "b=$B" >> "$GITHUB_ENV"\n',
  );
  const findings = scanText(text);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /b=\$B/);
});

test("collectSteps and stepSecretEnvVars agree on a two-key step", () => {
  const lines = workflowWithStep(
    "      - env:\n" + "          TOKEN: ${{ secrets.API_KEY }}\n" + "        run: echo hi\n",
  ).split("\n");
  const steps = collectSteps(lines);
  const last = steps[steps.length - 1];
  assert.deepEqual([...stepSecretEnvVars(lines, ...last)], ["TOKEN"]);
});

test("scanFiles concatenates findings across files in order", () => {
  const files = [
    { name: "a.yml", text: workflowWithStep('      - run: echo "${{ secrets.A }}" | base64\n') },
    { name: "b.yml", text: workflowWithStep('      - run: echo "${{ secrets.B }}" | base64\n') },
  ];
  const findings = scanFiles(files);
  assert.deepEqual(findings.map((f) => f.file), ["a.yml", "b.yml"]);
});

test("hasRisk and summaryLine", () => {
  assert.equal(hasRisk([]), false);
  assert.equal(summaryLine([]), "No findings.");
  const findings = scanText(workflowWithStep('      - run: echo "${{ secrets.A }}" | base64\n'));
  assert.equal(hasRisk(findings), true);
  assert.match(summaryLine(findings), /1 transformed-secret finding/);
});

test("the browser port and the Python CLI produce identical findings", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "actions-secret-leak-check-parity-"));
  try {
    const workflowsDir = path.join(dir, ".github", "workflows");
    mkdirSync(workflowsDir, { recursive: true });
    const workflowText = workflowWithStep(
      "      - env:\n" +
        "          TOKEN: ${{ secrets.API_KEY }}\n" +
        "        run: |\n" +
        '          echo "$TOKEN" | base64\n' +
        '          echo "token=$TOKEN" >> "$GITHUB_OUTPUT"\n' +
        "      - env:\n" +
        "          B: ${{ secrets.B }}\n" +
        "        run: |\n" +
        '          echo "::add-mask::$B"\n' +
        '          echo "b=$B" >> "$GITHUB_ENV"\n',
    );
    writeFileSync(path.join(workflowsDir, "ci.yml"), workflowText);

    const pyOutput = execFileSync(
      "python3",
      [path.join(import.meta.dirname, "check.py"), dir, "--format", "json"],
      { encoding: "utf8" },
    );
    const pyFindings = JSON.parse(pyOutput).map((f) => ({ ...f, file: path.basename(f.file) }));

    const jsFindings = scanText(workflowText, "ci.yml");

    assert.deepEqual(jsFindings, pyFindings);
    assert.ok(jsFindings.length >= 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
