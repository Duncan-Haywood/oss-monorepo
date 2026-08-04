# Image the agent runner executes each headless CLI invocation inside,
# when use_docker_sandbox: true. Gives real OS-level isolation uniformly
# across all four tools — including the two (Antigravity, opencode) whose
# own sandbox flags are less battle-tested than Claude Code's/Codex's.
#
# UNTESTED: built from the same install commands used on the host
# (roles/agent_clis, roles/agent_runner), but never actually built or run
# — there's no box to build it on yet. Treat this as a starting point to
# debug against, not a working artifact.
#
# Runs as root inside the container. That's an acceptable tradeoff here —
# the container itself (--rm, no persistent volumes beyond the workspace
# and read-only credential mounts, no network beyond what the tool needs)
# is the isolation boundary, not the in-container user — but it's a
# reasonable hardening target later if you want to go further.

FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates gnupg python3 \
    && rm -rf /var/lib/apt/lists/*

# gh CLI — same repo/key as roles/agent_runner/tasks/main.yml, duplicated
# here deliberately: this is a separate build environment (container image
# vs. host), not the same install run twice.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g \
      @anthropic-ai/claude-code@latest \
      @openai/codex@latest \
      opencode-ai@latest

# Antigravity CLI — see roles/agent_runner/files/runners/antigravity.sh for
# the same "lower confidence than the other three" caveat; that applies
# doubly here since the install script's behavior inside a minimal
# container (vs. the interactive host environment it presumably expects)
# is unverified.
RUN curl -fsSL https://antigravity.google/cli/install.sh | bash || true

ENV PATH="/root/.npm-global/bin:/root/.local/bin:/root/bin:${PATH}"

# roles/docker/tasks/main.yml syncs the same runner scripts the host uses
# (roles/agent_runner/files/runners/) into this build context's runners/
# subdir before building — one source of truth, not a duplicate baked
# straight into the image from a different path.
COPY runners /runners
RUN chmod +x /runners/*.sh

WORKDIR /workspace

ENTRYPOINT []
