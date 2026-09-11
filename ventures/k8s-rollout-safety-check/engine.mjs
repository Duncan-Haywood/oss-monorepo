// The whole verdict lives here. The CLI and the browser page both import this
// file and nothing else does the deciding, so the two can never disagree
// about whether a rollout drops traffic -- the "import, don't restate" rule
// this repository has paid for more than once.
//
// Every check answers one question: *during a rolling update, or when a node
// is drained, does this manifest let Kubernetes take a pod out of service
// before it has stopped receiving requests, or put one into service before it
// can answer them?* Checks that would need to know what the application does
// (how long it takes to drain, whether a request is idempotent) are not here,
// because this tool only ever reads the manifest.

import { parseDocuments } from './yaml.mjs';

export const RISK = 'risk';
export const WARN = 'warn';

/** Every check this tool runs, in report order. Exported so the page and the
 * CLI can list what was checked without restating it. */
export const CHECKS = [
  { id: 'recreate-strategy', severity: RISK, title: 'Recreate strategy takes every pod down first' },
  { id: 'no-readiness-probe', severity: RISK, title: 'No readinessProbe, so traffic arrives before the app can answer' },
  { id: 'max-unavailable-all-pods', severity: RISK, title: 'maxUnavailable allows every pod to be down at once' },
  { id: 'no-prestop-hook', severity: RISK, title: 'No preStop delay, so shutdown races endpoint removal' },
  { id: 'grace-period-too-short', severity: RISK, title: 'terminationGracePeriodSeconds leaves no time to drain after preStop' },
  { id: 'pdb-blocks-drain', severity: RISK, title: 'PodDisruptionBudget can never be satisfied, so a node drain hangs' },
  { id: 'single-replica', severity: WARN, title: 'A single replica has no redundancy outside a rollout' },
  { id: 'liveness-equals-readiness', severity: WARN, title: 'livenessProbe duplicates readinessProbe, turning a brownout into a restart' },
  { id: 'liveness-probe-starts-immediately', severity: WARN, title: 'livenessProbe starts at container start with no startupProbe' },
  { id: 'no-pdb-found', severity: WARN, title: 'No PodDisruptionBudget selects these pods' },
];

const CHECK_BY_ID = new Map(CHECKS.map((c) => [c.id, c]));

const DEFAULT_GRACE_PERIOD = 30; // Kubernetes' own default, in seconds.
const DEFAULT_MAX_UNAVAILABLE = '25%';
const DEFAULT_MAX_SURGE = '25%';

/** Kubernetes resolves an int-or-percentage against the replica count, then
 * rounds *down* for maxUnavailable and *up* for maxSurge. Returns null when
 * the value is neither an integer nor an `N%` string. */
export function resolveReplicaCount(value, replicas, { roundUp = false } = {}) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const pct = String(value).trim().match(/^(\d+(?:\.\d+)?)%$/);
  if (!pct) return null;
  const raw = (Number(pct[1]) / 100) * replicas;
  return roundUp ? Math.ceil(raw) : Math.floor(raw);
}

/** The seconds a preStop hook waits before the container is asked to stop, or
 * null when the hook exists but its duration cannot be read from the manifest
 * (an httpGet hook, or a script whose sleep is computed). */
export function preStopSleepSeconds(preStop) {
  if (!preStop || typeof preStop !== 'object') return null;
  if (preStop.sleep && typeof preStop.sleep.seconds === 'number') return preStop.sleep.seconds;
  const command = preStop.exec?.command;
  if (!Array.isArray(command)) return null;
  const joined = command.map((part) => String(part)).join(' ');
  // `sleep 15`, `sleep 15s`, `/bin/sleep 0.5` -- the common shapes. A sleep
  // whose argument is a variable deliberately reads as unknown.
  const match = joined.match(/\bsleep\s+(\d+(?:\.\d+)?)s?\b/);
  return match ? Number(match[1]) : null;
}

function podLabels(deployment) {
  return deployment.spec?.template?.metadata?.labels ?? {};
}

/** A PodDisruptionBudget selects a Deployment's pods when every label in its
 * matchLabels is present, with the same value, on the pod template. */
export function pdbSelects(pdb, deployment) {
  const selector = pdb.spec?.selector?.matchLabels;
  if (!selector || typeof selector !== 'object') return false;
  const entries = Object.entries(selector);
  if (entries.length === 0) return false;
  const labels = podLabels(deployment);
  return entries.every(([k, v]) => String(labels[k]) === String(v));
}

