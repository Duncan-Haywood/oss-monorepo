import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAction,
  statefulCategory,
  explainActionReason,
  formatAttrPath,
  parsePlan,
  analyzePlan,
  summarize,
  STATEFUL_TYPE_RULES,
  NON_DATA_SUFFIXES,
  ACTION_REPLACE,
  ACTION_DELETE,
  ACTION_CREATE,
  ACTION_UPDATE,
  ACTION_NOOP,
} from "./engine.mjs";

// --- classifyAction -----------------------------------------------------

test("a single action classifies as itself", () => {
  assert.equal(classifyAction(["create"]).action, ACTION_CREATE);
  assert.equal(classifyAction(["update"]).action, ACTION_UPDATE);
  assert.equal(classifyAction(["delete"]).action, ACTION_DELETE);
  assert.equal(classifyAction(["no-op"]).action, ACTION_NOOP);
});

test("delete+create is a replace, destroy-first", () => {
  const { action, createFirst } = classifyAction(["delete", "create"]);
  assert.equal(action, ACTION_REPLACE);
  assert.equal(createFirst, false);
});

test("create+delete is a replace, create_before_destroy", () => {
  const { action, createFirst } = classifyAction(["create", "delete"]);
  assert.equal(action, ACTION_REPLACE);
  assert.equal(createFirst, true);
});

test("a missing or malformed actions array is a no-op, not a crash", () => {
  assert.equal(classifyAction(undefined).action, ACTION_NOOP);
  assert.equal(classifyAction("delete").action, ACTION_NOOP);
});

// --- statefulCategory ---------------------------------------------------

test("flags the obvious data-holding types across providers", () => {
  for (const type of [
    "aws_db_instance",
    "aws_rds_cluster",
    "azurerm_mssql_database",
    "google_sql_database_instance",
    "aws_dynamodb_table",
    "aws_ebs_volume",
    "google_compute_disk",
    "aws_s3_bucket",
    "google_storage_bucket",
    "aws_route53_record",
    "aws_lb",
    "aws_secretsmanager_secret",
    "kubernetes_persistent_volume_claim",
    "aws_sqs_queue",
    "aws_opensearch_domain",
  ]) {
    assert.ok(statefulCategory(type), `${type} should be flagged as stateful`);
  }
});

test("does not flag ordinary stateless types", () => {
  for (const type of [
    "aws_instance",
    "aws_security_group_rule",
    "aws_iam_role",
    "aws_cloudwatch_dashboard",
    "kubernetes_deployment",
    "null_resource",
    "random_pet",
  ]) {
    assert.equal(statefulCategory(type), null, `${type} should not be flagged`);
  }
});

test("a configuration sub-resource of a stateful thing is exempt", () => {
  // These carry a stateful token but hold no data of their own. Flagging them
  // is how the report earns a reputation for crying wolf.
  assert.equal(statefulCategory("aws_db_parameter_group"), null);
  assert.equal(statefulCategory("aws_db_subnet_group"), null);
  assert.equal(statefulCategory("aws_s3_bucket_versioning"), null);
  assert.equal(statefulCategory("aws_s3_bucket_policy"), null);
  assert.equal(statefulCategory("aws_lb_target_group_attachment"), null);
});

test("matching is on whole segments, not substrings", () => {
  // "db" as a substring appears in "dashboard"; "lb" in "globalaccelerator"
  // does not, but "elb" as a substring appears in nothing useful either --
  // the point is that a substring match would be wrong and this is not one.
  assert.equal(statefulCategory("aws_cloudwatch_dashboard"), null);
  assert.equal(statefulCategory("aws_dbxyz_thing"), null);
});

test("the category carries the token that matched, so a false positive is dismissable", () => {
  const hit = statefulCategory("aws_db_instance");
  assert.equal(hit.code, "database");
  assert.equal(hit.matchedToken, "db");
  assert.match(hit.loss, /data/i);
});

test("every rule has a non-empty loss explanation and distinct code", () => {
  const codes = new Set();
  for (const rule of STATEFUL_TYPE_RULES) {
    assert.ok(rule.loss.length > 20, `${rule.code} needs a real loss explanation`);
    assert.ok(rule.tokens.length > 0);
    assert.equal(codes.has(rule.code), false, `duplicate rule code ${rule.code}`);
    codes.add(rule.code);
  }
  assert.ok(NON_DATA_SUFFIXES.every((s) => s.startsWith("_")));
});

