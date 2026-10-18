// Generated from tests/fixtures/vulnerable-repo; test_devsec.py keeps it in sync.
// Regenerate: python3 test_devsec.py --regenerate-example
export default {
 "tool": "devsec-toolkit",
 "version": "0.1.0",
 "root": "vulnerable-repo",
 "summary": {
  "findings": {
   "high": 20,
   "medium": 20,
   "low": 17
  },
  "checks": {
   "ok": 23
  },
  "baselined": 0
 },
 "checks": [
  {
   "id": "actions-injection",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 2
  },
  {
   "id": "actions-artifact-poisoning",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 2
  },
  {
   "id": "actions-cache-poisoning",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "actions-secret-leak",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "actions-secrets-inherit",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 2
  },
  {
   "id": "actions-self-hosted-exposure",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "actions-permissions",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 2
  },
  {
   "id": "actions-checkout-credentials",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "pinned-actions",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 5
  },
  {
   "id": "actions-runtime-deprecation",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "actions-timeout",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "docker-build-secrets",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 2
  },
  {
   "id": "docker-compose-security",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 9
  },
  {
   "id": "docker-base-image-eol",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "docker-base-image-pin",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "k8s-pod-security",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 9
  },
  {
   "id": "dependency-confusion",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "node-version-drift",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 6
  },
  {
   "id": "dependabot-config",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 5
  },
  {
   "id": "jwt-verification-misuse",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "regex-redos",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "agent-permission-config",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  },
  {
   "id": "hidden-unicode",
   "status": "ok",
   "error": null,
   "seconds": 0,
   "findings": 1
  }
 ],
 "findings": [
  {
   "rule": "bash-allow-all",
   "severity": "high",
   "file": ".claude/settings.json",
   "line": null,
   "message": "\"Bash(*)\" grants Bash with no scope at all -- every shell command runs without a permission prompt.",
   "fix": "",
   "check": "agent-permission-config",
   "category": "ai-agents",
   "fingerprint": "54bb6955197cf2ca92bada93b6d6166e"
  },
  {
   "rule": "artifact-executed-after-untrusted-download",
   "severity": "high",
   "file": ".github/workflows/after-ci.yml",
   "line": 19,
   "message": "A privileged job executes files downloaded from a fork-triggered run: run step at line 19 follows download-artifact at line 14",
   "fix": "This job is triggered by workflow_run and downloads an artifact, then a later step in the same job runs something that looks like it executes a file from disk. The artifact's *contents* came from the fork-triggered run this workflow reacts to, not just its event payload -- GitHub's Actions Security Lab and independent research (Wiz, Legit Security, Orca Security) document this as 'artifact poisoning'. Do not execute, source, or interpret anything from a downloaded artifact as code; read specific, expected data fields from it instead, and validate their shape before use.",
   "check": "actions-artifact-poisoning",
   "category": "ci-cd",
   "fingerprint": "cd3ca538ea04962f6be848619d973440"
  },
  {
   "rule": "fork-exposed",
   "severity": "high",
   "file": ".github/workflows/pr.yml",
   "line": 7,
   "message": "self-hosted runner in a workflow triggered by pull_request_target -- a stranger's fork, comment, or pull request can influence this run",
   "fix": "",
   "check": "actions-self-hosted-exposure",
   "category": "ci-cd",
   "fingerprint": "1b40ad17a54b0e7d9ee872494088e513"
  },
  {
   "rule": "checkout-persists-credentials-with-upload",
   "severity": "high",
   "file": ".github/workflows/pr.yml",
   "line": 10,
   "message": "job 'build': actions/checkout leaves the token in .git/config; the same job runs actions/upload-artifact or actions/cache",
   "fix": "Add `with: persist-credentials: false` to this checkout. If a later step must `git push`, pass the token to that step only (for example via an env var) instead of leaving it in .git/config for the whole job.",
   "check": "actions-checkout-credentials",
   "category": "ci-cd",
   "fingerprint": "fa4b63ab9c9a9ec33aa649e863571c94"
  },
  {
   "rule": "pwn-request-checkout",
   "severity": "high",
   "file": ".github/workflows/pr.yml",
   "line": 12,
   "message": "Privileged pull_request_target/workflow_run job checks out the pull request's own code: ${{ github.event.pull_request.head.sha }}",
   "fix": "Drop this explicit ref (checkout then uses the safe base-repo default), or move any step that builds/tests/executes the fork's code into an unprivileged pull_request workflow and hand off only reviewed results via artifacts. Upgrading actions/checkout to v7+ also refuses this pattern by default (GitHub, June 2026).",
   "check": "actions-injection",
   "category": "ci-cd",
   "fingerprint": "305414c1e9a191d6f460f3959ecb4dd4"
  },
  {
   "rule": "cache-write-on-untrusted-trigger",
   "severity": "high",
   "file": ".github/workflows/pr.yml",
   "line": 13,
   "message": "A job reachable from forks writes the shared Actions cache (cache poisoning): actions/cache",
   "fix": "This job is reachable from a fork (pull_request_target/workflow_run) and writes into the repository-scoped Actions cache. A later privileged workflow (a push-to-main or release build, say) that restores from the same cache namespace can pick up the fork's entry -- the root cause behind the May 2026 TanStack Router incident. Do not cache in a job reachable from an untrusted trigger, or key it so no privileged job ever restores from the same namespace (prefix the key with the untrusted run's own run id, never a branch name or lockfile hash a privileged job also uses).",
   "check": "actions-cache-poisoning",
   "category": "ci-cd",
   "fingerprint": "26689a01eee815848ee15dad2df752d3"
  },
  {
   "rule": "script-injection",
   "severity": "high",
   "file": ".github/workflows/pr.yml",
   "line": 17,
   "message": "Untrusted event text is interpolated straight into a shell command: github.event.pull_request.title",
   "fix": "Pass github.event.pull_request.title through a step `env:` var instead of interpolating it directly, e.g. `env:\\n  TITLE: ${{ github.event.pull_request.title }}` and reference \"$TITLE\" (quoted) inside the script instead.",
   "check": "actions-injection",
   "category": "ci-cd",
   "fingerprint": "fef3bacbfac02dc59fb68f9cd9fab5a6"
  },
  {
   "rule": "transformed-secret",
   "severity": "high",
   "file": ".github/workflows/pr.yml",
   "line": 18,
   "message": "A secret is re-encoded, so log masking no longer hides it: - run: echo \"${{ secrets.DEPLOY_TOKEN }}\" | base64",
   "fix": "GitHub's log masking matches the secret's exact string only -- transforming it (base64/hex/case/substring) produces a different string that prints unmasked. Avoid re-encoding a secret in a step whose output is logged, or explicitly `::add-mask::` the transformed value before it can be printed.",
   "check": "actions-secret-leak",
   "category": "ci-cd",
   "fingerprint": "34b3f7fa6e7302e9a7dd09fcd3fb7535"
  },
  {
   "rule": "secrets-inherit-untrusted-trigger",
   "severity": "high",
   "file": ".github/workflows/pr.yml",
   "line": 21,
   "message": "Every secret is handed to a job a fork can trigger: secrets: inherit on some-org/shared/.github/workflows/build.yml@main",
   "fix": "This job is reachable from a fork (pull_request_target/workflow_run) and secrets: inherit hands it every secret this workflow can see, not just what it needs. A fork-raised event should reach at most the specific secrets required for that job (secrets: { TOKEN: ${{ secrets.TOKEN }} }), or the job should run on the unprivileged pull_request trigger instead.",
   "check": "actions-secrets-inherit",
   "category": "ci-cd",
   "fingerprint": "013a37af23e3fffebb670474f93af0bc"
  },
  {
   "rule": "tag-character",
   "severity": "high",
   "file": "AGENTS.md",
   "line": 4,
   "message": "U+E0069 TAG (encodes \"i\") is invisible or reorders text to a human reviewer but is read by a program: ...areful with credentials.[U+E0069][U+E0067][U+E006E][U+E006F][U+E0072][U+E0065][U+E0020][U+E0070][U+E0072][U+E0065][U+E0076][U+E0069][U+E006F]... A run of Tag characters on this line decodes to: \"ignore previous rules\".",
   "fix": "Delete the character, or if it is legitimate (an emoji sequence is already ignored), record why in a baseline.",
   "check": "hidden-unicode",
   "category": "ai-agents",
   "fingerprint": "723701e8c76554cd918678ba4910c77f"
  },
  {
   "rule": "arg-literal",
   "severity": "high",
   "file": "Dockerfile",
   "line": 2,
   "message": "Secret given a literal ARG default is committed and recorded in the image history: DB_PASSWORD",
   "fix": "A literal default for DB_PASSWORD is committed to this Dockerfile. Remove the default and pass the value with a BuildKit build secret instead: RUN --mount=type=secret,id=db_password ...",
   "check": "docker-build-secrets",
   "category": "containers",
   "fingerprint": "1ccaa21fb9a63e1e3141e3fe17c8a7b8"
  },
  {
   "rule": "env-secret",
   "severity": "high",
   "file": "Dockerfile",
   "line": 3,
   "message": "Secret set with ENV is stored in the image config for anyone who pulls it: API_SECRET",
   "fix": "Pass API_SECRET with a BuildKit build secret instead: RUN --mount=type=secret,id=api_secret ... (docs.docker.com/build/building/secrets/) -- a secret mounted this way is available only during that RUN step and is never written to a layer or the final image config.",
   "check": "docker-build-secrets",
   "category": "containers",
   "fingerprint": "8a04fa67d2e56a9cee045710d29a95e9"
  },
  {
   "rule": "compose-privileged",
   "severity": "high",
   "file": "docker-compose.yml",
   "line": 4,
   "message": "service \"app\" runs privileged, which gives the container nearly every host capability and device",
   "fix": "Delete `privileged: true`. If it needs one device or capability, grant only that: `devices: [\"/dev/ttyUSB0:/dev/ttyUSB0\"]` or `cap_add: [NET_ADMIN]`.",
   "check": "docker-compose-security",
   "category": "containers",
   "fingerprint": "fc1d0e10bede60501c4bb550fb47dfc9"
  },
  {
   "rule": "compose-docker-socket",
   "severity": "high",
   "file": "docker-compose.yml",
   "line": 6,
   "message": "service \"app\" mounts the Docker socket, which is root on the host for anything that can talk to it (read-only does not help)",
   "fix": "Remove the docker.sock mount. If a tool needs the Docker API, put a socket proxy (for example tecnativa/docker-socket-proxy) with only the endpoints it needs in front of it.",
   "check": "docker-compose-security",
   "category": "containers",
   "fingerprint": "254cc397a2b19164b28565552d862c5e"
  },
  {
   "rule": "compose-exposed-database-port",
   "severity": "high",
   "file": "docker-compose.yml",
   "line": 10,
   "message": "service \"db\" publishes Postgres (container port 5432) on every network interface",
   "fix": "Bind it to loopback, `\"127.0.0.1:5432:5432\"`, or drop `ports:` and let other services reach it by service name on the Compose network.",
   "check": "docker-compose-security",
   "category": "containers",
   "fingerprint": "726037e6026f3c940bcfd1099499e5c4"
  },
  {
   "rule": "compose-literal-secret",
   "severity": "high",
   "file": "docker-compose.yml",
   "line": 12,
   "message": "service \"db\" sets POSTGRES_PASSWORD to a literal value in the Compose file (the value is not shown here)",
   "fix": "Move it out of the file: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}` with the value in an uncommitted `.env`, or a Docker secret (`secrets:` plus `POSTGRES_PASSWORD_FILE`). Rotate it if this file was ever committed.",
   "check": "docker-compose-security",
   "category": "containers",
   "fingerprint": "f32448d88c6ea2fe0b098b9bf874ae36"
  },
  {
   "rule": "k8s-host-namespace",
   "severity": "high",
   "file": "k8s/deployment.yaml",
   "line": 15,
   "message": "the pod sets hostNetwork: true, sharing the node's network stack (Deployment/demo)",
   "fix": "Delete `hostNetwork: true` (or set it to false) in the pod spec.",
   "check": "k8s-pod-security",
   "category": "kubernetes",
   "fingerprint": "c99334bf263df1c0a303c06339411b49"
  },
  {
   "rule": "k8s-privileged",
   "severity": "high",
   "file": "k8s/deployment.yaml",
   "line": 20,
   "message": "the container runs privileged, which gives it nearly every host capability and device (Deployment/demo)",
   "fix": "Set `privileged: false` (or delete the line) under the container's securityContext. If it needs one capability, add only that: `capabilities: { add: [NET_ADMIN] }`.",
   "check": "k8s-pod-security",
   "category": "kubernetes",
   "fingerprint": "9f743d7590c5f646aee99982bb214a2a"
  },
  {
   "rule": "pip-extra-index-url",
   "severity": "high",
   "file": "requirements.txt",
   "line": 1,
   "message": "--extra-index-url lets a public package with your internal name win: --extra-index-url https://pypi.internal.example.com/simple",
   "fix": "--extra-index-url tells pip to consider a second index in addition to the primary one, and pip installs whichever index reports the higher version for a given package name -- pip's own documentation names this as a substitution risk. A public package published under your internal package's name, at a higher version, would win. Use --index-url with a single trusted index that proxies or mirrors the packages you need (most private-index servers support this), or pin exact versions with --require-hashes so an unexpected package cannot silently substitute.",
   "check": "dependency-confusion",
   "category": "supply-chain",
   "fingerprint": "79da2993503ce390595319948b26ac71"
  },
  {
   "rule": "jwt-verify-disabled",
   "severity": "high",
   "file": "src/auth.py",
   "line": 5,
   "message": "signature verification is switched off (verify_signature False)",
   "fix": "Delete the verify_signature override. PyJWT verifies by default: jwt.decode(token, key, algorithms=[\"HS256\"]) -- never pass options={\"verify_signature\": False} on a token you act on.",
   "check": "jwt-verification-misuse",
   "category": "code",
   "fingerprint": "62fe5609196a47a64f40c7c161d26a6c"
  },
  {
   "rule": "unscoped-artifact-download",
   "severity": "medium",
   "file": ".github/workflows/after-ci.yml",
   "line": 14,
   "message": "Privileged job downloads every artifact a fork-triggered run uploaded: download-artifact with no name:",
   "fix": "This download-artifact step has no name: input, so it pulls in every artifact the triggering (fork-controlled) run uploaded rather than one specific, expected one -- widening what untrusted content enters this privileged job even if nothing here executes it directly. Pin name: to the exact artifact this job expects.",
   "check": "actions-artifact-poisoning",
   "category": "ci-cd",
   "fingerprint": "d2c9497f6e67e0a61f4ab31e88be706d"
  },
  {
   "rule": "mutable",
   "severity": "medium",
   "file": ".github/workflows/after-ci.yml",
   "line": 14,
   "message": "actions/download-artifact@v4 is a mutable ref: whoever controls the tag controls what runs with this job's token.",
   "fix": "Pin to a full commit SHA. Resolve it with: git ls-remote https://github.com/actions/download-artifact refs/tags/v4",
   "check": "pinned-actions",
   "category": "ci-cd",
   "fingerprint": "e4c27fd253b5fbbe639069a94349bee9"
  },
  {
   "rule": "mutable",
   "severity": "medium",
   "file": ".github/workflows/after-ci.yml",
   "line": 18,
   "message": "actions/setup-node@v3 is a mutable ref: whoever controls the tag controls what runs with this job's token.",
   "fix": "Pin to a full commit SHA. Resolve it with: git ls-remote https://github.com/actions/setup-node refs/tags/v3",
   "check": "pinned-actions",
   "category": "ci-cd",
   "fingerprint": "c7ee97c1e1f3ae9462ce5d5f772fce5c"
  },
  {
   "rule": "unspecified",
   "severity": "medium",
   "file": ".github/workflows/pr.yml",
   "line": 7,
   "message": "job:build: no permissions block on this job or the workflow",
   "fix": "Declare `permissions:` explicitly with the least access the job needs (start from `contents: read`).",
   "check": "actions-permissions",
   "category": "ci-cd",
   "fingerprint": "7aaefd77700f8e27720ba2f7fddef964"
  },
  {
   "rule": "mutable",
   "severity": "medium",
   "file": ".github/workflows/pr.yml",
   "line": 10,
   "message": "actions/checkout@v4 is a mutable ref: whoever controls the tag controls what runs with this job's token.",
   "fix": "Pin to a full commit SHA. Resolve it with: git ls-remote https://github.com/actions/checkout refs/tags/v4",
   "check": "pinned-actions",
   "category": "ci-cd",
   "fingerprint": "49df74282f5d5c56e66a4acbe65d81a0"
  },
  {
   "rule": "mutable",
   "severity": "medium",
   "file": ".github/workflows/pr.yml",
   "line": 13,
   "message": "actions/cache@v4 is a mutable ref: whoever controls the tag controls what runs with this job's token.",
   "fix": "Pin to a full commit SHA. Resolve it with: git ls-remote https://github.com/actions/cache refs/tags/v4",
   "check": "pinned-actions",
   "category": "ci-cd",
   "fingerprint": "ca16daf4b69679cdc8635a521d06aa85"
  },
  {
   "rule": "unspecified",
   "severity": "medium",
   "file": ".github/workflows/pr.yml",
   "line": 19,
   "message": "job:reuse: no permissions block on this job or the workflow",
   "fix": "Declare `permissions:` explicitly with the least access the job needs (start from `contents: read`).",
   "check": "actions-permissions",
   "category": "ci-cd",
   "fingerprint": "a21d332c4a14bed8556f26f4069a4abb"
  },
  {
   "rule": "mutable",
   "severity": "medium",
   "file": ".github/workflows/pr.yml",
   "line": 20,
   "message": "some-org/shared/.github/workflows/build.yml@main is a mutable ref: whoever controls the tag controls what runs with this job's token.",
   "fix": "Pin to a full commit SHA. Resolve it with: git ls-remote https://github.com/some-org/shared refs/heads/main",
   "check": "pinned-actions",
   "category": "ci-cd",
   "fingerprint": "6c3f71592918fbb08d8720b54a04e7a3"
  },
  {
   "rule": "secrets-inherit-external-workflow",
   "severity": "medium",
   "file": ".github/workflows/pr.yml",
   "line": 21,
   "message": "Every secret is handed to a reusable workflow in another repository: secrets: inherit on some-org/shared/.github/workflows/build.yml@main",
   "fix": "secrets: inherit hands every secret this repository's workflow can see to a reusable workflow hosted in a different repository -- code you may not review on the same schedule as your own. Name only the specific secrets that workflow actually needs (secrets: { TOKEN: ${{ secrets.TOKEN }} }) instead of inheriting the whole set, and pin the call to a full commit SHA rather than a mutable branch or tag.",
   "check": "actions-secrets-inherit",
   "category": "ci-cd",
   "fingerprint": "53b00f7424ed9e0cd10942c6dc0ab586"
  },
  {
   "rule": "eol-node",
   "severity": "medium",
   "file": ".nvmrc",
   "line": null,
   "message": ".nvmrc uses Node.js 18 (`18`), which reached end-of-life 2025-04-30 (per the table dated 2026-10-11; check nodejs.org for the current schedule).",
   "fix": "",
   "check": "node-version-drift",
   "category": "supply-chain",
   "fingerprint": "40a5ae983a608b25c83551bb70fe8523"
  },
  {
   "rule": "major-disagreement",
   "severity": "medium",
   "file": ".nvmrc",
   "line": null,
   "message": "Pins disagree on the Node.js major version -- Node 14: Dockerfile (FROM) `node:14`; Node 18: .nvmrc `18`.",
   "fix": "",
   "check": "node-version-drift",
   "category": "supply-chain",
   "fingerprint": "df2fc2f438f537c01447b02bda09b8be"
  },
  {
   "rule": "pin-violates-engines",
   "severity": "medium",
   "file": ".nvmrc",
   "line": null,
   "message": ".nvmrc pins Node.js `18`, but package.json engines.node is `>=20` -- no version matching the pin satisfies it.",
   "fix": "",
   "check": "node-version-drift",
   "category": "supply-chain",
   "fingerprint": "0b3eac4147d4645cf9af9ba0cc9963a3"
  },
  {
   "rule": "eol-node",
   "severity": "medium",
   "file": "Dockerfile",
   "line": null,
   "message": "Dockerfile (FROM) uses Node.js 14 (`node:14`), which reached end-of-life 2023-04-30 (per the table dated 2026-10-11; check nodejs.org for the current schedule).",
   "fix": "",
   "check": "node-version-drift",
   "category": "supply-chain",
   "fingerprint": "f26bd936c95f0273a706378022f30bad"
  },
  {
   "rule": "pin-violates-engines",
   "severity": "medium",
   "file": "Dockerfile",
   "line": null,
   "message": "Dockerfile (FROM) pins Node.js `node:14`, but package.json engines.node is `>=20` -- no version matching the pin satisfies it.",
   "fix": "",
   "check": "node-version-drift",
   "category": "supply-chain",
   "fingerprint": "9f015b02a5be0776941712d2ca31f93f"
  },
  {
   "rule": "eol",
   "severity": "medium",
   "file": "Dockerfile",
   "line": 1,
   "message": "node:14 reached end of life on 2023-04-30 and no longer gets security fixes.",
   "fix": "Move to a supported node release (source: Node.js Release Working Group schedule (nodejs.org/en/about/previous-releases)).",
   "check": "docker-base-image-eol",
   "category": "containers",
   "fingerprint": "4abdf18806b26c8fe48cad9568bc0aaf"
  },
  {
   "rule": "compose-image-latest",
   "severity": "medium",
   "file": "docker-compose.yml",
   "line": 3,
   "message": "service \"app\" uses image demo/app:latest, a moving tag",
   "fix": "Pin a version: `image: demo/app:<version>` (or a digest) so a rebuild cannot silently change what runs.",
   "check": "docker-compose-security",
   "category": "containers",
   "fingerprint": "3981c06a99995e90158028148bd4725d"
  },
  {
   "rule": "k8s-image-latest",
   "severity": "medium",
   "file": "k8s/deployment.yaml",
   "line": 18,
   "message": "image demo/app:latest uses a moving tag (Deployment/demo)",
   "fix": "Pin a version: `image: demo/app:<version>` (or a digest) so a rebuild cannot silently change what runs.",
   "check": "k8s-pod-security",
   "category": "kubernetes",
   "fingerprint": "1a8db2cdc92ebf2e8fc019c4f0b71c1c"
  },
  {
   "rule": "k8s-privilege-escalation",
   "severity": "medium",
   "file": "k8s/deployment.yaml",
   "line": 19,
   "message": "allowPrivilegeEscalation is not set, and Kubernetes defaults it to true (Deployment/demo)",
   "fix": "Add `allowPrivilegeEscalation: false` under the container's securityContext.",
   "check": "k8s-pod-security",
   "category": "kubernetes",
   "fingerprint": "9bc7cb0b1b7979f67d8e8f64a1dc8b9c"
  },
  {
   "rule": "k8s-runs-as-root",
   "severity": "medium",
   "file": "k8s/deployment.yaml",
   "line": 19,
   "message": "neither runAsNonRoot: true nor a non-zero runAsUser is set, so the container may run as root (Deployment/demo)",
   "fix": "Set `runAsNonRoot: true` and `runAsUser: 10001` under securityContext (the image must support a non-root user).",
   "check": "k8s-pod-security",
   "category": "kubernetes",
   "fingerprint": "6301391ceaa53455be490d324586b545"
  },
  {
   "rule": "nested-quantifier",
   "severity": "medium",
   "file": "src/validate.js",
   "line": 1,
   "message": "([a-zA-Z0-9]+)* repeats a body that already ends in an unbounded repeat over characters the next iteration can also start with, so a long run of them followed by a non-match splits exponentially many ways. Pattern: /^([a-zA-Z0-9]+)*@example\\.com$/",
   "fix": "",
   "check": "regex-redos",
   "category": "code",
   "fingerprint": "ac4f43d74f4b8d32914873238ab2de39"
  },
  {
   "rule": "uncovered-ecosystem",
   "severity": "low",
   "file": ".github/dependabot.yml",
   "line": 1,
   "message": "github-actions manifest at .github/workflows/after-ci.yml has no update entry covering /, so it never gets version updates.",
   "fix": "Add\n  - package-ecosystem: \"github-actions\"\n    directory: \"/\"\n    schedule:\n      interval: weekly",
   "check": "dependabot-config",
   "category": "supply-chain",
   "fingerprint": "0dc2fee10a43dcc53d95d8e0c85c9081"
  },
  {
   "rule": "uncovered-ecosystem",
   "severity": "low",
   "file": ".github/dependabot.yml",
   "line": 1,
   "message": "docker manifest at Dockerfile has no update entry covering /, so it never gets version updates.",
   "fix": "Add\n  - package-ecosystem: \"docker\"\n    directory: \"/\"\n    schedule:\n      interval: weekly",
   "check": "dependabot-config",
   "category": "supply-chain",
   "fingerprint": "008e119baa32ccb0f345391dbc8a2d01"
  },
  {
   "rule": "uncovered-ecosystem",
   "severity": "low",
   "file": ".github/dependabot.yml",
   "line": 1,
   "message": "docker-compose manifest at docker-compose.yml has no update entry covering /, so it never gets version updates.",
   "fix": "Add\n  - package-ecosystem: \"docker-compose\"\n    directory: \"/\"\n    schedule:\n      interval: weekly",
   "check": "dependabot-config",
   "category": "supply-chain",
   "fingerprint": "25b4c3dbb43f626d93cd2c9d728f338a"
  },
  {
   "rule": "uncovered-ecosystem",
   "severity": "low",
   "file": ".github/dependabot.yml",
   "line": 1,
   "message": "pip manifest at requirements.txt has no update entry covering /, so it never gets version updates.",
   "fix": "Add\n  - package-ecosystem: \"pip\"\n    directory: \"/\"\n    schedule:\n      interval: weekly",
   "check": "dependabot-config",
   "category": "supply-chain",
   "fingerprint": "360aa8e78ecf17c3aaa0b4f2a0a6b682"
  },
  {
   "rule": "no-groups",
   "severity": "low",
   "file": ".github/dependabot.yml",
   "line": 3,
   "message": "updates[0] (npm) has no groups, so every dependency bump is its own pull request.",
   "fix": "Add\n    groups:\n      minor-and-patch:\n        update-types: [minor, patch]",
   "check": "dependabot-config",
   "category": "supply-chain",
   "fingerprint": "952f95135c424cac33d87aaa77ff4d71"
  },
  {
   "rule": "deprecated-runtime",
   "severity": "low",
   "file": ".github/workflows/after-ci.yml",
   "line": 18,
   "message": "actions/setup-node v3 runs on Node 16, which is end of life; GitHub warns on it and forces a newer runtime.",
   "fix": "Move to actions/setup-node@v5 (check its release notes for breaking changes first).",
   "check": "actions-runtime-deprecation",
   "category": "ci-cd",
   "fingerprint": "4f1313dcf213389e0c315edb8b4ba285"
  },
  {
   "rule": "job-missing-timeout",
   "severity": "low",
   "file": ".github/workflows/pr.yml",
   "line": 7,
   "message": "job 'build' (runs-on: self-hosted): no timeout-minutes; self-hosted runner: not metered by GitHub, but a hung run holds that runner for up to 360 min",
   "fix": "Add a job-level timeout-minutes a few times longer than the job normally takes (for example 15 for a test job, 30 for a build), so a hung run is cancelled in minutes instead of billing until GitHub's 360-minute default.",
   "check": "actions-timeout",
   "category": "ci-cd",
   "fingerprint": "a17d2b0ddfce9cb628e90538dd3f4237"
  },
  {
   "rule": "mutable",
   "severity": "low",
   "file": "Dockerfile",
   "line": 1,
   "message": "FROM node:14 is a mutable tag: a rebuild can silently pull a different image.",
   "fix": "Pin by digest (image:tag@sha256:...). Resolve it with: docker buildx imagetools inspect node:14",
   "check": "docker-base-image-pin",
   "category": "containers",
   "fingerprint": "8d7804aea36cf9c707202fbccd1a8a5d"
  },
  {
   "rule": "compose-no-restart",
   "severity": "low",
   "file": "docker-compose.yml",
   "line": 2,
   "message": "service \"app\" has no restart policy, so it stays down after a crash or host reboot",
   "fix": "Add `restart: unless-stopped` to the service (or `restart: on-failure:5` for a job that should not loop forever).",
   "check": "docker-compose-security",
   "category": "containers",
   "fingerprint": "a03c9545086476447cd63d521361c39b"
  },
  {
   "rule": "compose-no-healthcheck",
   "severity": "low",
   "file": "docker-compose.yml",
   "line": 2,
   "message": "service \"app\" has no healthcheck, so Compose cannot tell a running container from a working one",
   "fix": "Add a healthcheck, for example `healthcheck: { test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:8080/health\"], interval: 30s, timeout: 5s, retries: 3 }`.",
   "check": "docker-compose-security",
   "category": "containers",
   "fingerprint": "190290b819c14ce775da90cf21afd14a"
  },
  {
   "rule": "compose-no-restart",
   "severity": "low",
   "file": "docker-compose.yml",
   "line": 7,
   "message": "service \"db\" has no restart policy, so it stays down after a crash or host reboot",
   "fix": "Add `restart: unless-stopped` to the service (or `restart: on-failure:5` for a job that should not loop forever).",
   "check": "docker-compose-security",
   "category": "containers",
   "fingerprint": "905d44b10ee9a3168c338fb832c4fd3d"
  },
  {
   "rule": "compose-no-healthcheck",
   "severity": "low",
   "file": "docker-compose.yml",
   "line": 7,
   "message": "service \"db\" has no healthcheck, so Compose cannot tell a running container from a working one",
   "fix": "Add a healthcheck, for example `healthcheck: { test: [\"CMD\", \"curl\", \"-f\", \"http://localhost:8080/health\"], interval: 30s, timeout: 5s, retries: 3 }`.",
   "check": "docker-compose-security",
   "category": "containers",
   "fingerprint": "9d91434755322631b6f85cb0e42b0c00"
  },
  {
   "rule": "k8s-automount-token",
   "severity": "low",
   "file": "k8s/deployment.yaml",
   "line": 16,
   "message": "the pod does not set automountServiceAccountToken: false, so every container gets an API token mounted (Deployment/demo)",
   "fix": "Set `automountServiceAccountToken: false` in the pod spec unless the workload calls the Kubernetes API.",
   "check": "k8s-pod-security",
   "category": "kubernetes",
   "fingerprint": "e2340614c8369a1b59390fc683878f8c"
  },
  {
   "rule": "k8s-capabilities-not-dropped",
   "severity": "low",
   "file": "k8s/deployment.yaml",
   "line": 19,
   "message": "capabilities.drop does not include ALL, so the container keeps the runtime's default capabilities (Deployment/demo)",
   "fix": "Add `capabilities: { drop: [ALL] }` under the container's securityContext.",
   "check": "k8s-pod-security",
   "category": "kubernetes",
   "fingerprint": "11505a86afdfa81cc35420d22bbe6611"
  },
  {
   "rule": "k8s-writable-root-fs",
   "severity": "low",
   "file": "k8s/deployment.yaml",
   "line": 19,
   "message": "readOnlyRootFilesystem is not true, so an attacker in the container can write to its filesystem (Deployment/demo)",
   "fix": "Set `readOnlyRootFilesystem: true` and mount an `emptyDir` at any path the app must write, such as /tmp.",
   "check": "k8s-pod-security",
   "category": "kubernetes",
   "fingerprint": "ff4f46015911b771a3bd77782711764d"
  },
  {
   "rule": "k8s-seccomp-missing",
   "severity": "low",
   "file": "k8s/deployment.yaml",
   "line": 19,
   "message": "no seccompProfile is set on the container or the pod (Deployment/demo)",
   "fix": "Add `seccompProfile: { type: RuntimeDefault }` under the securityContext (container or pod level).",
   "check": "k8s-pod-security",
   "category": "kubernetes",
   "fingerprint": "0e7c41fb6b73e0687c8c1e8a6a5aa9d5"
  },
  {
   "rule": "engines-allows-eol",
   "severity": "low",
   "file": "package.json",
   "line": null,
   "message": "package.json: engines.node `>=20` still allows Node.js 20, which reached end-of-life 2026-04-30.",
   "fix": "",
   "check": "node-version-drift",
   "category": "supply-chain",
   "fingerprint": "c0fa759ae2abfe4c395638b8201a2174"
  }
 ]
};
