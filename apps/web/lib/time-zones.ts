import { DEFAULT_TIMEZONE } from "@fitcoach/shared";
import { useSyncExternalStore } from "react";

/**
 * Time zones for selects. The server renders only the default (its ICU list can differ from the
 * browser's); the browser's full list replaces it after hydration. ICU still calls India
 * "Asia/Calcutta", so our default is added explicitly.
 */
const SERVER_TIME_ZONES = [DEFAULT_TIMEZONE];
let browserTimeZones: string[] | undefined;

function getBrowserTimeZones(): string[] {
  browserTimeZones ??= [
    DEFAULT_TIMEZONE,
    ...Intl.supportedValuesOf("timeZone").filter(
      (zone) => zone !== "Asia/Calcutta" && zone !== DEFAULT_TIMEZONE,
    ),
  ];
  return browserTimeZones;
}

const noSubscription = () => () => undefined;

export function useTimeZones(): string[] {
  return useSyncExternalStore(noSubscription, getBrowserTimeZones, () => SERVER_TIME_ZONES);
}