/** Containers that can receive traffic. A container declaring a containerPort
 * is serving; when no container in the pod declares one, the manifest does not
 * say, so every container is checked rather than none. Sidecars without ports
 * are skipped so a log shipper does not produce a readiness finding. */
export function servingContainers(podSpec) {
  const containers = Array.isArray(podSpec?.containers) ? podSpec.containers : [];
  const withPorts = containers.filter((c) => Array.isArray(c?.ports) && c.ports.length > 0);
  return withPorts.length > 0 ? withPorts : containers;
}

function probeTarget(probe) {
  if (!probe || typeof probe !== 'object') return null;
  if (probe.httpGet) return `httpGet ${probe.httpGet.path ?? '/'}:${probe.httpGet.port ?? ''}`;
  if (probe.tcpSocket) return `tcpSocket ${probe.tcpSocket.port ?? ''}`;
  if (probe.exec?.command) return `exec ${[].concat(probe.exec.command).join(' ')}`;
  if (probe.grpc) return `grpc ${probe.grpc.port ?? ''}${probe.grpc.service ? ` ${probe.grpc.service}` : ''}`;
  return null;
}

export function resourceLabel(doc) {
  const ns = doc.metadata?.namespace;
  const name = doc.metadata?.name ?? '(unnamed)';
  return `${doc.kind}/${ns ? `${ns}.` : ''}${name}`;
}

function finding(id, resource, container, impact, fix) {
  const meta = CHECK_BY_ID.get(id);
  return { id, severity: meta.severity, title: meta.title, resource, container, impact, fix };
}