// --- action_reason ------------------------------------------------------

test("known action reasons get a plain-language sentence", () => {
  assert.match(explainActionReason("replace_because_cannot_update"), /ForceNew/);
  assert.match(explainActionReason("replace_because_tainted"), /tainted/);
  assert.match(explainActionReason("delete_because_each_key"), /for_each/);
});

test("an unrecognized reason code is surfaced, not swallowed", () => {
  // Terraform documents these as display hints whose set may change, and
  // tells consumers to expect unknown values. Dropping one would lose the
  // most specific thing the plan said about why a resource is going away.
  const text = explainActionReason("replace_because_of_something_new_in_1_14");
  assert.match(text, /replace_because_of_something_new_in_1_14/);
});

test('no reason, or the literal "none", produces nothing', () => {
  assert.equal(explainActionReason(null), null);
  assert.equal(explainActionReason(undefined), null);
  assert.equal(explainActionReason("none"), null);
});

// --- attribute paths ----------------------------------------------------

test("formats a nested replace path the way terraform prints it", () => {
  assert.equal(formatAttrPath(["network_interface", 0, "subnet_id"]), "network_interface[0].subnet_id");
  assert.equal(formatAttrPath(["name"]), "name");
});

// --- parsePlan ----------------------------------------------------------

test("rejects empty input", () => {
  assert.throws(() => parsePlan("   "), /empty input/);
});

test("rejects the human-readable plan with a message naming the right command", () => {
  assert.throws(() => parsePlan("Plan: 1 to add, 0 to change, 2 to destroy."), /terraform show -json/);
});

test("rejects valid JSON that is not a structured plan", () => {
  assert.throws(() => parsePlan('{"format_version":"1.2"}'), /resource_changes/);
  assert.throws(() => parsePlan("[]"), /resource_changes/);
});

test("accepts a minimal structured plan", () => {
  assert.deepEqual(parsePlan('{"resource_changes":[]}').resource_changes, []);
});

// --- analyzePlan --------------------------------------------------------

const PLAN = {
  format_version: "1.2",
  terraform_version: "1.9.5",
  resource_changes: [
    {
      address: "module.data.aws_db_instance.primary",
      module_address: "module.data",
      mode: "managed",
      type: "aws_db_instance",
      name: "primary",
      change: {
        actions: ["delete", "create"],
        replace_paths: [["engine_version"]],
      },
      action_reason: "replace_because_cannot_update",
    },
    {
      address: "aws_instance.web",
      mode: "managed",
      type: "aws_instance",
      name: "web",
      change: { actions: ["update"] },
    },
    {
      address: "aws_s3_bucket.old_logs",
      mode: "managed",
      type: "aws_s3_bucket",
      name: "old_logs",
      change: { actions: ["delete"] },
      action_reason: "delete_because_no_resource_config",
    },
    {
      address: "aws_security_group_rule.temp",
      mode: "managed",
      type: "aws_security_group_rule",
      name: "temp",
      change: { actions: ["delete"] },
    },
    {
      address: "aws_instance.new",
      mode: "managed",
      type: "aws_instance",
      name: "new",
      change: { actions: ["create"] },
    },
    {
      address: "data.aws_ami.ubuntu",
      mode: "data",
      type: "aws_ami",
      name: "ubuntu",
      change: { actions: ["read"] },
    },
    {
      address: "aws_iam_role.unchanged",
      mode: "managed",
      type: "aws_iam_role",
      name: "unchanged",
      change: { actions: ["no-op"] },
    },
  ],
};

test("totals count a replace once, in its own column", () => {
  const r = analyzePlan(PLAN);
  assert.equal(r.resourcesAnalyzed, 7);
  assert.equal(r.totals[ACTION_REPLACE], 1);
  assert.equal(r.totals[ACTION_DELETE], 2);
  assert.equal(r.totals[ACTION_CREATE], 1);
  assert.equal(r.totals[ACTION_UPDATE], 1);
  assert.equal(r.totals[ACTION_NOOP], 1);
  assert.equal(r.terraformVersion, "1.9.5");
});

test("summarize does not double-count the replace into add and destroy", () => {
  // This is the exact defect the tool exists for: `Plan: N to add, M to
  // destroy` counts a replacement in both columns, so the destroy count
  // cannot be read as "things going away".
  assert.match(summarize(analyzePlan(PLAN)), /1 to replace, 2 to destroy/);
});

