// Root config only lints repo-level files (Playwright suite, scripts).
// Each workspace package has its own eslint.config.mjs.
import base from "@fitcoach/config/eslint/base";

export default [
  { ignores: ["apps/**", "packages/**", "playwright-report/**", "test-results/**"] },
  ...base,
];