function analyzeDeployment(deployment, pdbs) {
  const out = [];
  const where = resourceLabel(deployment);
  const spec = deployment.spec ?? {};
  const podSpec = spec.template?.spec ?? {};
  const replicas = typeof spec.replicas === 'number' ? spec.replicas : 1;
  const strategyType = spec.strategy?.type ?? 'RollingUpdate';
  const rolling = spec.strategy?.rollingUpdate ?? {};

  if (strategyType === 'Recreate') {
    out.push(finding(
      'recreate-strategy', where, null,
      'Every existing pod is terminated before the first new pod is started, so the service is completely down for as long as the new pods take to become ready. This is not a misconfiguration Kubernetes can work around — it is what Recreate means.',
      'Use `strategy: {type: RollingUpdate}` unless the workload genuinely cannot run two versions at once (an exclusive lock, or a schema migration that is not backwards compatible).',
    ));
  }

  if (strategyType === 'RollingUpdate') {
    const maxUnavailableRaw = rolling.maxUnavailable ?? DEFAULT_MAX_UNAVAILABLE;
    const maxSurgeRaw = rolling.maxSurge ?? DEFAULT_MAX_SURGE;
    let maxUnavailable = resolveReplicaCount(maxUnavailableRaw, replicas);
    const maxSurge = resolveReplicaCount(maxSurgeRaw, replicas, { roundUp: true });
    // Kubernetes forbids both being zero; when they round to zero it uses 1.
    if (maxUnavailable === 0 && maxSurge === 0) maxUnavailable = 1;
    if (maxUnavailable != null && replicas > 0 && maxUnavailable >= replicas) {
      out.push(finding(
        'max-unavailable-all-pods', where, null,
        `maxUnavailable resolves to ${maxUnavailable} of ${replicas} replica(s), so Kubernetes is permitted to take every pod out of service at the same moment. Between that point and the first new pod becoming ready, there is nothing left to answer a request.`,
        `Set \`maxUnavailable: 0\` and \`maxSurge: 1\` so a replacement pod is started and becomes ready before any old pod is removed.${replicas === 1 ? ' With a single replica that is the only configuration that avoids a gap.' : ''}`,
      ));
    }
  }

  if (replicas === 1) {
    out.push(finding(
      'single-replica', where, null,
      'One replica means any node drain, node failure, eviction or OOM kill takes the service down entirely until a new pod is scheduled and ready. A careful rollout strategy does not help with an involuntary disruption.',
      'Run at least two replicas and spread them across nodes (a `topologySpreadConstraints` entry over `kubernetes.io/hostname`, or pod anti-affinity).',
    ));
  }

  const grace = typeof podSpec.terminationGracePeriodSeconds === 'number'
    ? podSpec.terminationGracePeriodSeconds
    : DEFAULT_GRACE_PERIOD;
  const graceIsDefault = typeof podSpec.terminationGracePeriodSeconds !== 'number';

  for (const container of servingContainers(podSpec)) {
    const name = container?.name ?? '(unnamed container)';

    if (!container?.readinessProbe) {
      out.push(finding(
        'no-readiness-probe', where, name,
        'Without a readinessProbe a pod is marked Ready the instant its container process starts, and the Service adds it to the load balancer immediately. Every request that arrives before the application has finished booting, connected to its database, or warmed its cache gets a connection error or a 5xx — on every single rollout.',
        'Add a `readinessProbe` that fails until the application can actually serve a request. It should check the dependencies a real request needs, not just that the process is alive.',
      ));
    }

    const preStop = container?.lifecycle?.preStop;
    if (!preStop) {
      out.push(finding(
        'no-prestop-hook', where, name,
        'When a pod is deleted, two things happen at the same time: the kubelet sends SIGTERM to the container, and the endpoints controller starts removing the pod from EndpointSlice. The second has to propagate to every kube-proxy and every ingress controller, and that is not instant. With no preStop delay the container can be gone before the propagation finishes, so proxies keep sending it new connections and those connections are refused.',
        'Add a preStop hook that does nothing except wait, so removal can propagate before shutdown starts: `lifecycle: {preStop: {sleep: {seconds: 10}}}` on Kubernetes 1.29+, or `{exec: {command: ["/bin/sh","-c","sleep 10"]}}` on older clusters. Then make sure terminationGracePeriodSeconds covers that wait plus the time the app needs to finish in-flight requests.',
      ));
    } else {
      const sleepSeconds = preStopSleepSeconds(preStop);
      if (sleepSeconds != null && grace <= sleepSeconds) {
        out.push(finding(
          'grace-period-too-short', where, name,
          `The grace period clock starts when the pod is deleted and has to cover the preStop hook *and* the application's own shutdown. Here preStop waits ${sleepSeconds}s while terminationGracePeriodSeconds is ${grace}s${graceIsDefault ? ' (the Kubernetes default, because the manifest does not set it)' : ''}, so SIGKILL lands at or before the moment preStop returns. The application never gets to finish its in-flight requests — they are cut off mid-response.`,
          `Set \`terminationGracePeriodSeconds\` to the preStop wait plus the longest request the app needs to finish, with headroom — for a ${sleepSeconds}s preStop, something like ${sleepSeconds + 30} is a common starting point.`,
        ));
      }
    }

    const liveness = container?.livenessProbe;
    const readiness = container?.readinessProbe;
    if (liveness && readiness) {
      const a = probeTarget(liveness);
      const b = probeTarget(readiness);
      if (a && b && a === b) {
        out.push(finding(
          'liveness-equals-readiness', where, name,
          `Both probes check the same thing (${a}). When a dependency slows down, the readinessProbe correctly pulls the pod out of rotation — and the livenessProbe then restarts the container for the same reason. During a rollout that turns a recoverable brownout into a crash loop that stalls the rollout with reduced capacity.`,
          'Point livenessProbe at a cheap endpoint that only proves the process is not wedged, and leave the dependency checks to readinessProbe.',
        ));
      }
    }

    if (liveness && !container?.startupProbe && !liveness.initialDelaySeconds) {
      out.push(finding(
        'liveness-probe-starts-immediately', where, name,
        'The livenessProbe begins the moment the container starts, with no startupProbe to hold it off and no initialDelaySeconds. An application that takes longer to boot than failureThreshold × periodSeconds is killed mid-startup and restarted, forever — and a rollout that hits this never completes.',
        'Add a `startupProbe` with a generous failureThreshold (it suspends the livenessProbe until it first succeeds), which is the modern replacement for guessing an initialDelaySeconds.',
      ));
    }
  }

  const matching = pdbs.filter((pdb) => pdbSelects(pdb, deployment));
  if (matching.length === 0) {
    out.push(finding(
      'no-pdb-found', where, null,
      'Nothing in what was checked declares a PodDisruptionBudget selecting these pods. A rollout is a *voluntary* disruption and so is a node drain during a cluster upgrade — without a budget, the drain is free to evict every replica at once, whatever the rollout strategy says.',
      'Add a PodDisruptionBudget with `minAvailable` set below the replica count (for example `minAvailable: 1` at 2 replicas). If one already exists outside the files checked here, this finding does not apply.',
    ));
  }
  for (const pdb of matching) {
    const pdbWhere = resourceLabel(pdb);
    const minAvailable = resolveReplicaCount(pdb.spec?.minAvailable, replicas);
    const maxUnavailable = resolveReplicaCount(pdb.spec?.maxUnavailable, replicas);
    if (minAvailable != null && replicas > 0 && minAvailable >= replicas) {
      out.push(finding(
        'pdb-blocks-drain', pdbWhere, null,
        `minAvailable resolves to ${minAvailable} with ${replicas} replica(s), so evicting even one pod would break the budget. \`kubectl drain\` does not fail here — it blocks and retries indefinitely, which is why this usually shows up as a cluster upgrade that appears to hang rather than as an error.`,
        `Set minAvailable below the replica count (\`minAvailable: ${Math.max(1, replicas - 1)}\` at ${replicas} replicas), or raise the replica count.`,
      ));
    }
    if (maxUnavailable === 0) {
      out.push(finding(
        'pdb-blocks-drain', pdbWhere, null,
        'maxUnavailable resolves to 0, so no pod may ever be voluntarily evicted. A node drain blocks forever rather than failing, so a cluster upgrade stalls with no error to point at.',
        'Set `maxUnavailable: 1` (or a minAvailable below the replica count) so a drain can make progress one pod at a time.',
      ));
    }
  }

  return out;
}

