/**
 * URL parameters the leads list understands. A plain module (not "use client") so the server page
 * can read it as a value: exports of client modules are only references on the server.
 */
export const LEAD_PARAMS = [
  "stage",
  "q",
  "source",
  "mode",
  "followUp",
  "sort",
  "archived",
] as const;
