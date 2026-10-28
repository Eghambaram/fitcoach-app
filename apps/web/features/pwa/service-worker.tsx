"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` (PROMPT §14) in production builds only, so `next dev` never serves stale
 * assets from a worker.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Installing is optional: the app works the same without the worker.
    });
  }, []);
  return null;
}
