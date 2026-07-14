import { DocLink, DocPage } from "@/components/docs/doc-page";

export default function CliAgentsDocPage() {
  return (
    <DocPage
      title="CLI scheduled agents"
      subtitle="GitHub Actions that run Codex, Gemini, OpenCode, and Grok Build every 30 minutes"
      related={[
        { href: "/docs/process", label: "Process log" },
        { href: "/docs/architecture", label: "Architecture" },
        { href: "/docs/launch-checklist", label: "Launch checklist" },
      ]}
    >
      <p>
        Four scheduled workflows under <code>.github/workflows/</code> run autonomous CLI
        agents against this repo every 30 minutes. Each workflow executes both{" "}
        <code>.github/prompts/dev-work.md</code> and{" "}
        <code>.github/prompts/continuous-work.md</code>, which point agents at{" "}
        <code>src/lib/process/prompt_process.tsx</code> (<code>AGENT_PROTOCOL</code> +{" "}
        <code>NEXT_STEPS</code>).
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
              <code>0,30 * * * *</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>gemini-scheduled.yml</code>
            </td>
            <td>Gemini CLI</td>
            <td>
              <code>gemini-3.5-flash</code>
            </td>
            <td>Google OAuth / GCA</td>
            <td>
              <code>5,35 * * * *</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>opencode-scheduled.yml</code>
            </td>
            <td>OpenCode CLI</td>
            <td>
              <code>opencode/deepseek-v4-flash</code> (overrideable)
            </td>
            <td>OpenCode OAuth</td>
            <td>
              <code>10,40 * * * *</code>
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
              <code>15,45 * * * *</code>
            </td>
          </tr>
        </tbody>
      </table>

      <p>
        Crons are staggered by a few minutes so the four CLIs do not all claim the same{" "}
        <code>NEXT_STEPS</code> item in the same second. Each prompt matrix cell also has a
        concurrency group so overlapping runs of the same agent+prompt queue instead of
        canceling mid-flight.
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
          <code>GEMINI_OAUTH_CREDS</code> — contents of{" "}
          <code>~/.gemini/oauth_creds.json</code> after signing in with Google in Gemini CLI.
          Workflows set <code>GOOGLE_GENAI_USE_GCA=true</code> and unset API keys so OAuth
          wins.
        </li>
        <li>
          <code>GEMINI_SETTINGS</code> (optional) — contents of{" "}
          <code>~/.gemini/settings.json</code>. If omitted, the workflow writes a minimal
          OAuth + <code>gemini-3.5-flash</code> settings file.
        </li>
        <li>
          <code>OPENCODE_AUTH</code> — contents of{" "}
          <code>~/.local/share/opencode/auth.json</code> after{" "}
          <code>opencode auth login</code>.
        </li>
        <li>
          <code>GROK_AUTH_JSON</code> — contents of <code>~/.grok/auth.json</code> after{" "}
          <code>grok login</code> (SuperGrok or X Premium+).
        </li>
      </ul>

      <h2>Seed commands</h2>
      <pre>
        <code>{`# Codex (ChatGPT OAuth)
# ~/.codex/config.toml → cli_auth_credentials_store = "file"
codex login
gh secret set CODEX_AUTH_JSON < ~/.codex/auth.json

# Gemini (Google OAuth)
gemini  # complete browser/device login once
gh secret set GEMINI_OAUTH_CREDS < ~/.gemini/oauth_creds.json
gh secret set GEMINI_SETTINGS < ~/.gemini/settings.json

# OpenCode
opencode auth login
gh secret set OPENCODE_AUTH < ~/.local/share/opencode/auth.json

# Grok Build
grok login
gh secret set GROK_AUTH_JSON < ~/.grok/auth.json`}</code>
      </pre>

      <h2>Token refresh</h2>
      <p>
        GitHub-hosted runners are ephemeral. Each workflow restores the latest OAuth file
        from Actions cache (falling back to the seed secret), runs the CLI so it can refresh
        tokens in place, then saves the refreshed file back to cache. If refresh stops
        working, re-run the local login and reseed the secret.
      </p>
      <p>
        Do not share one OAuth file across concurrent machines — each CLI family uses its
        own cache key prefix. Still: overlapping matrix jobs can race a single provider
        refresh token; if a job starts failing with 401s, reseed and let the next schedule
        pick up.
      </p>

      <h2>Manual runs</h2>
      <p>
        Every workflow supports <code>workflow_dispatch</code>. Choose{" "}
        <code>dev-work</code>, <code>continuous-work</code>, or <code>both</code>. OpenCode
        also accepts a <code>model</code> input override.
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
