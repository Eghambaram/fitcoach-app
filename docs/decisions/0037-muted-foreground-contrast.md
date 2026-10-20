# ADR-0037: Muted text token darkened to #6A736D for WCAG AA

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 1.1; amends §7.1

## Decision

`--muted-foreground` changes from `#6C756F` to `#6A736D` in PROMPT §7.1, CLAUDE.md and `apps/web/app/globals.css`.

## Why

The axe check in the first Playwright run flagged `#6C756F` on `--background #F6F7F3` at 4.42:1, below the 4.5:1 AA minimum the spec targets (§7.4). `#6A736D` is the smallest darkening of the same hue that passes: 4.55:1 on the background, 4.90:1 on cards.

## Consequences

- Muted text on `--border` (`#E6EAE5`) is still below AA — don't put body text on border-coloured surfaces.
- The axe check stays in the e2e suite to catch regressions.
