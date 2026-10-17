import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCpu, parseMem, fmtCpu, fmtMem, parseInput, analyze, summarize, DEFAULT_PRICES } from "./engine.mjs";

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const csv = (rows) => `namespace,pod,container,cpu_request,mem_request,cpu_usage_p95,mem_usage_p95,replicas,cpu_limit,mem_limit\n${rows.join("\n")}`;
const rules = (r) => r.findings.map((f) => f.rule);
const one = (row, opts) => analyze(parseInput(csv([row])), opts);

test("quantities: cpu m/u/n/cores, memory binary and decimal units, CSV bare memory is MiB", () => {
  assert.equal(parseCpu("250m"), 0.25);
  assert.equal(parseCpu("2"), 2);
  assert.equal(parseCpu("1500000n"), 0.0015);
  assert.equal(parseCpu("abc"), null);
  assert.equal(parseMem("256Mi"), 256 * 1048576);
  assert.equal(parseMem("1Gi"), 1073741824);
  assert.equal(parseMem("512M"), 512e6);
  assert.equal(parseMem("256", 1048576), 256 * 1048576);
  assert.equal(fmtCpu(0.25), "250m");
  assert.equal(fmtCpu(2), "2");
  assert.equal(fmtMem(2 * 1073741824), "2Gi");
  assert.equal(fmtMem(300 * 1048576), "300Mi");
});

test("kubectl top with a namespace column, and without one", () => {
  const withNs = parseInput("NAMESPACE   POD   NAME   CPU(cores)   MEMORY(bytes)\nprod   api-1   api   12m   64Mi\nprod   api-1   envoy   3m   20Mi");
  assert.equal(withNs.records.length, 2);
  assert.equal(withNs.records[0].ns, "prod");
  const without = parseInput("POD   NAME   CPU(cores)   MEMORY(bytes)\napi-1   api   12m   64Mi");
  assert.equal(without.records.length, 1);
  assert.equal(without.records[0].cpuUse, 0.012);
});

test("pods JSON is separated from top output, joined by pod and container, replicas counted, busiest replica kept", () => {
  const p = parseInput(fx("top.txt") + fx("pods.json"));
  assert.ok(p.sources.json && p.sources.top);
  const api = p.records.find((r) => r.workload === "api" && r.container === "api");
  assert.equal(api.replicas, 3);
  assert.equal(api.cpuReq, 1);
  assert.equal(api.memReq, 2 * 1073741824);
  assert.equal(api.memLim, 2 * 1073741824);
  assert.equal(api.memUse, 410 * 1048576); // the busiest of the three replicas
  assert.equal(p.records.find((r) => r.workload === "redis").replicas, 3); // StatefulSet ordinals group too
  assert.equal(p.noUsage, 0);
});

test("top without namespace still joins to the pods JSON by pod name", () => {
  const top = fx("top.txt").split("\n").slice(1).map((l) => l.trim().split(/\s+/).slice(1).join(" ")).join("\n");
  const p = parseInput(`POD NAME CPU(cores) MEMORY(bytes)\n${top}\n${fx("pods.json")}`);
  assert.equal(p.topOnly, 0);
  assert.equal(p.records.find((r) => r.workload === "web").replicas, 4);
});

test("CSV with a header in any column order, aliases and optional limits", () => {
  const p = parseInput("container,namespace,pod,memory_request,cpu_request,cpu_usage_p95,mem_usage_p95,replicas,mem_limit\nweb,prod,web,256Mi,200m,100m,100Mi,2,512Mi");
  assert.equal(p.records.length, 1);
  assert.equal(p.records[0].memLim, 512 * 1048576);
  assert.equal(p.records[0].replicas, 2);
  assert.equal(parseInput("web,x\nnot,csv,at,all").records.length, 0);
});

test("recommendation is usage plus headroom and both headrooms are editable", () => {
  const r = one("prod,api,api,1,2Gi,200m,400Mi,1");
  assert.equal(r.containers[0].cpu.rec, 0.24); // 200m x 1.2
  assert.equal(r.containers[0].mem.rec, 504 * 1048576); // 400Mi x 1.25 -> 500Mi -> next 8Mi step
  const wide = one("prod,api,api,1,2Gi,200m,400Mi,1", { cpuHeadroom: 1, memHeadroom: 1 });
  assert.equal(wide.containers[0].cpu.rec, 0.4);
  assert.equal(wide.containers[0].mem.rec, 800 * 1048576);
});

