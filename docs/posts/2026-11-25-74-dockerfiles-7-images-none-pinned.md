---
title: "74 Dockerfiles, 7 base images, none pinned: what scanning our container images found"
seo_title: "Scanning Dockerfile base images with Trivy: digest pinning and fixable CVEs"
date: 2026-11-25
tags: [security, containers, trivy, ci, supply-chain]
description: "Our new image scan read 74 Dockerfiles and Compose files: 7 base images, none pinned by digest, and 101 fixable high or critical CVEs, 70 in one stale nginx tag."
---

This repository's pull requests now pass through a security scan: secrets, code, dependencies, infrastructure as code and workflows. Today it gained one more piece: the container base images that our Dockerfiles and Compose files pull.

The new `trivy-image` scanner does two things. It reads every `FROM` line and Compose `image:` entry, and it flags any image that is not pinned by digest (`@sha256:...`). A tag like `node:22-alpine` can be pointed at different contents tomorrow, so a build that looked safe when reviewed may not be the build that ships. Then it asks Trivy for the high and critical vulnerabilities in each image that already have a fix.

## The first reading

Across the whole tree:

- **74 files name only 7 distinct images.** `node:22-alpine` appears in 41 of them and `nginx:1.27-alpine` in 28. The other five each appear once or twice.
- **None of them is pinned by digest.** Every reference is a tag.
- **101 fixable high or critical vulnerabilities, 64 distinct CVEs, in 5 of the 7 images.** 3 are critical.
- **One stale tag accounts for most of it.** `nginx:1.27-alpine` carries 70 of the 101, mostly in libexpat, OpenSSL's libraries, libpng, libxml2 and curl. Each `node:22-*` image carries 10, all in packages npm bundles.

The concentration is the useful part. There aren't 101 problems to work through. One base image used by 28 product Dockerfiles needs moving to a current release, pinned by digest. That clears 70 of the findings.

## How it gates without blocking everyone

The scan compares each pull request's head with its merge base and counts only what the PR adds. A PR that touches a Dockerfile but keeps `nginx:1.27-alpine` is not blocked by that image's 70 old advisories. Those belong in a cleanup, not in someone else's unrelated change. A PR that switches to an image with a new fixable high or critical CVE is blocked. A missing digest is reported but doesn't block.

One design choice came from a bug. If an image cannot be fetched, the scanner records an `image-not-scanned` finding instead of failing quietly or reporting nothing. A locally built name like `demo/app:latest` can't be pulled from a registry. In an earlier draft, a single such image stopped the whole scan. Reporting it means one unscannable image neither hides the others nor reads as a clean result.

The scanner isn't a required check, because it pulls from public registries. A Docker Hub outage shouldn't stop all development. Everything else about it follows the rest of the scan: the Trivy binary is built from source pinned by checksum, and its findings land in the same JSON file as every other scanner's.
