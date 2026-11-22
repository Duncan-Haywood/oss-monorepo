// Differential test: does checkConfigText reach pre-commit's own verdict?
// Usage: node differential/config-diff.mjs <python-with-pre-commit> <file>...
// For each file pre-commit's loader (clientlib.load_config, what
// `pre-commit validate-config` calls) is run in-process with its log
// captured. Compared per file: accept/reject; the first error's context
// chain and message; and the warnings pre-commit logs, in order.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { checkConfigText } from "../check.mjs";

const [python, ...files] = process.argv.slice(2);
const py = `
import json,sys,logging,traceback
from pre_commit import clientlib
logger=logging.getLogger('pre_commit')
class H(logging.Handler):
    def emit(self,r): self.msgs.append(r.getMessage())
h=H(); logger.addHandler(h); logger.propagate=False
out={}
for f in sys.argv[1:]:
    h.msgs=[]
    try:
        clientlib.load_config(f); out[f]={'ok':True,'warnings':h.msgs}
    except clientlib.InvalidConfigError as e:
        out[f]={'ok':False,'error':str(e),'warnings':h.msgs}
    except Exception as e:
        out[f]={'ok':False,'crash':type(e).__name__+': '+str(e),'warnings':h.msgs}
print(json.dumps(out))
`;
const r = spawnSync(python, ["-I", "-c", py, ...files], { maxBuffer: 1 << 28 });
if (r.status !== 0) { console.error(String(r.stderr)); process.exit(2); }
const truth = JSON.parse(String(r.stdout));
const tally = { files: files.length, accepted: 0, rejected: 0, crashed: 0, verdictAgree: 0, firstErrorAgree: 0, warningsAgree: 0, fullAgree: 0 };
const bad = [];
for (const f of files) {
  const t = truth[f];
  const ours = checkConfigText(readFileSync(f, "utf8"), { filename: f });
  if (t.ok) tally.accepted++; else if (t.crash) tally.crashed++; else tally.rejected++;
  const verdict = ours.ok === t.ok;
  let first = true;
  if (!t.ok && !t.crash) {
    const theirs = t.error.trim().split("\n").map((x) => x.replace(/^=+> /, ""));
    const oursChain = ours.firstError ? [...ours.firstError.context.filter(Boolean), ours.firstError.message] : [];
    if (ours.firstError?.rule === "yaml") first = theirs[0] === oursChain[0];
    else first = JSON.stringify(theirs) === JSON.stringify(oursChain);
    if (!first) bad.push({ f, kind: "first-error", theirs, ours: oursChain });
  }
  if (t.crash) first = Boolean(ours.firstError?.crash);
  const ow = ours.preCommitWarnings.map((w) => w.message);
  const warn = JSON.stringify(ow) === JSON.stringify(t.warnings);
  if (!verdict) bad.push({ f, kind: "verdict", theirs: t.ok ? "accept" : t.error || t.crash, ours: ours.ok ? "accept" : ours.firstError?.message });
  if (!warn) bad.push({ f, kind: "warnings", theirs: t.warnings, ours: ow });
  tally.verdictAgree += verdict; tally.firstErrorAgree += verdict && first; tally.warningsAgree += warn; tally.fullAgree += verdict && first && warn;
}
console.log(JSON.stringify(tally));
for (const b of bad.slice(0, Number(process.env.SHOW || 15))) console.log(JSON.stringify(b).slice(0, 900));
process.exit(bad.length ? 1 : 0);
