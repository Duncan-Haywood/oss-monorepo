// Reading the `localStorage` global throws SecurityError when the visitor
// blocks site data, so a default parameter must not read it bare: the throw
// lands outside every try in the function and stops the page's script.
function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

const KEY = "amazon-fba-scenarios";

function read(storage) {
  try {
    const value = JSON.parse(storage?.getItem(KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function listScenarios(storage = browserStorage()) {
  return read(storage).filter((scenario) => scenario && scenario.id && scenario.name && scenario.inputs);
}

export function saveScenario(storage, name, inputs) {
  if (!storage) return [];
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Give this scenario a name first.");
  const scenarios = listScenarios(storage).filter((scenario) => scenario.name.toLowerCase() !== trimmed.toLowerCase());
  scenarios.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed.slice(0, 80),
    inputs: { ...inputs },
  });
  storage.setItem(KEY, JSON.stringify(scenarios.slice(0, 20)));
  return scenarios.slice(0, 20);
}

export function deleteScenario(storage, id) {
  const scenarios = listScenarios(storage).filter((scenario) => scenario.id !== id);
  storage?.setItem(KEY, JSON.stringify(scenarios));
  return scenarios;
}
