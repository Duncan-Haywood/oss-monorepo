// Deterministic blast-radius report for a Terraform *structured* plan (the
// JSON `terraform show -json <planfile>` prints, not the human-readable
// `terraform plan` output and not the line-delimited stream from `terraform
// plan -json`).
//
// One question, answered from the file you already have: **what does this
// apply take away?** A plain plan summary ends in a single line --
// `Plan: 3 to add, 1 to change, 2 to destroy.` -- and a replace is counted in
// *both* the add and the destroy column, so the line that tells you a
// production database is about to be recreated looks exactly like the line
// that tells you a security-group rule moved. The detail that distinguishes
// them is hundreds of lines up, in a diff nobody scrolls back through.
//
// Upstream has said the text output will not close this gap:
// hashicorp/terraform#36097 ("`terraform plan` hides unchanged `forces
// replacement` attributes") was closed as working-as-designed -- an attribute
// a provider marked `RequiresReplace` is hidden inside `(N unchanged
// attributes hidden)` when its own value did not change, so the plan can tell
// you a resource *must* be replaced while hiding *which* attribute forced it.
// The structured plan does not hide it: `change.replace_paths` carries the
// exact attribute paths, and `action_reason` carries the annotation. This
// module reads those two fields and puts the answer at the top instead of the
// bottom.
//
// No network call lives here -- this module only reads the plan JSON it is
// given. The identical logic runs in the browser page (pasted/loaded plan)
// and the Node CLI (a local file, usable as a CI gate before an apply).

// --- Action classification ---------------------------------------------
//
// `change.actions` is an array. A single-element array is the plain action.
// Delete and create *together* mean a replacement, in one order or the
// other: ["delete","create"] destroys first, ["create","delete"] is the
// `create_before_destroy` form. Collapsing both to "replace" is the whole
// reason this tool exists -- they are the two shapes a summary line buries.

export const ACTION_CREATE = "create";
export const ACTION_UPDATE = "update";
export const ACTION_DELETE = "delete";
export const ACTION_REPLACE = "replace";
export const ACTION_NOOP = "no-op";
export const ACTION_READ = "read";

/**
 * Collapses a `change.actions` array into one label.
 *
 * Returns `"replace"` for both replacement orderings; `createFirst` on the
 * returned record says which one, because `create_before_destroy` is the
 * safer of the two and a report that hid the difference would be lying by
 * omission about downtime.
 */
export function classifyAction(actions) {
  const list = Array.isArray(actions) ? actions.map(String) : [];
  const hasCreate = list.includes("create");
  const hasDelete = list.includes("delete");
  if (hasCreate && hasDelete) {
    return { action: ACTION_REPLACE, createFirst: list.indexOf("create") < list.indexOf("delete") };
  }
  if (hasDelete) return { action: ACTION_DELETE, createFirst: false };
  if (hasCreate) return { action: ACTION_CREATE, createFirst: false };
  if (list.includes("update")) return { action: ACTION_UPDATE, createFirst: false };
  if (list.includes("read")) return { action: ACTION_READ, createFirst: false };
  return { action: ACTION_NOOP, createFirst: false };
}

// --- Stateful resource types -------------------------------------------
//
// The heuristic is on the *type name*, split into `_`-separated segments,
// matched against a token set per category. Type names are the one part of a
// plan that is stable across providers and versions and needs no schema
// lookup, so this works offline on any provider -- including one this tool
// has never seen.
//
// **It is deliberately biased toward flagging.** The cost is asymmetric by
// orders of magnitude: an extra flag costs five seconds of reading, a missed
// one costs a database. So `aws_db_proxy` gets flagged alongside
// `aws_db_instance`, and the report says which token matched so you can
// dismiss it in one glance rather than trusting it blindly. That is also why
// the report never says "safe" -- only "nothing in this plan matched".

