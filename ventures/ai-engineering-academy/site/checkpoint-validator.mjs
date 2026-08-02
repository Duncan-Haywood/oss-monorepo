// The mastery checkpoint's actual grader.
//
// This module is the single source of the rule set. `build.mjs` inlines the
// function body into `sandbox.html` (the site is static, so the page cannot
// import it at runtime) and `test.mjs` imports it directly, so the rules the
// learner is graded against are the rules under test. A contract test fails if
// the built page stops carrying this source.
//
// It grades one question: "write the JSON schema for a safe database search
// tool that prevents SQL injection". Every rule below is a property that
// question actually asks for. Do not add a rule that passes on length,
// substring presence, or any other proxy for having answered — the previous
// grader accepted any input over ten characters and told the learner their
// schema was "verified", which taught the opposite of the lesson.

function validateToolSchema(rawInput) {
  const checks = [];
  const add = (id, label, passed, detail) =>
    checks.push({ id, label, passed, detail: detail || "" });

  const text = typeof rawInput === "string" ? rawInput.trim() : "";
  if (text === "") {
    add("parses", "Parses as JSON", false, "Nothing was entered.");
    return { ok: false, checks };
  }

  let schema;
  try {
    schema = JSON.parse(text);
  } catch (err) {
    add("parses", "Parses as JSON", false, "JSON parse error: " + err.message);
    return { ok: false, checks };
  }
  add("parses", "Parses as JSON", true);

  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    add("object-type", 'Declares "type": "object"', false, "The top level is not a JSON object.");
    return { ok: false, checks };
  }

  add(
    "object-type",
    'Declares "type": "object"',
    schema.type === "object",
    schema.type === undefined
      ? 'No "type" key at the top level.'
      : schema.type === "object"
        ? ""
        : 'Top-level "type" is ' + JSON.stringify(schema.type) + ', not "object".'
  );

  const properties =
    schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? schema.properties
      : null;
  const propertyNames = properties ? Object.keys(properties) : [];

  add(
    "properties",
    "Defines at least one parameter under \"properties\"",
    propertyNames.length > 0,
    properties === null
      ? 'No "properties" object.'
      : propertyNames.length === 0
        ? '"properties" is empty, so the tool takes no arguments.'
        : ""
  );

  // A tool call the model can omit arguments from is a tool the caller has to
  // defend against separately, so the checkpoint asks for them to be required.
  const required = Array.isArray(schema.required) ? schema.required : null;
  const undeclaredRequired = required ? required.filter((name) => !propertyNames.includes(name)) : [];
  add(
    "required",
    'Lists its parameters in "required"',
    required !== null && required.length > 0 && undeclaredRequired.length === 0,
    required === null
      ? 'No "required" array.'
      : required.length === 0
        ? '"required" is empty, so every parameter is optional.'
        : undeclaredRequired.length > 0
          ? '"required" names parameters that are not defined: ' + undeclaredRequired.join(", ") + "."
          : ""
  );

  // The injection-relevant rule. A free-text string parameter is the hole this
  // question is about: whatever the model produces reaches the query builder.
  // Any one of enum, pattern, maxLength or format narrows what can arrive.
  const CONSTRAINTS = ["enum", "pattern", "maxLength", "format", "const"];
  const isStringTyped = (prop) => {
    if (!prop || typeof prop !== "object") return false;
    if (prop.type === "string") return true;
    return Array.isArray(prop.type) && prop.type.includes("string");
  };
  const unconstrained = propertyNames.filter((name) => {
    const prop = properties[name];
    if (!isStringTyped(prop)) return false;
    return !CONSTRAINTS.some((key) => Object.prototype.hasOwnProperty.call(prop, key));
  });
  const stringProps = propertyNames.filter((name) => isStringTyped(properties[name]));
  add(
    "constrained-strings",
    "Constrains every string parameter (enum, pattern, maxLength or format)",
    propertyNames.length > 0 && unconstrained.length === 0,
    propertyNames.length === 0
      ? "No parameters to constrain yet."
      : unconstrained.length > 0
        ? "Unconstrained string parameter(s): " +
          unconstrained.join(", ") +
          ". Whatever the model writes here reaches your query builder."
        : stringProps.length === 0
          ? "No string parameters — nothing to constrain."
          : ""
  );

  add(
    "no-additional",
    'Sets "additionalProperties": false',
    schema.additionalProperties === false,
    schema.additionalProperties === undefined
      ? 'No "additionalProperties" key, so undeclared arguments are accepted.'
      : schema.additionalProperties === false
        ? ""
        : "Undeclared arguments are accepted."
  );

  return { ok: checks.every((c) => c.passed), checks };
}

export { validateToolSchema };
