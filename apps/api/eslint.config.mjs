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
];