export const STATEFUL_TYPE_RULES = [
  {
    code: "database",
    label: "Database",
    loss: "The data in it. A replaced database is a brand-new empty one unless you restore a snapshot by hand, and the restore is not part of this plan.",
    tokens: [
      "db", "database", "databases", "rds", "sql", "mssql", "mysql", "postgres", "postgresql",
      "mariadb", "aurora", "dynamodb", "documentdb", "docdb", "neptune", "spanner", "bigtable",
      "firestore", "cosmosdb", "mongo", "mongodb", "elasticache", "memorydb", "redis",
      "memcached", "influxdb", "timestream", "clickhouse", "cassandra", "keyspaces",
      "redshift", "bigquery", "snowflake", "warehouse",
    ],
  },
  {
    code: "disk",
    label: "Disk / volume",
    loss: "Everything written to the volume. A replaced disk is a fresh blank one attached in the same place.",
    tokens: ["disk", "disks", "volume", "volumes", "ebs", "efs", "fsx", "filestore", "netapp", "lun"],
  },
  {
    code: "bucket",
    label: "Bucket / object storage",
    loss: "The objects in it, plus the globally unique name while the new one is being created. Most providers refuse to destroy a non-empty bucket, so this often fails mid-apply instead -- leaving you half-applied.",
    tokens: ["bucket", "buckets", "objectstore", "blob", "container", "gcs", "storageaccount", "filesystem"],
  },
  {
    code: "dns",
    label: "DNS record / zone",
    loss: "Resolution, for as long as the gap between destroy and create lasts plus the record's TTL. A replaced record is a live cutover, not a config edit.",
    tokens: ["dns", "route53", "recordset", "resolver", "nameserver"],
  },
  {
    code: "loadbalancer",
    label: "Load balancer",
    loss: "The hostname and IP addresses the load balancer was assigned. Anything pointing at the old name -- a DNS record, a hardcoded client, a peered VPC endpoint -- points at nothing until it is repointed.",
    tokens: ["lb", "alb", "nlb", "elb", "elbv2", "loadbalancer", "gateway", "appgateway", "frontdoor"],
  },
  {
    code: "secret",
    label: "Secret / key material",
    loss: "The stored value, and any key material that cannot be regenerated. A replaced KMS/CMK-style key makes everything encrypted under it unreadable; a replaced secret version breaks every consumer still reading the old one.",
    tokens: ["secret", "secrets", "secretsmanager", "kms", "keyvault", "vault", "keyring", "cryptokey", "certificate", "privatekey"],
  },
  {
    code: "k8s-stateful",
    label: "Stateful Kubernetes object",
    loss: "The bound volume or stored value. A replaced PersistentVolumeClaim unbinds its volume; a replaced StatefulSet recreates its pods with their identity and ordering reset.",
    tokens: ["persistentvolumeclaim", "persistentvolume", "statefulset", "pvc", "storageclass"],
  },
  {
    code: "queue",
    label: "Queue / stream / topic",
    loss: "Messages still in flight, and the retained log. A replaced stream or topic starts empty at offset zero; consumers reading by offset silently start over or stall.",
    tokens: ["queue", "sqs", "kinesis", "kafka", "msk", "eventhub", "pubsub", "servicebus", "streams"],
  },
  {
    code: "search",
    label: "Search / analytics cluster",
    loss: "Every index on it. A replaced cluster comes back empty and has to be reindexed from the source of truth, which takes hours on a real dataset.",
    tokens: ["elasticsearch", "opensearch", "solr", "elastic"],
  },
];

/**
 * Type-name suffixes that mark a *configuration* sub-resource of a stateful
 * thing rather than the thing itself. `aws_db_parameter_group` and
 * `aws_s3_bucket_versioning` both carry a stateful token and neither holds a
 * byte of customer data; flagging them is how a report earns a reputation for
 * crying wolf, which is the failure mode that makes the real flag invisible.
 */
export const NON_DATA_SUFFIXES = [
  "_policy", "_acl", "_iam_policy", "_iam_binding", "_iam_member",
  "_parameter_group", "_subnet_group", "_option_group", "_security_group",
  "_versioning", "_lifecycle_configuration", "_logging", "_notification",
  "_cors_configuration", "_website_configuration", "_public_access_block",
  "_ownership_controls", "_accelerate_configuration", "_request_payment_configuration",
  "_replication_configuration", "_metric", "_alarm", "_attachment",
  "_association", "_membership", "_binding", "_grant", "_tag", "_tags",
];

function typeSegments(type) {
  return String(type ?? "")
    .toLowerCase()
    .split(/[_.-]+/)
    .filter(Boolean);
}

/**
 * Returns the stateful category a resource type falls into, or null.
 *
 * Matches whole `_`-separated segments rather than substrings, on purpose:
 * a substring match on "db" flags `aws_cloudwatch_dashboard` and a substring
 * match on "lb" flags `aws_globalaccelerator`, and neither of those holds
 * anything.
 */
