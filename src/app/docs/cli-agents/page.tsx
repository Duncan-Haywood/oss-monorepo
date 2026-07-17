import { DocLink, DocPage } from "@/components/docs/doc-page";

export default function CliAgentsDocPage() {
  return (
    <DocPage
      title="CLI scheduled agents"
      subtitle="GitHub Actions that run Codex, Gemini, OpenCode, Grok Build, Cursor Agent, and Claude Code once per hour, staggered"
      related={[
        { href: "/docs/process", label: "Process log" },
        { href: "/docs/architecture", label: "Architecture" },
        { href: "/docs/launch-checklist", label: "Launch checklist" },
      ]}
    >
      <p>
        Six scheduled workflows under <code>.github/workflows/</code> run autonomous CLI
        agents against this repo once per hour. Crons are staggered by 10 minutes so the
        CLIs do not all claim the same <code>NEXT_STEPS</code> item in the same second.
        Each workflow executes both <code>.github/prompts/dev-work.md</code> and{" "}
        <code>.github/prompts/continuous-work.md</code>, which point agents at{" "}
        <code>src/lib/process/prompt_process.tsx</code> (<code>AGENT_PROTOCOL</code> +{" "}
        <code>NEXT_STEPS</code>).
      </p>

      <p>
        Every workflow authenticates via a subscription OAuth login, not a metered
        pay-per-token API key. None of them fall back to an API key on OAuth
        failure — a missing or expired subscription credential fails the job loudly
        instead of silently billing metered usage.
      </p>

      <h2>Workflows</h2>
      <table>
        <thead>
          <tr>
            <th>Workflow</th>
            <th>CLI</th>
            <th>Model</th>
            <th>Auth</th>
            <th>Cron (UTC)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>codex-scheduled.yml</code>
            </td>
            <td>Codex CLI</td>
            <td>
              <code>gpt-5.6-luna</code>
            </td>
            <td>ChatGPT OAuth</td>
            <td>
              <code>0 * * * *</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>gemini-scheduled.yml</code>
            </td>
            <td>
              Antigravity CLI (<code>agy</code>)
            </td>
            <td>CLI default</td>
            <td>Google subscription OAuth</td>
            <td>
              <code>10 * * * *</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>opencode-scheduled.yml</code>
            </td>
            <td>OpenCode CLI</td>
            <td>
              <code>github-copilot/gpt-5.5</code> (overrideable)
            </td>
            <td>GitHub Copilot subscription OAuth</td>
            <td>
              <code>20 * * * *</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>grok-scheduled.yml</code>
            </td>
            <td>Grok Build CLI</td>
            <td>subscription default</td>
            <td>SuperGrok / X Premium+ OAuth</td>
            <td>
              <code>30 * * * *</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>cursor-scheduled.yml</code>
            </td>
            <td>Cursor Agent CLI</td>
            <td>CLI default (overrideable)</td>
            <td>Cursor subscription OAuth cli-config</td>
            <td>
              <code>40 * * * *</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>claude-scheduled.yml</code>
            </td>
            <td>Claude Code CLI</td>
            <td>CLI default (overrideable)</td>
            <td>Claude.ai subscription OAuth token</td>
            <td>
              <code>50 * * * *</code>
            </td>
          </tr>
        </tbody>
      </table>

      <p>
        Each prompt matrix cell also has a concurrency group so overlapping runs of the
        same agent+prompt queue instead of canceling mid-flight. A separate manual
        workflow, <code>cursor-agent-grok.yml</code>, runs Cursor Agent pinned to{" "}
        <code>cursor-grok-4.5-high</code> via <code>workflow_dispatch</code> only, using the
        same <code>CURSOR_CLI_CONFIG</code> subscription OAuth as{" "}
        <code>cursor-scheduled.yml</code>.
      </p>

      <p>
        <strong>Gemini / Antigravity note:</strong> Google discontinued individual OAuth
        for the old Gemini CLI (Gemini Code Assist for individuals) on 2026-06-18 in
        favor of the Antigravity CLI. The Antigravity project also has an open upstream
        bug where file-based OAuth token restore in a fresh headless Linux container can
        be write-only (<code>google-antigravity/antigravity-cli#479</code>) — if this
        workflow starts failing auth right after a cache reset, re-run{" "}
        <code>agy auth login</code> locally and reseed <code>ANTIGRAVITY_OAUTH_TOKEN</code>{" "}
        rather than adding an API key.
      </p>

      <p>
        <strong>OpenCode note:</strong> OpenCode&apos;s own <code>opencode/*</code> models
        run through its Zen gateway, which bills prepaid metered credits — not a
        subscription — and Anthropic no longer permits routing a Claude Pro/Max
        subscription through third-party OAuth. The scheduled workflow instead
        authenticates OpenCode against a GitHub Copilot subscription (Pro/Pro+/Business/
        Enterprise) and defaults to a <code>github-copilot/*</code> model.
      </p>

      <h2>Required repository secrets</h2>
      <p>
        Seed each secret from a trusted local machine after interactive OAuth login. Treat
        these files like passwords — never commit them.
      </p>
      <ul>
        <li>
          <code>CODEX_AUTH_JSON</code> — contents of <code>~/.codex/auth.json</code> after{" "}
          <code>codex login</code> with <code>cli_auth_credentials_store = &quot;file&quot;</code>{" "}
          in <code>~/.codex/config.toml</code>. Prefer ChatGPT OAuth (
          <code>auth_mode: &quot;chatgpt&quot;</code>), not an API key.
        </li>
        <li>
          <code>ANTIGRAVITY_OAUTH_TOKEN</code> — contents of{" "}
          <code>~/.gemini/antigravity-cli/antigravity-oauth-token</code> after{" "}
          <code>agy auth login</code>. No API key fallback — the workflow unsets{" "}
          <code>GEMINI_API_KEY</code>/<code>GOOGLE_API_KEY</code>/
          <code>ANTIGRAVITY_API_KEY</code> before running.
        </li>
        <li>
          <code>OPENCODE_AUTH</code> — contents of{" "}
          <code>~/.local/share/opencode/auth.json</code> after authenticating to the
          &quot;GitHub Copilot&quot; provider via <code>opencode auth login</code> (device-code
          flow). No <code>OPENAI_API_KEY</code>/<code>ANTHROPIC_API_KEY</code>/
          <code>GOOGLE_GENERATIVE_AI_API_KEY</code> fallback, and do not select an{" "}
          <code>opencode/*</code> Zen model — those bill metered credits, not the
          subscription.
        </li>
        <li>
          <code>GROK_AUTH_JSON</code> — contents of <code>~/.grok/auth.json</code> after{" "}
          <code>grok login</code> (SuperGrok or X Premium+).
        </li>
        <li>
          <code>CURSOR_CLI_CONFIG</code> — contents of{" "}
          <code>~/.cursor/cli-config.json</code> after <code>agent login</code>. Required —
          no <code>CURSOR_API_KEY</code> fallback in either{" "}
          <code>cursor-scheduled.yml</code> or <code>cursor-agent-grok.yml</code>.
        </li>
        <li>
          <code>CLAUDE_CODE_OAUTH_TOKEN</code> — long-lived OAuth token from{" "}
          <code>claude setup-token</code> (preferred CI path; macOS Keychain login is not
          portable). Required — no <code>ANTHROPIC_API_KEY</code> fallback. Optionally also
          set <code>CLAUDE_CREDENTIALS_JSON</code> to the contents of Linux{" "}
          <code>~/.claude/.credentials.json</code> for file+cache restore.
        </li>
      </ul>

      <h2>Seed commands</h2>
      <pre>
        <code>{`# Codex (ChatGPT OAuth)
# ~/.codex/config.toml → cli_auth_credentials_store = "file"
codex login
gh secret set CODEX_AUTH_JSON < ~/.codex/auth.json

# Antigravity (Google subscription OAuth; replaces the old Gemini CLI)
agy auth login
gh secret set ANTIGRAVITY_OAUTH_TOKEN < ~/.gemini/antigravity-cli/antigravity-oauth-token

# OpenCode (GitHub Copilot subscription — pick "GitHub Copilot" at the prompt,
# not a Zen/API-key provider)
opencode auth login
gh secret set OPENCODE_AUTH < ~/.local/share/opencode/auth.json

# Grok Build
grok login
gh secret set GROK_AUTH_JSON < ~/.grok/auth.json

# Cursor Agent (subscription OAuth; used by both cursor-scheduled.yml and
# cursor-agent-grok.yml)
agent login
gh secret set CURSOR_CLI_CONFIG < ~/.cursor/cli-config.json

# Claude Code (subscription OAuth for CI)
claude setup-token
# copy the printed token, then:
gh secret set CLAUDE_CODE_OAUTH_TOKEN
# optional Linux file seed:
# gh secret set CLAUDE_CREDENTIALS_JSON < ~/.claude/.credentials.json`}</code>
      </pre>

      <h2>Token refresh</h2>
      <p>
        GitHub-hosted runners are ephemeral. Each workflow restores the latest OAuth file
        from Actions cache (falling back to the seed secret), runs the CLI so it can refresh
        tokens in place, then saves the refreshed file back to cache. If refresh stops
        working, re-run the local login and reseed the secret. Claude primarily uses{" "}
        <code>CLAUDE_CODE_OAUTH_TOKEN</code>; the credentials-file cache is a secondary
        refresh path on Linux runners.
      </p>
      <p>
        Do not share one OAuth file across concurrent machines — each CLI family uses its
        own cache key prefix. Still: overlapping matrix jobs can race a single provider
        refresh token; if a job starts failing with 401s, reseed and let the next schedule
        pick up.
      </p>

      <h2>Manual runs</h2>
      <p>
        Every scheduled workflow supports <code>workflow_dispatch</code>. Choose{" "}
        <code>dev-work</code>, <code>continuous-work</code>, or <code>both</code>. OpenCode,
        Cursor, and Claude also accept an optional <code>model</code> input override.
      </p>

      <h2>Permissions</h2>
      <p>
        Workflows request <code>contents: write</code>, <code>pull-requests: write</code>,
        and <code>issues: write</code> so agents can push branches and open PRs with{" "}
        <code>GITHUB_TOKEN</code>. OpenCode also requests <code>id-token: write</code> for
        its GitHub Action.
      </p>

      <p>
        Coordination rules live in the <DocLink href="/docs/process">process log</DocLink> —
        agents must claim <code>NEXT_STEPS</code> before feature work and avoid colliding
        with sibling Cursor/Claude automations.
      </p>
    </DocPage>
  );
}
