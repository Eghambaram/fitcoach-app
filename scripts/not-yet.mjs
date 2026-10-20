// Placeholder for root scripts whose feature arrives in a later PHASES.md step.
// Exits 0 so `pnpm verify` and CI stay green until the real command exists.
const [, , name = "script", step = "?"] = process.argv;
console.log(
  `[fitcoach] "${name}" is not implemented yet — it arrives in PHASES.md step ${step}. Nothing to do.`,
);
