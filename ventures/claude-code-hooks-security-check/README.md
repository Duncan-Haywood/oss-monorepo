# Claude Code Hooks Security Check

A free tool that scans the command strings inside a pasted Claude Code
hooks configuration — the `hooks` section of `settings.json`, or a
standalone hooks object — for known-dangerous shapes: a remote download
piped straight into a shell, a credential file read and sent over the
network in the same line, environment variables dumped and sent over the
network, an unguarded recursive delete, TLS verification disabled,
persistence via a shell startup file or crontab, world-writable
permissions granted, a base64-obfuscated payload executed, and a process
started detached from the hook.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/claude-code-hooks-security-check/

After using this, you can now **catch a hook command that matches a known
dangerous shape before it runs** — Claude Code hooks fire automatically,
with no confirmation prompt, on every matching tool call, so a risky
command in a hooks config a project ships or a teammate adds is a risky
command that runs unattended, every time, for everyone who trusts that
project's settings.

**What it is not:** proof that a command is safe, or an exhaustive list of
every dangerous shape a command could take. It never runs a single command
and never calls an AI model — it only matches the text you paste against
documented patterns. A finding is something worth a look, not a verdict;
a clean result means none of this tool's known patterns fired, not that
the hooks are safe to run unattended. See
[why a clean scan isn't a safety guarantee](why-a-clean-scan-isnt-a-safety-guarantee.html).

## How this differs from Claude Code Settings Check

[`claude-code-settings-check`](../claude-code-settings-check/) asks whether
a hook or permission rule is *shaped correctly* — does the matcher regex
compile, is there a command at all. This tool assumes the JSON is
well-formed and asks a different question: does the *command text itself*
match a known-dangerous shape. Run both — a hook can be structurally
perfect and still risky, or structurally broken and harmless.

## What gets flagged

- **Remote pipe to shell** — a `curl`/`wget` download piped straight into
  `sh`/`bash`/`zsh`/`python`/`node`/`powershell`/etc., or a PowerShell
  download executed with `Invoke-Expression`/`iex`. Runs whatever the
  remote server returns at the moment the hook fires, with nobody
  reviewing it first.
- **Broad recursive delete** — `rm -rf` (or `-fr`, `--recursive --force`)
  targeting an unguarded broad path: `/`, `~`, `*`, `.`, `..`, or `$HOME`.
- **Credential file read**, and **credential exfiltration** when the same
  command line also sends data over the network — an SSH private key,
  AWS credentials, `.npmrc`, a kube config, a Docker config, `.netrc`,
  `.pypirc`, or a GnuPG/gcloud credentials path.
- **Environment-variable exfiltration** — `env`/`printenv`/`export -p`
  combined with an outbound network call in the same command.
- **TLS verification disabled** — `curl -k`/`--insecure`, `wget
  --no-check-certificate`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, and similar.
- **Persistence** — appending to a shell startup file (`.bashrc`,
  `.zshrc`, `.profile`, ...), `crontab -`, or enabling a user service —
  runs again on a future login/boot, independent of the hook firing again.
- **World-writable permissions** — `chmod 777`/`a+w`/`o+w`.
- **Obfuscated payload execution** — a base64-decoded payload piped
  straight into a shell.
- **Detached background process** — `nohup ... &`, `setsid`, `screen -dm`,
  `tmux new-session -d`, or `at now` — a caution, since this shape is also
  completely ordinary for a ­legitimate long-running dev-server hook.

## Try it without installing anything

[`index.html`](index.html) runs the exact same logic as
[`calc.mjs`](calc.mjs) entirely in the browser. Paste your hooks
configuration, or load the built-in risky example, and see every finding
immediately — nothing is uploaded, and the page makes no network requests.

```sh
cd ventures/claude-code-hooks-security-check
node --test
```

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not security advice, and it is not a
guarantee that a command is safe or unsafe. **You are responsible for
reviewing and verifying its output before relying on it**, and for
reviewing every hook command yourself regardless of what this tool
reports. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

**Privacy.** Everything runs client-side in your browser. The
configuration you paste, and every finding this tool produces, never
leaves your device — there is no upload, no server-side processing, and
no third-party analytics vendor. Usage logging is opt-in, stays in
`localStorage` on your device, and records only that a scan ran or a
summary was copied — never the pasted content or the findings themselves.
Do Not Track and Global Privacy Control disable it automatically.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional
and does not change what the tool does.
