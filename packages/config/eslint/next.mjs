import nextVitals from "eslint-config-next/core-web-vitals";
import tseslint from "typescript-eslint";
import base from "./base.mjs";

/**
 * Flat config for apps/web: shared strict TypeScript base + Next.js core web vitals
 * (react, react-hooks, jsx-a11y, @next/next).
 * - The preset's "next/typescript" block only registers its own copy of the typescript-eslint parser/plugin
 *   (no rules); the base already provides them, and ESLint refuses two plugin instances under one name.
 * - The preset's main block swaps in `eslint-config-next/parser` for every file, so the typescript-eslint
 *   parser is restored afterwards for every file the base lints (its typescript-eslint rules need it).
 */
export default [
  ...base,
  ...nextVitals.filter((config) => config.name !== "next/typescript"),
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    languageOptions: { parser: tseslint.parser },
  },
];
