import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "seed_full.js",
      "node_modules/**",
    ],
  },
  ...nextVitals,
  ...nextTs,
];

export default eslintConfig;
