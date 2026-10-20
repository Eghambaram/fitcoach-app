import { z } from "zod";

/** Liveness: process is up. No dependencies are touched (PROMPT §17.5). */
export const livenessResponseSchema = z.object({
  status: z.literal("ok"),
});

export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

/**
 * Per-dependency status. "not_configured" is an honest state for integrations that aren't
 * set up yet (CLAUDE.md rule 20) — it never counts as a failure.
 */
export const dependencyStatusSchema = z.enum(["ok", "degraded", "unknown", "not_configured"]);

export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

export const dependencyCheckSchema = z.object({
  status: dependencyStatusSchema,
  latencyMs: z.number().int().nonnegative().optional(),
});

export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;

/** Readiness: database, job queue and object storage (PROMPT §17.5). */
export const readinessResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.object({
    database: dependencyCheckSchema,
    jobs: dependencyCheckSchema,
    storage: dependencyCheckSchema,
  }),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
