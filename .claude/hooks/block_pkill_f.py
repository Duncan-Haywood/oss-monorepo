#!/usr/bin/env python3
"""PreToolUse hook: refuse `pkill -f` / `pgrep -f` / `killall`-by-pattern in Bash.

The Bash tool's shell has the pattern on its own command line, so the
pattern matches the shell and kills it (exit 144). 18 run records hit this
despite three prose warnings. A bracketed first letter ('[n]ame') is fine.
Only a real invocation counts: at the start of a command or after ; & | ( then
do else ! sudo timeout nohup. A command that merely quotes it (an echo, a commit
message, a heredoc line) is left alone.
"""
import json, re, sys

try:
    cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
except Exception:
    sys.exit(0)

CMD = r"(?:^|[;&|(\n]|\b(?:then|do|else|sudo|nohup|timeout\s+\S+)\b|!)\s*"
for m in re.finditer(CMD + r"(pkill|pgrep)\b([^|;&\n]*)", cmd):
    w, args = m.group(1), m.group(2)
    if not re.search(r"(?:^|\s)-[a-zA-Z]*f", args):
        continue
    pats = [t.strip("'\"") for t in args.split() if not t.startswith("-")]
    if pats and all(re.match(r"\[.\]", p) for p in pats[:1]):
        plain = re.sub(r"^\[(.)\]", r"\1", pats[0])
        if plain not in cmd:
            continue
        print("Blocked: `%s -f '%s'` is bracketed, but `%s` also appears elsewhere in this "
              "command line, so it still matches the shell. Split into two calls or use "
              "`kill <pid>`." % (w, pats[0], plain), file=sys.stderr)
        sys.exit(2)
    print("Blocked: `%s -f` matches this shell's own command line and kills it "
          "(exit 144). Use `%s -f '[n]ame'` (bracket the first letter) or `kill <pid>`."
          % (w, w), file=sys.stderr)
    sys.exit(2)
