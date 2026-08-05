// A Deployment whose probes point at a port the image does not listen on.
//
// `portfolio/marisstella-homepage/Dockerfile` drops to `USER nginx` and then
// declares `EXPOSE 8080`, and its `nginx.conf` has `listen 8080 default_server`.
// It has to: an unprivileged process cannot bind port 80, so 8080 is a
// consequence of the image running as a non-root user rather than a preference.
//
// `platform/k8s/apps/marisstella-homepage/deployment.yaml` declared
// `containerPort: 80` with the liveness and readiness probes both on port 80,
// and `service.yaml` had `targetPort: 80`. Nothing in that chain can work. A pod
// from this image never passes readiness, so the Service never gets an endpoint,
// so `ingress.yaml` — which claims `marisstella.dev` and `www.marisstella.dev`,
// the portfolio's only live public customer surface — has nothing behind it.
// `platform/k8s/argocd-apps/marisstella-homepage.yaml` syncs that directory from
// HEAD with `automated: {prune: true, selfHeal: true}`, so the manifests are
// applied and the failure is permanent rather than pending.
//
// It is a complete, plausible, reviewed-looking manifest set for a workload that
// cannot come up — the same class as `scripts/ci/image_release_path.py`'s
// finding that six of eight images had no producer, one level in: the image
// exists, the manifests exist, and they disagree about the one number that has
// to match. Every other app in the cluster gets this right (print-atelier and
// local-site-studio both run `port: 80 / targetPort: 3000` against an
// `EXPOSE 3000` image), which is why nothing generalised the rule.
//
// The contract, derived from the files on both sides:
//
//   * the port comes from the image — `EXPOSE` in the Dockerfile, cross-checked
//     against the `listen` directives of an nginx config the Dockerfile copies,
//     so a manifest cannot be "fixed" by editing only one of them;
//   * every `containerPort` in the app's Deployment must be a port the image
//     exposes;
//   * every liveness/readiness/startup probe must target it, resolving named
//     ports through the container's own `ports:` list;
//   * every Service `targetPort` must resolve to it. The Service's own `port:`
//     is deliberately not constrained — that is the cluster-facing number the
//     Ingress routes to, and 80 is correct there.
//
// Declared scope. The subject is an app directory under `platform/k8s/apps/`
// whose name matches the directory of a tracked Dockerfile, because that pairing
// is the only place in the repository where the image's port is knowable. Four
// apps qualify. The others — `ai-engineering-academy`, `ai-first-markets`,
// `real-estate-photo-app`, `retail-pilot-intel` — name organisation images this
// repository contains no Dockerfile for, which is not an exemption but the
// absence of any evidence to check against; `image_release_path.py` is the
// control that counts them, and it counts them as unbuildable.
// `service-template` pins third-party `nginx:alpine` and is excluded for the
// same reason that script excludes it.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function gitLsFiles(...pathspecs) {
  return execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 16,
    env: GIT_ENV,
  })
    .split('\0')
    .filter(Boolean)
    .sort();
}

const readRepoFile = (relative) => fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');

/** The indentation of a line's key, counting a `- ` list marker as two spaces. */
function keyIndent(line) {
  const match = /^(\s*)(-\s+)?/.exec(line);
  return match[1].length + (match[2] ? match[2].length : 0);
}

// ---------------------------------------------------------------------------
// What the image listens on
// ---------------------------------------------------------------------------

/** `EXPOSE` ports declared by a Dockerfile. */
function exposedPorts(dockerfile) {
  const body = readRepoFile(dockerfile);
  const ports = new Set();
  for (const match of body.matchAll(/^\s*EXPOSE\s+(.+)$/gim)) {
    for (const token of match[1].trim().split(/\s+/)) {
      const port = /^(\d+)(?:\/(?:tcp|udp))?$/i.exec(token);
      if (port) ports.add(Number(port[1]));
    }
  }
  return ports;
}

/**
 * `listen` ports of an nginx config the Dockerfile copies into the image.
 *
 * `EXPOSE` is documentation — it opens nothing — so on its own it is a claim
 * about the image rather than a fact about it. Where the server's own config
 * ships in the same directory, that config is the fact, and the two are
 * required to agree below.
 */
function nginxListenPorts(dockerfile) {
  const body = readRepoFile(dockerfile);
  const directory = path.posix.dirname(dockerfile);
  const ports = new Map();
  for (const match of body.matchAll(/^\s*COPY\s+(?:--\S+\s+)*(\S+\.conf)\s+\S+/gim)) {
    const relative = path.posix.join(directory, match[1]);
    let config;
    try {
      config = readRepoFile(relative);
    } catch {
      continue; // not a file this repository tracks alongside the Dockerfile
    }
    const listened = new Set();
    for (const listen of config.matchAll(/^\s*listen\s+([^;]+);/gim)) {
      const port = /(?:^|:)(\d+)\s*$|(?:^|:)(\d+)\s/.exec(listen[1].trim());
      if (port) listened.add(Number(port[1] ?? port[2]));
    }
    if (listened.size > 0) ports.set(relative, listened);
  }
  return ports;
}

