// AWS IAM policy risk check. Reads one policy document (identity policy, role trust policy or
// resource policy as JSON) and reports over-broad grants, privilege-escalation paths and public
// principals, each with a fix to review. Pure functions: no DOM, no network, no AWS credentials.

export const SEVERITIES = ["critical", "high", "medium", "info"];
const WEIGHT = { critical: 25, high: 10, medium: 4, info: 0 };

// Actions that let a principal grant itself (or a chosen principal) more access.
export const ESCALATION = [
  "iam:CreatePolicyVersion", "iam:SetDefaultPolicyVersion", "iam:AttachUserPolicy", "iam:AttachRolePolicy",
  "iam:AttachGroupPolicy", "iam:PutUserPolicy", "iam:PutRolePolicy", "iam:PutGroupPolicy",
  "iam:CreateAccessKey", "iam:CreateLoginProfile", "iam:UpdateLoginProfile", "iam:UpdateAssumeRolePolicy",
  "iam:AddUserToGroup", "iam:PassRole", "sts:AssumeRole",
];
// Reads of secrets or key material: a wildcard resource here is a data-theft path.
export const SENSITIVE_READ = [
  "secretsmanager:GetSecretValue", "ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath",
  "kms:Decrypt", "s3:GetObject", "dynamodb:Scan", "dynamodb:GetItem",
];

