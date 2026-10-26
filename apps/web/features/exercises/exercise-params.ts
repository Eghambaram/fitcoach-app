/**
 * URL parameters the exercise library understands. A plain module (not "use client") so the server
 * page can read it as a value.
 */
export const EXERCISE_PARAMS = [
  "q",
  "category",
  "muscle",
  "equipment",
  "source",
  "archived",
] as const;
