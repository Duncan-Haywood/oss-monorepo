// A build-time `ARG` that no build supplies is an empty string, silently.
//
// `ventures/print-atelier/Dockerfile` declares `ARG NEXT_PUBLIC_SITE_URL` and
// re-exports it as `ENV`, because Next.js substitutes `NEXT_PUBLIC_*` while the
// image is being built — no Deployment env entry can reach it afterwards.
// `.gitea/workflows/print-atelier-image.yml` then ran, in the step named "Build
// the exact deployable image":
//
//     docker build --file Dockerfile --tag "$IMAGE" .
//
// with no `--build-arg`. So the exact deployable image carried an empty origin.
//
// That is worse than it sounds, because `src/lib/site-url.ts` fails *closed* on
// an unset value — deliberately and correctly, after the fallback was found to
// be `https://printatelier.com`, a domain resolving to registrar parking. But a
// fail-closed default whose supply side was never built is just closed: robots
// answers `Disallow: /`, the sitemap is empty, and the Meta/Google/Pinterest
// merchant feed refuses to generate. The pod passes its probes, ArgoCD reports
// healthy, and the storefront is invisible to every crawler and every ad
// channel. Fixing the far side of a guard without building its supply side
// converts "wrong" into "never", which this repository has done before.
//
// This control binds three things that were previously independent:
//
//   1. every build-time `ARG` a venture Dockerfile declares must be supplied by
//      the workflow that builds that venture's image;
//   2. the supplied origin must equal the host the venture's Ingress declares —
//      an image built for an address the cluster does not route is the same
//      defect with a plausible value in it;
//   3. the scan must find the Dockerfiles and workflows it thinks it does, so a
//      rename cannot quietly turn this file into an assertion about nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

function tracked(...patterns) {
  return execFileSync("git", ["ls-files", "--", ...patterns], {
    cwd: REPO,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

const read = (relative) => readFileSync(join(REPO, relative), "utf8");

/**
 * Ventures whose image a workflow builds, paired with that workflow.
 *
 * Derived rather than listed: a hardcoded pairing is how a control comes to
 * police every venture except the one that was added last.
 */
function imageBuilds() {
  const workflows = tracked(".gitea/workflows/*.yml", ".gitea/workflows/*.yaml");
  const builds = [];
  for (const workflow of workflows) {
    const body = read(workflow);
    if (!/docker\s+build\b/.test(body)) continue;
    for (const dockerfile of tracked("ventures/*/Dockerfile")) {
      const venture = dockerfile.split("/")[1];
      // The workflow builds this venture if it changes into its directory.
      if (new RegExp(`ventures/${venture}(\\s|$|["'])`, "m").test(body)) {
        builds.push({ venture, dockerfile, workflow });
      }
    }
  }
  return builds;
}

/** `ARG NAME` lines that the Dockerfile then promotes to `ENV`. */
function buildTimeArgs(dockerfile) {
  const body = read(dockerfile);
  const args = [...body.matchAll(/^ARG\s+([A-Z0-9_]+)/gm)].map((m) => m[1]);
  return args.filter((name) =>
    new RegExp(`^ENV\\s+${name}=\\$\\{?${name}\\}?`, "m").test(body),
  );
}

test("the scan finds the Dockerfiles and image workflows it asserts over", () => {
  const builds = imageBuilds();
  assert.ok(
    builds.length > 0,
    "No venture Dockerfile was matched to a workflow that runs `docker build`. " +
      "Either the workflows moved or the pairing heuristic broke — as written " +
      "this file would then assert nothing at all.",
  );
  assert.ok(
    builds.some((b) => b.venture === "print-atelier"),
    "print-atelier's image build was not found. It is the build this control " +
      "was written for; if its workflow was renamed, point this at the new one.",
  );
});

test("every build-time ARG is supplied by the workflow that builds the image", () => {
  for (const { venture, dockerfile, workflow } of imageBuilds()) {
    const args = buildTimeArgs(dockerfile);
    if (args.length === 0) continue;
    const body = read(workflow);
    for (const name of args) {
      assert.match(
        body,
        new RegExp(`--build-arg\\s+${name}=`),
        `${dockerfile} declares \`ARG ${name}\` and promotes it to ENV, so it is ` +
          `substituted while the image is built and nothing at runtime can set ` +
          `it. ${workflow} runs \`docker build\` without \`--build-arg ${name}=\`, ` +
          `so ${venture}'s deployable image carries an empty ${name}. Supply it ` +
          `in the build step, or stop declaring the ARG.`,
      );
    }
  }
});

test("the origin built into the image is the host the Ingress routes", () => {
  for (const { venture, workflow } of imageBuilds()) {
    const body = read(workflow);
    const supplied = body.match(/--build-arg\s+NEXT_PUBLIC_SITE_URL=(\S+)/);
    if (!supplied) continue;

    const ingressFiles = tracked(`platform/k8s/apps/${venture}/ingress.yaml`);
    assert.equal(
      ingressFiles.length,
      1,
      `${workflow} builds ${venture} with an origin, but ` +
        `platform/k8s/apps/${venture}/ingress.yaml does not exist — there is ` +
        "nothing to check the origin against.",
    );

    const hosts = [...read(ingressFiles[0]).matchAll(/^\s*-?\s*host:\s*(\S+)/gm)].map(
      (m) => m[1],
    );
    assert.ok(hosts.length > 0, `${ingressFiles[0]} declares no host:`);

    const built = supplied[1].replace(/^https?:\/\//, "").replace(/\/$/, "");
    assert.ok(
      hosts.includes(built),
      `${workflow} bakes ${supplied[1]} into ${venture}'s image, but the Ingress ` +
        `routes ${hosts.join(", ")}. Next.js substitutes this at build time, so ` +
        "the image would advertise — in its sitemap, its robots.txt and its " +
        "merchant product feed — an address the cluster does not serve.",
    );
  }
});