const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const esc = (s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
export function globMatch(pattern, value) {
  return new RegExp(`^${esc(pattern).replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i").test(value);
}
const isStarResource = (r) => r === "*" || /^arn:aws[a-z-]*:[a-z0-9-]+:[^:]*:[^:]*:\*$/.test(r);
const readOnly = (a) => /^[a-z0-9-]+:(describe|list|get|batchget|lookup|search|head|view)/i.test(a);

// Accepts a policy, an array of policies, or a wrapper such as {PolicyDocument: {...}} from the AWS CLI.
export function parsePolicies(text) {
  let data;
  try { data = JSON.parse(String(text ?? "").replace(/^﻿/, "")); }
  catch (e) { return { error: `Not valid JSON (${e.message}). Paste a policy document such as {"Version":"2012-10-17","Statement":[...]}.` }; }
  const out = [];
  const visit = (d, label) => {
    if (!d || typeof d !== "object") return;
    if (Array.isArray(d)) { d.forEach((x, i) => visit(x, `${label}[${i}]`)); return; }
    if (d.Statement !== undefined) { out.push({ label, doc: d }); return; }
    for (const k of ["PolicyDocument", "AssumeRolePolicyDocument", "Document", "Policy"]) {
      if (d[k] !== undefined) { visit(typeof d[k] === "string" ? safeParse(d[k]) : d[k], `${label}.${k}`); return; }
    }
    if (d.PolicyVersion) visit(d.PolicyVersion, `${label}.PolicyVersion`);
  };
  visit(data, "policy");
  if (!out.length) return { error: 'No "Statement" found. Paste the policy document itself (or the JSON that wraps it).' };
  return { policies: out, chars: String(text).replace(/\s+/g, "").length };
}
function safeParse(s) { try { return decodeURIComponent(s).startsWith("{") ? JSON.parse(decodeURIComponent(s)) : JSON.parse(s); } catch { try { return JSON.parse(s); } catch { return null; } } }

function principals(p) {
  if (p === "*") return { any: true, aws: [], other: [] };
  if (!p || typeof p !== "object") return { any: false, aws: [], other: [] };
  const aws = arr(p.AWS).map(String);
  return { any: aws.includes("*"), aws, other: [...arr(p.Service), ...arr(p.Federated), ...arr(p.CanonicalUser)].map(String) };
}

export function analyze(policies, { chars = 0 } = {}) {
  const findings = [];
  const stats = { policies: policies.length, statements: 0, allow: 0, deny: 0 };
  const add = (f, pi, si, st, sev, rule, title, detail, fix, actions = []) =>
    findings.push({ severity: sev, rule, policy: pi, statement: si, sid: st.Sid || `Statement ${si + 1}`, title, detail, fix, actions });

  policies.forEach((p, pi) => {
    const doc = p.doc;
    if (!doc.Version) add(0, pi, 0, {}, "info", "no-version", "No Version element", "Without \"Version\": \"2012-10-17\" policy variables such as ${aws:username} are not evaluated.", 'Add "Version": "2012-10-17".');
    else if (doc.Version === "2008-10-17") add(0, pi, 0, {}, "info", "old-version", "Old policy language version", "2008-10-17 does not support policy variables or several newer elements.", 'Set "Version": "2012-10-17".');
    arr(doc.Statement).forEach((st, si) => {
      stats.statements++;
      if (!st || typeof st !== "object") return;
      const effect = String(st.Effect || "");
      if (effect === "Deny") { stats.deny++; return; }
      if (effect !== "Allow") { add(0, pi, si, st, "medium", "bad-effect", "Missing or invalid Effect", `Effect is "${effect}"; AWS rejects a statement without Allow or Deny.`, 'Set "Effect": "Allow" or "Deny".'); return; }
      stats.allow++;
      const acts = arr(st.Action).map(String), notActs = arr(st.NotAction).map(String);
      const res = arr(st.Resource).map(String), notRes = arr(st.NotResource).map(String);
      const hasCond = st.Condition && Object.keys(st.Condition).length > 0;
      const pr = principals(st.Principal);
      const hasPrincipal = st.Principal !== undefined;
      const broadRes = res.length ? res.some(isStarResource) : (!hasPrincipal);
      const wholeRes = res.includes("*");

      if (acts.includes("*") && wholeRes)
        add(0, pi, si, st, "critical", "admin", "Full administrator access", 'Action "*" on Resource "*" lets the holder do anything in the account, including removing logging and creating other admins.', "Replace with the specific actions and resource ARNs the workload needs, starting from the CloudTrail events it actually calls.", ["*"]);
      else if (acts.includes("*"))
        add(0, pi, si, st, "high", "all-actions", 'Every action allowed ("*")', "Every API action is allowed on the listed resources, including ones added to AWS later.", "List the actions needed instead of a wildcard.", ["*"]);

      if (notActs.length)
        add(0, pi, si, st, "high", "not-action", "Allow with NotAction", `Allow + NotAction grants every action except ${notActs.join(", ")}, including services launched after this was written.`, "Use an explicit Action list. Reserve NotAction for Deny statements (for example deny-all-but-MFA).", notActs);

      for (const a of acts.filter((a) => a !== "*" && /^[a-z0-9-]+:\*$/i.test(a))) {
        const svc = a.split(":")[0].toLowerCase();
        const hot = ["iam", "sts", "kms", "organizations", "secretsmanager", "cloudtrail", "config"].includes(svc);
        add(0, pi, si, st, hot ? "high" : "medium", "service-wildcard", `Whole-service wildcard ${a}`, hot ? `${svc} controls identity, keys or audit trails, so ${a} is close to administrator access.` : `${a} allows every ${svc} action, including delete and permission changes.`, `Narrow to the ${svc} actions the workload calls (read-only first), and scope the Resource.`, [a]);
      }

      const covered = ESCALATION.filter((e) => acts.some((a) => a !== "*" && globMatch(a, e)));
      if (covered.length && !hasPrincipal && !(acts.includes("*") && wholeRes)) {
        const fullyOpen = broadRes && !hasCond;
        const passOnly = covered.every((c) => c === "iam:PassRole" || c === "sts:AssumeRole");
        add(0, pi, si, st, fullyOpen && !passOnly ? "critical" : fullyOpen || !passOnly ? "high" : "medium", "escalation",
          passOnly ? "PassRole or AssumeRole without a narrow resource" : "Privilege-escalation actions",
          `Allows ${covered.join(", ")}${broadRes ? " on a wildcard resource" : ""}. ${passOnly ? "With a wildcard resource the holder can pass or assume any role, including a more powerful one." : "A principal that can change policies, keys or logins can grant itself more access than it was given."}`,
          passOnly ? "Scope Resource to the exact role ARNs, and add an iam:PassedToService condition for PassRole." : "Remove these actions from workload roles; if needed, scope Resource to specific ARNs and add a permissions boundary.", covered);
      }

      const sens = SENSITIVE_READ.filter((e) => acts.some((a) => a !== "*" && globMatch(a, e)));
      if (sens.length && wholeRes && !acts.includes("*") && !hasPrincipal)
        add(0, pi, si, st, "high", "sensitive-read", "Secret or data reads on every resource", `${sens.join(", ")} on "*" lets a compromised workload read every secret, parameter, key or object in the account.`, "Scope Resource to the specific secret, parameter path, key or bucket prefix the workload uses.", sens);

      const writeActs = acts.filter((a) => a !== "*" && !/^[a-z0-9-]+:\*$/i.test(a) && !readOnly(a));
      if (!hasPrincipal && wholeRes && writeActs.length && !covered.length && !sens.length && !acts.includes("*"))
        add(0, pi, si, st, "medium", "resource-star", 'Write actions on Resource "*"', `${writeActs.length} non-read action(s) apply to every resource of that type: ${writeActs.slice(0, 6).join(", ")}${writeActs.length > 6 ? ", ..." : ""}.`, "Scope Resource to ARNs (or ARN patterns with a tag condition). Some actions do not support resource-level permissions; keep \"*\" only for those.", writeActs);

      if (notRes.length && !hasPrincipal)
        add(0, pi, si, st, "medium", "not-resource", "Allow with NotResource", `Allow + NotResource applies to everything except ${notRes.slice(0, 3).join(", ")}, including resources created later.`, "List the resources allowed instead.", []);

      if (hasPrincipal) {
        if (pr.any && !hasCond)
          add(0, pi, si, st, "critical", "public-principal", 'Principal "*" with no Condition', 'Anyone on the internet (or in any AWS account) matches this statement. On a bucket, queue or key policy that makes the resource public; on a role trust policy it lets any account assume the role.', "Name the principal ARNs, or keep \"*\" and add a Condition such as aws:PrincipalOrgID, aws:SourceVpce or aws:SourceArn.", acts);
        else if (pr.any)
          add(0, pi, si, st, "medium", "public-principal-cond", 'Principal "*" relies on a Condition', "The statement is only as safe as its Condition. Check that the key is one a stranger cannot satisfy (aws:PrincipalOrgID, aws:SourceVpce, aws:SourceAccount).", "Test the policy with IAM Access Analyzer or the policy simulator before relying on it.", acts);
        const acct = pr.aws.filter((a) => /^(arn:aws[a-z-]*:iam::\d{12}:root|\d{12})$/.test(a));
        if (acct.length && !hasCond)
          add(0, pi, si, st, "medium", "cross-account", "Whole other account trusted, no Condition", `${acct.join(", ")} trusts every identity in that account that has permission to assume it.`, "Add sts:ExternalId for third parties, or aws:PrincipalOrgID for your own organisation, or name a specific role ARN.", []);
      }
    });
  });

  if (chars > 6144)
    findings.push({ severity: "info", rule: "size", policy: 0, statement: 0, sid: "Policy", title: "Larger than a managed policy allows", detail: `About ${chars} characters without whitespace; a customer managed policy is limited to 6,144 (inline role policies 10,240, user 2,048).`, fix: "Split into several policies or use wildcards on safe prefixes.", actions: [] });

  const rank = (s) => SEVERITIES.indexOf(s);
  findings.sort((a, b) => rank(a.severity) - rank(b.severity) || a.policy - b.policy || a.statement - b.statement);
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));
  const penalty = findings.reduce((n, f) => n + WEIGHT[f.severity], 0);
  const score = Math.max(0, 100 - penalty);
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 55 ? "C" : score >= 30 ? "D" : "F";
  return { summary: { ...stats, findings: findings.length, bySeverity, penalty, score, grade }, findings };
}

export function toCsv(findings) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ["severity,statement,rule,title,fix", ...findings.map((f) => [f.severity, f.sid, f.rule, f.title, f.fix].map(q).join(","))].join("\n");
}

export function sampleText() {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      { Sid: "AppBucketRead", Effect: "Allow", Action: ["s3:GetObject", "s3:ListBucket"], Resource: ["arn:aws:s3:::acme-app-assets", "arn:aws:s3:::acme-app-assets/*"] },
      { Sid: "DeployHelper", Effect: "Allow", Action: ["iam:PassRole", "iam:AttachRolePolicy", "lambda:UpdateFunctionCode"], Resource: "*" },
      { Sid: "AllEc2", Effect: "Allow", Action: "ec2:*", Resource: "*" },
      { Sid: "Secrets", Effect: "Allow", Action: "secretsmanager:GetSecretValue", Resource: "*" },
      { Sid: "PublicQueue", Effect: "Allow", Principal: "*", Action: "sqs:SendMessage", Resource: "arn:aws:sqs:us-east-1:111122223333:orders" },
    ],
  }, null, 2);
}
