"use client";

import { useSyncExternalStore } from "react";
import { OfflineNotice } from "./status";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** True while the browser reports no connection. Saves are disabled while offline (PROMPT D15). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function OfflineBanner() {
  return useOnline() ? null : <OfflineNotice />;
}