// ---------------------------------------------------------------------------
// What the manifests declare
// ---------------------------------------------------------------------------

/** `{ ports, named }` for every container port in a workload manifest. */
function containerPortsOf(source) {
  const lines = source.split('\n');
  const ports = [];
  const named = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*-?\s*containerPort:\s*(\d+)\s*$/.exec(lines[index]);
    if (!match) continue;
    const port = Number(match[1]);
    ports.push(port);

    // A name for this port sits in the same list item, so it is the `name:` key
    // at the same indentation within a couple of lines either side. The
    // container's own `name:` sits two columns shallower and is not matched.
    const indent = keyIndent(lines[index]);
    for (let offset = -3; offset <= 3; offset += 1) {
      const line = lines[index + offset];
      if (!line || offset === 0) continue;
      if (keyIndent(line) !== indent) continue;
      const name = /^\s*-?\s*name:\s*([A-Za-z0-9][A-Za-z0-9-]*)\s*$/.exec(line);
      if (name) named.set(name[1], port);
    }
  }
  return { ports, named };
}

/** `{ kind, port }` for every probe in a workload manifest. */
function probePortsOf(source) {
  const lines = source.split('\n');
  const probes = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opener = /^(\s*)(liveness|readiness|startup)Probe:\s*$/.exec(lines[index]);
    if (!opener) continue;
    const outer = opener[1].length;
    for (let inner = index + 1; inner < lines.length; inner += 1) {
      const line = lines[inner];
      if (line.trim() === '') continue;
      if (/^\s*/.exec(line)[0].length <= outer) break;
      const port = /^\s*port:\s*(\S+)\s*$/.exec(line);
      if (port) probes.push({ kind: `${opener[2]}Probe`, port: port[1] });
    }
  }
  return probes;
}

/** Every `targetPort:` value in a Service manifest. */
function targetPortsOf(source) {
  return [...source.matchAll(/^\s*targetPort:\s*(\S+)\s*$/gm)].map((match) => match[1]);
}

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------

/**
 * Apps whose image port is knowable, derived rather than listed: a tracked
 * Dockerfile whose directory name is also an app directory under
 * `platform/k8s/apps/` holding a Deployment.
 */
