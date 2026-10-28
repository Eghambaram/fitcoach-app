import { z } from "zod";
import { BASELINE_MEASUREMENTS, MEASUREMENT_RANGES } from "./onboarding";
import { LENGTH_UNITS, WEIGHT_UNITS } from "./settings";

/** Measurements, charts and progress sharing (PROMPT §8.8, step 4.4; photos are v1.1). */

export const UNIT_KINDS = ["mass", "length", "percent", "count"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];
export const UNIT_KIND_LABELS: Record<UnitKind, string> = {
  mass: "Weight (kg / lb)",
  length: "Length (cm / in)",
  percent: "Percent (%)",
  count: "Number",
};

/** The unit a value was entered in; the API converts to canonical kg / cm. */
export const INPUT_UNITS = ["kg", "lb", "cm", "in", "%", "count"] as const;
export type InputUnit = (typeof INPUT_UNITS)[number];

/** The units a metric of this kind may be entered in. */
export function unitsFor(kind: UnitKind): readonly InputUnit[] {
  switch (kind) {
    case "mass":
      return WEIGHT_UNITS;
    case "length":
      return LENGTH_UNITS;
    case "percent":
      return ["%"];
    case "count":
      return ["count"];
  }
}

/** Plausible range in canonical units; anything outside is almost certainly a typo. */
export function measurementRange(key: string, kind: UnitKind): [number, number] {
  if ((BASELINE_MEASUREMENTS as readonly string[]).includes(key)) {
    return MEASUREMENT_RANGES[key as (typeof BASELINE_MEASUREMENTS)[number]];
  }
  switch (kind) {
    case "mass":
      return [1, 500];
    case "length":
      return [1, 300];
    case "percent":
      return [0.1, 100];
    case "count":
      return [0.01, 100_000];
  }
}

export const CHART_RANGES = ["1m", "3m", "6m", "1y", "all"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export const CHART_RANGE_LABELS: Record<ChartRange, string> = {
  "1m": "1M",
  "3m": "3M",
  "6m": "6M",
  "1y": "1Y",
  all: "All",
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

export const measurementTypeSchema = z.object({
  id: z.string().uuid(),
  key: z.string().max(40),
  name: z.string().max(60),
  unitKind: z.enum(UNIT_KINDS),
  /** Added by the trainer for this workspace. */
  custom: z.boolean(),
});
export type MeasurementType = z.infer<typeof measurementTypeSchema>;

export const createMeasurementTypeRequestSchema = z.object({
  name: z.string().trim().min(1, "Name the measurement").max(60, "Use at most 60 characters"),
  unitKind: z.enum(UNIT_KINDS, "Choose what it measures"),
});
export type CreateMeasurementTypeRequest = z.infer<typeof createMeasurementTypeRequestSchema>;

export const measurementTypesResponseSchema = z.object({
  types: z.array(measurementTypeSchema),
});
export type MeasurementTypesResponse = z.infer<typeof measurementTypesResponseSchema>;

export const addMeasurementRequestSchema = z.object({
  typeId: z.string().uuid("Choose a measurement"),
  value: z
    .number("Enter a number")
    .positive("Enter a positive number")
    .max(100_000, "That looks too large"),
  unit: z.enum(INPUT_UNITS),
  measuredOn: isoDate,
  note: z.string().trim().max(500, "Use at most 500 characters").optional(),
});
export type AddMeasurementRequest = z.infer<typeof addMeasurementRequestSchema>;

export const voidMeasurementRequestSchema = z.object({
  reason: z.string().trim().min(1, "Say why it's wrong").max(200, "Use at most 200 characters"),
});
export type VoidMeasurementRequest = z.infer<typeof voidMeasurementRequestSchema>;

/** A value in canonical units (kg, cm, %). */
export const measurementPointSchema = z.object({
  id: z.string().uuid(),
  measuredOn: isoDate,
  value: z.number(),
  source: z.enum(["trainer", "client"]),
  /** Trainer view only. */
  note: z.string().max(500).nullable(),
  recordedAt: z.string().datetime(),
});
export type MeasurementPoint = z.infer<typeof measurementPointSchema>;

const datedValue = z.object({ measuredOn: isoDate, value: z.number() });

export const metricSchema = z.object({
  type: measurementTypeSchema,
  /** The client sees this metric in their app. */
  shared: z.boolean(),
  /** Live values, oldest first. */
  points: z.array(measurementPointSchema),
  /** Voided values (corrections), newest first. Trainer view only. */
  voided: z.array(
    measurementPointSchema.extend({
      voidedAt: z.string().datetime(),
      voidReason: z.string().max(200),
    }),
  ),
  first: datedValue.nullable(),
  latest: datedValue.nullable(),
  /** latest − first, canonical units; null with fewer than 2 values. */
  change: z.number().nullable(),
  /** Only for body weight, where a percentage is meaningful; labelled as such. */
  percentChange: z.number().nullable(),
});
export type Metric = z.infer<typeof metricSchema>;

const unitsSchema = z.object({
  weightUnit: z.enum(WEIGHT_UNITS),
  lengthUnit: z.enum(LENGTH_UNITS),
});

/** Client profile → Progress. */
export const clientProgressResponseSchema = z.object({
  today: isoDate,
  units: unitsSchema,
  /** The client may add their own measurements (of shared metrics). */
  selfLogging: z.boolean(),
  metrics: z.array(metricSchema),
  types: z.array(measurementTypeSchema),
});
export type ClientProgressResponse = z.infer<typeof clientProgressResponseSchema>;

export const updateProgressSharesRequestSchema = z.object({
  typeIds: z.array(z.string().uuid()).max(30),
  selfLogging: z.boolean(),
});
export type UpdateProgressSharesRequest = z.infer<typeof updateProgressSharesRequestSchema>;

/** `/app/progress`: each client's own recent changes (no cross-client averages). */
export const progressOverviewResponseSchema = z.object({
  units: unitsSchema,
  clients: z.array(
    z.object({
      id: z.string().uuid(),
      fullName: z.string(),
      lastMeasuredOn: isoDate,
      changes: z.array(
        z.object({
          name: z.string().max(60),
          unitKind: z.enum(UNIT_KINDS),
          latest: z.number(),
          change: z.number().nullable(),
          since: isoDate.nullable(),
        }),
      ),
    }),
  ),
});
export type ProgressOverviewResponse = z.infer<typeof progressOverviewResponseSchema>;

/** The client app: shared metrics only. */
export const portalProgressResponseSchema = z.object({
  today: isoDate,
  units: unitsSchema,
  canLog: z.boolean(),
  metrics: z.array(metricSchema),
});
export type PortalProgressResponse = z.infer<typeof portalProgressResponseSchema>;

/** A shared metric tile on the client home. */
export const sharedMetricTileSchema = z.object({
  name: z.string().max(60),
  unitKind: z.enum(UNIT_KINDS),
  latest: z.number(),
  change: z.number().nullable(),
  since: isoDate.nullable(),
});
export type SharedMetricTile = z.infer<typeof sharedMetricTileSchema>;
