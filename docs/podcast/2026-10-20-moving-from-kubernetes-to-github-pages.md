---
title: "Moving off a Kubernetes cluster to GitHub Pages"
date: 2026-10-20
description: "Why a repository of free tools retired its two-server k3s cluster and now serves everything from a gh-pages branch, and the traps along the way."
post: moving-from-kubernetes-to-github-pages
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

This repository publishes free browser tools, built mostly by AI coding agents with an owner steering a few hours a week. For about a month in late summer, the catalogue had two homes. One was GitHub Pages. The other was a small, self-hosted Kubernetes cluster, running the lightweight distribution called k three s, on two rented servers. On the first of October, the owner deleted the servers. GitHub Pages, published from a branch called g h pages, is now the only host. This episode is the record of why.

On the twenty-fifth of August, the hosting decision was simple. Browser calculators and landing pages go on GitHub Pages, which costs nothing and leaves no server to patch. Anything that needs a running process would go on a rented server.

But Pages was not one switch away. It was not enabled yet. The repository was private at the time, and on the free plan, Pages does not serve a public site from a private repository. And the workflow that builds the Pages site needs a GitHub Actions runner, which the account had run out of.

So on the twenty-ninth of August, the whole site also went onto the cluster. The design was one cluster on two machines. A control plane node with twelve virtual processors and twenty-four gigabytes of memory, and a smaller node with two processors and four gigabytes, reserved for agent jobs. A tool called Argo C D kept the cluster in sync with the main branch. By the second and third of September, the domain's front page and one hundred and seventy-four tools were being served from a copy of the build committed into the repository.

Then, on the fourth of September, the cluster's Kubernetes interface stopped answering. The same evening, the Actions runners ran out again. The ledger explains why that was worse than two separate outages. Pages through the Actions workflow needed a runner. The fallback for missing runners was a set of self-hosted runners, and they ran as pods inside the cluster. And repairing the cluster needed remote access, plus a runner to start the repair. The insurance against metered C I lived inside the thing whose repair needed C I. On the sixth of September, the owner's own browser confirmed that the domain refused connections.

The way out was a fourth route, a script called publish branch. It depends on neither a runner nor the cluster. It builds the site inside the agent's session and force-pushes it to the g h pages branch. GitHub's own managed Pages builder serves that branch. The owner's one action was to choose deploy from a branch in the Pages settings, and that was granted on the sixth of September.

The trade-off is that a committed snapshot does not rebuild itself. After a change to a served page lands, a session re-runs the publish script. For static calculators that run in the browser, a stale copy still computes the same answers, so the cost is low.

On the first of October, the owner deleted both servers, the cluster, Argo C D, and the self-hosted runner host. The standing rule is not to connect to their old addresses at all, because a released address can be handed to a stranger. Repointing the domain to Pages is an open owner action. Anything that needs a server process now needs a new hosting decision from the owner.

There were traps along the way. The first was a force-push that deletes the custom domain. When an owner sets a custom domain for Pages, GitHub writes a small file naming that domain to the serving branch, and reads the domain back from it. A publisher that force-pushes a freshly built branch deletes that file, and GitHub treats its absence as the domain being removed. The script was fixed on the sixth of September to carry the file forward, and an explicit empty setting is now the only way to remove a domain.

The second trap was a probe that inverted the truth. On the tenth of September, a session tested the servers' ports from its sandbox. The web ports looked open, which reads like a cluster serving again. It was actually the agents' own outbound proxy answering. A sandbox could measure nothing about those servers, and the reading that looked like recovery was the one to distrust most.

The rule now is to prefer a reading over prose, and a tool called pages state takes one. Its reading for this episode, on the twentieth of October, says the repository is public, Pages is configured to serve from a branch, and GitHub's managed builder deployed it successfully at eleven minutes past two that morning, universal time. It also says the snapshot is stale, with twelve changed files on main since it was published. And because the site is served from a subfolder, crawlers never read its robots file, so its sitemap is not discovered automatically. That is an owner fix. One honest caveat: no agent session can load the public site directly, because the outbound proxy refuses it.

One cost outlived the cluster. On the sixteenth of October, the repository found that eighty-four percent of recent pull requests touched the committed copy of the site made for the cluster, an origin that no longer exists. Removing that step is the owner's call.

The lessons. For static tools, a published branch is the route with the fewest moving parts. Do not put your C I fallback inside the infrastructure it is meant to rescue. If you force-push a generated branch, know which files GitHub writes to it. And retire infrastructure explicitly, including what it leaves in the repository. This is one repository's experience, not professional infrastructure advice.

The written version is on the site's Writing page, with the links and sources.
