# ADR-0035: Toolchain pins: NestJS 11, TypeScript 5.9, ESLint 9

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 1.1; §3

## Decision

NestJS **11** (`@nestjs/*` ^11.2, `@nestjs/swagger` ^11.4), TypeScript **~5.9.3**, ESLint **9** with flat config. Everything else uses the current stable major (Next.js 16, React 19, Tailwind 4, Zod 4, Vitest 5, Playwright 1.64, Turborepo 2, pnpm 12).

## Why

Checked against npm on 2026-10-20: `nestjs-zod` (named in §3) supports NestJS 10–11 only, while NestJS 12 (Aug 2026) requires `@nestjs/swagger` 12. TypeScript 7 (native compiler) isn't supported by `typescript-eslint` (<6.1) and NestJS relies on `emitDecoratorMetadata`. `eslint-plugin-react`, `jsx-a11y` and `import` (pulled in by `eslint-config-next`) support ESLint ≤ 9.

## Consequences

- Upgrade NestJS to 12 once `nestjs-zod` supports it; revisit TypeScript 6/7 and ESLint 10 when their ecosystems catch up.
- `eslint-config-next`'s TypeScript block is replaced by our stricter typescript-eslint base (see `packages/config/eslint/next.mjs`).
- pnpm only runs install scripts listed under `allowBuilds` in `pnpm-workspace.yaml`.
