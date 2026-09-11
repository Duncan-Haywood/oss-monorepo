import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (name) => readFile(new URL(`./${name}`, import.meta.url), "utf8");

test("index links to the docs page", async () => {
  const page = await read("index.html");
  assert.match(
    page,
    /href="why-terraform-replace-destroys-data\.html"/,
    "index must link the docs page so crawlers can reach it",
  );
});

test("docs page links back to the tool", async () => {
  const page = await read("why-terraform-replace-destroys-data.html");
  assert.match(page, /href="\.\/"/);
});

test("both pages carry the no-warranty clause", async () => {
  for (const file of ["index.html", "why-terraform-replace-destroys-data.html"]) {
    const page = await read(file);
    assert.match(page, /no warranty/i, `${file} is missing the no-warranty clause`);
  }
});

test("both pages disclaim affiliation with HashiCorp and the cloud providers", async () => {
  // The tool reads a file produced by someone else's trademarked program and
  // names it throughout. Naming a trademark only to say what you are not is
  // the defense; naming one and staying silent about affiliation is what
  // invites the claim the defense exists to answer.
  for (const file of ["index.html", "why-terraform-replace-destroys-data.html"]) {
    const page = await read(file);
    assert.match(page, /not\s+affiliated\s+with/i, `${file} is missing the affiliation disclaimer`);
    assert.match(page, /HashiCorp/, `${file} must name HashiCorp in that disclaimer`);
  }
});

test("index carries the sponsor link", async () => {
  assert.match(await read("index.html"), /github\.com\/sponsors\/Duncan-Haywood/);
});

test("index states nothing is uploaded (privacy line)", async () => {
  assert.match(await read("index.html"), /never uploaded|never leaves your device/i);
});

test("neither page makes any network request of its own", async () => {
  // The whole privacy claim rests on this. A structured plan describes the
  // user's entire infrastructure, so a single stray fetch would make the
  // page's central promise false.
  for (const file of ["index.html", "why-terraform-replace-destroys-data.html"]) {
    const page = await read(file);
    for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new WebSocket/, /<form\b/i]) {
      assert.doesNotMatch(page, forbidden, `${file} must make no network request (${forbidden})`);
    }
  }
});

test("index links one hop to the terraform-plan-secret-exposure-check sibling", async () => {
  const page = await read("index.html");
  assert.match(
    page,
    /href="\.\.\/terraform-plan-secret-exposure-check\/"/,
    "index must link ../terraform-plan-secret-exposure-check/ so crawlers reach it in one hop from a sibling",
  );
});

test("index wires the opt-out button and the local-only usage counter", async () => {
  const page = await read("index.html");
  assert.match(page, /id="optout"/);
  assert.match(page, /setUsageOptOut\(true\)/);
  assert.match(page, /from "\.\/usage\.mjs"/);
});

test("index renders the data-loss risk block from the engine, not from hardcoded copy", async () => {
  // The page must show what the shared engine decided; a second, page-local
  // list of stateful types is exactly how a browser tool and its CLI drift
  // into giving different answers about the same plan.
  const page = await read("index.html");
  assert.match(page, /STATEFUL_TYPE_RULES/);
  assert.match(page, /report\.dataLossRisks/);
  assert.match(page, /analyzePlan/);
});

test("the docs page cites the upstream issue and the incident it is built on", async () => {
  const page = await read("why-terraform-replace-destroys-data.html");
  assert.match(page, /hashicorp\/terraform\/issues\/36097/, "must cite the upstream issue by URL");
  assert.match(page, /gitlab\.com\/gitlab-com\/gl-infra/, "must cite the public corrective action by URL");
});

test("the worked example exercises a replace, a true deletion, and a no-op", async () => {
  const page = await read("index.html");
  assert.match(page, /replace_paths/);
  assert.match(page, /delete_because_no_resource_config/);
  assert.match(page, /"no-op"/);
});