test("the data-loss flag fires on a replaced database and nothing else here", () => {
  const r = analyzePlan(PLAN);
  assert.equal(r.dataLossRisks.length, 1);
  assert.equal(r.dataLossRisks[0].address, "module.data.aws_db_instance.primary");
  assert.equal(r.dataLossRisks[0].stateful.code, "database");
  assert.deepEqual(r.dataLossRisks[0].replacePaths, ["engine_version"]);
  assert.match(r.dataLossRisks[0].actionReasonText, /ForceNew/);
});

test("a true deletion is a delete with no create of the same address", () => {
  const r = analyzePlan(PLAN);
  const addresses = r.trueDeletions.map((d) => d.address).sort();
  assert.deepEqual(addresses, ["aws_s3_bucket.old_logs", "aws_security_group_rule.temp"]);
  assert.equal(r.statefulDeletions.length, 1);
  assert.equal(r.statefulDeletions[0].address, "aws_s3_bucket.old_logs");
});

test("a create_before_destroy deposed pair is NOT reported as a true deletion", () => {
  // Terraform emits two entries at one address for this: a `create` and a
  // `delete` carrying a `deposed` key. Counting that delete as a resource
  // going away is precisely the false alarm that would make the list
  // untrustworthy, which is why the flag is address-aware.
  const r = analyzePlan({
    resource_changes: [
      { address: "aws_lb.front", type: "aws_lb", mode: "managed", change: { actions: ["create"] } },
      {
        address: "aws_lb.front",
        type: "aws_lb",
        mode: "managed",
        deposed: "abc12345",
        change: { actions: ["delete"] },
      },
    ],
  });
  assert.equal(r.trueDeletions.length, 0);
  assert.equal(r.destructive.length, 1);
  assert.equal(r.destructive[0].deposed, "abc12345");
});

test("a destroyed data source is never flagged as data loss", () => {
  const r = analyzePlan({
    resource_changes: [
      { address: "data.aws_db_instance.existing", mode: "data", type: "aws_db_instance", change: { actions: ["delete"] } },
    ],
  });
  assert.equal(r.dataLossRisks.length, 0);
  assert.equal(r.destructive[0].stateful, null);
});

test("grouping by type and by module covers every change exactly once", () => {
  const r = analyzePlan(PLAN);
  assert.equal(
    r.byType.reduce((sum, row) => sum + row.total, 0),
    r.resourcesAnalyzed,
  );
  assert.equal(
    r.byModule.reduce((sum, row) => sum + row.total, 0),
    r.resourcesAnalyzed,
  );
  const dataModule = r.byModule.find((m) => m.module === "module.data");
  assert.equal(dataModule[ACTION_REPLACE], 1);
  const root = r.byModule.find((m) => m.module === "(root module)");
  assert.equal(root.total, 6);
});

test("module is derived from the address when module_address is absent", () => {
  const r = analyzePlan({
    resource_changes: [
      { address: "module.net.module.vpc.aws_subnet.a", type: "aws_subnet", change: { actions: ["create"] } },
    ],
  });
  assert.equal(r.byModule[0].module, "module.net.module.vpc");
});

test("the destructive list puts data-loss risks first", () => {
  const r = analyzePlan(PLAN);
  assert.equal(r.destructive[0].dataLossRisk, true);
  assert.equal(r.destructive.at(-1).dataLossRisk, false);
});

test("a replace with no replace_paths is still reported, with the gap stated", () => {
  const r = analyzePlan({
    resource_changes: [
      { address: "aws_db_instance.x", type: "aws_db_instance", mode: "managed", change: { actions: ["delete", "create"] } },
    ],
  });
  assert.equal(r.dataLossRisks.length, 1);
  assert.deepEqual(r.dataLossRisks[0].replacePaths, []);
  assert.equal(r.dataLossRisks[0].actionReason, null);
});

test("an empty plan analyzes to an all-zero report rather than throwing", () => {
  const r = analyzePlan({ resource_changes: [] });
  assert.equal(r.resourcesAnalyzed, 0);
  assert.deepEqual(r.destructive, []);
  assert.deepEqual(r.byType, []);
  assert.match(summarize(r), /0 resource change/);
});