export function statefulCategory(type) {
  const lower = String(type ?? "").toLowerCase();
  if (!lower) return null;
  if (NON_DATA_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return null;
  const segments = typeSegments(lower);
  for (const rule of STATEFUL_TYPE_RULES) {
    const matched = rule.tokens.find((token) => segments.includes(token));
    if (matched) return { code: rule.code, label: rule.label, loss: rule.loss, matchedToken: matched };
  }
  return null;
}

// --- action_reason ------------------------------------------------------
//
// Terraform's own docs call these "display hints only", say the set may
// change over time, and tell consumers to expect unrecognized values. So the
// lookup deliberately falls through to the raw code rather than dropping it:
// an unknown reason is still the most specific thing the plan said about why
// this resource is going away, and swallowing it would lose the one field
// that answers the question a user actually asked.

export const ACTION_REASONS = {
  replace_because_tainted: "the existing object is tainted (a previous create or provisioner failed), so Terraform will not reuse it",
  replace_because_cannot_update: "an attribute changed that the provider cannot update in place -- this is the ForceNew case",
  replace_by_request: "you asked for it explicitly with -replace=ADDRESS (or a legacy `terraform taint`)",
  delete_because_no_resource_config: "no `resource` block for this address exists in the configuration any more",
  delete_because_no_module: "the module call that declared it is gone from the configuration",
  delete_because_wrong_repetition: "the address no longer matches the resource's count/for_each repetition mode",
  delete_because_count_index: "its `count` index is outside the new count",
  delete_because_each_key: "its `for_each` key is not in the new map or set",
  read_because_config_unknown: "a data source could not be read during planning because its configuration is not yet known",
  read_because_dependency_pending: "a data source could not be read during planning because something it depends on has not been created yet",
  read_because_check_nested: "a data source inside a `check` block is deferred to apply time",
};

/** Human sentence for an `action_reason`, or a stated fallback for an unrecognized code. */
export function explainActionReason(code) {
  if (!code || code === "none") return null;
  const known = ACTION_REASONS[code];
  if (known) return known;
  return `Terraform reported the reason code "${code}", which this tool does not have a description for (Terraform documents these as display hints whose set can change). Check the plan output for the annotation next to this resource.`;
}

// --- Attribute paths ----------------------------------------------------

/** `["network_interface", 0, "subnet_id"]` -> `network_interface[0].subnet_id`. */
export function formatAttrPath(path) {
  if (!Array.isArray(path)) return String(path ?? "");
  return path
    .map((seg, i) => (typeof seg === "number" ? `[${seg}]` : i === 0 ? String(seg) : `.${seg}`))
    .join("");
}

function replacePathsOf(change) {
  const raw = change?.replace_paths;
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => formatAttrPath(p)).filter(Boolean);
}

// --- Plan parsing -------------------------------------------------------

/**
 * Parses and validates a `terraform show -json` structured plan. The error
 * messages aim at the most common mistake by far: pasting the human-readable
 * `terraform plan` output, or the line-delimited JSON from `terraform plan
 * -json`, neither of which carry `resource_changes`.
 */
export function parsePlan(text) {
  const raw = String(text ?? "").trim();
  if (!raw) throw new Error("empty input");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `not valid JSON (${err.message}). This tool needs the structured plan from ` +
        '"terraform show -json <planfile>", not the human-readable plan output.',
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.resource_changes)) {
    throw new Error(
      'missing "resource_changes" -- run "terraform plan -out=tfplan && terraform show -json tfplan" ' +
        'and read that file, not the plain-text plan or the streamed "terraform plan -json" log.',
    );
  }
  return data;
}

// --- Analysis -----------------------------------------------------------

function moduleOf(rc) {
  const declared = rc?.module_address;
  if (typeof declared === "string" && declared) return declared;
  const address = String(rc?.address ?? "");
  if (address.startsWith("module.")) {
    // Fall back to the address prefix for a plan that omits module_address.
    const parts = address.split(".");
    const out = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      if (parts[i] !== "module") break;
      out.push("module", parts[i + 1]);
    }
    if (out.length) return out.join(".");
  }
  return "(root module)";
}

const EMPTY_COUNTS = () => ({
  [ACTION_CREATE]: 0,
  [ACTION_UPDATE]: 0,
  [ACTION_DELETE]: 0,
  [ACTION_REPLACE]: 0,
  [ACTION_NOOP]: 0,
  [ACTION_READ]: 0,
  total: 0,
});

