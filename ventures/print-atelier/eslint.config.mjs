// eslint-config-next 16 ships flat-config entry points directly, so there is no
// FlatCompat layer here. The previous shape — `compat.extends("next/core-web-vitals",
// "next/typescript")` — is an eslintrc bridge, and against 16 it throws
// "Converting circular structure to JSON" before a single file is linted. This
// matches ventures/quick-pick-survey and ventures/local-site-studio, which are on
// the same Next version.
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts",
    ],
  },
  ...nextVitals,
  ...nextTs,
  {
    // Carried over from the .eslintrc.json this replaces: the venture's marketing
    // copy is full of apostrophes and the rule flags every one of them.
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
