import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Built widget bundle.
    "widget/dist/**",
  ]),
  // The widget is a Vite app, not a Next.js one: `next/image` does not exist
  // there, and the host loads the bundle from a data document with no loader.
  {
    files: ["widget/**"],
    rules: { "@next/next/no-img-element": "off" },
  },
]);

export default eslintConfig;
