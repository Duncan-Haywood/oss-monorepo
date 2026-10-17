import test from "node:test";
import assert from "node:assert/strict";

import { matchPosting, extractTerms, summarizeMatch, tokenize, stem } from "./match.mjs";

// Invented postings and resumes: no real person or employer.
const POSTING = `Senior Data Analyst

About the role
We are looking for a data analyst to join our growth team.

Responsibilities:
- Build dashboards in Tableau and Looker for the sales team
- Write complex SQL queries against Snowflake
- Run A/B tests and report on KPIs

Requirements:
- 5+ years of experience in analytics
- Bachelor's degree in statistics or related field
- Proficient in SQL and Python
- Experience with dbt and Airflow
- Strong communication and stakeholder management

Nice to have:
- Experience with Kubernetes
`;

const RESUME = `Jordan Rivera
Analyst with 6 years of experience building dashboards in Tableau, writing SQL and Python pipelines.
Led stakeholder reporting on KPIs, ran A/B tests, B.S. Statistics.
Skills: SQL, Python, Tableau, Excel, communication`;

const names = (list) => list.map((x) => x.term);

test("tokenize keeps technical tokens whole", () => {
  assert.deepEqual(tokenize("C++, C#, .NET and Node.js with CI/CD"), ["c++", "c#", ".net", "and", "node.js", "with", "ci/cd"]);
});

test("stem folds plurals and verb endings", () => {
  assert.equal(stem("dashboards"), stem("dashboard"));
  assert.equal(stem("managed"), stem("managing"));
  assert.equal(stem("queries"), stem("query"));
});

test("terms the posting leans on are read, boilerplate is not", () => {
  const terms = extractTerms(POSTING).map((t) => t.display);
  for (const want of ["sql", "python", "tableau", "airflow", "dbt", "snowflake"]) assert.ok(terms.includes(want), `missing ${want}`);
  for (const junk of ["team", "proficient", "strong", "looking"]) assert.ok(!terms.includes(junk), `kept ${junk}`);
});

test("repeated, required, hard skills outrank a nice-to-have", () => {
  const terms = extractTerms(POSTING);
  const imp = (name) => terms.find((t) => t.display === name).importance;
  assert.ok(imp("sql") > imp("kubernetes"));
  assert.ok(imp("python") > imp("kubernetes"));
});

test("covered terms are matched and absent ones are listed missing", () => {
  const r = matchPosting(RESUME, POSTING);
  assert.equal(r.ok, true);
  for (const t of ["sql", "python", "tableau"]) assert.ok(names(r.matched).includes(t), `${t} should match`);
  for (const t of ["airflow", "dbt", "snowflake", "looker"]) assert.ok(names(r.missing).includes(t), `${t} should be missing`);
  assert.equal(r.stats.matchedCount + r.stats.missingCount, r.stats.termsRead);
});

test("missing terms are ordered most important first", () => {
  const r = matchPosting(RESUME, POSTING);
  const imps = r.missing.map((m) => m.importance);
  assert.deepEqual(imps, [...imps].sort((a, b) => b - a));
});

test("score is weighted coverage, 0 to 100, and rises as the resume covers more", () => {
  const low = matchPosting(RESUME, POSTING).score;
  const high = matchPosting(RESUME + "\nBuilt dbt models on Snowflake, scheduled with Airflow, Looker dashboards, analytics.", POSTING).score;
  assert.ok(low >= 0 && high <= 100);
  assert.ok(high > low);
});

test("an alias counts as the same term (k8s = kubernetes, js = javascript)", () => {
  const posting = "Platform Engineer\nRequirements:\n- Kubernetes in production\n- JavaScript and TypeScript\n- Terraform\n- Kubernetes operators\n- Observability tooling, incident response, and on-call rotations for the platform team every quarter\n- Kubernetes upgrades and cluster capacity planning across several regions";
  const resume = "Platform engineer with 4 years running k8s clusters, writing js and ts services, and Terraform modules across several cloud accounts for a mid size company.";
  const r = matchPosting(resume, posting);
  assert.ok(names(r.matched).includes("kubernetes"));
  assert.ok(names(r.matched).includes("javascript"));
  assert.ok(names(r.matched).includes("typescript"));
});

test("years and degree requirements are reported separately from keywords", () => {
  const r = matchPosting(RESUME, POSTING);
  assert.deepEqual(r.years, { required: 5, stated: 6, meets: true });
  assert.equal(r.degree.required, "bachelor");
  assert.equal(r.degree.meets, true);
  const short = matchPosting(RESUME.replace("6 years", "2 years"), POSTING);
  assert.equal(short.years.meets, false);
  const noDeg = matchPosting(RESUME.replace("B.S. Statistics", "Statistics coursework"), POSTING);
  assert.equal(noDeg.degree.meets, false);
});

test("a posting with no years or degree requirement reports none", () => {
  const r = matchPosting(RESUME, "Barista\nWe need a friendly barista to pull espresso, steam milk, run the register, and keep the espresso bar clean. Espresso skills matter and espresso quality matters most here.");
  assert.equal(r.years, null);
  assert.equal(r.degree, null);
});

test("too little text is refused with a reason, never scored", () => {
  assert.equal(matchPosting(RESUME, "Analyst wanted").reason, "posting-too-short");
  assert.equal(matchPosting("Jordan", POSTING).reason, "resume-too-short");
});

test("summary leads with the score and names the highest-weight gaps", () => {
  const s = summarizeMatch(matchPosting(RESUME, POSTING));
  assert.match(s.text, /covers \d+%/);
  assert.match(s.text, /never mentions/);
  assert.equal(summarizeMatch(matchPosting("x", POSTING)).level, "error");
});

test("the match runs entirely on the pasted text: no network, no storage", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./match.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|import\()/);
});
