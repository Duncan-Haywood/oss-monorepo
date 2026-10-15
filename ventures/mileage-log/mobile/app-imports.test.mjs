// App.js and store.js cannot run under node (React Native, AsyncStorage), but a
// renamed or missing export would only show up on a phone. This checks that
// every name App.js imports from the pure modules is really exported there.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("./App.js", import.meta.url), "utf8");
const store = readFileSync(new URL("./src/store.js", import.meta.url), "utf8");

for (const m of app.matchAll(/import \{([^}]+)\} from "(\.[^"]+\.mjs)"/g)) {
  test(`App.js imports from ${m[2]} all exist`, async () => {
    const mod = await import(new URL(m[2], import.meta.url));
    for (const n of m[1].split(",").map((x) => x.trim()).filter(Boolean)) assert.ok(n in mod, `${n} missing from ${m[2]}`);
  });
}

test("App.js imports from ./src/store all exist", () => {
  const m = app.match(/import \{([^}]+)\} from "\.\/src\/store"/);
  for (const n of m[1].split(",").map((x) => x.trim())) assert.match(store, new RegExp(`export (async )?(const|function) ${n}\\b`), n);
});