const SEVERITY_ORDER = { [RISK]: 0, [WARN]: 1 };

/**
 * Analyze parsed manifest documents.
 * @returns {{findings: Array, deployments: Array<string>, skipped: Array<string>, verdict: string, counts: {risk: number, warn: number}}}
 */
export function analyzeDocuments(docs) {
  const list = Array.isArray(docs) ? docs.filter((d) => d && typeof d === 'object' && !Array.isArray(d)) : [];
  const deployments = list.filter((d) => d.kind === 'Deployment');
  const pdbs = list.filter((d) => d.kind === 'PodDisruptionBudget');
  const skipped = list
    .filter((d) => d.kind && d.kind !== 'Deployment' && d.kind !== 'PodDisruptionBudget')
    .map((d) => resourceLabel(d));

  const findings = [];
  for (const deployment of deployments) findings.push(...analyzeDeployment(deployment, pdbs));
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const counts = {
    risk: findings.filter((f) => f.severity === RISK).length,
    warn: findings.filter((f) => f.severity === WARN).length,
  };
  let verdict = 'clean';
  if (deployments.length === 0) verdict = 'no-deployments';
  else if (counts.risk > 0) verdict = 'drops-requests';
  else if (counts.warn > 0) verdict = 'review';

  return {
    findings,
    deployments: deployments.map(resourceLabel),
    skipped,
    verdict,
    counts,
  };
}

/** Parse then analyze. `sources` is an array of `{name, text}`. A file that
 * does not parse becomes a named error rather than failing the whole run, so
 * one bad file in a directory cannot hide the findings in the rest. */
export function analyzeSources(sources) {
  const docs = [];
  const errors = [];
  for (const source of sources) {
    try {
      for (const doc of parseDocuments(source.text)) {
        docs.push(doc);
      }
    } catch (err) {
      errors.push({ name: source.name, message: err.message });
    }
  }
  return { ...analyzeDocuments(docs), errors };
}

export function summaryLine(result) {
  if (result.verdict === 'no-deployments') {
    return 'No Deployment found — nothing to check.';
  }
  const n = result.deployments.length;
  const subject = `${n} Deployment${n === 1 ? '' : 's'}`;
  if (result.verdict === 'clean') {
    return `No rollout-safety problems found in ${subject}.`;
  }
  if (result.verdict === 'review') {
    return `${subject}: ${result.counts.warn} thing${result.counts.warn === 1 ? '' : 's'} worth reviewing, nothing that drops requests on a rollout.`;
  }
  return `${subject}: ${result.counts.risk} way${result.counts.risk === 1 ? '' : 's'} this rollout can drop live requests${result.counts.warn ? `, plus ${result.counts.warn} to review` : ''}.`;
}
