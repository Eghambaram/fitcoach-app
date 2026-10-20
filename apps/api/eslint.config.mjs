import base from "@fitcoach/config/eslint/base";

export default [
  ...base,
  {
    files: ["src/**/*.ts"],
    rules: {
      // Nest wires constructor parameters by type, so imports used only as types still need to be values.
      "@typescript-eslint/consistent-type-imports": "off",
      // Nest modules are intentionally empty classes carrying a @Module() decorator.
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
    },
  },
  {
    // CLI entry points (migrate, reset, OpenAPI export) report progress on stdout.
    files: [
      "src/db/migrate.ts",
      "src/db/reset.ts",
      "src/db/seed.ts",
      "src/openapi.ts",
      "src/cli/**",
    ],
    rules: { "no-console": "off" },
  },
];
