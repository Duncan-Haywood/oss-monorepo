// Deterministic checker: read Kubernetes workload YAML (one or more
// `---`-separated documents) and flag every container missing the resource
// requests/limits that keep it from starving or crowding out its node --
// or, once set, quietly wrong in a specific, well-documented way. No network
// call, no kubeconfig, no API server: it reads only the text you give it.
//
// Why this is worth a dedicated check, stated precisely rather than assumed:
//
// - A container with no memory *limit* can grow without bound. Kubernetes
//   does not stop it on its own; the kernel's OOM killer eventually does, and
//   the OOM killer's scoring is not scoped to "the container that grew" --
//   under enough memory pressure it can kill a different process on the same
//   node. This is documented under Kubernetes' own "Resource Management for
//   Pods and Containers" and "Node-pressure Eviction" pages.
// - A container with no memory (or CPU) *request* gets the lowest possible
//   priority in the kubelet's node-pressure eviction ranking (effectively
//   BestEffort for that resource), so it is evicted first under pressure --
//   regardless of how little it is actually using at the time. This is the
//   documented `Requests` field of the eviction ranking, not a heuristic
//   this tool invented.
// - A container with no `ephemeral-storage` *limit* can fill its node's
//   local disk (logs, temp files, an unbounded writable layer). Once the
//   node crosses its disk-pressure threshold, the kubelet evicts pods on
//   that node to reclaim space -- not only the pod that filled it. This is
//   the documented "Local ephemeral storage" resource and node-pressure
//   eviction behaviour, and it is the resource type teams reach for CPU/
//   memory limits and still miss most often.
// - A CPU *limit*, once set, is enforced by the kernel's CFS bandwidth
//   controller: quota is granted once per fixed period and unused quota does
//   not roll over. A container that bursts inside one period and idles the
//   next can be throttled even while the node overall has spare CPU -- a
//   widely reported gotcha (tracked upstream as kubernetes/kubernetes#67577)
//   that has led several engineering teams to publish "why we stopped
//   setting CPU limits" write-ups. This tool reports a set CPU limit as
//   informational, not as a problem to fix, because a limit is sometimes the
//   right call (strict multi-tenant isolation) -- the point is to make the
//   trade-off visible rather than silently invite it.
// - A request that is larger than its own limit for the same resource is not
//   a style problem: the API server's admission validation rejects it
//   outright (`must be less than or equal to memory limit`), so a manifest
//   carrying one fails at `kubectl apply` or `helm upgrade`, not quietly at
//   runtime. Catching it here saves that round trip.
//
// See why-a-missing-resource-limit-takes-down-a-node.html for the fuller
// explanation and README.md for exactly which Kubernetes docs each claim
// above is sourced from.

import { parseDocuments } from './yaml.mjs';

export const RISK = 'risk';
export const WARN = 'warn';
export const INFO = 'info';

/** Every check this tool runs, in report order. Exported so the page and the
 * CLI can list what was checked without restating it. */
export const CHECKS = [
  { id: 'no-memory-limit', severity: RISK, title: 'No memory limit, so this container can consume all of a node’s memory' },
  { id: 'requests-exceed-limits', severity: RISK, title: 'Requests a resource above its own limit -- the API server rejects this manifest' },
  { id: 'no-memory-request', severity: WARN, title: 'No memory request, so this container is first evicted under node memory pressure' },
  { id: 'no-cpu-request', severity: WARN, title: 'No CPU request, so the scheduler cannot bin-pack this pod accurately' },
  { id: 'no-ephemeral-storage-limit', severity: WARN, title: 'No ephemeral-storage limit, so filling local disk can evict every pod on the node' },
  { id: 'cpu-limit-set', severity: INFO, title: 'CPU limit set -- CFS quota throttling can trigger even when the node has spare CPU' },
];

const CHECK_BY_ID = new Map(CHECKS.map((c) => [c.id, c]));

/** Workload kinds whose pod template lives at `spec.template.spec`. A bare
 * `Pod` carries its spec directly at `spec`, and `CronJob` nests one level
 * deeper through its own `jobTemplate`. Anything else has no pod template
 * this tool knows how to find, and is reported under `skipped` rather than
 * silently treated as clean. */
const POD_TEMPLATE_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job']);

/** Finds the PodSpec a workload document actually runs, or `null` if this
 * tool does not recognise where one would be. */
export function podSpecOf(doc) {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.kind === 'Pod') return doc.spec ?? {};
  if (POD_TEMPLATE_KINDS.has(doc.kind)) return doc.spec?.template?.spec ?? {};
  if (doc.kind === 'CronJob') return doc.spec?.jobTemplate?.spec?.template?.spec ?? {};
  return null;
}

export function resourceLabel(doc) {
  const ns = doc.metadata?.namespace;
  const name = doc.metadata?.name ?? '(unnamed)';
  return `${doc.kind}/${ns ? `${ns}.` : ''}${name}`;
}