function bump(bucket, action) {
  bucket[action] = (bucket[action] ?? 0) + 1;
  bucket.total += 1;
}

/**
 * The whole report for one structured plan.
 *
 * `trueDeletions` is the flag the summary line cannot give you: a resource
 * whose actions are exactly `["delete"]` **and** which nothing else in the
 * plan re-creates at the same address. Terraform represents an ordinary
 * replacement as one entry with both actions, but a `create_before_destroy`
 * replacement of a *deposed* object arrives as two separate entries at the
 * same address -- one `["create"]`, one `["delete"]` with a `deposed` key --
 * and counting that delete as a real deletion is exactly the false alarm
 * that would make the list untrustworthy.
 */
export function analyzePlan(plan) {
  const changes = Array.isArray(plan?.resource_changes) ? plan.resource_changes : [];

  const recreatedAddresses = new Set();
  for (const rc of changes) {
    const { action } = classifyAction(rc?.change?.actions);
    if (action === ACTION_CREATE || action === ACTION_REPLACE) recreatedAddresses.add(String(rc?.address ?? ""));
  }

  const totals = EMPTY_COUNTS();
  const byTypeMap = new Map();
  const byModuleMap = new Map();
  const destructive = [];

  for (const rc of changes) {
    const change = rc?.change ?? {};
    const { action, createFirst } = classifyAction(change.actions);
    const type = String(rc?.type ?? "(unknown type)");
    const address = String(rc?.address ?? "(unknown address)");
    const module = moduleOf(rc);

    bump(totals, action);
    if (!byTypeMap.has(type)) byTypeMap.set(type, { type, ...EMPTY_COUNTS() });
    bump(byTypeMap.get(type), action);
    if (!byModuleMap.has(module)) byModuleMap.set(module, { module, ...EMPTY_COUNTS() });
    bump(byModuleMap.get(module), action);

    if (action !== ACTION_DELETE && action !== ACTION_REPLACE) continue;

    const stateful = rc?.mode === "data" ? null : statefulCategory(type);
    const reasonCode = rc?.action_reason ?? null;
    const isTrueDeletion = action === ACTION_DELETE && !recreatedAddresses.has(address);

    destructive.push({
      address,
      type,
      module,
      mode: rc?.mode ?? "managed",
      action,
      createFirst: action === ACTION_REPLACE ? createFirst : false,
      deposed: rc?.deposed ?? null,
      replacePaths: replacePathsOf(change),
      actionReason: reasonCode && reasonCode !== "none" ? reasonCode : null,
      actionReasonText: explainActionReason(reasonCode),
      stateful,
      dataLossRisk: action === ACTION_REPLACE && Boolean(stateful),
      trueDeletion: isTrueDeletion,
    });
  }

  const bySeverity = (a, b) => {
    const rank = (d) => (d.dataLossRisk ? 0 : d.trueDeletion && d.stateful ? 1 : d.trueDeletion ? 2 : 3);
    return rank(a) - rank(b) || a.address.localeCompare(b.address);
  };
  destructive.sort(bySeverity);

  const byCount = (a, b) =>
    b[ACTION_REPLACE] + b[ACTION_DELETE] - (a[ACTION_REPLACE] + a[ACTION_DELETE]) ||
    b.total - a.total ||
    String(a.type ?? a.module).localeCompare(String(b.type ?? b.module));

  return {
    resourcesAnalyzed: changes.length,
    terraformVersion: typeof plan?.terraform_version === "string" ? plan.terraform_version : null,
    totals,
    byType: [...byTypeMap.values()].sort(byCount),
    byModule: [...byModuleMap.values()].sort(byCount),
    destructive,
    dataLossRisks: destructive.filter((d) => d.dataLossRisk),
    trueDeletions: destructive.filter((d) => d.trueDeletion),
    statefulDeletions: destructive.filter((d) => d.trueDeletion && d.stateful),
  };
}

/** One-line verdict, shared by the CLI and the page so they cannot drift apart. */
export function summarize(report) {
  const t = report.totals;
  return (
    `${report.resourcesAnalyzed} resource change(s): ` +
    `${t[ACTION_CREATE]} to create, ${t[ACTION_UPDATE]} to update, ` +
    `${t[ACTION_REPLACE]} to replace, ${t[ACTION_DELETE]} to destroy, ` +
    `${t[ACTION_NOOP]} unchanged.`
  );
}
