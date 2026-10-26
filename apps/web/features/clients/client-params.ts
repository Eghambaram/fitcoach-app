/**
 * URL parameters the clients list understands. A plain module (not "use client") so the server page
 * can read it as a value.
 */
export const CLIENT_PARAMS = ["status", "q", "goal", "mode", "sort"] as const;
