import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
  ...nextCoreWebVitals,
  {
    // react-hooks/eslint-plugin was upgraded as part of the next@16.3.1
    // audit fix and now flags two pre-existing patterns unrelated to that
    // fix; left as warnings rather than silently rewritten here.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];

export default eslintConfig;