test("over-provisioning is a warning when usage is under half the request, a note above that; a small gap is left alone", () => {
  assert.ok(rules(one("p,a,a,1,2Gi,200m,400Mi,1")).includes("cpu-overprovisioned"));
  assert.equal(one("p,a,a,1,2Gi,200m,400Mi,1").findings.find((f) => f.rule === "cpu-overprovisioned").severity, "warn");
  assert.equal(one("p,a,a,500m,2Gi,300m,400Mi,1").findings.find((f) => f.rule === "cpu-overprovisioned").severity, "info");
  const fine = one("p,a,a,200m,256Mi,170m,190Mi,1");
  assert.equal(fine.findings.length, 0);
  assert.equal(fine.patches.length, 0);
  assert.equal(summarize(fine).status, "ok");
});

test("memory above 85% of the limit is an error; above 85% of the request with no limit is a warning; the patch raises the limit with it", () => {
  const lim = one("p,a,a,500m,512Mi,100m,470Mi,1,,512Mi");
  assert.ok(rules(lim).includes("oom-risk"));
  assert.equal(summarize(lim).status, "error");
  assert.match(lim.patches[0].yaml, /limits:\n\s+memory: 592Mi/);
  assert.match(lim.patches[0].yaml, /requests:[\s\S]*memory: 592Mi[\s\S]*limits/);
  const noLim = one("p,a,a,500m,512Mi,100m,470Mi,1");
  assert.ok(rules(noLim).includes("memory-near-request"));
  assert.ok(!rules(noLim).includes("oom-risk"));
  assert.equal(summarize(noLim).status, "warn");
  assert.equal(one("p,a,a,500m,512Mi,100m,300Mi,1,,512Mi").findings.some((f) => f.rule === "oom-risk"), false);
});

test("cpu close to its limit warns about throttling; usage above the request is noted", () => {
  assert.ok(rules(one("p,a,a,200m,256Mi,190m,100Mi,1,200m")).includes("cpu-throttle-risk"));
  assert.ok(rules(one("p,a,a,100m,256Mi,300m,200Mi,1")).includes("cpu-underprovisioned"));
});

test("savings: replicas x (request - recommended) x list prices x hours; under-provisioning is added cost, not hidden", () => {
  const r = one("p,a,a,1,2Gi,100m,512Mi,4", { prices: { cpuPerVcpuHour: 0.04, memPerGibHour: 0.005 } });
  const c = r.containers[0];
  const expected = 4 * ((1 - 0.12) * 0.04 + (2 - 0.625) * 0.005) * 730; // 100m x 1.2 = 120m; 512Mi x 1.25 = 640Mi
  assert.ok(Math.abs(c.savings - expected) < 0.5, `${c.savings} vs ${expected}`);
  const under = one("p,a,a,100m,128Mi,100m,120Mi,1");
  assert.ok(under.containers[0].savings < 0);
  assert.ok(under.totals.addedCost > 0);
  assert.equal(DEFAULT_PRICES.cpuPerVcpuHour > 0, true);
});

test("containers without requests are flagged and given a starting request; savings do not count them", () => {
  const r = analyze(parseInput(fx("top.txt") + fx("pods.json")));
  const f = r.findings.find((x) => x.rule === "no-requests");
  assert.ok(f);
  assert.match(f.message, /cron-helper/);
  assert.equal(r.containers.find((c) => c.workload === "cron-helper").savings, 0);
});

test("snapshot note appears for kubectl top input and not for CSV p95 input", () => {
  assert.ok(analyze(parseInput(fx("top.txt") + fx("pods.json"))).notes.some((n) => /single sample/.test(n)));
  assert.equal(analyze(parseInput(fx("containers.csv"))).notes.length, 0);
});

test("patches group containers by workload, only include what changes, and finished pods are ignored", () => {
  const r = analyze(parseInput(fx("containers.csv")));
  const api = r.patches.find((p) => p.workload === "api");
  assert.match(api.yaml, /- name: api/);
  assert.match(api.yaml, /- name: envoy/);
  assert.ok(!r.patches.some((p) => p.workload === "web"));
  const done = parseInput(JSON.stringify({ kind: "Pod", metadata: { name: "j-1", namespace: "x" }, spec: { containers: [{ name: "c", resources: {} }] }, status: { phase: "Succeeded" } }));
  assert.equal(done.records.length + done.noUsage, 0);
});

test("empty and junk input is 'none'", () => {
  assert.equal(summarize(analyze(parseInput(""))).status, "none");
  assert.equal(summarize(analyze(parseInput("hello\nworld"))).status, "none");
});

test("broken JSON is skipped, not fatal", () => {
  const p = parseInput(`{ "kind": "Pod", \n${csv(["p,a,a,1,2Gi,100m,100Mi,1"])}`);
  assert.equal(p.records.length, 1);
  assert.ok(p.skipped >= 1);
});