function portSubjects() {
  const appDirectories = new Set(
    gitLsFiles('platform/k8s/apps')
      .filter((entry) => /\/deployment\.ya?ml$/.test(entry))
      .map((entry) => path.posix.basename(path.posix.dirname(entry))),
  );

  const subjects = [];
  for (const dockerfile of gitLsFiles('*Dockerfile')) {
    const app = path.posix.basename(path.posix.dirname(dockerfile));
    if (!appDirectories.has(app)) continue;
    const manifests = gitLsFiles(`platform/k8s/apps/${app}`);
    subjects.push({
      app,
      dockerfile,
      deployments: manifests.filter((entry) => /\/deployment\.ya?ml$/.test(entry)),
      services: manifests.filter((entry) => /\/service\.ya?ml$/.test(entry)),
    });
  }
  return subjects;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('Container port contract - the scan pairs images with the manifests that run them', () => {
  const subjects = portSubjects();

  assert.ok(
    subjects.length >= 4,
    `only ${subjects.length} image/manifest pair(s) were found. Four apps have both a ` +
      'tracked Dockerfile and a Deployment (marisstella-homepage, print-atelier, ' +
      'local-site-studio, quick-pick-survey); fewer means the pairing heuristic broke ' +
      'and this file would assert almost nothing.',
  );

  assert.ok(
    subjects.some((subject) => subject.app === 'marisstella-homepage'),
    'marisstella-homepage was not paired with its manifests. It is the pair this ' +
      'control was written for — the one app whose image port and manifest port ' +
      'disagreed — so if it moved, point this at the new location.',
  );

  for (const subject of subjects) {
    assert.ok(
      exposedPorts(subject.dockerfile).size > 0,
      `${subject.dockerfile} declares no EXPOSE, so there is no image port to bind ` +
        `${subject.app}'s manifests to. Declare it rather than leaving the manifests ` +
        'unchecked.',
    );
  }
});

test('Container port contract - EXPOSE agrees with the server config in the image', () => {
  let checked = 0;
  for (const { app, dockerfile } of portSubjects()) {
    const exposed = exposedPorts(dockerfile);
    for (const [config, listened] of nginxListenPorts(dockerfile)) {
      checked += 1;
      assert.deepEqual(
        [...listened].sort(),
        [...exposed].sort(),
        `${dockerfile} declares EXPOSE ${[...exposed].join(', ')} but ${config} — which ` +
          `it copies into the image — listens on ${[...listened].join(', ')}. EXPOSE opens ` +
          `nothing, so the config is what ${app} actually serves on; the two disagreeing ` +
          'means one of them is documentation for a port nobody uses.',
      );
    }
  }
  assert.ok(
    checked > 0,
    'no Dockerfile/server-config pair was checked. marisstella-homepage copies ' +
      'nginx.conf into its image and is meant to be one, so this reading it as zero ' +
      'means the COPY scan broke.',
  );
});

test('Container port contract - containerPort is a port the image exposes', () => {
  for (const { app, dockerfile, deployments } of portSubjects()) {
    const exposed = exposedPorts(dockerfile);
    for (const manifest of deployments) {
      const { ports } = containerPortsOf(readRepoFile(manifest));
      assert.ok(
        ports.length > 0,
        `${manifest} declares no containerPort; ${app}'s port would be whatever the ` +
          'image happens to use, unchecked by anything.',
      );
      for (const port of ports) {
        assert.ok(
          exposed.has(port),
          `${manifest} declares containerPort ${port}, but ${dockerfile} exposes ` +
            `${[...exposed].join(', ')}. The manifest and the image disagree about the ` +
            `port ${app} serves on.`,
        );
      }
    }
  }
});

test('Container port contract - every probe targets the port the image listens on', () => {
  let checked = 0;
  for (const { app, dockerfile, deployments } of portSubjects()) {
    const exposed = exposedPorts(dockerfile);
    for (const manifest of deployments) {
      const source = readRepoFile(manifest);
      const { named } = containerPortsOf(source);
      const probes = probePortsOf(source);
      assert.ok(
        probes.length > 0,
        `${manifest} declares no liveness or readiness probe, so Kubernetes cannot tell ` +
          `whether ${app} is serving at all.`,
      );
      for (const probe of probes) {
        checked += 1;
        const resolved = /^\d+$/.test(probe.port) ? Number(probe.port) : named.get(probe.port);
        assert.notEqual(
          resolved,
          undefined,
          `${manifest}: the ${probe.kind} targets port \`${probe.port}\`, which is not a ` +
            'number and is not a name declared in the container\'s `ports:` list.',
        );
        assert.ok(
          exposed.has(resolved),
          `${manifest}: the ${probe.kind} targets port ${resolved}, but ${dockerfile} ` +
            `exposes ${[...exposed].join(', ')}. The probe can never succeed, so every ` +
            `pod stays unready, the Service gets no endpoint, and whatever the Ingress ` +
            `routes to ${app} answers nothing.`,
        );
      }
    }
  }
  assert.ok(checked >= 8, `only ${checked} probes were read across four apps; expected both a ` +
    'liveness and a readiness probe for each');
});

test('Container port contract - Service targetPort resolves to the image port', () => {
  let checked = 0;
  for (const { app, dockerfile, deployments, services } of portSubjects()) {
    const exposed = exposedPorts(dockerfile);
    const named = new Map();
    for (const manifest of deployments) {
      for (const [name, port] of containerPortsOf(readRepoFile(manifest)).named) {
        named.set(name, port);
      }
    }
    for (const manifest of services) {
      const targets = targetPortsOf(readRepoFile(manifest));
      assert.ok(targets.length > 0, `${manifest} declares no targetPort`);
      for (const target of targets) {
        checked += 1;
        const resolved = /^\d+$/.test(target) ? Number(target) : named.get(target);
        assert.notEqual(
          resolved,
          undefined,
          `${manifest}: targetPort \`${target}\` is neither a number nor a named ` +
            "containerPort in the app's Deployment.",
        );
        assert.ok(
          exposed.has(resolved),
          `${manifest}: targetPort resolves to ${resolved}, but ${dockerfile} exposes ` +
            `${[...exposed].join(', ')}. The Service would forward ${app}'s traffic to a ` +
            'port nothing is listening on. Only `targetPort` is constrained here — the ' +
            "Service's own `port:` is the cluster-facing number the Ingress routes to.",
        );
      }
    }
  }
  assert.ok(checked >= 4, `only ${checked} targetPort(s) were read; expected one per app`);
});

test('Container port contract - the port readers still read', () => {
  const deployment = [
    'spec:',
    '  template:',
    '    spec:',
    '      containers:',
    '      - name: app',
    '        ports:',
    '        - name: http',
    '          containerPort: 8080',
    '        livenessProbe:',
    '          httpGet:',
    '            path: /',
    '            port: 8080',
    '        readinessProbe:',
    '          httpGet:',
    '            path: /',
    '            port: http',
  ].join('\n');

  const { ports, named } = containerPortsOf(deployment);
  assert.deepEqual(ports, [8080], 'the containerPort reader lost its port');
  assert.equal(named.get('http'), 8080, 'a named containerPort must resolve to its number');
  assert.equal(
    named.get('app'),
    undefined,
    "the container's own name must not be read as a port name",
  );

  const probes = probePortsOf(deployment);
  assert.deepEqual(
    probes.map((probe) => `${probe.kind}:${probe.port}`),
    ['livenessProbe:8080', 'readinessProbe:http'],
    'both probes must be found, numeric and named',
  );

  // The shape marisstella-homepage's manifest actually had: no port names, the
  // list item carrying the port directly.
  const bare = containerPortsOf(
    ['      - name: app', '        ports:', '        - containerPort: 80'].join('\n'),
  );
  assert.deepEqual(bare.ports, [80], 'a bare `- containerPort:` list item must be read');
  assert.equal(bare.named.size, 0, 'a bare containerPort has no name');

  assert.deepEqual(targetPortsOf('    targetPort: 8080\n'), ['8080'], 'targetPort reader broke');
});