/** `kubectl get deploy,job,cronjob -o yaml` returns a single `kind: List`
 * whose resources are under `items`, not a stream of documents -- the same
 * shape k8s-rollout-safety-check's own reader has to flatten. Lists nest, so
 * this recurses with a depth guard against a self-referential structure. */
export function flattenLists(docs, depth = 0) {
  const out = [];
  if (depth > 10) return out;
  for (const doc of Array.isArray(docs) ? docs : []) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) continue;
    if (typeof doc.kind === 'string' && doc.kind.endsWith('List') && Array.isArray(doc.items)) {
      out.push(...flattenLists(doc.items, depth + 1));
    } else {
      out.push(doc);
    }
  }
  return out;
}

const BINARY_SUFFIX = { Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40, Pi: 2 ** 50, Ei: 2 ** 60 };
// Kubernetes' decimal SI suffixes are case-sensitive: lowercase `k` for
// kilo, uppercase for everything above it -- `K` is not a valid quantity
// suffix at all, which is exactly the typo ("K" for "Ki") this check exists
// to catch rather than silently accept.
const DECIMAL_SUFFIX = { k: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18 };

/**
 * Parses a Kubernetes memory (or `ephemeral-storage`) quantity into bytes.
 * Supports the binary (`Ki`..`Ei`) and decimal SI (`k`..`E`) suffixes and a
 * bare number (bytes). Returns `null` for anything else -- including the
 * exponential (`2e9`) and fractional-binary forms the API also accepts, both
 * rare in a hand-written manifest -- so an unparseable value abstains rather
 * than asserting a wrong comparison.
 */
export function parseMemoryQuantity(raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
  const match = /^([0-9]+(?:\.[0-9]+)?)(Ki|Mi|Gi|Ti|Pi|Ei|[kMGTPE])?$/.exec(str);
  if (!match) return null;
  const value = Number(match[1]);
  const suffix = match[2] ?? '';
  if (suffix === '') return value;
  const mult = BINARY_SUFFIX[suffix] ?? DECIMAL_SUFFIX[suffix];
  return mult == null ? null : value * mult;
}

/**
 * Parses a Kubernetes CPU quantity into millicores (`500m` -> 500, `1` ->
 * 1000, `0.5` -> 500). Returns `null` for anything else, same abstain rule
 * as {@link parseMemoryQuantity}.
 */
export function parseCpuQuantity(raw) {
  if (raw == null) return null;
  const str = String(raw).trim();
  const milli = /^([0-9]+(?:\.[0-9]+)?)m$/.exec(str);
  if (milli) return Number(milli[1]);
  const plain = /^([0-9]+(?:\.[0-9]+)?)$/.exec(str);
  return plain ? Number(plain[1]) * 1000 : null;
}

function humanMemory(bytes) {
  if (bytes >= 2 ** 30) return `${(bytes / 2 ** 30).toFixed(bytes % 2 ** 30 ? 2 : 0)}Gi`;
  if (bytes >= 2 ** 20) return `${(bytes / 2 ** 20).toFixed(bytes % 2 ** 20 ? 2 : 0)}Mi`;
  if (bytes >= 2 ** 10) return `${(bytes / 2 ** 10).toFixed(bytes % 2 ** 10 ? 2 : 0)}Ki`;
  return `${bytes}`;
}

function finding(id, resource, container, role, impact, fix) {
  const meta = CHECK_BY_ID.get(id);
  return { id, severity: meta.severity, title: meta.title, resource, container, role, impact, fix };
}

