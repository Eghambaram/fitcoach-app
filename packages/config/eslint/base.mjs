import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

/** Shared flat config for every TypeScript package (CLAUDE.md rule 23: strict, no `any`). */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/coverage/**", "**/.turbo/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.mjs", "**/*.cjs", "**/scripts/**"],
    rules: { "no-console": "off" },
  },
  prettier,
);