/** Checks one container (or init container) and returns its findings. */
function checkContainer(where, container, role) {
  const out = [];
  const name = container?.name ?? `(unnamed ${role})`;
  const resources = container?.resources ?? {};
  const requests = resources.requests ?? {};
  const limits = resources.limits ?? {};

  if (limits.memory == null) {
    out.push(finding(
      'no-memory-limit', where, name, role,
      'This container can grow its memory use without bound. Kubernetes does not stop it on its own -- the kernel’s OOM killer eventually does, once the node itself is under memory pressure, and it does not only target the container that grew.',
      'Set `resources.limits.memory` to the most this container should ever legitimately need, based on its own observed usage.',
    ));
  }
  if (requests.memory == null) {
    out.push(finding(
      'no-memory-request', where, name, role,
      'With no memory request, this container is ranked for eviction ahead of every container that has one, the moment the node comes under memory pressure -- regardless of how little memory it is actually using at that moment.',
      'Set `resources.requests.memory` to what this container needs in steady state, so it is scheduled onto a node that actually has room for it.',
    ));
  }
  if (requests.cpu == null) {
    out.push(finding(
      'no-cpu-request', where, name, role,
      'With no CPU request, the scheduler has no figure to bin-pack this container against and treats it as needing none, which lets a node be scheduled tighter than the containers on it can actually share.',
      'Set `resources.requests.cpu` to this container’s typical steady-state usage.',
    ));
  }
  if (limits['ephemeral-storage'] == null) {
    out.push(finding(
      'no-ephemeral-storage-limit', where, name, role,
      'This container’s logs, temp files, and writable layer can fill the node’s local disk with nothing to stop them. Once the node crosses its disk-pressure threshold, the kubelet evicts pods to reclaim space -- not only the one that filled it.',
      'Set `resources.limits.ephemeral-storage` if this container writes logs or temp files locally rather than to a mounted volume with its own size limit.',
    ));
  }
  if (limits.cpu != null) {
    out.push(finding(
      'cpu-limit-set', where, name, role,
      `A CPU limit (${limits.cpu}) is enforced by the kernel’s CFS bandwidth controller, which grants quota once per fixed period with no rollover -- a container that bursts within one period and idles the next can be throttled even while the node overall has spare CPU (tracked upstream as kubernetes/kubernetes#67577). Not a defect by itself: strict multi-tenant isolation is a real reason to keep it.`,
      'If this workload sees latency spikes that correlate with CPU throttling rather than actual contention, try removing the CPU limit (keep the request) and re-measure -- the request alone still gets it scheduling priority.',
    ));
  }

  const memRequest = parseMemoryQuantity(requests.memory);
  const memLimit = parseMemoryQuantity(limits.memory);
  if (memRequest != null && memLimit != null && memRequest > memLimit) {
    out.push(finding(
      'requests-exceed-limits', where, name, role,
      `Memory request (${humanMemory(memRequest)}) is above the memory limit (${humanMemory(memLimit)}). Kubernetes' admission validation rejects this outright -- \`kubectl apply\` or \`helm upgrade\` fails on this manifest, it does not merely warn.`,
      'Lower the request to at or below the limit, or raise the limit to at or above the request.',
    ));
  }
  const cpuRequest = parseCpuQuantity(requests.cpu);
  const cpuLimit = parseCpuQuantity(limits.cpu);
  if (cpuRequest != null && cpuLimit != null && cpuRequest > cpuLimit) {
    out.push(finding(
      'requests-exceed-limits', where, name, role,
      `CPU request (${requests.cpu}) is above the CPU limit (${limits.cpu}). Kubernetes' admission validation rejects this outright -- \`kubectl apply\` or \`helm upgrade\` fails on this manifest, it does not merely warn.`,
      'Lower the request to at or below the limit, or raise the limit to at or above the request.',
    ));
  }

  return out;
}

function analyzeWorkload(doc) {
  const podSpec = podSpecOf(doc);
  if (!podSpec) return [];
  const where = resourceLabel(doc);
  const out = [];
  for (const container of Array.isArray(podSpec.containers) ? podSpec.containers : []) {
    out.push(...checkContainer(where, container, 'container'));
  }
  for (const container of Array.isArray(podSpec.initContainers) ? podSpec.initContainers : []) {
    out.push(...checkContainer(where, container, 'init container'));
  }
  return out;
}

const SEVERITY_ORDER = { [RISK]: 0, [WARN]: 1, [INFO]: 2 };

/** Analyze already-parsed manifest documents. */
export function analyzeDocuments(docs) {
  const list = flattenLists(docs);
  const workloads = list.filter((d) => podSpecOf(d) != null);
  const skipped = list
    .filter((d) => typeof d?.kind === 'string' && podSpecOf(d) == null)
    .map((d) => resourceLabel(d));

  const findings = [];
  for (const doc of workloads) findings.push(...analyzeWorkload(doc));
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const counts = {
    risk: findings.filter((f) => f.severity === RISK).length,
    warn: findings.filter((f) => f.severity === WARN).length,
    info: findings.filter((f) => f.severity === INFO).length,
  };
  let verdict = 'clean';
  if (workloads.length === 0) verdict = 'no-workloads';
  else if (counts.risk > 0) verdict = 'at-risk';
  else if (counts.warn > 0) verdict = 'review';

  return { findings, workloads: workloads.map(resourceLabel), skipped, verdict, counts };
}

/** Parse then analyze. `sources` is an array of `{name, text}`. A file that
 * does not parse becomes a named error rather than failing the whole run, so
 * one bad file in a batch cannot hide the findings in the rest. */
export function analyzeSources(sources) {
  const docs = [];
  const errors = [];
  for (const source of sources) {
    try {
      for (const doc of parseDocuments(source.text)) docs.push(doc);
    } catch (err) {
      errors.push({ name: source.name, message: err.message });
    }
  }
  return { ...analyzeDocuments(docs), errors };
}

export function summaryLine(result) {
  if (result.verdict === 'no-workloads') {
    return 'No Pod, Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, or CronJob found -- nothing to check.';
  }
  const n = result.workloads.length;
  const subject = `${n} workload${n === 1 ? '' : 's'}`;
  if (result.verdict === 'clean') {
    return `No resource-limit problems found in ${subject}.`;
  }
  if (result.verdict === 'review') {
    return `${subject}: ${result.counts.warn} thing${result.counts.warn === 1 ? '' : 's'} worth reviewing, nothing that leaves a container unbounded.`;
  }
  return `${subject}: ${result.counts.risk} container${result.counts.risk === 1 ? '' : 's'} left unbounded or invalid${result.counts.warn ? `, plus ${result.counts.warn} to review` : ''}.`;
}
